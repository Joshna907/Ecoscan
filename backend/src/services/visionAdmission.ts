import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import type { ReliabilityConfig } from '../config.js'

export class VisionAdmissionError extends Error {
  constructor(public readonly code: 'VISION_BUSY' | 'VISION_BUDGET_EXHAUSTED') {
    super(code)
  }
}

export interface VisionPermit {
  markUsed(): void
  release(): Promise<void>
}

export class PostgresVisionAdmission {
  constructor(private readonly pool: Pool, private readonly config: ReliabilityConfig) {}

  async acquire(): Promise<VisionPermit> {
    const client = await this.pool.connect()
    const id = randomUUID()
    let day = ''
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock(17028106)')
      await client.query('DELETE FROM eco_vision_slots WHERE expires_at <= now()')
      const active = await client.query<{ count: string }>('SELECT count(*)::text AS count FROM eco_vision_slots')
      if (Number(active.rows[0].count) >= this.config.maxConcurrentVision) throw new VisionAdmissionError('VISION_BUSY')
      const date = await client.query<{ day: string }>('SELECT current_date::text AS day')
      day = date.rows[0].day
      await client.query('INSERT INTO eco_vision_daily_usage(day, calls) VALUES ($1, 0) ON CONFLICT (day) DO NOTHING', [day])
      const usage = await client.query<{ calls: number }>('SELECT calls FROM eco_vision_daily_usage WHERE day = $1 FOR UPDATE', [day])
      if (usage.rows[0].calls >= this.config.maxDailyVisionCalls) throw new VisionAdmissionError('VISION_BUDGET_EXHAUSTED')
      await client.query('UPDATE eco_vision_daily_usage SET calls = calls + 1 WHERE day = $1', [day])
      await client.query(`INSERT INTO eco_vision_slots(id, expires_at) VALUES ($1, now() + interval '2 minutes')`, [id])
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally { client.release() }

    let used = false
    let released = false
    return {
      markUsed: () => { used = true },
      release: async () => {
        if (released) return
        released = true
        const connection = await this.pool.connect()
        try {
          await connection.query('BEGIN')
          await connection.query('DELETE FROM eco_vision_slots WHERE id = $1', [id])
          if (!used) await connection.query('UPDATE eco_vision_daily_usage SET calls = GREATEST(calls - 1, 0) WHERE day = $1', [day])
          await connection.query('COMMIT')
        } catch (error) { await connection.query('ROLLBACK'); throw error }
        finally { connection.release() }
      },
    }
  }

  async cleanup(): Promise<void> {
    await this.pool.query('DELETE FROM eco_vision_slots WHERE expires_at <= now()')
    await this.pool.query("DELETE FROM eco_vision_daily_usage WHERE day < current_date - 2")
  }
}
