import { confirmScanRequestSchema, type ConfirmScanResponse } from 'shared'
import { calculateEstimate } from '../domain/calculateEstimate'
import { ApplicationError } from './applicationError'
import type { EcoScanStore } from './ports'

export class ScanService {
  constructor(private readonly store: Pick<EcoScanStore, 'confirmOnce' | 'getLatestResult'>) {}

  async latest(sessionId: string): Promise<{ result: ConfirmScanResponse | null }> {
    return { result: await this.store.getLatestResult(sessionId) }
  }

  async confirm(sessionId: string, input: unknown): Promise<ConfirmScanResponse> {
    const parsed = confirmScanRequestSchema.safeParse(input)
    if (!parsed.success) {
      throw new ApplicationError('INVALID_SCAN', 'Review the item list and comparison choice, then try again.')
    }
    const request = parsed.data
    // Equivalent category totals allow reordered and split rows on a retry.
    const totals = new Map<string, number>()
    for (const item of request.items) {
      totals.set(item.category, (totals.get(item.category) ?? 0) + item.quantity)
    }
    const fingerprint = JSON.stringify({
      items: [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)),
      replacesPlannedNewPurchase: request.replacesPlannedNewPurchase,
    })
    return this.store.confirmOnce(sessionId, request.analysisId, fingerprint, () => calculateEstimate(request))
  }
}
