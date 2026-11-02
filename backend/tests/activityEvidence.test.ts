import { randomUUID } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { Pool } from 'pg'
import { createApp } from '../src/app'
import { mockRecognizer } from '../src/services/vision/mockRecognizer'
import { ActivityEvidenceService, evidenceConfig, type EvidenceConfig } from '../src/services/activityEvidence'
import { MemoryEvidenceStore, PostgresEvidenceStore } from '../src/store/activityEvidence'
import { evidenceSignature } from '../src/routes/activityEvidenceRoutes'
import { PostgresSessionStore } from '../src/store/postgresSessions'
import { reliabilityConfigSchema } from '../src/config'

const partner = { id: 'repair-partner', name: 'Test repair partner', secret: 's'.repeat(40), activities: ['repair' as const] }
const config: EvidenceConfig = { hashKey: 'h'.repeat(40), partners: [partner] }
const base = '/api/activity-evidence'
afterEach(() => vi.unstubAllEnvs())
const bodyFor = (code: string, eventReference = 'repair-123', participantReference = 'customer-42') => ({ code, eventReference, participantReference, activity: 'repair' as const, occurredAt: new Date(Date.now() - 1000).toISOString() })
function appFor(now?: () => number) { return createApp(mockRecognizer, { evidenceConfig: config, logger: () => {}, now, config: { scanRateCapacity: 100, scanRateRefillMs: 1000 } }) }
function signed(app: ReturnType<typeof createApp>, path: string, body: unknown, options: { secret?: string; timestamp?: string; partnerId?: string; signedBody?: string } = {}) {
  const text = JSON.stringify(body), timestamp = options.timestamp ?? String(Math.floor(Date.now() / 1000))
  return request(app).post(base + path).set('Content-Type', 'application/json')
    .set('X-EcoScan-Partner', options.partnerId ?? partner.id).set('X-EcoScan-Timestamp', timestamp)
    .set('X-EcoScan-Signature', evidenceSignature(options.secret ?? partner.secret, timestamp, base + path, options.signedBody ?? text)).send(text)
}
async function newRequest(agent: ReturnType<typeof request.agent>) {
  const result = await agent.post(base + '/requests').send({ partnerId: partner.id, activity: 'repair' }).expect(201)
  return result.body.code as string
}

