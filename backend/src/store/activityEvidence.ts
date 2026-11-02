import { type Pool, type PoolClient } from 'pg'
import type { ActivityReceipt } from '../../../shared/src/index.js'
import { type EvidenceStore, type EvidenceRequest, type EvidenceEvent, evidenceError, validateEvidenceRequest, validateActivityDate } from '../services/activityEvidence.js'

type Confirmation = Parameters<EvidenceStore['confirm']>[0]
const receiptConflict = () => evidenceError(409, 'ACTIVITY_ALREADY_CLAIMED', 'This activity was already claimed. Reuse the original request for a retry.')
const rateLimit = () => evidenceError(429, 'ACTIVITY_LIMIT', 'The activity verification limit has been reached. Please try again later.')
const dayStart = (now: number) => Math.floor(now / 86400_000) * 86400_000

// Development/test only; production verification requires durable global deduplication.
export class MemoryEvidenceStore implements EvidenceStore {
  readonly persistent = false
  private requests = new Map<string, EvidenceRequest>()
  private events = new Map<string, EvidenceEvent>()
  constructor(private readonly now = Date.now) {}
  async create(request: EvidenceRequest) {
    await this.cleanup()
    if (this.requests.size >= 10000 || [...this.requests.values()].filter(r => r.sessionId === request.sessionId && r.createdAt >= dayStart(request.createdAt)).length >= 5) rateLimit()
    this.requests.set(request.codeHash, request)
  }
  async confirm(input: Confirmation, now: number) {
    const existing = this.events.get(input.eventHash)
    if (existing) {
      if (existing.fingerprint !== input.fingerprint) receiptConflict()
      return structuredClone(existing.receipt)
    }
    const request = this.requests.get(input.codeHash)
    validateEvidenceRequest(request, input, now)
    validateActivityDate(input.occurredAt, now)
    if ([...this.events.values()].some(e => e.requestId === request!.id)) receiptConflict()
    const events = [...this.events.values()]
    if (this.events.size >= 10000 || events.filter(e => e.participantHash === input.participantHash && Date.parse(e.receipt.confirmedAt) >= now - 30 * 86400_000).length >= 4 || events.filter(e => e.receipt.partnerId === input.partnerId && Date.parse(e.receipt.confirmedAt) >= dayStart(now)).length >= 1000) rateLimit()
    this.events.set(input.eventHash, { receipt: input.receipt, requestId: request!.id, sessionId: request!.sessionId, eventHash: input.eventHash, participantHash: input.participantHash, fingerprint: input.fingerprint })
    return structuredClone(input.receipt)
  }
  async reverse(partnerId: string, eventHash: string, reason: 'returned' | 'cancelled' | 'rejected') {
    const event = this.events.get(eventHash)
    if (!event || event.receipt.partnerId !== partnerId) evidenceError(404, 'ACTIVITY_NOT_FOUND', 'This activity is unavailable.')
    if (event.receipt.status === 'reversed' && event.receipt.reversalReason !== reason) receiptConflict()
    event.receipt.status = 'reversed'; event.receipt.reversalReason = reason
    return structuredClone(event.receipt)
  }
  async list(sessionId: string) { return structuredClone([...this.events.values()].filter(e => e.sessionId === sessionId).map(e => e.receipt).reverse()) }
  async cleanup() {
    const referenced = new Set([...this.events.values()].map(e => e.requestId))
    for (const [key, request] of this.requests) if (request.createdAt < this.now() - 86400_000 && !referenced.has(request.id)) this.requests.delete(key)
  }
}

type EventRow = { id: string; request_id: string; session_id: string | null; partner_id: string; partner_name: string; fingerprint: string; activity: ActivityReceipt['activity']; credits: number; occurred_at: Date; confirmed_at: Date; reversal_reason: ActivityReceipt['reversalReason'] }
const receiptOf = (r: EventRow): ActivityReceipt => ({ id: r.id, partnerId: r.partner_id, partnerName: r.partner_name, activity: r.activity, credits: r.credits, occurredAt: r.occurred_at.toISOString(), confirmedAt: r.confirmed_at.toISOString(), status: r.reversal_reason ? 'reversed' : 'confirmed', reversalReason: r.reversal_reason })

