import { sameRewardImage, REWARD_CLAIM_RETENTION_MS, MAX_DAILY_REWARD_POINTS, MAX_MEMORY_REWARD_CLAIMS } from '../services/rewardImage.js'
import { randomBytes, randomUUID } from 'node:crypto'
import { confirmScanResponseSchema, type ConfirmScanResponse, type DemoReceipt, type ScanEstimate } from '../../../shared/src/index.js'
import { reliabilityConfigSchema, type ReliabilityConfig } from '../config.js'
import { ApplicationError } from '../services/applicationError.js'
import type { AnalysisEvidence, EcoScanStore, RewardSnapshot } from '../services/ports.js'

interface AnalysisBase { id: string; createdAt: number }
type AnalysisRecord = AnalysisBase & (
  | { status: 'awaiting_review'; expiresAt: number; evidence: Omit<AnalysisEvidence, 'duplicateImage'> }
  | { status: 'confirmed'; expiresAt: number; fingerprint: string; result: ConfirmScanResponse }
  | { status: 'expired'; expiresAt: number }
)

interface DemoSession {
  id: string
  analyses: Map<string, AnalysisRecord>
  lastSeenAt: number
  pendingUploads: number
  demoPointsBalance: number
  latestResult: ConfirmScanResponse | null
  redemptions: Map<string, DemoReceipt & { pointsCost: number }>
}

export class DemoSessionStore implements EcoScanStore {
  private readonly receiptArchive = new Map<string, { offerId: string; receipt: DemoReceipt; hash: string; recoveryExpiresAt: string }>()
  private readonly rewardClaims = new Map<string, { sessionId: string; points: number; at: number }>()
  private readonly inventory: Record<string, number> = { 'repair-kit': 100, 'swap-pass': 100, 'secondhand-voucher': 100 }
  private readonly sessions = new Map<string, DemoSession>()
  constructor(
    private readonly config: ReliabilityConfig = reliabilityConfigSchema.parse({}),
    private readonly now = Date.now,
  ) {}

  async cleanup(): Promise<void> {
    const now = this.now()
    for (const [reference, archived] of this.receiptArchive) if (Date.parse(archived.recoveryExpiresAt) <= now) this.receiptArchive.delete(reference)
    for (const [hash, claim] of this.rewardClaims) if (now - claim.at >= REWARD_CLAIM_RETENTION_MS) this.rewardClaims.delete(hash)
    for (const [id, session] of this.sessions) {
      // An admitted upload pins its session until recognition settles.
      if (session.pendingUploads === 0 && now - session.lastSeenAt >= this.config.sessionTtlMs && ![...session.redemptions.values()].some(receipt => Date.parse(receipt.expiresAt!) > now)) {
        this.sessions.delete(id)
        continue
      }
      for (const [analysisId, record] of session.analyses) {
        if (now < record.expiresAt) continue
        if (record.status === 'awaiting_review' && now < record.expiresAt + this.config.resultRetentionMs) {
          session.analyses.set(analysisId, {
            id: record.id, createdAt: record.createdAt, status: 'expired',
            expiresAt: record.expiresAt + this.config.resultRetentionMs,
          })
        } else session.analyses.delete(analysisId)
      }
    }
  }

  async getOrCreate(id: string | undefined): Promise<string> {
    await this.cleanup()
    const existing = id ? this.sessions.get(id) : undefined
    if (existing) { existing.lastSeenAt = this.now(); return existing.id }
    if (this.sessions.size >= this.config.maxSessions) {
      throw new ApplicationError('SESSION_CAPACITY', 'The demo is busy. Please try again later.')
    }

    const session: DemoSession = {
      id: randomUUID(),
      analyses: new Map(),
      lastSeenAt: this.now(),
      pendingUploads: 0,
      demoPointsBalance: 0,
      latestResult: null,
      redemptions: new Map(),
    }
    this.sessions.set(session.id, session)
    return session.id
  }

  private async requireSession(id: string): Promise<DemoSession> {
    await this.cleanup()
    const session = this.sessions.get(id)
    if (!session) throw new ApplicationError('SESSION_EXPIRED', 'This demo session expired. Start a new scan.')
    return session
  }

