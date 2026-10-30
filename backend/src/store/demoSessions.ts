import { randomBytes, randomUUID } from 'node:crypto'
import { confirmScanResponseSchema, type ConfirmScanResponse, type ScanEstimate } from '../../../shared/src/index.js'
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
  redemptions: Map<string, { reference: string; redeemedAt: string }>
  rewardedImageHashes: Set<string>
}

export class DemoSessionStore implements EcoScanStore {
  private readonly sessions = new Map<string, DemoSession>()
  constructor(
    private readonly config: ReliabilityConfig = reliabilityConfigSchema.parse({}),
    private readonly now = Date.now,
  ) {}

  async cleanup(): Promise<void> {
    const now = this.now()
    for (const [id, session] of this.sessions) {
      // An admitted upload pins its session until recognition settles.
      if (session.pendingUploads === 0 && now - session.lastSeenAt >= this.config.sessionTtlMs) {
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
      rewardedImageHashes: new Set(),
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
      duplicateImage: !!record.evidence.imageHash && session.rewardedImageHashes.has(record.evidence.imageHash),
    })
    const result = confirmScanResponseSchema.parse({
      ...calculated, demoPointsBalance: session.demoPointsBalance + calculated.demoPointsAwarded,
    })
    session.analyses.set(record.id, {
      id: record.id, createdAt: record.createdAt, status: 'confirmed',
      expiresAt: this.now() + this.config.resultRetentionMs,
      fingerprint, result,
    })
    session.demoPointsBalance = result.demoPointsBalance
    if (result.demoPointsAwarded > 0 && record.evidence.imageHash) session.rewardedImageHashes.add(record.evidence.imageHash)
    session.latestResult = structuredClone(result)
    return structuredClone(result)
  }

  async getLatestResult(sessionId: string): Promise<ConfirmScanResponse | null> {
    const session = await this.requireSession(sessionId)
    return session.latestResult ? structuredClone(session.latestResult) : null
  }

  async getRewards(sessionId: string): Promise<RewardSnapshot> {
    const session = await this.requireSession(sessionId)
    return { demoPointsBalance: session.demoPointsBalance,
      redemptions: [...session.redemptions].map(([offerId, receipt]) => ({ offerId, ...receipt })) }
  }

  async redeemOnce(sessionId: string, offerId: string, pointsCost: number) {
    const session = await this.requireSession(sessionId)
    if (!Number.isSafeInteger(pointsCost) || pointsCost <= 0) throw new Error('Invalid offer cost')
    if (session.redemptions.has(offerId)) {
      throw new ApplicationError('ALREADY_REDEEMED', 'You already redeemed this demo offer.')
    }
    if (session.demoPointsBalance < pointsCost) {
      throw new ApplicationError('INSUFFICIENT_POINTS', 'You need more demo points for this offer.')
    }
    session.demoPointsBalance -= pointsCost
    const receipt = { reference: 'DEMO-' + randomBytes(8).toString('hex').toUpperCase(), redeemedAt: new Date(this.now()).toISOString() }
    session.redemptions.set(offerId, receipt)
    return { demoPointsBalance: session.demoPointsBalance, receipt }
  }
}
