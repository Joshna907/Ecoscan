import {
  confirmScanRequestSchema,
  scanEstimateSchema,
  type ConfirmScanRequest,
  type ScanEstimate,
} from '../../../shared/src/index.js'
import {
  ASSUMPTIONS_VERSION,
  DEMO_DISPLACEMENT_FACTOR,
  DEMO_POINTS_PER_SCENARIO_KG,
  PRODUCTION_KG_CO2E,
} from './carbonCatalogue.js'
import type { AnalysisEvidence } from '../services/ports.js'

const roundKg = (value: number) => Math.round(value * 100) / 100

function sameCategoryTotals(input: ConfirmScanRequest, evidence: AnalysisEvidence): boolean {
  if (evidence.recognitionMode !== 'vision' || !evidence.imageHash || evidence.suggestions.length === 0) return false
  const confirmed = new Map<string, number>()
  const suggested = new Map<string, number>()
  for (const item of input.items) confirmed.set(item.category, (confirmed.get(item.category) ?? 0) + item.quantity)
  for (const item of evidence.suggestions) suggested.set(item.category, (suggested.get(item.category) ?? 0) + 1)
  if (confirmed.size !== suggested.size) return false
  return [...confirmed].every(([category, quantity]) => suggested.get(category) === quantity)
}

export function calculateEstimate(input: ConfirmScanRequest, evidence: AnalysisEvidence): ScanEstimate {
  const request = confirmScanRequestSchema.parse(input)
  const items = request.items.map(({ category, quantity }) => ({
    category,
    quantity,
    estimatedProductionKgCo2e: roundKg(PRODUCTION_KG_CO2E[category] * quantity),
  }))
  const totalEstimatedProductionKgCo2e = roundKg(
    items.reduce((total, item) => total + item.estimatedProductionKgCo2e, 0),
  )
  const scenarioPotentialAvoidedKgCo2e = request.replacesPlannedNewPurchase
    ? roundKg(totalEstimatedProductionKgCo2e * DEMO_DISPLACEMENT_FACTOR)
    : 0

  const rewardStatus = !request.replacesPlannedNewPurchase
    ? 'not_replacing'
    : !sameCategoryTotals(request, evidence)
      ? 'unverified_items'
      : evidence.duplicateImage
        ? 'duplicate_image'
        : 'awarded'

  return scanEstimateSchema.parse({
    items,
    totalEstimatedProductionKgCo2e,
    scenarioPotentialAvoidedKgCo2e,
    demoPointsAwarded: rewardStatus === 'awarded'
      ? Math.round(scenarioPotentialAvoidedKgCo2e * DEMO_POINTS_PER_SCENARIO_KG)
      : 0,
    rewardStatus,
    assumptionsVersion: ASSUMPTIONS_VERSION,
  })
}
