import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createTestApp as createApp } from './helpers'

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=',
  'base64',
)

async function uploadDemoImage(agent: ReturnType<typeof request.agent>) {
  const response = await agent
    .post('/api/analyses')
    .attach('image', PNG_1X1, { filename: 'clothes.png', contentType: 'image/png' })
    .expect(200)
  return response.body.analysisId as string
}

describe('reviewed scan and demo offers', () => {
  it('calculates corrected items, awards points once, and redeems the selected offer cost', async () => {
    const agent = request.agent(createApp())
    const initially = await agent.get('/api/offers').expect(200)
    expect(initially.body.demoPointsBalance).toBe(0)
    expect(initially.body.offers.every((offer: { canRedeem: boolean }) => !offer.canRedeem)).toBe(true)
    expect((await agent.get('/api/scans/latest').expect(200)).body.result).toBeNull()

    const analysisId = await uploadDemoImage(agent)
    const confirmation = {
      analysisId,
      items: [{ category: 'jeans', quantity: 2 }],
      replacesPlannedNewPurchase: true,
    }
    const scan = await agent.post('/api/scans/confirm').send(confirmation).expect(200)
    expect(scan.body).toMatchObject({
      items: [{ category: 'jeans', quantity: 2, estimatedProductionKgCo2e: 20 }],
      totalEstimatedProductionKgCo2e: 20,
      scenarioPotentialAvoidedKgCo2e: 10,
      demoPointsAwarded: 100,
      demoPointsBalance: 100,
      assumptionsVersion: 'demo-v1',
    })
    expect((await agent.get('/api/scans/latest').expect(200)).body.result).toEqual(scan.body)

    const available = await agent.get('/api/offers').expect(200)
    expect(available.body.offers.find((offer: { id: string }) => offer.id === 'swap-pass'))
      .toMatchObject({ pointsCost: 60, canRedeem: true, redeemed: false })

    const redemption = await agent.post('/api/offers/swap-pass/redeem').expect(200)
    expect(redemption.body).toMatchObject({ offerId: 'swap-pass', demoPointsBalance: 40 })
    expect(redemption.body.receipt.reference).toMatch(/^DEMO-[0-9A-F]{16}$/)
    expect(await agent.post('/api/offers/swap-pass/redeem').then((res) => res.body.error.code))
      .toBe('ALREADY_REDEEMED')
    expect(await agent.post('/api/offers/secondhand-voucher/redeem').then((res) => res.body.error.code))
      .toBe('INSUFFICIENT_POINTS')

    const duplicate = await agent.post('/api/scans/confirm').send(confirmation).expect(200)
    expect(duplicate.body).toEqual(scan.body)
    expect((await agent.get('/api/scans/latest').expect(200)).body.result).toEqual(scan.body)
    const finalOffers = await agent.get('/api/offers').expect(200)
    expect(finalOffers.body.demoPointsBalance).toBe(40)
    expect(finalOffers.body.offers.find((offer: { id: string }) => offer.id === 'swap-pass').receipt)
      .toEqual(redemption.body.receipt)

    const newerAnalysisId = await uploadDemoImage(agent)
    const newerScan = await agent.post('/api/scans/confirm').send({
      analysisId: newerAnalysisId,
      items: [{ category: 'jacket', quantity: 1 }],
      replacesPlannedNewPurchase: false,
    }).expect(200)
    expect((await agent.get('/api/scans/latest').expect(200)).body.result).toEqual(newerScan.body)
  })

  it('does not accept an analysis from a different browser session', async () => {
    const app = createApp()
    const owner = request.agent(app)
    const analysisId = await uploadDemoImage(owner)

    const stranger = await request(app)
      .post('/api/scans/confirm')
      .send({
        analysisId,
        items: [{ category: 'tshirt', quantity: 1 }],
        replacesPlannedNewPurchase: true,
      })
      .expect(404)
    expect(stranger.body.error.code).toBe('ANALYSIS_NOT_FOUND')
  })

  it('rejects invalid reviewed items without awarding points', async () => {
    const agent = request.agent(createApp())
    const analysisId = await uploadDemoImage(agent)

    const invalid = await agent.post('/api/scans/confirm').send({
      analysisId,
      items: [{ category: 'spacesuit', quantity: 1 }],
      replacesPlannedNewPurchase: true,
    }).expect(400)
    expect(invalid.body.error.code).toBe('INVALID_SCAN')
    expect((await agent.get('/api/offers').expect(200)).body.demoPointsBalance).toBe(0)
  })

  it('reports malformed JSON as a client error', async () => {
    const response = await request(createApp())
      .post('/api/scans/confirm')
      .set('Content-Type', 'application/json')
      .send('{bad-json')
      .expect(400)
    expect(response.body.error.code).toBe('INVALID_JSON')
  })

  it('returns an estimate but zero points when no planned purchase is replaced', async () => {
    const agent = request.agent(createApp())
    const analysisId = await uploadDemoImage(agent)
    const response = await agent.post('/api/scans/confirm').send({
      analysisId,
      items: [{ category: 'jacket', quantity: 1 }],
      replacesPlannedNewPurchase: false,
    }).expect(200)

    expect(response.body.totalEstimatedProductionKgCo2e).toBe(15)
    expect(response.body.scenarioPotentialAvoidedKgCo2e).toBe(0)
    expect(response.body.demoPointsBalance).toBe(0)
  })
})
