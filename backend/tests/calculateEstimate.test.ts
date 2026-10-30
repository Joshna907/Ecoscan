import { describe, expect, it } from 'vitest'
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
    expect(result.assumptionsVersion).toBe('demo-v2')
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
})
