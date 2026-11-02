import { describe, expect, it } from 'vitest'
import { MATERIAL_KG_CO2E_PER_KG } from '../src/domain/carbonCatalogue'
import { calculateEstimate } from '../src/domain/calculateEstimate'

describe('calculateEstimate', () => {
  const liveEvidence = {
    recognitionMode: 'vision' as const,
    imageHash: 'image-hash',
    duplicateImage: false,
    suggestions: [
      { id: 'item-1', category: 'tshirt' as const },
      { id: 'item-2', category: 'tshirt' as const },
      { id: 'item-3', category: 'jeans' as const },
    ],
  }

  it('calculates each item, total, scenario, and demo points from reviewed items', () => {
    const result = calculateEstimate({
      analysisId: 'analysis-1',
      items: [
        { category: 'tshirt', quantity: 2 },
        { category: 'jeans', quantity: 1 },
      ],
      replacesPlannedNewPurchase: true,
    }, liveEvidence)

    expect(result.items.map((item) => item.estimatedProductionKgCo2e)).toEqual([10, 10])
    expect(result.totalEstimatedProductionKgCo2e).toBe(20)
    expect(result.scenarioPotentialAvoidedKgCo2e).toBe(10)
    expect(result.demoPointsAwarded).toBe(100)
    expect(result.rewardStatus).toBe('awarded')
    expect(result.assumptionsVersion).toBe('materials-v2')
  })

  it('does not award points when no planned new purchase is replaced', () => {
    const result = calculateEstimate({
      analysisId: 'analysis-2',
      items: [{ category: 'jacket', quantity: 1 }],
      replacesPlannedNewPurchase: false,
    }, { ...liveEvidence, suggestions: [{ id: 'item-1', category: 'jacket' }] })

    expect(result.totalEstimatedProductionKgCo2e).toBe(15)
    expect(result.scenarioPotentialAvoidedKgCo2e).toBe(0)
    expect(result.demoPointsAwarded).toBe(0)
  })

  it('rejects a category outside the documented catalogue', () => {
    expect(() =>
      calculateEstimate({
        analysisId: 'analysis-3',
        items: [{ category: 'unknown' as 'tshirt', quantity: 1 }],
        replacesPlannedNewPurchase: true,
      }, liveEvidence),
    ).toThrow()
  })

  it('does not award points for edited, mock, or duplicate image results', () => {
    const input = { analysisId: 'analysis-4', items: [{ category: 'jeans' as const, quantity: 1 }], replacesPlannedNewPurchase: true }
    expect(calculateEstimate(input, { ...liveEvidence, suggestions: [{ id: 'item-1', category: 'tshirt' }] }).rewardStatus).toBe('unverified_items')
    expect(calculateEstimate(input, { ...liveEvidence, recognitionMode: 'mock', suggestions: [{ id: 'item-1', category: 'jeans' }] }).demoPointsAwarded).toBe(0)
    expect(calculateEstimate(input, { ...liveEvidence, duplicateImage: true, suggestions: [{ id: 'item-1', category: 'jeans' }] }).rewardStatus).toBe('duplicate_image')
  })
  it('uses confirmed fractional blends and measured per-item mass without altering points', () => {
    const base = { analysisId: 'blend', items: [{ category: 'tshirt' as const, quantity: 2 }, { category: 'jeans' as const, quantity: 1 }], replacesPlannedNewPurchase: true }
    const original = calculateEstimate(base, liveEvidence)
    const result = calculateEstimate({ ...base, items: [{ ...base.items[0], materialProfile: {
      composition: [{ material: 'cotton', percentage: 97.5 }, { material: 'polyester', percentage: 2.5 }],
      source: 'manual', userConfirmed: true, weightGrams: 200,
    } }, base.items[1]] }, liveEvidence)
    const expected = Math.round(0.4 * (0.975 * MATERIAL_KG_CO2E_PER_KG.cotton!.central + 0.025 * MATERIAL_KG_CO2E_PER_KG.polyester!.central) * 100) / 100
    expect(result.materialStageKgCo2e?.central).toBe(expected)
    expect(result.materialProfiledQuantity).toBe(2)
    expect(result.demoPointsAwarded).toBe(original.demoPointsAwarded)
    expect(result.totalEstimatedProductionKgCo2e).toBe(original.totalEstimatedProductionKgCo2e)
  })

  it('uses category mass bounds, and withholds unsupported fibre blends', () => {
    const input = { analysisId: 'weight', items: [{ category: 'tshirt' as const, quantity: 1, materialProfile: {
      composition: [{ material: 'cotton' as const, percentage: 100 }], source: 'manual' as const, userConfirmed: true as const,
    } }], replacesPlannedNewPurchase: false }
    const result = calculateEstimate(input, liveEvidence)
    expect(result.items[0].effectiveWeightGrams).toEqual({ low: 130, central: 200, high: 300, source: 'category_range' })
    expect(result.materialStageKgCo2e!.low).toBeLessThan(result.materialStageKgCo2e!.central)
    input.items[0].materialProfile.composition = [{ material: 'elastane' as 'cotton', percentage: 100 }]
    const unsupported = calculateEstimate(input, liveEvidence)
    expect(unsupported.materialStageKgCo2e).toBeUndefined()
    expect(unsupported.materialProfiledQuantity).toBe(0)
  })

  it('rejects unconfirmed, duplicate, or incomplete composition', () => {
    for (const profile of [
      { composition: [{ material: 'cotton', percentage: 100 }], userConfirmed: false },
      { composition: [{ material: 'cotton', percentage: 99 }], userConfirmed: true },
      { composition: [{ material: 'cotton', percentage: 50 }, { material: 'cotton', percentage: 50 }], userConfirmed: true },
    ]) {
      expect(() => calculateEstimate({ analysisId: 'invalid', items: [{ category: 'tshirt', quantity: 1, materialProfile: { ...profile, source: 'manual' } as never }], replacesPlannedNewPurchase: false }, liveEvidence)).toThrow()
    }
  })

  it('does not renormalize supported fibres when elastane or unallocated components are missing',()=>{
    const result=calculateEstimate({analysisId:'partial',items:[{category:'tshirt',quantity:2,materialProfile:{userConfirmed:true,source:'manual',weightGrams:200,composition:[{material:'cotton',percentage:98},{material:'elastane',percentage:2}]}}],replacesPlannedNewPurchase:false},liveEvidence)
    expect(result.items[0].materialCoverage).toMatchObject({status:'partial',supportedMassGrams:196,uncoveredMassGrams:4,missingFactors:[{material:'elastane',weightGrams:4}]})
    expect(result.materialStageKgCo2e?.central).toBe(Math.round(0.392*MATERIAL_KG_CO2E_PER_KG.cotton!.central*100)/100)
    expect(result.demoPointsAwarded).toBe(0)
  })

})
