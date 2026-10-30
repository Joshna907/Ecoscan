import { randomBytes, randomUUID } from 'node:crypto'
import { Pool, type PoolClient } from 'pg'
import { confirmScanResponseSchema, type AnalysisResponse, type ConfirmScanResponse, type ScanEstimate } from 'shared'
import type { ReliabilityConfig } from '../config.js'
import { ApplicationError } from '../services/applicationError.js'
import type { EcoScanStore, RewardSnapshot } from '../services/ports.js'

type SessionRow = { id: string; demo_points_balance: number }
type AnalysisRow = { status: string; fingerprint: string | null; result: unknown; expires_at: Date }

// The session row is the lock for every balance change in that session.
export class PostgresSessionStore implements EcoScanStore {
  constructor(private readonly pool: Pool, private readonly config: ReliabilityConfig) {}

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
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

  async cleanup(): Promise<void> {
    // Drop unprocessed photos after a day, including when no worker was available.
    await this.pool.query(`WITH stale AS (
      DELETE FROM eco_recognition_jobs WHERE created_at <= now() - interval '1 day' RETURNING analysis_id
    ) UPDATE eco_analyses SET status = 'failed', expires_at = now() + ($1::bigint * interval '1 millisecond')
      WHERE id IN (SELECT analysis_id FROM stale)`, [this.config.resultRetentionMs])
    await this.pool.query('DELETE FROM eco_upload_leases WHERE expires_at <= now()')
    await this.pool.query(`DELETE FROM eco_sessions s WHERE last_seen_at <= now() - ($1::bigint * interval '1 millisecond') AND NOT EXISTS (SELECT 1 FROM eco_users u WHERE u.session_id = s.id) AND NOT EXISTS (SELECT 1 FROM eco_upload_leases l WHERE l.session_id = s.id) AND NOT EXISTS (SELECT 1 FROM eco_analyses a WHERE a.session_id = s.id AND a.status IN ('queued', 'processing'))`, [this.config.sessionTtlMs])
    await this.pool.query(`UPDATE eco_analyses SET status = 'expired', expires_at = expires_at + ($1::bigint * interval '1 millisecond'), suggestions = '[]'::jsonb WHERE status = 'awaiting_review' AND expires_at <= now()`, [this.config.resultRetentionMs])
    await this.pool.query('DELETE FROM eco_analyses WHERE status IN (\'confirmed\', \'expired\', \'failed\') AND expires_at <= now()')
  }

  async getOrCreate(id: string | undefined): Promise<string> {
    if (id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      const updated = await this.pool.query<{ id: string }>(`UPDATE eco_sessions SET last_seen_at = now() WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM eco_users WHERE session_id = $1) AND (last_seen_at > now() - ($2::bigint * interval '1 millisecond') OR EXISTS (SELECT 1 FROM eco_upload_leases WHERE session_id = $1 AND expires_at > now()) OR EXISTS (SELECT 1 FROM eco_analyses WHERE session_id = $1 AND status IN ('queued', 'processing'))) RETURNING id`, [id, this.config.sessionTtlMs])
      if (updated.rows[0]) return updated.rows[0].id
    }
    return this.transaction(async (client) => {
      // Serialize session creation across API copies so the capacity limit holds.
      await client.query('SELECT pg_advisory_xact_lock(17028101)')
      await client.query('DELETE FROM eco_upload_leases WHERE expires_at <= now()')
      await client.query(`DELETE FROM eco_sessions s WHERE last_seen_at <= now() - ($1::bigint * interval '1 millisecond') AND NOT EXISTS (SELECT 1 FROM eco_users u WHERE u.session_id = s.id) AND NOT EXISTS (SELECT 1 FROM eco_upload_leases l WHERE l.session_id = s.id) AND NOT EXISTS (SELECT 1 FROM eco_analyses a WHERE a.session_id = s.id AND a.status IN ('queued', 'processing'))`, [this.config.sessionTtlMs])
      const count = await client.query<{ count: string }>('SELECT count(*)::text AS count FROM eco_sessions')
      if (Number(count.rows[0].count) >= this.config.maxSessions) {
        throw new ApplicationError('SESSION_CAPACITY', 'The demo is busy. Please try again later.')
      }
      const newId = randomUUID()
      await client.query('INSERT INTO eco_sessions(id) VALUES ($1)', [newId])
      return newId
    })
  }

