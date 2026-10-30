import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { Pool } from 'pg'
import request from 'supertest'
import { createApp } from '../src/app'
import { PNG_1X1 } from './helpers'
import { mockRecognizer } from '../src/services/vision/mockRecognizer'
import { PostgresRecognitionJobs } from '../src/services/recognitionJobs'
import { RecognitionWorker } from '../src/services/recognitionWorker'
import { PostgresScanRateLimiter, PostgresUploadGate } from '../src/middleware/postgresTrafficControl'
import { PostgresVisionAdmission } from '../src/services/visionAdmission'
import { PostgresSessionStore } from '../src/store/postgresSessions'
import { reliabilityConfigSchema } from '../src/config'
import { ScanService } from '../src/services/scanService'
import { OfferService } from '../src/services/offerService'

const testUrl = process.env.TEST_DATABASE_URL
const databaseTests = testUrl ? describe : describe.skip

databaseTests('PostgreSQL persistence across API copies', () => {
  const firstPool = new Pool({ connectionString: testUrl, max: 4 })
  const secondPool = new Pool({ connectionString: testUrl, max: 4 })
  const config = reliabilityConfigSchema.parse({})
  const first = new PostgresSessionStore(firstPool, config)
  const second = new PostgresSessionStore(secondPool, config)
  let sessionId: string

  beforeAll(async () => {
    const directory = fileURLToPath(new URL('../db/', import.meta.url))
    for (const name of readdirSync(directory).filter((file) => /^\d+_.*\.sql$/.test(file)).sort()) {
      await firstPool.query(readFileSync(join(directory, name), 'utf8'))
    }
    sessionId = await first.getOrCreate(undefined)
  })
  afterAll(async () => {
    if (sessionId) await firstPool.query('DELETE FROM eco_sessions WHERE id = $1', [sessionId])
    await firstPool.end()
    await secondPool.end()
  })

  it('keeps a confirmed scan and balance visible after switching store instances', async () => {
    const analysisId = randomUUID()
    await first.addAnalysis(sessionId, analysisId, {
      suggestions: [{ id: 'item-1', category: 'jeans' }, { id: 'item-2', category: 'jeans' }],
      recognitionMode: 'vision',
      imageHash: randomUUID(),
    })
    const input = { analysisId, items: [{ category: 'jeans', quantity: 2 }], replacesPlannedNewPurchase: true }
    const [original, simultaneousReplay] = await Promise.all([
      new ScanService(first).confirm(sessionId, input),
      new ScanService(second).confirm(sessionId, input),
    ])
    expect(original.demoPointsBalance).toBe(100)
    expect(simultaneousReplay).toEqual(original)
    expect(await new ScanService(second).confirm(sessionId, input)).toEqual(original)
    expect(await second.getLatestResult(sessionId)).toEqual(original)
    expect((await new OfferService(second).list(sessionId)).demoPointsBalance).toBe(100)
    const stranger = await second.getOrCreate(undefined)
    try {
      await expect(new ScanService(second).confirm(stranger, input)).rejects.toMatchObject({ code: 'ANALYSIS_NOT_FOUND' })
      expect(await second.getLatestResult(stranger)).toBeNull()
    } finally { await secondPool.query('DELETE FROM eco_sessions WHERE id = $1', [stranger]) }
    await firstPool.query("UPDATE eco_analyses SET expires_at = now() - interval '1 second' WHERE id = $1", [analysisId])
    await second.cleanup()
    expect(await first.getLatestResult(sessionId)).toEqual(original)
  })

  it('prevents a double spend when two instances redeem at the same time', async () => {
    const results = await Promise.allSettled([
      new OfferService(first).redeem(sessionId, 'swap-pass'),
      new OfferService(second).redeem(sessionId, 'secondhand-voucher'),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect((await second.getRewards(sessionId)).demoPointsBalance).toBeGreaterThanOrEqual(0)
    const winner = results.find((result) => result.status === 'fulfilled')
    if (winner?.status === 'fulfilled') {
      const receipt = winner.value.receipt
      expect(receipt.reference).toMatch(/^DEMO-[0-9A-F]{16}$/)
      const saved = await new OfferService(second).list(sessionId)
      expect(saved.offers.find((offer) => offer.receipt?.reference === receipt.reference)?.receipt).toEqual(receipt)
    }
  })

  it('queues an upload, lets a worker finish it, and restricts status to its session', async () => {
    const jobs = new PostgresRecognitionJobs(firstPool, config)
    const app = createApp(mockRecognizer, { store: first, jobs, logger: () => {} })
    const browser = request.agent(app)
    const uploaded = await browser.post('/api/analyses')
      .attach('image', PNG_1X1, { filename: 'shirt.png', contentType: 'image/png' }).expect(202)
    const id = uploaded.body.analysisId as string
    expect(uploaded.body.status).toBe('queued')
    expect((await browser.get(`/api/analyses/${id}`).expect(200)).body.status).toBe('queued')
    const input = { analysisId: id, items: [{ category: 'tshirt', quantity: 1 }], replacesPlannedNewPurchase: true }
    expect((await browser.post('/api/scans/confirm').send(input).expect(409)).body.error.code).toBe('ANALYSIS_NOT_READY')
    await request(app).get(`/api/analyses/${id}`).expect(404)
    expect(await new RecognitionWorker(jobs, mockRecognizer).runOne()).toBe(true)
    const ready = await browser.get(`/api/analyses/${id}`).expect(200)
    expect(ready.body).toMatchObject({ status: 'ready', analysisId: id, recognitionMode: 'mock', needsReview: true })
    expect((await browser.post('/api/scans/confirm').send(input).expect(200)).body.demoPointsAwarded).toBe(0)
    expect((await browser.get(`/api/analyses/${id}`).expect(200)).body.status).toBe('confirmed')
    expect((await firstPool.query('SELECT 1 FROM eco_recognition_jobs WHERE analysis_id = $1', [id])).rowCount).toBe(0)
    const cookie = uploaded.headers['set-cookie']?.[0]?.split(';')[0]
    if (cookie) {
      const match = /ecoscan_demo_session=([0-9a-f-]+)/.exec(cookie)
      if (match) await firstPool.query('DELETE FROM eco_sessions WHERE id = $1', [match[1]])
    }
  })

  it('recovers an expired worker claim and rejects a late completion', async () => {
    const jobs = new PostgresRecognitionJobs(firstPool, config)
    const queued = await jobs.enqueue(sessionId, PNG_1X1, 'image/png')
    const abandoned = await jobs.claim()
    expect(abandoned?.analysisId).toBe(queued.analysisId)
    await firstPool.query("UPDATE eco_recognition_jobs SET lease_until = now() - interval '1 second' WHERE analysis_id = $1", [queued.analysisId])
    expect(await new RecognitionWorker(jobs, mockRecognizer).runOne()).toBe(true)
    expect(await jobs.complete(abandoned!, [], 'mock')).toBe(false)
    expect((await jobs.status(sessionId, queued.analysisId)).status).toBe('ready')
  })

  it('retries failures and deletes the private image after the final attempt', async () => {
    const jobs = new PostgresRecognitionJobs(firstPool, config)
    const queued = await jobs.enqueue(sessionId, PNG_1X1, 'image/png')
    const failing = new RecognitionWorker(jobs, { mode: 'mock', recognize: async () => { throw new Error('private provider detail') } })
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      expect(await failing.runOne()).toBe(true)
      if (attempt < 3) await firstPool.query('UPDATE eco_recognition_jobs SET available_at = now() WHERE analysis_id = $1', [queued.analysisId])
    }
    expect((await jobs.status(sessionId, queued.analysisId)).status).toBe('failed')
    expect((await firstPool.query('SELECT 1 FROM eco_recognition_jobs WHERE analysis_id = $1', [queued.analysisId])).rowCount).toBe(0)
  })

  it('bounds queued images across API copies and expires an abandoned photo', async () => {
    const limitedConfig = reliabilityConfigSchema.parse({ maxQueuedJobs: 1 })
    const one = new PostgresRecognitionJobs(firstPool, limitedConfig)
    const two = new PostgresRecognitionJobs(secondPool, limitedConfig)
    const results = await Promise.allSettled([
      one.enqueue(sessionId, PNG_1X1, 'image/png'),
      two.enqueue(sessionId, PNG_1X1, 'image/png'),
    ])
    const accepted = results.find((result) => result.status === 'fulfilled')
    expect(accepted?.status).toBe('fulfilled')
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { code: 'JOB_QUEUE_FULL' },
    })
    if (accepted?.status !== 'fulfilled') return
    const id = accepted.value.analysisId
    await firstPool.query("UPDATE eco_recognition_jobs SET created_at = now() - interval '2 days' WHERE analysis_id = $1", [id])
    await first.cleanup()
    expect((await firstPool.query('SELECT 1 FROM eco_recognition_jobs WHERE analysis_id = $1', [id])).rowCount).toBe(0)
    expect((await one.status(sessionId, id)).status).toBe('failed')
  })

  it('shares a hashed IP rate limit and upload slots across API copies', async () => {
    const limitedConfig = reliabilityConfigSchema.parse({ scanRateCapacity: 1, scanRateRefillMs: 60_000 })
    const secret = 'integration-test-secret-with-32-characters'
    const firstLimit = new PostgresScanRateLimiter(firstPool, limitedConfig, secret)
    const secondLimit = new PostgresScanRateLimiter(secondPool, limitedConfig, secret)
    const ip = '192.0.2.31'
    await firstLimit.consume(ip)
    await expect(secondLimit.consume(ip)).rejects.toMatchObject({ code: 'SCAN_RATE_LIMITED', status: 429 })
    const stored = await firstPool.query<{ key_hash: string }>('SELECT key_hash FROM eco_scan_rate_buckets')
    expect(stored.rows.every((row) => !row.key_hash.includes(ip))).toBe(true)
    const firstGate = new PostgresUploadGate(firstPool, 1)
    const secondGate = new PostgresUploadGate(secondPool, 1)
    const release = await firstGate.acquire()
    try { await expect(secondGate.acquire()).rejects.toMatchObject({ code: 'SCANNER_BUSY', status: 503 }) }
    finally { await release() }
    const releaseAgain = await secondGate.acquire()
    await releaseAgain()
    await firstPool.query('DELETE FROM eco_scan_rate_buckets')
  })

  it('shares a daily vision-call budget and refunds unused permits', async () => {
    const budget = reliabilityConfigSchema.parse({ maxConcurrentVision: 1, maxDailyVisionCalls: 1 })
    const firstAdmission = new PostgresVisionAdmission(firstPool, budget)
    const secondAdmission = new PostgresVisionAdmission(secondPool, budget)
    await firstPool.query('DELETE FROM eco_vision_daily_usage WHERE day = current_date')
    const unused = await firstAdmission.acquire()
    await expect(secondAdmission.acquire()).rejects.toMatchObject({ code: 'VISION_BUSY' })
    await unused.release()
    const used = await secondAdmission.acquire()
    used.markUsed()
    await used.release()
    await expect(firstAdmission.acquire()).rejects.toMatchObject({ code: 'VISION_BUDGET_EXHAUSTED' })
    await firstPool.query('DELETE FROM eco_vision_daily_usage WHERE day = current_date')
  })
})