  async reserveUpload(sessionId: string): Promise<() => Promise<void>> {
    const session = await this.requireSession(sessionId)
    if (session.analyses.size + session.pendingUploads >= this.config.maxAnalysesPerSession) {
      throw new ApplicationError('SCAN_STORAGE_LIMIT', 'This session has too many retained scans. Please try again later.')
    }
    session.pendingUploads += 1
    let released = false
    return async () => {
      if (!released) {
        released = true
        session.pendingUploads -= 1
        session.lastSeenAt = this.now()
      }
    }
  }

  async addAnalysis(sessionId: string, id: string, evidence: Omit<AnalysisEvidence, 'duplicateImage'>): Promise<void> {
    const session = await this.requireSession(sessionId)
    session.analyses.set(id, {
      id, status: 'awaiting_review', createdAt: this.now(),
      expiresAt: this.now() + this.config.analysisTtlMs, evidence: structuredClone(evidence),
    })
  }

  async confirmOnce(sessionId: string, analysisId: string, fingerprint: string, estimate: (evidence: AnalysisEvidence) => ScanEstimate): Promise<ConfirmScanResponse> {
    const session = await this.requireSession(sessionId)
    const record = session.analyses.get(analysisId)
    if (!record) throw new ApplicationError('ANALYSIS_NOT_FOUND', 'This analysis is unavailable. Upload an image again.')
    if (record.status === 'expired') throw new ApplicationError('ANALYSIS_EXPIRED', 'The review window expired. Upload an image again.')
    if (record.status === 'confirmed') {
      if (record.fingerprint !== fingerprint) {
        throw new ApplicationError('CONFIRMATION_CONFLICT', 'This analysis was already confirmed with different items or a different comparison choice.')
      }
      return structuredClone(record.result)
    }
    // Validate before mutation. No await separates the state check, award, and saved result.
    const calculated = estimate({
      ...record.evidence,
      duplicateImage: !!record.evidence.imageHash && [...this.rewardClaims.keys()].some(hash => sameRewardImage(hash, record.evidence.imageHash!)),
    })
    const day = new Date(this.now()).toISOString().slice(0, 10)
    const earnedToday = [...this.rewardClaims.values()].filter(claim => claim.sessionId === sessionId && new Date(claim.at).toISOString().slice(0, 10) === day).reduce((sum, claim) => sum + claim.points, 0)
    if (calculated.demoPointsAwarded > 0 && (earnedToday + calculated.demoPointsAwarded > MAX_DAILY_REWARD_POINTS || this.rewardClaims.size >= MAX_MEMORY_REWARD_CLAIMS)) {
      calculated.demoPointsAwarded = 0
      calculated.rewardStatus = 'reward_limit'
    }
    const result = confirmScanResponseSchema.parse({
      ...calculated, demoPointsBalance: session.demoPointsBalance + calculated.demoPointsAwarded,
    })
    session.analyses.set(record.id, {
      id: record.id, createdAt: record.createdAt, status: 'confirmed',
      expiresAt: this.now() + this.config.resultRetentionMs,
      fingerprint, result,
    })
    session.demoPointsBalance = result.demoPointsBalance
    if (result.demoPointsAwarded > 0 && record.evidence.imageHash) this.rewardClaims.set(record.evidence.imageHash, { sessionId, points: result.demoPointsAwarded, at: this.now() })
    session.latestResult = structuredClone(result)
    return structuredClone(result)
  }

  async getLatestResult(sessionId: string): Promise<ConfirmScanResponse | null> {
    const session = await this.requireSession(sessionId)
    return session.latestResult ? structuredClone(session.latestResult) : null
  }

  async getRewards(sessionId: string): Promise<RewardSnapshot> {
    const session = await this.requireSession(sessionId)
    return { demoPointsBalance: session.demoPointsBalance, inventory: { ...this.inventory },
      redemptions: [...session.redemptions].map(([offerId, receipt]) => ({ offerId, ...receipt, status: receipt.status === 'issued' && Date.parse(receipt.expiresAt!) <= this.now() ? 'expired' as const : receipt.status })) }
  }

