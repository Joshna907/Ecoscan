import { createHash, createHmac, randomUUID } from 'node:crypto'
import type { Pool } from 'pg'
import { HttpError } from '../httpError.js'

export const safetyRules = ['invalid_partner_signature','activity_claim_conflict','activity_limit','duplicate_image','reward_limit','recovery_failed','recovery_success','activity_confirmed'] as const
export type SafetyRule = typeof safetyRules[number]
export type ReviewDecision = 'dismiss' | 'hold' | 'release'
export interface SafetyEvent { id: string; rule: SafetyRule; subject: string; dedupKey: string | null; at: number }
export interface Review { id: string; rule: SafetyRule; subject: string; eventCount: number; createdAt: string; updatedAt: string; status: 'open' | 'held' | 'dismissed' | 'released'; version: number }
export interface ReviewAudit { operatorId: string; decision: ReviewDecision; reason: string; occurredAt: string }
export interface SafetyStore {
  readonly persistent:boolean
  record(event: SafetyEvent): Promise<void>
  held(subject: string): Promise<boolean>
  snapshot(): Promise<{ counts24h: Record<string, number>; reviews: Review[]; oldestOpenSeconds: number }>
  review(id: string, version: number, decision: ReviewDecision, reason: string, operatorId: string): Promise<Review>
  audit(id: string): Promise<ReviewAudit[]>
  cleanup(): Promise<void>
}
export const partnerSubject = (id: string) => 'partner:' + id
export const sessionSubject = (id: string) => 'session:' + createHash('sha256').update(id).digest('hex')
const shouldAlert = (rule: SafetyRule) => !['recovery_success','activity_confirmed'].includes(rule)
const conflict = () => { throw new HttpError(409, 'REVIEW_CONFLICT', 'This review changed. Refresh before deciding.') }

export class MemorySafetyStore implements SafetyStore {
  readonly persistent=false
  private events: SafetyEvent[] = []
  private reviews: Review[] = []
  private holds = new Set<string>()
  private history = new Map<string, ReviewAudit[]>()
  constructor(private readonly now = Date.now) {}
  async record(event: SafetyEvent) {
    await this.cleanup()
    if (event.dedupKey && this.events.some(e => e.dedupKey === event.dedupKey)) return
    this.events.push(event)
    const count = this.events.filter(e => e.rule === event.rule && e.subject === event.subject && e.at >= event.at - 15 * 60_000).length
    if (count < 3 || !shouldAlert(event.rule)) return
    const review = this.reviews.find(r => r.subject === event.subject && r.rule === event.rule && ['open','held'].includes(r.status))
    if (review) { review.eventCount = count; review.updatedAt = new Date(event.at).toISOString() }
    else this.reviews.push({ id: randomUUID(), rule: event.rule, subject: event.subject, eventCount: count, createdAt: new Date(event.at).toISOString(), updatedAt: new Date(event.at).toISOString(), status: 'open', version: 0 })
  }
  async held(subject: string) { return this.holds.has(subject) }
  async snapshot() {
    const reviews = this.reviews.filter(r => ['open','held'].includes(r.status)).sort((a,b) => a.createdAt.localeCompare(b.createdAt)).slice(0,100)
    const counts24h: Record<string,number> = {}
    for (const event of this.events) if (event.at >= this.now() - 86400_000) counts24h[event.rule] = (counts24h[event.rule] ?? 0) + 1
    return { counts24h, reviews: structuredClone(reviews), oldestOpenSeconds: reviews.length ? Math.max(0,Math.floor((this.now()-Date.parse(reviews[0].createdAt))/1000)) : 0 }
  }
  async review(id: string, version: number, decision: ReviewDecision, reason: string, operatorId: string) {
    const review = this.reviews.find(r => r.id === id)
    if (!review || review.version !== version) conflict()
    const row = review!
    if (decision === 'dismiss' && row.status !== 'open' || decision === 'hold' && row.status !== 'open' || decision === 'release' && row.status !== 'held') conflict()
    if (decision === 'hold') this.holds.add(row.subject)
    if (decision === 'release' && !this.reviews.some(r => r.id !== row.id && r.subject === row.subject && r.status === 'held')) this.holds.delete(row.subject)
    row.status = decision === 'dismiss' ? 'dismissed' : decision === 'hold' ? 'held' : 'released'; row.version++; row.updatedAt = new Date(this.now()).toISOString()
    this.history.set(id, [...this.history.get(id) ?? [], { operatorId, decision, reason, occurredAt: row.updatedAt }])
    return structuredClone(row)
  }
  async audit(id: string) { return structuredClone(this.history.get(id) ?? []) }
  async cleanup() { this.events = this.events.filter(e => e.at > this.now()-30*86400_000).slice(-10000) }
}

