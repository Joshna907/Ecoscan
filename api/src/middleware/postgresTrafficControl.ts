import { createHmac, randomUUID } from 'node:crypto'
import type { RequestHandler } from 'express'
import { Pool, type PoolClient } from 'pg'
import type { ReliabilityConfig } from '../config'
import { HttpError } from '../httpError'

async function transaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}

export class PostgresScanRateLimiter {
  constructor(private readonly pool: Pool, private readonly config: ReliabilityConfig, private readonly hashKey: string) {
    if (hashKey.length < 32) throw new Error('RATE_LIMIT_HASH_KEY must be at least 32 characters')
  }

  async consume(ip: string): Promise<void> {
    const key = createHmac('sha256', this.hashKey).update(ip).digest('hex')
    const waitSeconds = await transaction(this.pool, async (client) => {
      let found = await client.query<{ tokens: number; updated_at: Date }>(
        'SELECT tokens, updated_at FROM eco_scan_rate_buckets WHERE key_hash = $1 FOR UPDATE', [key])
      if (!found.rows[0]) {
        await client.query('SELECT pg_advisory_xact_lock(17028104)')
        found = await client.query<{ tokens: number; updated_at: Date }>(
          'SELECT tokens, updated_at FROM eco_scan_rate_buckets WHERE key_hash = $1 FOR UPDATE', [key])
        if (!found.rows[0]) {
          const count = await client.query<{ count: string }>('SELECT count(*)::text AS count FROM eco_scan_rate_buckets')
          if (Number(count.rows[0].count) >= this.config.maxRateClients) {
            throw new HttpError(503, 'RATE_LIMIT_CAPACITY', 'The scanner is busy. Please try again shortly.', 12)
          }
          await client.query('INSERT INTO eco_scan_rate_buckets(key_hash, tokens, updated_at) VALUES ($1, $2, clock_timestamp())', [key, this.config.scanRateCapacity])
          found = await client.query<{ tokens: number; updated_at: Date }>(
            'SELECT tokens, updated_at FROM eco_scan_rate_buckets WHERE key_hash = $1 FOR UPDATE', [key])
        }
      }
      const now = await client.query<{ current_time: Date }>('SELECT clock_timestamp() AS current_time')
      const elapsed = Math.max(0, now.rows[0].current_time.getTime() - found.rows[0].updated_at.getTime())
      const tokens = Math.min(this.config.scanRateCapacity, found.rows[0].tokens + elapsed / this.config.scanRateRefillMs)
      if (tokens < 1) {
        await client.query('UPDATE eco_scan_rate_buckets SET tokens = $2, updated_at = $3 WHERE key_hash = $1', [key, tokens, now.rows[0].current_time])
        return Math.max(1, Math.ceil((1 - tokens) * this.config.scanRateRefillMs / 1000))
      }
      await client.query('UPDATE eco_scan_rate_buckets SET tokens = $2, updated_at = $3 WHERE key_hash = $1', [key, tokens - 1, now.rows[0].current_time])
      return 0
    })
    if (waitSeconds) throw new HttpError(429, 'SCAN_RATE_LIMITED', 'Too many scan attempts. Please wait before trying again.', waitSeconds)
  }

  readonly middleware: RequestHandler = async (request, _response, next) => {
    try {
      await this.consume(request.ip ?? request.socket.remoteAddress ?? 'unknown')
      next()
    } catch (error) { next(error) }
  }

  async cleanup(): Promise<void> {
    await this.pool.query(`DELETE FROM eco_scan_rate_buckets WHERE tokens + GREATEST(0, EXTRACT(EPOCH FROM (clock_timestamp() - updated_at)) * 1000) / $1 >= $2`,
      [this.config.scanRateRefillMs, this.config.scanRateCapacity])
  }
}

export class PostgresUploadGate {
  private running = 0
  constructor(private readonly pool: Pool, private readonly limit: number) {}
  get active(): number { return this.running }

  async acquire(): Promise<() => Promise<void>> {
    const id = randomUUID()
    await transaction(this.pool, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(17028105)')
      await client.query('DELETE FROM eco_upload_slots WHERE expires_at <= now()')
      const count = await client.query<{ count: string }>('SELECT count(*)::text AS count FROM eco_upload_slots')
      if (Number(count.rows[0].count) >= this.limit) {
        throw new HttpError(503, 'SCANNER_BUSY', 'All scan slots are busy. Please try again shortly.', 2)
      }
      await client.query(`INSERT INTO eco_upload_slots(id, expires_at) VALUES ($1, now() + interval '2 minutes')`, [id])
    })
    this.running += 1
    let released = false
    return async () => {
      if (released) return
      released = true
      try { await this.pool.query('DELETE FROM eco_upload_slots WHERE id = $1', [id]) }
      finally { this.running -= 1 }
    }
  }
}
