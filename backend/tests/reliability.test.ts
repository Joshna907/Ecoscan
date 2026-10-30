import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createTestApp, PNG_1X1, verifiedRecognizer } from './helpers'
import { mockRecognizer } from '../src/services/vision/mockRecognizer'
import { VisionUnavailableError } from '../src/services/vision/openAIRecognizer'
import type { RecognitionSuggestion } from '../src/services/vision/types'
import type { RequestLog } from '../src/middleware/requestLogging'
import { loadReliabilityConfig } from '../src/config'
import { request as httpRequest } from 'node:http'
import type { AddressInfo } from 'node:net'

type Agent = ReturnType<typeof request.agent>
const upload = (agent: Agent) => agent.post('/api/analyses')
  .attach('image', PNG_1X1, { filename: 'shirt.png', contentType: 'image/png' })
const confirmation = (analysisId: string) => ({
  analysisId, items: [{ category: 'jeans', quantity: 2 }], replacesPlannedNewPurchase: true,
})

describe('scan lifecycle and safe retries', () => {
  it('awards once for simultaneous equivalent confirmations and rejects a conflicting retry', async () => {
    const agent = request.agent(createTestApp(verifiedRecognizer))
    const { body } = await upload(agent).expect(200)
    const input = confirmation(body.analysisId)
    const [first, second] = await Promise.all([
      agent.post('/api/scans/confirm').send(input).expect(200),
      agent.post('/api/scans/confirm').send({ ...input, items: [
        { category: 'jeans', quantity: 1 }, { category: 'jeans', quantity: 1 },
      ] }).expect(200),
    ])
    expect(first.body).toEqual(second.body)
    expect((await agent.get('/api/offers')).body.demoPointsBalance).toBe(100)
    const conflict = await agent.post('/api/scans/confirm')
      .send({ ...input, replacesPlannedNewPurchase: false }).expect(409)
    expect(conflict.body.error.code).toBe('CONFIRMATION_CONFLICT')
    expect((await agent.get('/api/offers')).body.demoPointsBalance).toBe(100)
  })

  it('returns 410 for an expired review and never awards points', async () => {
    let now = 0
    const app = createTestApp(verifiedRecognizer, { now: () => now, config: { analysisTtlMs: 100 } })
    const agent = request.agent(app)
    const { body } = await upload(agent).expect(200)
    now = 100
    app.locals.cleanup()
    const result = await agent.post('/api/scans/confirm').send(confirmation(body.analysisId)).expect(410)
    expect(result.body.error.code).toBe('ANALYSIS_EXPIRED')
    expect((await agent.get('/api/offers')).body.demoPointsBalance).toBe(0)
  })

  it('removes retained results without making their IDs eligible for another award', async () => {
    let now = 0
    const agent = request.agent(createTestApp(verifiedRecognizer, { now: () => now, config: { resultRetentionMs: 100 } }))
    const { body } = await upload(agent).expect(200)
    await agent.post('/api/scans/confirm').send(confirmation(body.analysisId)).expect(200)
    now = 100
    await agent.post('/api/scans/confirm').send(confirmation(body.analysisId)).expect(404)
    expect((await agent.get('/api/offers')).body.demoPointsBalance).toBe(100)
  })

  it('expires idle sessions, rejects their analyses and clears their demo balance', async () => {
    let now = 0
    const agent = request.agent(createTestApp(verifiedRecognizer, { now: () => now, config: { sessionTtlMs: 100 } }))
    const { body } = await upload(agent).expect(200)
    await agent.post('/api/scans/confirm').send(confirmation(body.analysisId)).expect(200)
    now = 100
    await agent.post('/api/scans/confirm').send(confirmation(body.analysisId)).expect(404)
    expect((await agent.get('/api/offers')).body.demoPointsBalance).toBe(0)
  })

  it('caps sessions without evicting active users and reclaims expired capacity', async () => {
    let now = 0
    const app = createTestApp(undefined, { now: () => now, config: { maxSessions: 1, sessionTtlMs: 100 } })
    const owner = request.agent(app)
    await owner.get('/api/offers').expect(200)
    expect((await request(app).get('/api/offers').expect(503)).body.error.code).toBe('SESSION_CAPACITY')
    await owner.get('/api/offers').expect(200)
    now = 100
    app.locals.cleanup()
    await request(app).get('/api/offers').expect(200)
  })

  it('checks scan capacity before recognition and reclaims expired records', async () => {
    let now = 0
    let calls = 0
    const app = createTestApp({ mode: 'mock', recognize: async () => { calls++; return [] } }, {
      now: () => now, config: { maxAnalysesPerSession: 1, analysisTtlMs: 100, resultRetentionMs: 100 },
    })
    const agent = request.agent(app)
    await upload(agent).expect(200)
    expect((await upload(agent).expect(429)).body.error.code).toBe('SCAN_STORAGE_LIMIT')
    expect(calls).toBe(1)
    now = 200
    app.locals.cleanup()
    await upload(agent).expect(200)
    expect(calls).toBe(2)
  })
})