export class PostgresEvidenceStore implements EvidenceStore {
  readonly persistent = true
  constructor(private readonly pool: Pool) {}
  private async transaction<T>(work: (client: PoolClient) => Promise<T>) {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      // Serialize verification mutations across sessions and API replicas. This
      // pairs duplicate/participant/quota checks with the award in one commit.
      await client.query('SELECT pg_advisory_xact_lock(17028111)')
      const value = await work(client)
      await client.query('COMMIT'); return value
    } catch (error) { await client.query('ROLLBACK'); throw error }
    finally { client.release() }
  }
  async create(request: EvidenceRequest) {
    await this.transaction(async client => {
      const count = await client.query<{ count: string }>('SELECT count(*) FROM eco_activity_requests WHERE session_id=$1 AND created_at >= $2', [request.sessionId, new Date(dayStart(request.createdAt))])
      if (Number(count.rows[0].count) >= 5) rateLimit()
      await client.query('INSERT INTO eco_activity_requests(id,session_id,code_hash,partner_id,activity,created_at,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [request.id, request.sessionId, request.codeHash, request.partnerId, request.activity, new Date(request.createdAt), new Date(request.expiresAt)])
    })
  }
  async confirm(input: Confirmation, now: number) {
    return this.transaction(async client => {
      const existing = await client.query<EventRow>('SELECT * FROM eco_activity_events WHERE event_hash=$1', [input.eventHash])
      if (existing.rows[0]) {
        if (existing.rows[0].fingerprint !== input.fingerprint) receiptConflict()
        return receiptOf(existing.rows[0])
      }
      const found = await client.query<{ id: string; session_id: string | null; code_hash: string; partner_id: string; activity: ActivityReceipt['activity']; created_at: Date; expires_at: Date }>('SELECT * FROM eco_activity_requests WHERE code_hash=$1 FOR UPDATE', [input.codeHash])
      const row = found.rows[0]
      const request: EvidenceRequest | undefined = row ? { id: row.id, sessionId: row.session_id, codeHash: row.code_hash, partnerId: row.partner_id, activity: row.activity, createdAt: row.created_at.getTime(), expiresAt: row.expires_at.getTime() } : undefined
      validateEvidenceRequest(request, input, now)
      validateActivityDate(input.occurredAt, now)
      if ((await client.query('SELECT 1 FROM eco_activity_events WHERE request_id=$1', [request!.id])).rowCount) receiptConflict()
      const limits = await client.query<{ participant: string; partner: string }>(`SELECT
        count(*) FILTER (WHERE participant_hash=$1 AND confirmed_at >= $3)::text AS participant,
        count(*) FILTER (WHERE partner_id=$2 AND confirmed_at >= $4)::text AS partner
        FROM eco_activity_events WHERE confirmed_at >= $3`, [input.participantHash, input.partnerId, new Date(now - 30 * 86400_000), new Date(dayStart(now))])
      if (Number(limits.rows[0].participant) >= 4 || Number(limits.rows[0].partner) >= 1000) rateLimit()
      const receipt = input.receipt
      const saved = await client.query<EventRow>(`INSERT INTO eco_activity_events(id,request_id,session_id,partner_id,partner_name,event_hash,participant_hash,fingerprint,activity,credits,occurred_at,confirmed_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`, [receipt.id, request!.id, request!.sessionId, input.partnerId, receipt.partnerName, input.eventHash, input.participantHash, input.fingerprint, receipt.activity, receipt.credits, new Date(input.occurredAt), new Date(now)])
      return receiptOf(saved.rows[0])
    })
  }
  async reverse(partnerId: string, eventHash: string, reason: 'returned' | 'cancelled' | 'rejected') {
    return this.transaction(async client => {
      const found = await client.query<EventRow>('SELECT * FROM eco_activity_events WHERE partner_id=$1 AND event_hash=$2 FOR UPDATE', [partnerId, eventHash])
      const row = found.rows[0]
      if (!row) evidenceError(404, 'ACTIVITY_NOT_FOUND', 'This activity is unavailable.')
      if (row.reversal_reason && row.reversal_reason !== reason) receiptConflict()
      if (row.reversal_reason) return receiptOf(row)
      const saved = await client.query<EventRow>('UPDATE eco_activity_events SET reversal_reason=$2,reversed_at=now() WHERE id=$1 RETURNING *', [row.id, reason])
      return receiptOf(saved.rows[0])
    })
  }
  async list(sessionId: string) { return (await this.pool.query<EventRow>('SELECT * FROM eco_activity_events WHERE session_id=$1 ORDER BY confirmed_at DESC', [sessionId])).rows.map(receiptOf) }
  async cleanup() { await this.pool.query("DELETE FROM eco_activity_requests r WHERE created_at < now() - interval '1 day' AND NOT EXISTS (SELECT 1 FROM eco_activity_events e WHERE e.request_id=r.id)") }
}