  private async lockedSession(client: PoolClient, id: string): Promise<SessionRow> {
    const result = await client.query<SessionRow>('SELECT id, demo_points_balance FROM eco_sessions WHERE id = $1 FOR UPDATE', [id])
    if (!result.rows[0]) throw new ApplicationError('SESSION_EXPIRED', 'This demo session expired. Start a new scan.')
    return result.rows[0]
  }

  async reserveUpload(sessionId: string): Promise<() => Promise<void>> {
    const leaseId = randomUUID()
    await this.transaction(async (client) => {
      await this.lockedSession(client, sessionId)
      await client.query('DELETE FROM eco_upload_leases WHERE session_id = $1 AND expires_at <= now()', [sessionId])
      const count = await client.query<{ count: string }>('SELECT count(*)::text AS count FROM eco_analyses WHERE session_id = $1', [sessionId])
      const pending = await client.query<{ count: string }>('SELECT count(*)::text AS count FROM eco_upload_leases WHERE session_id = $1', [sessionId])
      if (Number(count.rows[0].count) + Number(pending.rows[0].count) >= this.config.maxAnalysesPerSession) {
        throw new ApplicationError('SCAN_STORAGE_LIMIT', 'This session has too many retained scans. Please try again later.')
      }
      await client.query(`INSERT INTO eco_upload_leases(id, session_id, expires_at) VALUES ($1, $2, now() + interval '10 minutes')`, [leaseId, sessionId])
    })
    let released = false
    return async () => {
      if (released) return
      released = true
      await this.pool.query('DELETE FROM eco_upload_leases WHERE id = $1', [leaseId])
      await this.pool.query('UPDATE eco_sessions SET last_seen_at = now() WHERE id = $1', [sessionId])
    }
  }

  async addAnalysis(sessionId: string, id: string, suggestions: AnalysisResponse['suggestions']): Promise<void> {
    await this.pool.query(`INSERT INTO eco_analyses(id, session_id, status, expires_at, suggestions) VALUES ($1, $2, 'awaiting_review', now() + ($3::bigint * interval '1 millisecond'), $4::jsonb)`, [id, sessionId, this.config.analysisTtlMs, JSON.stringify(suggestions)])
  }

  async confirmOnce(sessionId: string, analysisId: string, fingerprint: string, estimate: () => ScanEstimate): Promise<ConfirmScanResponse> {
    return this.transaction(async (client) => {
      const session = await this.lockedSession(client, sessionId)
      const found = await client.query<AnalysisRow>('SELECT status, fingerprint, result, expires_at FROM eco_analyses WHERE id = $1 AND session_id = $2 FOR UPDATE', [analysisId, sessionId])
      const record = found.rows[0]
      if (!record) throw new ApplicationError('ANALYSIS_NOT_FOUND', 'This analysis is unavailable. Upload an image again.')
      if (record.expires_at.getTime() <= Date.now()) {
        if (record.status === 'awaiting_review' && record.expires_at.getTime() + this.config.resultRetentionMs > Date.now()) {
          throw new ApplicationError('ANALYSIS_EXPIRED', 'The review window expired. Upload an image again.')
        }
        throw new ApplicationError('ANALYSIS_NOT_FOUND', 'This analysis is unavailable. Upload an image again.')
      }
      if (record.status === 'expired') throw new ApplicationError('ANALYSIS_EXPIRED', 'The review window expired. Upload an image again.')
      if (record.status === 'queued' || record.status === 'processing') throw new ApplicationError('ANALYSIS_NOT_READY', 'This image is still being scanned. Try again shortly.')
      if (record.status === 'failed') throw new ApplicationError('ANALYSIS_FAILED', 'This scan failed. Upload an image again.')
      if (record.status === 'confirmed') {
        if (record.fingerprint !== fingerprint) throw new ApplicationError('CONFIRMATION_CONFLICT', 'This analysis was already confirmed with different items or a different comparison choice.')
        return confirmScanResponseSchema.parse(record.result)
      }
      const calculated = estimate()
      const result = confirmScanResponseSchema.parse({ ...calculated, demoPointsBalance: session.demo_points_balance + calculated.demoPointsAwarded })
      await client.query(`UPDATE eco_analyses SET status = 'confirmed', expires_at = now() + ($1::bigint * interval '1 millisecond'), fingerprint = $2, result = $3::jsonb, suggestions = '[]'::jsonb WHERE id = $4`, [this.config.resultRetentionMs, fingerprint, JSON.stringify(result), analysisId])
      await client.query('UPDATE eco_sessions SET demo_points_balance = $1, latest_result = $2::jsonb WHERE id = $3', [result.demoPointsBalance, JSON.stringify(result), sessionId])
      return result
    })
  }

