import { describe, expect, it } from 'vitest'
import { AnalysisService } from '../src/services/analysisService'
import { ScanService } from '../src/services/scanService'
import { OfferService } from '../src/services/offerService'
import { DemoSessionStore } from '../src/store/demoSessions'
import { mockRecognizer } from '../src/services/vision/mockRecognizer'
import { reliabilityConfigSchema } from '../src/config'
import { verifiedRecognizer } from './helpers'

async function setup() {
  const store = new DemoSessionStore()
  const analyses = new AnalysisService(store, verifiedRecognizer)
  const scans = new ScanService(store)
  const offers = new OfferService(store)
  const sessionId = await store.getOrCreate(undefined)
  return { store, analyses, scans, offers, sessionId }
}

async function analyse(service: AnalysisService, sessionId: string) {
  const release = await service.reserveUpload(sessionId)
  try {
    const result = await service.analyse(sessionId, Buffer.from('validated image'), 'image/png')
    if (!result) throw new Error('Unexpected cancellation')
    return result
  } finally { await release() }
}

const confirmation = (analysisId: string) => ({
  analysisId, items: [{ category: 'jeans', quantity: 2 }], replacesPlannedNewPurchase: true,
})

describe('application workflows without HTTP', () => {
  it('submits durable recognition work without calling the recognizer in the API', async () => {
    const store = new DemoSessionStore()
    const sessionId = await store.getOrCreate(undefined)
    const analysisId = 'a1b2c3d4-1234-4123-8123-123456789abc'
    let recognitionCalls = 0
    const analyses = new AnalysisService(store, {
      mode: 'mock',
      recognize: async () => { recognitionCalls++; return [] },
    }, {
      enqueue: async (owner, image, mimeType) => {
        expect(owner).toBe(sessionId)
        expect(image.toString()).toBe('validated image')
        expect(mimeType).toBe('image/png')
        return { analysisId, status: 'queued' as const }
      },
      status: async () => ({ analysisId, status: 'queued' as const }),
    })
    expect(await analyses.submit(sessionId, Buffer.from('validated image'), 'image/png')).toEqual({
      kind: 'queued', result: { analysisId, status: 'queued' },
    })
    expect(await analyses.status(sessionId, analysisId)).toEqual({ analysisId, status: 'queued' })
    expect(recognitionCalls).toBe(0)
  })

  it('recognizes, confirms, replays and redeems through services alone', async () => {
    const { analyses, scans, offers, sessionId } = await setup()
    const analysis = await analyse(analyses, sessionId)
    expect(analysis.recognitionMode).toBe('vision')
    const input = confirmation(analysis.analysisId)
    const original = await scans.confirm(sessionId, input)
    expect(original.demoPointsBalance).toBe(100)
    expect((await offers.redeem(sessionId, 'swap-pass')).demoPointsBalance).toBe(40)
    expect(await scans.confirm(sessionId, input)).toEqual(original)
    expect((await offers.list(sessionId)).demoPointsBalance).toBe(40)
    await expect(offers.redeem(sessionId, 'swap-pass')).rejects.toMatchObject({ code: 'ALREADY_REDEEMED' })
  })

  it('enforces validation and ownership for callers outside Express', async () => {
    const { store, analyses, scans, offers, sessionId } = await setup()
    const analysis = await analyse(analyses, sessionId)
    const stranger = await store.getOrCreate(undefined)
    await expect(scans.confirm(stranger, confirmation(analysis.analysisId))).rejects.toMatchObject({ code: 'ANALYSIS_NOT_FOUND' })
    await expect(scans.confirm(sessionId, { ...confirmation(analysis.analysisId), items: [{ category: 'jeans', quantity: -1 }] })).rejects.toMatchObject({ code: 'INVALID_SCAN' })
    expect((await offers.list(sessionId)).demoPointsBalance).toBe(0)
    expect((await scans.confirm(sessionId, confirmation(analysis.analysisId))).demoPointsBalance).toBe(100)
  })

  it('does not partially confirm or award if calculation fails before commit', async () => {
    const { store, analyses, scans, offers, sessionId } = await setup()
    const analysis = await analyse(analyses, sessionId)
    await expect(store.confirmOnce(sessionId, analysis.analysisId, 'unused', () => { throw new Error('Calculation failed') })).rejects.toThrow('Calculation failed')
    expect((await offers.list(sessionId)).demoPointsBalance).toBe(0)
    expect((await scans.confirm(sessionId, confirmation(analysis.analysisId))).demoPointsBalance).toBe(100)
  })

  it('returned data cannot mutate retained confirmation results or reward state', async () => {
    const { store, analyses, scans, offers, sessionId } = await setup()
    const analysis = await analyse(analyses, sessionId)
    const input = confirmation(analysis.analysisId)
    const returned = await scans.confirm(sessionId, input)
    returned.demoPointsBalance = 99999
    returned.items[0].quantity = 999
    const snapshot = await store.getRewards(sessionId)
    snapshot.demoPointsBalance = 0
    const replay = await scans.confirm(sessionId, input)
    expect(replay.demoPointsBalance).toBe(100)
    expect(replay.items[0].quantity).toBe(2)
    expect((await offers.list(sessionId)).demoPointsBalance).toBe(100)
  })

  it('serializes competing redemptions through the store operation', async () => {
    const { analyses, scans, offers, sessionId } = await setup()
    const analysis = await analyse(analyses, sessionId)
    await scans.confirm(sessionId, confirmation(analysis.analysisId))
    const results = await Promise.allSettled([
      offers.redeem(sessionId, 'swap-pass'),
      offers.redeem(sessionId, 'secondhand-voucher'),
    ])
    expect(results[0].status).toBe('fulfilled')
    expect(results[1]).toMatchObject({ status: 'rejected', reason: { code: 'INSUFFICIENT_POINTS' } })
    expect((await offers.list(sessionId)).demoPointsBalance).toBe(40)
  })

  it('does not store a cancelled recognition result or consume retained scan capacity', async () => {
    const store = new DemoSessionStore(reliabilityConfigSchema.parse({ maxAnalysesPerSession: 1 }))
    const sessionId = await store.getOrCreate(undefined)
    let cancelled = false
    const analyses = new AnalysisService(store, { mode: 'mock', recognize: async () => {
      cancelled = true
      return []
    } })
    const release = await analyses.reserveUpload(sessionId)
    try {
      expect(await analyses.analyse(sessionId, Buffer.from('image'), 'image/png', { isCancelled: () => cancelled })).toBeUndefined()
    } finally { await release() }
    const next = new AnalysisService(store, mockRecognizer)
    expect((await analyse(next, sessionId)).needsReview).toBe(true)
  })
})