  async redeemOnce(sessionId: string, offerId: string, pointsCost: number) {
    const session = await this.requireSession(sessionId)
    if (!Number.isSafeInteger(pointsCost) || pointsCost <= 0) throw new Error('Invalid offer cost')
    if (session.redemptions.has(offerId)) {
      return { demoPointsBalance: session.demoPointsBalance, receipt: { ...structuredClone(session.redemptions.get(offerId)!), status: session.redemptions.get(offerId)!.status === 'issued' && Date.parse(session.redemptions.get(offerId)!.expiresAt!) <= this.now() ? 'expired' as const : session.redemptions.get(offerId)!.status } }
    }
    if (session.demoPointsBalance < pointsCost) {
      throw new ApplicationError('INSUFFICIENT_POINTS', 'You need more demo points for this offer.')
    }
    if (!this.inventory[offerId]) throw new ApplicationError('OUT_OF_STOCK', 'This demo offer is out of stock.')
    this.inventory[offerId]--
    session.demoPointsBalance -= pointsCost
    const receipt = { reference: 'DEMO-' + randomBytes(8).toString('hex').toUpperCase(), redeemedAt: new Date(this.now()).toISOString(), expiresAt: new Date(this.now() + 30 * 86400000).toISOString(), status: 'issued' as const, pointsCost }
    session.redemptions.set(offerId, receipt)
    return { demoPointsBalance: session.demoPointsBalance, receipt }
  }
  async settleRedemption(sessionId: string, offerId: string, action: 'refund' | 'use') {
    const session = await this.requireSession(sessionId)
    const receipt = session.redemptions.get(offerId)
    if (!receipt || (receipt.status !== 'issued' && !(action === 'refund' && receipt.status === 'refunded'))) throw new ApplicationError('VOUCHER_UNAVAILABLE', 'This voucher cannot be used or refunded.')
    if (receipt.status !== 'refunded') {
      if (action === 'use' && Date.parse(receipt.expiresAt!) <= this.now()) throw new ApplicationError('VOUCHER_UNAVAILABLE', 'This voucher has expired.')
      if (action === 'refund') { session.demoPointsBalance += receipt.pointsCost; this.inventory[offerId]++ }
      receipt.status = action === 'refund' ? 'refunded' : 'used'
      const archived = this.receiptArchive.get(receipt.reference)
      if (archived) archived.receipt = structuredClone(receipt)
    }
    return { demoPointsBalance: session.demoPointsBalance, receipt: structuredClone(receipt) }
  }

  async ownerForReceipt(reference: string) {
    for (const session of this.sessions.values()) for (const [offerId, receipt] of session.redemptions) if (receipt.reference === reference) return { sessionId: session.id, offerId }
    return null
  }

  async saveRecoveryKey(sessionId: string, offerId: string, hash: string) {
    const session = await this.requireSession(sessionId)
    const receipt = session.redemptions.get(offerId)
    if (!receipt) throw new ApplicationError('VOUCHER_UNAVAILABLE', 'Receipt not found in this browser session.')
    const recoveryExpiresAt = new Date(Date.parse(receipt.redeemedAt) + 180 * 86400_000).toISOString()
    if (Date.parse(recoveryExpiresAt) <= this.now()) throw new ApplicationError('VOUCHER_UNAVAILABLE', 'The recovery period has expired.')
    this.receiptArchive.set(receipt.reference, { offerId, receipt: structuredClone(receipt), hash, recoveryExpiresAt })
    return { recoveryExpiresAt }
  }

  async recoverReceipt(hash: string) {
    await this.cleanup()
    const record = [...this.receiptArchive.values()].find(value => value.hash === hash)
    if (!record) return null
    const result = structuredClone(record)
    if (result.receipt.status === 'issued' && Date.parse(result.receipt.expiresAt!) <= this.now()) result.receipt.status = 'expired'
    return { offerId: result.offerId, receipt: result.receipt, recoveryExpiresAt: result.recoveryExpiresAt }
  }

}