  async getLatestResult(sessionId: string): Promise<ConfirmScanResponse | null> {
    const found = await this.pool.query<{ latest_result: unknown }>('SELECT latest_result FROM eco_sessions WHERE id = $1', [sessionId])
    if (!found.rows[0]) throw new ApplicationError('SESSION_EXPIRED', 'This demo session expired. Start a new scan.')
    return found.rows[0].latest_result === null ? null : confirmScanResponseSchema.parse(found.rows[0].latest_result)
  }

  async getRewards(sessionId: string): Promise<RewardSnapshot> {
    const snapshot = await this.pool.query<{ demo_points_balance: number }>('SELECT demo_points_balance FROM eco_sessions WHERE id = $1', [sessionId])
    if (!snapshot.rows[0]) throw new ApplicationError('SESSION_EXPIRED', 'This demo session expired. Start a new scan.')
    const redemptions = await this.pool.query<{ offer_id: string; demo_reference: string; redeemed_at: Date }>(
      'SELECT offer_id, demo_reference, redeemed_at FROM eco_redemptions WHERE session_id = $1', [sessionId])
    return { demoPointsBalance: snapshot.rows[0].demo_points_balance,
      redemptions: redemptions.rows.map((row) => ({ offerId: row.offer_id, reference: row.demo_reference, redeemedAt: row.redeemed_at.toISOString() })) }
  }

  async redeemOnce(sessionId: string, offerId: string, pointsCost: number) {
    if (!Number.isSafeInteger(pointsCost) || pointsCost <= 0) throw new Error('Invalid offer cost')
    return this.transaction(async (client) => {
      const session = await this.lockedSession(client, sessionId)
      const existing = await client.query('SELECT 1 FROM eco_redemptions WHERE session_id = $1 AND offer_id = $2', [sessionId, offerId])
      if (existing.rowCount) throw new ApplicationError('ALREADY_REDEEMED', 'You already redeemed this demo offer.')
      if (session.demo_points_balance < pointsCost) throw new ApplicationError('INSUFFICIENT_POINTS', 'You need more demo points for this offer.')
      const balance = session.demo_points_balance - pointsCost
      await client.query('UPDATE eco_sessions SET demo_points_balance = $1 WHERE id = $2', [balance, sessionId])
      const reference = 'DEMO-' + randomBytes(8).toString('hex').toUpperCase()
      const saved = await client.query<{ redeemed_at: Date }>(
        'INSERT INTO eco_redemptions(session_id, offer_id, points_cost, demo_reference) VALUES ($1, $2, $3, $4) RETURNING redeemed_at',
        [sessionId, offerId, pointsCost, reference])
      return { demoPointsBalance: balance, receipt: { reference, redeemedAt: saved.rows[0].redeemed_at.toISOString() } }
    })
  }
}
