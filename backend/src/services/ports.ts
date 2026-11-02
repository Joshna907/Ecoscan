import type { AnalysisResponse, ConfirmScanResponse, DemoReceipt, ScanEstimate } from '../../../shared/src/index.js'

export interface RewardSnapshot {
  demoPointsBalance: number
  inventory?: Record<string, number>
  redemptions: readonly (DemoReceipt & { offerId: string })[]
}

export interface AnalysisEvidence {
  suggestions: AnalysisResponse['suggestions']
  recognitionMode: AnalysisResponse['recognitionMode'] | null
  imageHash: string | null
  duplicateImage: boolean
}

// The same workflow can use the local demo store or the persistent database store.
export interface EcoScanStore {
  getOrCreate(sessionId: string | undefined): Promise<string>
  reserveUpload(sessionId: string): Promise<() => Promise<void>>
  addAnalysis(sessionId: string, id: string, evidence: Omit<AnalysisEvidence, 'duplicateImage'>): Promise<void>
  confirmOnce(sessionId: string, analysisId: string, fingerprint: string, estimate: (evidence: AnalysisEvidence) => ScanEstimate): Promise<ConfirmScanResponse>
  hasLegacyResult?(sessionId: string): Promise<boolean>
  getLatestResult(sessionId: string): Promise<ConfirmScanResponse | null>
  getRewards(sessionId: string): Promise<RewardSnapshot>
  redeemOnce(sessionId: string, offerId: string, pointsCost: number): Promise<{ demoPointsBalance: number; receipt: DemoReceipt }>
  settleRedemption(sessionId: string, offerId: string, action: 'refund' | 'use'): Promise<{ demoPointsBalance: number; receipt: DemoReceipt }>
  ownerForReceipt(reference: string): Promise<{ sessionId: string; offerId: string } | null>
  saveRecoveryKey(sessionId: string, offerId: string, hash: string): Promise<{ recoveryExpiresAt: string }>
  recoverReceipt(hash: string): Promise<{ offerId: string; receipt: DemoReceipt; recoveryExpiresAt: string } | null>
  cleanup(): Promise<void>
}