describe('traffic admission', () => {
  it('limits attempts before parsing uploads, ignores spoofed forwarding and refills tokens', async () => {
    let now = 0
    let calls = 0
    const app = createTestApp({ mode: 'mock', recognize: async () => { calls++; return [] } }, {
      now: () => now, config: { scanRateCapacity: 1, scanRateRefillMs: 1000 },
    })
    await upload(request.agent(app)).expect(200)
    const limited = await request(app).post('/api/analyses').set('X-Forwarded-For', '192.0.2.99').expect(429)
    expect(limited.body.error.code).toBe('SCAN_RATE_LIMITED')
    expect(limited.headers['retry-after']).toBe('1')
    expect(calls).toBe(1)
    await request(app).get('/api/health').expect(200)
    now = 1000
    await upload(request.agent(app)).expect(200)
    expect(calls).toBe(2)
  })

  it('uses the reverse proxy client address only when a proxy hop is explicitly trusted', async () => {
    const app = createTestApp(mockRecognizer, {
      trustedProxyHops: 1,
      config: { scanRateCapacity: 1, scanRateRefillMs: 60_000 },
    })
    const uploadAs = (ip: string) => request(app).post('/api/analyses')
      .set('X-Forwarded-For', ip)
      .attach('image', PNG_1X1, { filename: 'shirt.png', contentType: 'image/png' })
    await uploadAs('192.0.2.10').expect(200)
    await uploadAs('192.0.2.11').expect(200)
    await uploadAs('192.0.2.10').expect(429)
  })

  it('rejects excess concurrent uploads while keeping other endpoints available, then releases the slot', async () => {
    let complete!: (value: RecognitionSuggestion[]) => void
    let entered!: () => void
    const ready = new Promise<void>((resolve) => { entered = resolve })
    let calls = 0
    const app = createTestApp({ mode: 'mock', recognize: async () => {
      calls++
      if (calls === 1) { entered(); return new Promise((resolve) => { complete = resolve }) }
      return []
    } }, { config: { maxConcurrentScans: 1 } })
    const first = upload(request.agent(app)).then((response) => response)
    await ready
    try {
      const busy = await request(app).post('/api/analyses').expect(503)
      expect(busy.body.error.code).toBe('SCANNER_BUSY')
      expect(busy.headers['retry-after']).toBe('2')
      await request(app).get('/api/offers').expect(200)
      expect(calls).toBe(1)
    } finally { complete([]) }
    expect((await first).status).toBe(200)
    await upload(request.agent(app)).expect(200)
  })

  it('releases admission and storage reservations after invalid uploads and provider failures', async () => {
    let calls = 0
    const agent = request.agent(createTestApp({ mode: 'mock', recognize: async () => {
      calls++
      if (calls === 1) throw new VisionUnavailableError()
      return []
    } }, { config: { maxConcurrentScans: 1, maxAnalysesPerSession: 1 } }))
    await agent.post('/api/analyses').expect(400)
    await upload(agent).expect(503)
    await upload(agent).expect(200)
    expect(calls).toBe(2)
  })

  it('reserves per-session capacity during concurrent uploads and pins the session during work', async () => {
    let now = 0
    let entered!: () => void
    let complete!: (value: RecognitionSuggestion[]) => void
    const ready = new Promise<void>((resolve) => { entered = resolve })
    const app = createTestApp({ mode: 'mock', recognize: async () => {
      entered(); return new Promise((resolve) => { complete = resolve })
    } }, { now: () => now, config: { maxAnalysesPerSession: 1, sessionTtlMs: 100 } })
    const agent = request.agent(app)
    await agent.get('/api/offers').expect(200)
    const first = upload(agent).then((response) => response)
    await ready
    try {
      now = 150
      app.locals.cleanup()
      expect((await upload(agent).expect(429)).body.error.code).toBe('SCAN_STORAGE_LIMIT')
    } finally { complete([]) }
    const response = await first
    await agent.post('/api/scans/confirm').send(confirmation(response.body.analysisId)).expect(200)
  })

  it('releases an upload slot when the client disconnects midway through a file', async () => {
    let admitted!: () => void
    let disconnected!: () => void
    const ready = new Promise<void>((resolve) => { admitted = resolve })
    const closed = new Promise<void>((resolve) => { disconnected = resolve })
    const app = createTestApp(undefined, {
      config: { maxConcurrentScans: 1 },
      logger: (event) => { if (event.outcome === 'aborted') disconnected() },
    })
    const server = app.listen(0, '127.0.0.1')
    await new Promise<void>((resolve) => server.once('listening', resolve))
    server.once('request', () => admitted())
    const client = httpRequest({
      host: '127.0.0.1', port: (server.address() as AddressInfo).port, path: '/api/analyses', method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data; boundary=test-boundary', 'Content-Length': 10000 },
    })
    client.on('error', () => {})
    try {
      client.write('--test-boundary\r\nContent-Disposition: form-data; name="image"; filename="shirt.png"\r\nContent-Type: image/png\r\n\r\n')
      await ready
      client.destroy()
      await closed
      await new Promise<void>((resolve) => setImmediate(resolve))
      await request(server).post('/api/analyses')
        .attach('image', PNG_1X1, { filename: 'shirt.png', contentType: 'image/png' }).expect(200)
    } finally {
      client.destroy()
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})

describe('diagnostics and configuration', () => {
  it('reports readiness separately from liveness without exposing database errors', async () => {
    let available = true
    const app = createTestApp(mockRecognizer, {
      readiness: async () => {
        if (!available) throw new Error('PRIVATE_DATABASE_DETAILS')
      },
    })
    await request(app).get('/api/ready').expect(200, { status: 'ready' })
    available = false
    const unavailable = await request(app).get('/api/ready').expect(503)
    expect(unavailable.body).toEqual({
      error: { code: 'NOT_READY', message: 'The API is not ready to serve requests.' },
    })
    expect(JSON.stringify(unavailable.body)).not.toContain('PRIVATE_DATABASE_DETAILS')
    await request(app).get('/api/health').expect(200, { status: 'ok' })
  })

  it('correlates safe logs with responses without recording client secrets or raw exceptions', async () => {
    const events: RequestLog[] = []
    const app = createTestApp({ mode: 'mock', recognize: async () => {
      throw new Error('SECRET_PROVIDER_DETAILS')
    } }, { logger: (event) => events.push(event) })
    const response = await request(app).post('/api/analyses?secret=SECRET_QUERY')
      .set('Authorization', 'Bearer SECRET_TOKEN').set('Cookie', 'private=SECRET_COOKIE')
      .set('X-Request-ID', 'UNTRUSTED_REQUEST_ID')
      .attach('image', PNG_1X1, { filename: 'SECRET_FILENAME.png', contentType: 'image/png' }).expect(500)
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      requestId: response.headers['x-request-id'], operation: 'image.analyse', statusCode: 500,
      errorCode: 'INTERNAL_ERROR', recognitionOutcome: 'failure', activeScans: 0,
    })
    expect(JSON.stringify(events)).not.toMatch(/SECRET|UNTRUSTED|iVBOR/)
  })

  it('reports validation failures and request IDs even when JSON parsing fails', async () => {
    const events: RequestLog[] = []
    const app = createTestApp(mockRecognizer, { logger: (event) => events.push(event) })
    await request(app).post('/api/scans/confirm').set('Content-Type', 'application/json').send('{bad').expect(400)
    expect(events[0].errorCode).toBe('INVALID_JSON')
    expect(events[0].operation).toBe('scan.confirm')
    expect(events[0].requestId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('uses defaults and rejects invalid environment settings without printing their values', () => {
    expect(loadReliabilityConfig({ MAX_CONCURRENT_SCANS: '2' }).maxConcurrentScans).toBe(2)
    expect(() => loadReliabilityConfig({ MAX_CONCURRENT_SCANS: '0' })).toThrow('MAX_CONCURRENT_SCANS must be a positive integer')
    expect(() => loadReliabilityConfig({ SESSION_TTL_MS: 'secret' })).toThrow('SESSION_TTL_MS must be a positive integer')
  })
})
