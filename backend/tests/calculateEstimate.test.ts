import { describe, expect, it } from 'vitest'
import { calculateEstimate } from '../src/domain/calculateEstimate'

describe('calculateEstimate', () => {
  it('calculates each item, total, scenario, and demo points from reviewed items', () => {
    const result = calculateEstimate({
      analysisId: 'analysis-1',
      items: [
        { category: 'tshirt', quantity: 2 },
        { category: 'jeans', quantity: 1 },
      ],
      replacesPlannedNewPurchase: true,
    })

    expect(result.items.map((item) => item.estimatedProductionKgCo2e)).toEqual([10, 10])
    expect(result.totalEstimatedProductionKgCo2e).toBe(20)
    expect(result.scenarioPotentialAvoidedKgCo2e).toBe(10)
    expect(result.demoPointsAwarded).toBe(100)
    expect(result.assumptionsVersion).toBe('demo-v1')
  })

  it('does not award points when no planned new purchase is replaced', () => {
    const result = calculateEstimate({
      analysisId: 'analysis-2',
      items: [{ category: 'jacket', quantity: 1 }],
      replacesPlannedNewPurchase: false,
    })

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
      }),
    ).toThrow()
  })
})