describe('independent activity evidence', () => {
  it('fails closed without configured partners and never offers self-confirmation', async () => {
    const app = createApp(mockRecognizer, { evidenceConfig: { hashKey: '', partners: [] }, logger: () => {} })
    const snapshot = await request(app).get(base).expect(200)
    expect(snapshot.body).toEqual({ enabled: false, partners: [], receipts: [], verifiedActivityCredits: 0 })
    await request(app).post(base + '/requests').send({ partnerId: partner.id, activity: 'repair' }).expect(503)
    await request(app).post(base + '/partner/confirm').send(bodyFor('a'.repeat(43))).expect(401)
    expect(() => evidenceConfig({ ACTIVITY_EVIDENCE_PARTNERS: JSON.stringify([partner]) })).toThrow('HASH_KEY')
    expect(evidenceConfig({ ACTIVITY_EVIDENCE_PARTNERS: '' }).partners).toEqual([])
  })
  it('refuses configured production verification without durable storage', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(() => appFor()).toThrow('persistent PostgreSQL')
  })
  it('binds a signed event to the requesting session, credits once, and leaves demo balances untouched', async () => {
    const app = appFor(), owner = request.agent(app), other = request.agent(app)
    const code = await newRequest(owner), body = bodyFor(code)
    const first = await signed(app, '/partner/confirm', body).expect(200)
    expect(first.body).toMatchObject({ credits: 50, status: 'confirmed', activity: 'repair' })
    expect((await signed(app, '/partner/confirm', body).expect(200)).body).toEqual(first.body)
    expect((await owner.get(base).expect(200)).body).toMatchObject({ verifiedActivityCredits: 50, receipts: [first.body] })
    expect((await other.get(base).expect(200)).body.verifiedActivityCredits).toBe(0)
    expect((await owner.get('/api/offers').expect(200)).body.demoPointsBalance).toBe(0)
    await owner.post('/api/offers/repair-kit/redeem').expect(409)
    const listed = (await owner.get(base)).body
    expect(JSON.stringify(listed)).not.toContain(partner.secret)
    expect(JSON.stringify(listed)).not.toContain('customer-42')
    expect(JSON.stringify(listed)).not.toContain('repair-123')
  })
  it('rejects unsigned, tampered, stale and wrong-partner attestations', async () => {
    const app = appFor(), code = await newRequest(request.agent(app)), body = bodyFor(code)
    await signed(app, '/partner/confirm', body, { secret: 'wrong' }).expect(401)
    await signed(app, '/partner/confirm', body, { signedBody: '{}' }).expect(401)
    await signed(app, '/partner/confirm', body, { timestamp: String(Math.floor(Date.now() / 1000) - 301) }).expect(401)
    await signed(app, '/partner/confirm', body, { partnerId: 'unknown' }).expect(401)
    await signed(app, '/partner/confirm', { ...body, credits: 9999 }).expect(400)
    await signed(app, '/partner/confirm', { ...body, activity: 'donation' }).expect(403)
    await signed(app, '/partner/confirm', { ...body, occurredAt: new Date(Date.now() + 3600_000).toISOString() }).expect(400)
    await signed(app, '/partner/confirm', body).expect(200)
  })
  it('blocks duplicate events across browsers and multiple events on one code', async () => {
    const app = appFor(), first = await newRequest(request.agent(app)), second = await newRequest(request.agent(app))
    const body = bodyFor(first)
    await signed(app, '/partner/confirm', body).expect(200)
    await signed(app, '/partner/confirm', { ...body, code: second }).expect(409)
    await signed(app, '/partner/confirm', { ...body, eventReference: 'new-event' }).expect(409)
    await signed(app, '/partner/confirm', { ...body, participantReference: 'changed-person' }).expect(409)
  })
  it('rejects expired codes, preserves successful retries after expiry and limits request creation', async () => {
    let now = Date.now()
    const app = appFor(() => now), agent = request.agent(app)
    const code = await newRequest(agent), body = bodyFor(code)
    await signed(app, '/partner/confirm', body).expect(200)
    const expired = await newRequest(agent)
    now += 16 * 60_000
    // Signing and the service use the same test clock.
    const ts = String(Math.floor(now / 1000))
    await signed(app, '/partner/confirm', body, { timestamp: ts }).expect(200)
    await signed(app, '/partner/confirm', bodyFor(expired, 'expired'), { timestamp: ts }).expect(410)
    await newRequest(agent); await newRequest(agent); await newRequest(agent)
    await agent.post(base + '/requests').send({ partnerId: partner.id, activity: 'repair' }).expect(429)
  })
  it('applies a stable participant limit across browsers, including reversed events', async () => {
    const app = appFor()
    for (let i = 0; i < 4; i++) {
      const code = await newRequest(request.agent(app))
      await signed(app, '/partner/confirm', bodyFor(code, 'event-' + i)).expect(200)
      await signed(app, '/partner/reverse', { eventReference: 'event-' + i, reason: 'cancelled' }).expect(200)
    }
    await signed(app, '/partner/confirm', bodyFor(await newRequest(request.agent(app)), 'fifth')).expect(429)
  })
  it('reverses once, rejects changed reversal reasons and prevents re-awarding a reversed event', async () => {
    const app = appFor(), agent = request.agent(app), code = await newRequest(agent), body = bodyFor(code)
    await signed(app, '/partner/confirm', body).expect(200)
    const reversal = { eventReference: body.eventReference, reason: 'returned' }
    const first = await signed(app, '/partner/reverse', reversal).expect(200)
    expect((await signed(app, '/partner/reverse', reversal).expect(200)).body).toEqual(first.body)
    expect((await signed(app, '/partner/confirm', body).expect(200)).body.status).toBe('reversed')
    await signed(app, '/partner/reverse', { ...reversal, reason: 'cancelled' }).expect(409)
    expect((await agent.get(base)).body.verifiedActivityCredits).toBe(0)
  })
  it('binds codes to the selected approved partner and activity', async () => {
    const second = { ...partner, id: 'other', secret: 't'.repeat(40) }
    const service = new ActivityEvidenceService({ ...config, partners: [partner, second] }, new MemoryEvidenceStore())
    const { code } = await service.request(randomUUID(), partner.id, 'repair')
    await expect(service.confirm(second, bodyFor(code))).rejects.toMatchObject({ code: 'ACTIVITY_MISMATCH' })
  })
  it('returns an original receipt after the new-activity age window has elapsed', async () => {
    let now = Date.now()
    const service = new ActivityEvidenceService(config, new MemoryEvidenceStore(() => now), () => now)
    const { code } = await service.request(randomUUID(), partner.id, 'repair')
    const body = bodyFor(code)
    const original = await service.confirm(partner, body)
    now += 31 * 86400_000
    expect(await service.confirm(partner, body)).toEqual(original)
  })
})

