import { confirmScanRequestSchema, type ConfirmScanResponse } from '../../../shared/src/index.js'
import { calculateEstimate } from '../domain/calculateEstimate.js'
import { ApplicationError } from './applicationError.js'
import type { EcoScanStore } from './ports.js'
import { sessionSubject, type RewardSafetyService } from './rewardSafety.js'

export class ScanService {
  constructor(private readonly store: Pick<EcoScanStore, 'confirmOnce' | 'getLatestResult' | 'hasLegacyResult'>, private readonly safety?: RewardSafetyService) {}

  async latest(sessionId: string): Promise<{ result: ConfirmScanResponse | null; legacyResult?: boolean }> {
    const result = await this.store.getLatestResult(sessionId)
    return { result, legacyResult: !result && !!(await this.store.hasLegacyResult?.(sessionId)) }
  }

  async confirm(sessionId: string, input: unknown): Promise<ConfirmScanResponse> {
    const parsed = confirmScanRequestSchema.safeParse(input)
    if (!parsed.success) {
      throw new ApplicationError('INVALID_SCAN', 'Review the item list and comparison choice, then try again.')
    }
    const request = parsed.data
    await this.safety?.assertAllowed(sessionSubject(sessionId))
    // Equivalent category totals allow reordered and split rows on a retry.
    const totals = new Map<string, number>()
    for (const item of request.items) {
      const profile = item.materialProfile
      const key = profile ? JSON.stringify({ category: item.category, composition: [...profile.composition].sort((a, b) => a.material.localeCompare(b.material)), components: profile.components?.map(component => ({ ...component, composition: [...component.composition].sort((a, b) => a.material.localeCompare(b.material)) })).sort((a, b) => a.kind.localeCompare(b.kind)), weightGrams: profile.weightGrams, source: profile.source }) : item.category
      totals.set(key, (totals.get(key) ?? 0) + item.quantity)
    }
    const fingerprint = JSON.stringify({
      items: [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)),
      replacesPlannedNewPurchase: request.replacesPlannedNewPurchase,
    })
    const result = await this.store.confirmOnce(sessionId, request.analysisId, fingerprint, (evidence) => calculateEstimate(request, evidence))
    if (result.rewardStatus === 'duplicate_image' || result.rewardStatus === 'reward_limit') await this.safety?.record(result.rewardStatus,sessionSubject(sessionId),request.analysisId)
    return result
  }
}
