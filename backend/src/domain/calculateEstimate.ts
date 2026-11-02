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
  GARMENT_WEIGHT_GRAMS,
  getMaterialDataset,
  MATERIAL_KG_CO2E_PER_KG,
  PRODUCTION_KG_CO2E,
} from './carbonCatalogue.js'
import type { AnalysisEvidence } from '../services/ports.js'

const roundKg = (value: number) => Math.round(value * 100) / 100
const categoryRange = (value: number) => ({
  low: roundKg(value * 0.6), central: roundKg(value), high: roundKg(value * 1.6),
})

function materialStage(item: ConfirmScanRequest['items'][number], factors = MATERIAL_KG_CO2E_PER_KG) {
  const profile = item.materialProfile
  if (!profile) return undefined
  const weight = profile.weightGrams
    ? { low: profile.weightGrams, central: profile.weightGrams, high: profile.weightGrams, source: 'measured' as const }
    : { ...GARMENT_WEIGHT_GRAMS[item.category], source: 'category_range' as const }
  const components = profile.components ?? [{ weightGrams: weight.central, composition: profile.composition }]
  const missingFactors = components.flatMap(component=>component.composition.filter(part=>!factors[part.material]).map(part=>({ material:part.material,weightGrams:roundKg(component.weightGrams*part.percentage/100),...('kind' in component?{component:String(component.kind)}:{}) })))
  const coverage = components.reduce((sum,component)=>sum+component.weightGrams*component.composition.filter(part=>factors[part.material]).reduce((total,part)=>total+part.percentage/100,0),0)
  const unallocatedMassGrams = Math.max(0,weight.central-components.reduce((sum,component)=>sum+component.weightGrams,0))
  const ranges = components.map(component => {
    const factor = component.composition.reduce((sum, part) => {
      const value = factors[part.material]
      if (!value) return sum
      return { low: sum.low + value.low * part.percentage / 100, central: sum.central + value.central * part.percentage / 100, high: sum.high + value.high * part.percentage / 100 }
    }, { low: 0, central: 0, high: 0 })
    const mass = profile.components ? { low: component.weightGrams, central: component.weightGrams, high: component.weightGrams } : weight
    return { low: roundKg(mass.low / 1000 * factor.low * item.quantity), central: roundKg(mass.central / 1000 * factor.central * item.quantity), high: roundKg(mass.high / 1000 * factor.high * item.quantity) }
  })
  return { range: coverage>0 ? addRanges(ranges) : undefined, weight, coverage:roundKg(coverage),materialCoverage:{ status:coverage===0?'unsupported' as const:weight.central-coverage>0.000001?'partial' as const:'complete' as const,supportedMassGrams:roundKg(coverage),uncoveredMassGrams:roundKg(Math.max(0,weight.central-coverage)),unallocatedMassGrams:roundKg(unallocatedMassGrams),missingFactors } }
}

function addRanges(ranges: Array<{ low: number; central: number; high: number }>) {
  return ranges.reduce((total, range) => ({
    low: roundKg(total.low + range.low),
    central: roundKg(total.central + range.central),
    high: roundKg(total.high + range.high),
  }), { low: 0, central: 0, high: 0 })
}

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
  const dataset = getMaterialDataset()
  const request = confirmScanRequestSchema.parse(input)
  const items = request.items.map((item) => {
    const estimatedProductionKgCo2e = roundKg(PRODUCTION_KG_CO2E[item.category] * item.quantity)
    const material = materialStage(item, dataset.factors)
    return {
      ...item,
      estimatedProductionKgCo2e,
      estimatedProductionRangeKgCo2e: categoryRange(estimatedProductionKgCo2e),
      ...(material ? { materialStageKgCo2e: material.range, effectiveWeightGrams: material.weight, materialCoverageGrams: material.coverage,materialCoverage:material.materialCoverage } : {}),
    }
  })
  const totalEstimatedProductionKgCo2e = roundKg(
    items.reduce((total, item) => total + item.estimatedProductionKgCo2e, 0),
  )
  const scenarioPotentialAvoidedKgCo2e = request.replacesPlannedNewPurchase
    ? roundKg(totalEstimatedProductionKgCo2e * DEMO_DISPLACEMENT_FACTOR)
    : 0
  const totalEstimatedProductionRangeKgCo2e = addRanges(items.map((item) => item.estimatedProductionRangeKgCo2e))
  const scenarioPotentialAvoidedRangeKgCo2e = request.replacesPlannedNewPurchase
    ? {
        low: roundKg(totalEstimatedProductionRangeKgCo2e.low * DEMO_DISPLACEMENT_FACTOR),
        central: roundKg(totalEstimatedProductionRangeKgCo2e.central * DEMO_DISPLACEMENT_FACTOR),
        high: roundKg(totalEstimatedProductionRangeKgCo2e.high * DEMO_DISPLACEMENT_FACTOR),
      }
    : { low: 0, central: 0, high: 0 }
  const materialItems = items.filter((item) => item.materialStageKgCo2e)
  const materialStageKgCo2e = materialItems.length
    ? addRanges(materialItems.map((item) => item.materialStageKgCo2e!))
    : undefined

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
    totalEstimatedProductionRangeKgCo2e,
    scenarioPotentialAvoidedKgCo2e,
    scenarioPotentialAvoidedRangeKgCo2e,
    materialStageKgCo2e,
    materialProfiledQuantity: materialItems.reduce((total, item) => total + item.quantity, 0),
    totalQuantity: request.items.reduce((total, item) => total + item.quantity, 0),
    demoPointsAwarded: rewardStatus === 'awarded'
      ? Math.round(scenarioPotentialAvoidedKgCo2e * DEMO_POINTS_PER_SCENARIO_KG)
      : 0,
    rewardStatus,
    verification: { garmentOwnership: false, avoidedPurchase: false, rewardValue: 'demo_only' },
    assumptionsVersion: ASSUMPTIONS_VERSION,
    factorDatasetVersion: dataset.version,
    factorSources: dataset.sources,
    lifecycleBoundary: {
      categoryBenchmark: 'illustrative whole-garment production benchmark',
      materialStage: 'fibre production, cradle-to-gate',
    },
  })
}