type ReviewRow = { id: string; rule: SafetyRule; subject: string; event_count: number; created_at: Date; updated_at: Date; status: Review['status']; version: number }
const reviewOf = (r: ReviewRow): Review => ({ id:r.id,rule:r.rule,subject:r.subject,eventCount:r.event_count,createdAt:r.created_at.toISOString(),updatedAt:r.updated_at.toISOString(),status:r.status,version:r.version })
export class PostgresSafetyStore implements SafetyStore {
  readonly persistent=true
  constructor(private readonly pool: Pool) {}
  async record(event: SafetyEvent) {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock(17028112)')
      const saved = await client.query('INSERT INTO eco_reward_security_events(id,rule,subject,dedup_key,occurred_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT(dedup_key) DO NOTHING RETURNING id', [event.id,event.rule,event.subject,event.dedupKey,new Date(event.at)])
      if (saved.rowCount && shouldAlert(event.rule)) {
        const count = Number((await client.query<{ count: string }>("SELECT count(*) FROM eco_reward_security_events WHERE rule=$1 AND subject=$2 AND occurred_at >= $3", [event.rule,event.subject,new Date(event.at-15*60_000)])).rows[0].count)
        if (count >= 3) await client.query(`INSERT INTO eco_reward_reviews(id,rule,subject,event_count) VALUES ($1,$2,$3,$4)
          ON CONFLICT(rule,subject) WHERE status IN ('open','held') DO UPDATE SET event_count=EXCLUDED.event_count,updated_at=now()`, [randomUUID(),event.rule,event.subject,count])
      }
      await client.query('COMMIT')
    } catch(error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  }
  async held(subject: string) { return !!(await this.pool.query('SELECT 1 FROM eco_reward_holds WHERE subject=$1',[subject])).rowCount }
  async snapshot() {
    const counts = await this.pool.query<{ rule: string; count: string }>("SELECT rule,count(*) FROM eco_reward_security_events WHERE occurred_at >= now()-interval '1 day' GROUP BY rule")
    const reviews = (await this.pool.query<ReviewRow>("SELECT * FROM eco_reward_reviews WHERE status IN ('open','held') ORDER BY created_at LIMIT 100")).rows.map(reviewOf)
    return { counts24h: Object.fromEntries(counts.rows.map(r => [r.rule,Number(r.count)])), reviews, oldestOpenSeconds: reviews.length ? Math.max(0,Math.floor((Date.now()-Date.parse(reviews[0].createdAt))/1000)) : 0 }
  }
  async review(id: string, version: number, decision: ReviewDecision, reason: string, operatorId: string) {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock(17028112)')
      const row = (await client.query<ReviewRow>('SELECT * FROM eco_reward_reviews WHERE id=$1 FOR UPDATE',[id])).rows[0]
      if (!row || row.version !== version || (decision === 'release' ? row.status !== 'held' : row.status !== 'open')) conflict()
      if (decision === 'hold') await client.query('INSERT INTO eco_reward_holds(subject,operator_id,reason) VALUES ($1,$2,$3) ON CONFLICT(subject) DO UPDATE SET operator_id=EXCLUDED.operator_id,reason=EXCLUDED.reason,updated_at=now()',[row.subject,operatorId,reason])
      if (decision === 'release') {
        // Another active review on this subject may still require a hold.
        const other = await client.query("SELECT 1 FROM eco_reward_reviews WHERE subject=$1 AND status='held' AND id<>$2",[row.subject,id])
        if (!other.rowCount) await client.query('DELETE FROM eco_reward_holds WHERE subject=$1',[row.subject])
      }
      const status = decision === 'dismiss' ? 'dismissed' : decision === 'hold' ? 'held' : 'released'
      const updated = (await client.query<ReviewRow>('UPDATE eco_reward_reviews SET status=$2,version=version+1,updated_at=now() WHERE id=$1 RETURNING *',[id,status])).rows[0]
      await client.query('INSERT INTO eco_reward_review_audit(id,review_id,operator_id,decision,reason) VALUES ($1,$2,$3,$4,$5)',[randomUUID(),id,operatorId,decision,reason])
      await client.query('COMMIT'); return reviewOf(updated)
    } catch(error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  }
  async audit(id: string) { return (await this.pool.query<{ operator_id: string; decision: ReviewDecision; reason: string; occurred_at: Date }>('SELECT operator_id,decision,reason,occurred_at FROM eco_reward_review_audit WHERE review_id=$1 ORDER BY occurred_at',[id])).rows.map(r => ({ operatorId:r.operator_id,decision:r.decision,reason:r.reason,occurredAt:r.occurred_at.toISOString() })) }
  async cleanup() { await this.pool.query("DELETE FROM eco_reward_security_events WHERE occurred_at < now()-interval '30 days'") }
}

export class RewardSafetyService {
  constructor(readonly store: SafetyStore, private readonly hashKey: string, private readonly now = Date.now) {}
  ipSubject(ip: string) { return 'network:' + createHmac('sha256',this.hashKey).update(ip).digest('hex') }
  async assertAllowed(subject: string) { if (await this.store.held(subject)) throw new HttpError(423,'REWARD_REVIEW_HOLD','Reward activity is temporarily held for review. Existing receipts remain viewable.') }
  async record(rule: SafetyRule, subject: string, reference?: string) {
    await this.store.record({ id:randomUUID(),rule,subject,dedupKey:reference ? createHash('sha256').update(JSON.stringify([rule,subject,reference])).digest('hex') : null,at:this.now() })
    if (shouldAlert(rule)) {
      const review=(await this.store.snapshot()).reviews.find(r=>r.rule===rule&&r.subject===subject)
      if (review) console.warn(JSON.stringify({event:'reward_review_required',reviewId:review.id,rule,eventCount:review.eventCount,status:review.status}))
    }
  }
}