describe.skipIf(!process.env.TEST_DATABASE_URL)('durable activity evidence', () => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 4 })
  const store = new PostgresSessionStore(pool, reliabilityConfigSchema.parse({}))
  const localPartner = { ...partner, id: 'test-' + randomUUID() }
  const first = new ActivityEvidenceService({ ...config, partners: [localPartner] }, new PostgresEvidenceStore(pool))
  const second = new ActivityEvidenceService({ ...config, partners: [localPartner] }, new PostgresEvidenceStore(pool))
  const sessions: string[] = []
  beforeAll(async () => {
    const directory = fileURLToPath(new URL('../db/', import.meta.url))
    for (const name of readdirSync(directory).filter(name => /^\d+_.*\.sql$/.test(name)).sort()) await pool.query(readFileSync(directory + name, 'utf8'))
  })
  afterAll(async () => {
    await pool.query('DELETE FROM eco_activity_events WHERE partner_id=$1', [localPartner.id])
    await pool.query('DELETE FROM eco_activity_requests WHERE partner_id=$1', [localPartner.id])
    for (const id of sessions) await pool.query('DELETE FROM eco_sessions WHERE id=$1', [id])
    await pool.end()
  })
  it('credits one event atomically across replicas and preserves deduplication after session deletion', async () => {
    const owner = await store.getOrCreate(undefined), other = await store.getOrCreate(undefined); sessions.push(owner, other)
    const a = await first.request(owner, localPartner.id, 'repair'), b = await second.request(other, localPartner.id, 'repair')
    const body = bodyFor(a.code, 'race')
    const results = await Promise.allSettled([first.confirm(localPartner, body), second.confirm(localPartner, { ...body, code: b.code })])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    const winner = results[0].status === 'fulfilled' ? owner : other
    expect((await second.snapshot(winner)).verifiedActivityCredits).toBe(50)
    await first.reverse(localPartner, 'race', 'cancelled')
    await second.reverse(localPartner, 'race', 'cancelled')
    expect((await first.snapshot(winner)).verifiedActivityCredits).toBe(0)
    await pool.query('DELETE FROM eco_sessions WHERE id=$1', [winner])
    const replacement = await store.getOrCreate(undefined); sessions.push(replacement)
    const retry = await first.request(replacement, localPartner.id, 'repair')
    await expect(second.confirm(localPartner, { ...body, code: retry.code })).rejects.toMatchObject({ code: 'ACTIVITY_ALREADY_CLAIMED' })
    const stored = await pool.query('SELECT event_hash,participant_hash FROM eco_activity_events WHERE partner_id=$1', [localPartner.id])
    expect(stored.rows[0].event_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(stored.rows[0].participant_hash).toMatch(/^[a-f0-9]{64}$/)
  })
})
