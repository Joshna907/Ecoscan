import { sameRewardImage, MAX_DAILY_REWARD_POINTS } from '../services/rewardImage.js'
import { randomBytes, randomUUID } from 'node:crypto'
import { Pool, type PoolClient } from 'pg'
import { analysisResponseSchema, confirmScanResponseSchema, type ConfirmScanResponse, type ScanEstimate } from '../../../shared/src/index.js'
import type { ReliabilityConfig } from '../config.js'
import { ApplicationError } from '../services/applicationError.js'
import type { AnalysisEvidence, EcoScanStore, RewardSnapshot } from '../services/ports.js'

type SessionRow = { id: string; demo_points_balance: number }
type AnalysisRow = {
  status: string
  fingerprint: string | null
  result: unknown
  expires_at: Date
  suggestions: unknown
  recognition_mode: string | null
  image_hash: string | null
}

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
    await this.pool.query('DELETE FROM eco_receipt_archive WHERE recovery_expires_at <= now()')
    await this.pool.query("DELETE FROM eco_visual_reward_claims WHERE claimed_at <= now() - interval '90 days'")
    // Drop unprocessed photos after a day, including when no worker was available.
    await this.pool.query(`WITH stale AS (
      DELETE FROM eco_recognition_jobs WHERE created_at <= now() - interval '1 day' RETURNING analysis_id
    ) UPDATE eco_analyses SET status = 'failed', expires_at = now() + ($1::bigint * interval '1 millisecond')
      WHERE id IN (SELECT analysis_id FROM stale)`, [this.config.resultRetentionMs])
    await this.pool.query('DELETE FROM eco_upload_leases WHERE expires_at <= now()')
    await this.pool.query(`DELETE FROM eco_sessions s WHERE last_seen_at <= now() - ($1::bigint * interval '1 millisecond') AND NOT EXISTS (SELECT 1 FROM eco_redemptions r WHERE r.session_id = s.id AND r.expires_at > now()) AND NOT EXISTS (SELECT 1 FROM eco_upload_leases l WHERE l.session_id = s.id) AND NOT EXISTS (SELECT 1 FROM eco_analyses a WHERE a.session_id = s.id AND a.status IN ('queued', 'processing'))`, [this.config.sessionTtlMs])
    await this.pool.query(`UPDATE eco_analyses SET status = 'expired', expires_at = expires_at + ($1::bigint * interval '1 millisecond'), suggestions = '[]'::jsonb WHERE status = 'awaiting_review' AND expires_at <= now()`, [this.config.resultRetentionMs])
    await this.pool.query('DELETE FROM eco_analyses WHERE status IN (\'confirmed\', \'expired\', \'failed\') AND expires_at <= now()')
  }

  async getOrCreate(id: string | undefined): Promise<string> {
    if (id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      const updated = await this.pool.query<{ id: string }>(`UPDATE eco_sessions SET last_seen_at = now() WHERE id = $1 AND (last_seen_at > now() - ($2::bigint * interval '1 millisecond') OR EXISTS (SELECT 1 FROM eco_redemptions WHERE session_id = $1 AND expires_at > now()) OR EXISTS (SELECT 1 FROM eco_upload_leases WHERE session_id = $1 AND expires_at > now()) OR EXISTS (SELECT 1 FROM eco_analyses WHERE session_id = $1 AND status IN ('queued', 'processing'))) RETURNING id`, [id, this.config.sessionTtlMs])
      if (updated.rows[0]) return updated.rows[0].id
    }
    return this.transaction(async (client) => {
      // Serialize session creation across API copies so the capacity limit holds.
      await client.query('SELECT pg_advisory_xact_lock(17028101)')
      await client.query('DELETE FROM eco_upload_leases WHERE expires_at <= now()')
      await client.query(`DELETE FROM eco_sessions s WHERE last_seen_at <= now() - ($1::bigint * interval '1 millisecond') AND NOT EXISTS (SELECT 1 FROM eco_redemptions r WHERE r.session_id = s.id AND r.expires_at > now()) AND NOT EXISTS (SELECT 1 FROM eco_upload_leases l WHERE l.session_id = s.id) AND NOT EXISTS (SELECT 1 FROM eco_analyses a WHERE a.session_id = s.id AND a.status IN ('queued', 'processing'))`, [this.config.sessionTtlMs])
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
      const count = await client.query<{ count: string }>('SELECT count(*)::text AS count FROM eco_analyses WHERE session_id = $1 AND expires_at > now()', [sessionId])
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

  async addAnalysis(sessionId: string, id: string, evidence: Omit<AnalysisEvidence, 'duplicateImage'>): Promise<void> {
    await this.pool.query(`INSERT INTO eco_analyses(id, session_id, status, expires_at, suggestions, recognition_mode, image_hash) VALUES ($1, $2, 'awaiting_review', now() + ($3::bigint * interval '1 millisecond'), $4::jsonb, $5, $6)`, [id, sessionId, this.config.analysisTtlMs, JSON.stringify(evidence.suggestions), evidence.recognitionMode, evidence.imageHash])
  }

  async confirmOnce(sessionId: string, analysisId: string, fingerprint: string, estimate: (evidence: AnalysisEvidence) => ScanEstimate): Promise<ConfirmScanResponse> {
    return this.transaction(async (client) => {
      const session = await this.lockedSession(client, sessionId)
      const found = await client.query<AnalysisRow>('SELECT status, fingerprint, result, expires_at, suggestions, recognition_mode, image_hash FROM eco_analyses WHERE id = $1 AND session_id = $2 FOR UPDATE', [analysisId, sessionId])
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
      // All claims use this lock across sessions/API replicas. Pair check and
      // insertion in one transaction so simultaneous lookalikes cannot both earn.
      await client.query('SELECT pg_advisory_xact_lock(17028107)')
      await client.query("DELETE FROM eco_visual_reward_claims WHERE claimed_at <= now() - interval '90 days'")
      const visualClaims = await client.query<{ image_hash: string }>("SELECT image_hash FROM eco_visual_reward_claims WHERE claimed_at > now() - interval '90 days'")
      const visualDuplicate = !!record.image_hash && visualClaims.rows.some(row => sameRewardImage(row.image_hash, record.image_hash!))
      const duplicate = visualDuplicate || (record.image_hash
        ? (await client.query('SELECT 1 FROM eco_reward_claims WHERE session_id = $1 AND image_hash = $2', [sessionId, record.image_hash])).rowCount === 1
        : false)
      const recognitionMode = record.recognition_mode === 'vision' || record.recognition_mode === 'mock'
        ? record.recognition_mode
        : null
      const calculated = estimate({
        suggestions: analysisResponseSchema.shape.suggestions.parse(record.suggestions),
        recognitionMode,
        imageHash: record.image_hash,
        duplicateImage: duplicate,
      })
      const daily = await client.query<{ points: string }>(`SELECT COALESCE(sum(points), 0)::text AS points FROM eco_visual_reward_claims
        WHERE session_id = $1 AND claimed_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`, [sessionId])
      if (calculated.demoPointsAwarded > 0 && Number(daily.rows[0].points) + calculated.demoPointsAwarded > MAX_DAILY_REWARD_POINTS) {
        calculated.demoPointsAwarded = 0
        calculated.rewardStatus = 'reward_limit'
      }
      const result = confirmScanResponseSchema.parse({ ...calculated, demoPointsBalance: session.demo_points_balance + calculated.demoPointsAwarded })
      if (result.demoPointsAwarded > 0 && record.image_hash) {
        await client.query('INSERT INTO eco_visual_reward_claims(image_hash, session_id, points) VALUES ($1, $2, $3)', [record.image_hash, sessionId, result.demoPointsAwarded])
        await client.query('INSERT INTO eco_reward_claims(session_id, image_hash, analysis_id) VALUES ($1, $2, $3)', [sessionId, record.image_hash, analysisId])
      }
      await client.query(`UPDATE eco_analyses SET status = 'confirmed', expires_at = now() + ($1::bigint * interval '1 millisecond'), fingerprint = $2, result = $3::jsonb, suggestions = '[]'::jsonb WHERE id = $4`, [this.config.resultRetentionMs, fingerprint, JSON.stringify(result), analysisId])
      await client.query('UPDATE eco_sessions SET demo_points_balance = $1, latest_result = $2::jsonb WHERE id = $3', [result.demoPointsBalance, JSON.stringify(result), sessionId])
      return result
    })
  }

  async getLatestResult(sessionId: string): Promise<ConfirmScanResponse | null> {
    const found = await this.pool.query<{ latest_result: unknown }>('SELECT latest_result FROM eco_sessions WHERE id = $1', [sessionId])
    if (!found.rows[0]) throw new ApplicationError('SESSION_EXPIRED', 'This demo session expired. Start a new scan.')
    // Legacy snapshots predate material ranges. Keep balances and receipts, but
    // ask for a new estimate instead of failing the entire Results endpoint.
    const result = confirmScanResponseSchema.safeParse(found.rows[0].latest_result)
    return result.success ? result.data : null
  }

  async hasLegacyResult(sessionId: string): Promise<boolean> {
    const found = await this.pool.query<{ latest_result: unknown }>('SELECT latest_result FROM eco_sessions WHERE id=$1', [sessionId])
    return found.rows[0]?.latest_result != null && !confirmScanResponseSchema.safeParse(found.rows[0].latest_result).success
  }

  async getRewards(sessionId: string): Promise<RewardSnapshot> {
    const snapshot = await this.pool.query<{ demo_points_balance: number }>('SELECT demo_points_balance FROM eco_sessions WHERE id = $1', [sessionId])
    if (!snapshot.rows[0]) throw new ApplicationError('SESSION_EXPIRED', 'This demo session expired. Start a new scan.')
    const redemptions = await this.pool.query<{ offer_id: string; demo_reference: string; redeemed_at: Date; expires_at: Date; status: 'issued' | 'used' | 'refunded' }>(
      'SELECT offer_id, demo_reference, redeemed_at, expires_at, status FROM eco_redemptions WHERE session_id = $1', [sessionId])
    const inventory = await this.pool.query<{ offer_id: string; remaining: number }>('SELECT offer_id, remaining FROM eco_offer_inventory')
    return { demoPointsBalance: snapshot.rows[0].demo_points_balance, inventory: Object.fromEntries(inventory.rows.map(row => [row.offer_id, row.remaining])),
      redemptions: redemptions.rows.map((row) => ({ offerId: row.offer_id, reference: row.demo_reference, redeemedAt: row.redeemed_at.toISOString(), expiresAt: row.expires_at.toISOString(), status: row.status === 'issued' && row.expires_at.getTime() <= Date.now() ? 'expired' as const : row.status })) }
  }

  async redeemOnce(sessionId: string, offerId: string, pointsCost: number) {
    if (!Number.isSafeInteger(pointsCost) || pointsCost <= 0) throw new Error('Invalid offer cost')
    return this.transaction(async (client) => {
      const session = await this.lockedSession(client, sessionId)
      const existing = await client.query<{ demo_reference: string; redeemed_at: Date; expires_at: Date; status: 'issued' | 'used' | 'refunded' }>('SELECT demo_reference, redeemed_at, expires_at, status FROM eco_redemptions WHERE session_id = $1 AND offer_id = $2', [sessionId, offerId])
      if (existing.rows[0]) return { demoPointsBalance: session.demo_points_balance, receipt: { reference: existing.rows[0].demo_reference, redeemedAt: existing.rows[0].redeemed_at.toISOString(), expiresAt: existing.rows[0].expires_at.toISOString(), status: existing.rows[0].status === 'issued' && existing.rows[0].expires_at.getTime() <= Date.now() ? 'expired' as const : existing.rows[0].status } }
      if (session.demo_points_balance < pointsCost) throw new ApplicationError('INSUFFICIENT_POINTS', 'You need more demo points for this offer.')
      const stock = await client.query('UPDATE eco_offer_inventory SET remaining = remaining - 1 WHERE offer_id = $1 AND remaining > 0 RETURNING remaining', [offerId])
      if (!stock.rowCount) throw new ApplicationError('OUT_OF_STOCK', 'This demo offer is out of stock.')
      const balance = session.demo_points_balance - pointsCost
      await client.query('UPDATE eco_sessions SET demo_points_balance = $1 WHERE id = $2', [balance, sessionId])
      const reference = 'DEMO-' + randomBytes(8).toString('hex').toUpperCase()
      const saved = await client.query<{ redeemed_at: Date; expires_at: Date }>(
        'INSERT INTO eco_redemptions(session_id, offer_id, points_cost, demo_reference) VALUES ($1, $2, $3, $4) RETURNING redeemed_at, expires_at',
        [sessionId, offerId, pointsCost, reference])
      return { demoPointsBalance: balance, receipt: { reference, redeemedAt: saved.rows[0].redeemed_at.toISOString(), expiresAt: saved.rows[0].expires_at.toISOString(), status: 'issued' as const } }
    })
  }
  async settleRedemption(sessionId: string, offerId: string, action: 'refund' | 'use') {
    return this.transaction(async client => {
      const session = await this.lockedSession(client, sessionId)
      const found = await client.query<{ points_cost: number; demo_reference: string; redeemed_at: Date; expires_at: Date; status: 'issued' | 'used' | 'refunded' }>('SELECT points_cost, demo_reference, redeemed_at, expires_at, status FROM eco_redemptions WHERE session_id=$1 AND offer_id=$2 FOR UPDATE', [sessionId, offerId])
      const row = found.rows[0]
      if (!row || (row.status !== 'issued' && !(action === 'refund' && row.status === 'refunded'))) throw new ApplicationError('VOUCHER_UNAVAILABLE', 'This voucher cannot be used or refunded.')
      if (action === 'use' && row.expires_at.getTime() <= Date.now()) throw new ApplicationError('VOUCHER_UNAVAILABLE', 'This voucher has expired.')
      const refund = action === 'refund' && row.status !== 'refunded' ? row.points_cost : 0
      const status = action === 'refund' ? 'refunded' as const : 'used' as const
      if (row.status !== 'refunded') {
        await client.query('UPDATE eco_redemptions SET status=$3, settled_at=now() WHERE session_id=$1 AND offer_id=$2', [sessionId, offerId, status])
        await client.query('UPDATE eco_receipt_archive SET status=$2 WHERE reference=$1', [row.demo_reference, status])
        if (refund) {
          await client.query('UPDATE eco_sessions SET demo_points_balance=demo_points_balance+$2 WHERE id=$1', [sessionId, refund])
          await client.query('UPDATE eco_offer_inventory SET remaining=remaining+1 WHERE offer_id=$1', [offerId])
        }
      }
      return { demoPointsBalance: session.demo_points_balance + refund, receipt: { reference: row.demo_reference, redeemedAt: row.redeemed_at.toISOString(), expiresAt: row.expires_at.toISOString(), status } }
    })
  }

  async ownerForReceipt(reference: string) {
    const found = await this.pool.query<{ session_id: string; offer_id: string }>('SELECT session_id, offer_id FROM eco_redemptions WHERE demo_reference=$1', [reference])
    return found.rows[0] ? { sessionId: found.rows[0].session_id, offerId: found.rows[0].offer_id } : null
  }

  async saveRecoveryKey(sessionId: string, offerId: string, hash: string) {
    return this.transaction(async client => {
      await this.lockedSession(client, sessionId)
      const found = await client.query<{ demo_reference: string; redeemed_at: Date; expires_at: Date; status: string }>('SELECT demo_reference,redeemed_at,expires_at,status FROM eco_redemptions WHERE session_id=$1 AND offer_id=$2 FOR UPDATE', [sessionId, offerId])
      const row = found.rows[0]
      if (!row) throw new ApplicationError('VOUCHER_UNAVAILABLE', 'Receipt not found in this browser session.')
      const recoveryExpiresAt = new Date(row.redeemed_at.getTime() + 180 * 86400_000)
      if (recoveryExpiresAt.getTime() <= Date.now()) throw new ApplicationError('VOUCHER_UNAVAILABLE', 'The recovery period has expired.')
      await client.query(`INSERT INTO eco_receipt_archive(reference,offer_id,redeemed_at,expires_at,status,recovery_hash,recovery_expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT(reference) DO UPDATE SET status=EXCLUDED.status,recovery_hash=EXCLUDED.recovery_hash`, [row.demo_reference, offerId, row.redeemed_at, row.expires_at, row.status, hash, recoveryExpiresAt])
      return { recoveryExpiresAt: recoveryExpiresAt.toISOString() }
    })
  }

  async recoverReceipt(hash: string) {
    const found = await this.pool.query<{ reference: string; offer_id: string; redeemed_at: Date; expires_at: Date; status: 'issued' | 'used' | 'refunded'; recovery_expires_at: Date }>('SELECT * FROM eco_receipt_archive WHERE recovery_hash=$1 AND recovery_expires_at > now()', [hash])
    const row = found.rows[0]
    return row ? { offerId: row.offer_id, receipt: { reference: row.reference, redeemedAt: row.redeemed_at.toISOString(), expiresAt: row.expires_at.toISOString(), status: row.status === 'issued' && row.expires_at.getTime() <= Date.now() ? 'expired' as const : row.status }, recoveryExpiresAt: row.recovery_expires_at.toISOString() } : null
  }

}
