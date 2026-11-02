import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { qualifyingActivitySchema, type ActivityReceipt, type QualifyingActivity } from '../../../shared/src/index.js'
import { HttpError } from '../httpError.js'
import { partnerSubject, type RewardSafetyService } from './rewardSafety.js'

const partnerSchema = z.object({ id: z.string().regex(/^[a-z0-9-]{1,64}$/), name: z.string().min(2).max(100), secret: z.string().min(32), activities: z.array(qualifyingActivitySchema).min(1) }).strict()
export type EvidencePartner = z.infer<typeof partnerSchema>
export interface EvidenceConfig { hashKey: string; partners: EvidencePartner[] }
export function evidenceConfig(env: NodeJS.ProcessEnv = process.env): EvidenceConfig {
  const partners = z.array(partnerSchema).max(50).parse(JSON.parse(env.ACTIVITY_EVIDENCE_PARTNERS || '[]'))
  if (new Set(partners.map(p => p.id)).size !== partners.length || new Set(partners.map(p => p.secret)).size !== partners.length) throw new Error('Activity partners need unique IDs and secrets')
  if (partners.length && (!env.ACTIVITY_EVIDENCE_HASH_KEY || env.ACTIVITY_EVIDENCE_HASH_KEY.length < 32)) throw new Error('ACTIVITY_EVIDENCE_HASH_KEY must have at least 32 characters')
  return { partners, hashKey: env.ACTIVITY_EVIDENCE_HASH_KEY ?? '' }
}
export const activityAttestationSchema = z.object({
  code: z.string().regex(/^[A-Za-z0-9_-]{43}$/), eventReference: z.string().trim().min(1).max(128),
  participantReference: z.string().trim().min(1).max(128), activity: qualifyingActivitySchema,
  occurredAt: z.string().datetime(),
}).strict()
export const activityReversalSchema = z.object({ eventReference: z.string().trim().min(1).max(128), reason: z.enum(['returned', 'cancelled', 'rejected']) }).strict()
export const ACTIVITY_CREDITS: Record<QualifyingActivity, number> = { repair: 50, secondhand_purchase: 25, donation: 10, recycling: 10 }
export const REQUEST_TTL_MS = 15 * 60_000
export function evidenceError(status: number, code: string, message: string): never { throw new HttpError(status, code, message) }
export const codeHash = (code: string) => createHash('sha256').update(code).digest('hex')
export interface EvidenceRequest { id: string; sessionId: string | null; codeHash: string; partnerId: string; activity: QualifyingActivity; createdAt: number; expiresAt: number }
export interface EvidenceEvent { receipt: ActivityReceipt; requestId: string; sessionId: string | null; eventHash: string; participantHash: string; fingerprint: string }
export interface EvidenceStore {
  readonly persistent: boolean
  create(request: EvidenceRequest): Promise<void>
  confirm(input: { codeHash: string; partnerId: string; activity: QualifyingActivity; eventHash: string; participantHash: string; fingerprint: string; occurredAt: number; receipt: ActivityReceipt }, now: number): Promise<ActivityReceipt>
  reverse(partnerId: string, eventHash: string, reason: 'returned' | 'cancelled' | 'rejected'): Promise<ActivityReceipt>
  list(sessionId: string): Promise<ActivityReceipt[]>
  cleanup(): Promise<void>
}
export class ActivityEvidenceService {
  constructor(readonly config: EvidenceConfig, readonly store: EvidenceStore, private readonly now = Date.now, private readonly safety?: RewardSafetyService) {}
  private hash(partnerId: string, kind: string, value: string) { return createHmac('sha256', this.config.hashKey).update(JSON.stringify([partnerId, kind, value])).digest('hex') }
  snapshot = async (sessionId: string) => {
    const receipts = await this.store.list(sessionId)
    return { enabled: this.config.partners.length > 0, partners: this.config.partners.map(p => ({ id: p.id, name: p.name, activities: p.activities })), receipts, verifiedActivityCredits: receipts.reduce((sum, receipt) => sum + (receipt.status === 'confirmed' ? receipt.credits : 0), 0) }
  }
  async request(sessionId: string, partnerId: string, activity: QualifyingActivity) {
    const partner = this.config.partners.find(p => p.id === partnerId)
    if (!partner || !partner.activities.includes(activity)) evidenceError(400, 'ACTIVITY_UNAVAILABLE', 'Choose an available partner and activity.')
    const code = randomBytes(32).toString('base64url')
    const expiresAt = this.now() + REQUEST_TTL_MS
    await this.store.create({ id: randomUUID(), sessionId, codeHash: codeHash(code), partnerId, activity, createdAt: this.now(), expiresAt })
    return { code, expiresAt: new Date(expiresAt).toISOString() }
  }
  async confirm(partner: EvidencePartner, body: z.infer<typeof activityAttestationSchema>) {
    await this.safety?.assertAllowed(partnerSubject(partner.id))
    const now = this.now(), occurredAt = Date.parse(body.occurredAt)
    if (!partner.activities.includes(body.activity)) evidenceError(403, 'ACTIVITY_FORBIDDEN', 'This partner cannot confirm that activity.')
    const fingerprint = this.hash(partner.id, 'payload', JSON.stringify([codeHash(body.code), body.eventReference, body.participantReference, body.activity, body.occurredAt]))
    const receipt = await this.store.confirm({ codeHash: codeHash(body.code), partnerId: partner.id, activity: body.activity, eventHash: this.hash(partner.id, 'event', body.eventReference), participantHash: this.hash(partner.id, 'participant', body.participantReference), fingerprint, occurredAt,
      receipt: { id: randomUUID(), partnerId: partner.id, partnerName: partner.name, activity: body.activity, credits: ACTIVITY_CREDITS[body.activity], occurredAt: body.occurredAt, confirmedAt: new Date(now).toISOString(), status: 'confirmed', reversalReason: null } }, now)
    await this.safety?.record('activity_confirmed',partnerSubject(partner.id),receipt.id)
    return receipt
  }
  reverse(partner: EvidencePartner, eventReference: string, reason: 'returned' | 'cancelled' | 'rejected') { return this.store.reverse(partner.id, this.hash(partner.id, 'event', eventReference), reason) }
}

export function validateEvidenceRequest(request: EvidenceRequest | undefined, input: { partnerId: string; activity: QualifyingActivity }, now: number) {
  if (!request || !request.sessionId || request.expiresAt <= now) evidenceError(410, 'ACTIVITY_REQUEST_EXPIRED', 'This activity request is unavailable or expired. Ask the user for a new code.')
  if (request.partnerId !== input.partnerId || request.activity !== input.activity) evidenceError(409, 'ACTIVITY_MISMATCH', 'The code belongs to another partner or activity.')
}

export function validateActivityDate(occurredAt: number, now: number) {
  // Check new awards after replay detection so original receipts remain recoverable.
  if (occurredAt > now || occurredAt < now - 30 * 86400_000) evidenceError(400, 'INVALID_ACTIVITY_DATE', 'Activity must have completed within the last 30 days.')
}
