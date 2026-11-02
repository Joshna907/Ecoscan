import { describe, expect, it, afterEach, vi } from 'vitest'
import request from 'supertest'
import { Pool } from 'pg'
import { randomUUID } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { assertSchemaReady, REQUIRED_MIGRATIONS } from '../src/schemaReadiness'
import { createApp } from '../src/app'
import { mockRecognizer } from '../src/services/vision/mockRecognizer'
import { Maintenance } from '../src/services/maintenance'
import { postgresRuntime } from '../src/postgresRuntime'
import { reliabilityConfigSchema } from '../src/config'
import { PNG_1X1 } from './helpers'

afterEach(() => vi.unstubAllEnvs())
describe('deployment contract', () => {
  it('keeps the readiness manifest aligned with migration files', () => {
    expect(readdirSync(fileURLToPath(new URL('../db/', import.meta.url))).filter(name => /^\d+_.*\.sql$/.test(name)).sort()).toEqual(REQUIRED_MIGRATIONS)
  })
  it('fails readiness when a required migration is absent', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: REQUIRED_MIGRATIONS.slice(0, -1).map(name => ({ name })) }) }
    await expect(assertSchemaReady(pool as unknown as Pool)).rejects.toThrow('migrations are pending')
  })
  it('fails closed without a cron secret and rejects unauthorized cleanup', async () => {
    let runs = 0
    const app = createApp(mockRecognizer, { maintenance: { async run() { runs++; return { status: 'completed' } } } })
    vi.stubEnv('CRON_SECRET', '')
    await request(app).get('/api/internal/cleanup').expect(503)
    vi.stubEnv('CRON_SECRET', 'x'.repeat(32))
    await request(app).get('/api/internal/cleanup').expect(401)
    await request(app).get('/api/internal/cleanup').set('Authorization', 'Bearer wrong').expect(401)
    expect(runs).toBe(0)
    await request(app).get('/api/internal/cleanup').set('Authorization', 'Bearer ' + 'x'.repeat(32)).expect(200)
    expect(runs).toBe(1)
  })
})

describe.skipIf(!process.env.TEST_DATABASE_URL)('PostgreSQL deployment controls', () => {
  it('checks schema, monitors maintenance, recovers expired scan capacity and enforces OCR budgets', async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 4 })
    const config = reliabilityConfigSchema.parse({ maxAnalysesPerSession: 1, maxDailyVisionCalls: 1 })
    const runtime = postgresRuntime(pool, config, { RATE_LIMIT_HASH_KEY: 'deployment-test-key-at-least-32-characters', VISION_PROVIDER: 'openai' })
    let owner: string | undefined
    try {
      // Other integration suites also use the database; apply schema explicitly first.
      const directory = fileURLToPath(new URL('../db/', import.meta.url))
      await pool.query('CREATE TABLE IF NOT EXISTS eco_schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
      for (const name of REQUIRED_MIGRATIONS) {
        await pool.query(readFileSync(directory + name, 'utf8'))
        await pool.query('INSERT INTO eco_schema_migrations(name) VALUES ($1) ON CONFLICT DO NOTHING', [name])
      }
      await assertSchemaReady(pool)
      await runtime.maintenance.run()
      await runtime.readiness()
      await pool.query("UPDATE eco_maintenance SET last_success_at = now() - interval '27 hours' WHERE name = 'retention'")
      await expect(runtime.readiness()).rejects.toThrow('maintenance')
      await runtime.maintenance.run()
      let entered!: () => void
      let finish!: () => void
      const started = new Promise<void>(resolve => { entered = resolve })
      const held = new Promise<void>(resolve => { finish = resolve })
      const slow = new Maintenance(pool, async () => { entered(); await held })
      const running = slow.run()
      await started
      try { expect(await runtime.maintenance.run()).toEqual({ status: 'already_running' }) }
      finally { finish(); await running }
      const failing = new Maintenance(pool, async () => { throw new Error('test failure') })
      await expect(failing.run()).rejects.toThrow('test failure')
      await expect(runtime.readiness()).rejects.toThrow('maintenance')
      await runtime.maintenance.run()
      await runtime.readiness()
      owner = await runtime.store.getOrCreate(undefined)
      const id = randomUUID()
      await runtime.store.addAnalysis(owner, id, { imageHash: null, recognitionMode: 'mock', suggestions: [] })
      await expect(runtime.store.reserveUpload(owner)).rejects.toMatchObject({ code: 'SCAN_STORAGE_LIMIT' })
      await pool.query("UPDATE eco_analyses SET expires_at = now() - interval '1 second' WHERE id = $1", [id])
      const release = await runtime.store.reserveUpload(owner)
      await release()
      await pool.query("UPDATE eco_analyses SET expires_at = now() - interval '2 hours' WHERE id = $1", [id])
      await runtime.maintenance.run()
      expect((await pool.query('SELECT 1 FROM eco_analyses WHERE id = $1', [id])).rowCount).toBe(0)
      let calls = 0
      const app = createApp(mockRecognizer, { ...runtime, materialRecognizer: { mode: 'vision', async recognizeLabel() { calls++; return [] } } })
      await pool.query('INSERT INTO eco_vision_daily_usage(day, calls) VALUES (current_date, 1) ON CONFLICT(day) DO UPDATE SET calls = 1')
      await request(app).post('/api/materials/recognize-label').attach('image', PNG_1X1, { filename: 'label.png', contentType: 'image/png' }).expect(429)
      expect(calls).toBe(0)
    } finally {
      await pool.query('DELETE FROM eco_vision_daily_usage WHERE day = current_date')
      if (owner) await pool.query('DELETE FROM eco_sessions WHERE id = $1', [owner])
      await pool.end()
    }
  })
})
