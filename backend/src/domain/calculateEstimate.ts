import {
  confirmScanRequestSchema,
  scanEstimateSchema,
  type ConfirmScanRequest,
  type ScanEstimate,
} from 'shared'
import {
  ASSUMPTIONS_VERSION,
  DEMO_DISPLACEMENT_FACTOR,
  DEMO_POINTS_PER_SCENARIO_KG,
  PRODUCTION_KG_CO2E,
} from './carbonCatalogue.js'

const roundKg = (value: number) => Math.round(value * 100) / 100

export function calculateEstimate(input: ConfirmScanRequest): ScanEstimate {
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

  return scanEstimateSchema.parse({
    items,
    totalEstimatedProductionKgCo2e,
    scenarioPotentialAvoidedKgCo2e,
    demoPointsAwarded: Math.round(
      scenarioPotentialAvoidedKgCo2e * DEMO_POINTS_PER_SCENARIO_KG,
    ),
    assumptionsVersion: ASSUMPTIONS_VERSION,
  })
}
