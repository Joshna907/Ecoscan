import type { AnalysisResponse, ConfirmScanResponse, DemoReceipt, ScanEstimate } from '../../../shared/src/index.js'

export interface RewardSnapshot {
  demoPointsBalance: number
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
  getLatestResult(sessionId: string): Promise<ConfirmScanResponse | null>
  getRewards(sessionId: string): Promise<RewardSnapshot>
  redeemOnce(sessionId: string, offerId: string, pointsCost: number): Promise<{ demoPointsBalance: number; receipt: DemoReceipt }>
  cleanup(): Promise<void>
}
