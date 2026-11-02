import { writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Pool } from 'pg'
import { PostgresSessionStore } from '../src/store/postgresSessions'
import { reliabilityConfigSchema } from '../src/config'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import sharp from 'sharp'
import { createTestApp, PNG_1X1 } from './helpers'
import { DemoSessionStore } from '../src/store/demoSessions'
import { ScanService } from '../src/services/scanService'
import { OfferService } from '../src/services/offerService'
import { calculateEstimate } from '../src/domain/calculateEstimate'
import { factorImportSchema } from '../src/domain/factorImport'

afterEach(() => vi.unstubAllEnvs())
async function funded(store = new DemoSessionStore()) {
  const owner = await store.getOrCreate(undefined)
  const id = randomUUID()
  await store.addAnalysis(owner, id, { imageHash: randomUUID(), recognitionMode: 'vision', suggestions: [{ id: '1', category: 'tshirt' }] })
  await new ScanService(store).confirm(owner, { analysisId: id, items: [{ category: 'tshirt', quantity: 1 }], replacesPlannedNewPurchase: true })
  return { store, owner, offers: new OfferService(store) }
}
describe('anonymous offers and bounded uploads', () => {
  it('has no signup, login or account identity API', async () => {
    const app = createTestApp()
    for (const path of ['/signup', '/login']) await request(app).post('/api/auth' + path).send({}).expect(404)
    await request(app).get('/api/auth/me').expect(404)
  })
  it('replays a redemption and refunds once without a second debit or stock change', async () => {
    const { store, owner, offers } = await funded()
    const first = await offers.redeem(owner, 'repair-kit')
    const replay = await offers.redeem(owner, 'repair-kit')
    expect(replay).toEqual(first)
    expect((await store.getRewards(owner)).inventory?.['repair-kit']).toBe(99)
    const [refund, retry] = await Promise.all([offers.refund(owner, 'repair-kit'), offers.refund(owner, 'repair-kit')])
    expect(refund.demoPointsBalance).toBe(25)
    expect(retry).toEqual(refund)
    expect((await store.getRewards(owner)).inventory?.['repair-kit']).toBe(100)
    const stranger = await store.getOrCreate(undefined)
    await expect(offers.refund(stranger, 'repair-kit')).rejects.toMatchObject({ code: 'VOUCHER_UNAVAILABLE' })
  })
  it('requires the partner credential for single-use fulfilment and forbids refunds afterward', async () => {
    const { store, owner, offers } = await funded()
    const voucher = await offers.redeem(owner, 'repair-kit')
    const app = createTestApp(undefined, { store })
    vi.stubEnv('PARTNER_API_SECRET', 'partner-secret-'.repeat(4))
    const path = '/api/offers/vouchers/' + voucher.receipt.reference + '/use'
    await request(app).post(path).expect(401)
    await request(app).post(path).set('Authorization', 'Bearer ' + process.env.PARTNER_API_SECRET).expect(200)
    await request(app).post(path).set('Authorization', 'Bearer ' + process.env.PARTNER_API_SECRET).expect(409)
    await expect(offers.refund(owner, 'repair-kit')).rejects.toMatchObject({ code: 'VOUCHER_UNAVAILABLE' })
  })

  it('allows only the owning session to simulate demo fulfilment', async () => {
    const { store, owner, offers } = await funded()
    await offers.redeem(owner, 'repair-kit')
    const stranger = await store.getOrCreate(undefined)
    await expect(offers.fulfilDemo(stranger, 'repair-kit')).rejects.toMatchObject({ code: 'VOUCHER_UNAVAILABLE' })
    expect((await offers.fulfilDemo(owner, 'repair-kit')).receipt.status).toBe('used')
    await expect(offers.refund(owner, 'repair-kit')).rejects.toMatchObject({ code: 'VOUCHER_UNAVAILABLE' })
  })
  it('blocks expired fulfilment but permits a single refund during the active session', async () => {
    let now = Date.now()
    const { store, owner, offers } = await funded(new DemoSessionStore(undefined, () => now))
    const voucher = await offers.redeem(owner, 'repair-kit')
    now += 30 * 86400000 - 1000
    await store.getOrCreate(owner)
    now += 2000
    expect((await offers.list(owner)).offers.find(offer => offer.id === 'repair-kit')?.receipt?.status).toBe('expired')
    await expect(offers.fulfil(voucher.receipt.reference)).rejects.toMatchObject({ code: 'VOUCHER_UNAVAILABLE' })
    expect((await offers.refund(owner, 'repair-kit')).demoPointsBalance).toBe(25)
  })
  it('rejects a 4 MiB overflow and a corrupt JPEG before calling label OCR', async () => {
    let calls = 0
    const app = createTestApp(undefined, { materialRecognizer: { mode: 'vision', async recognizeLabel() { calls++; return [] } } })
    await request(app).post('/api/materials/recognize-label').attach('image', Buffer.alloc(4 * 1024 * 1024 + 1), { filename: 'huge.png', contentType: 'image/png' }).expect(413)
    await request(app).post('/api/materials/recognize-label').attach('image', Buffer.from([255,216,255]), { filename: 'bad.jpg', contentType: 'image/jpeg' }).expect(415)
    expect(calls).toBe(0)
  })
  it('strips image metadata before passing label pixels to OCR', async () => {
    const input = await sharp(PNG_1X1).withMetadata({ density: 144 }).png().toBuffer()
    let density: number | undefined = 1
    const app = createTestApp(undefined, { materialRecognizer: { mode: 'vision', async recognizeLabel(image) { density = (await sharp(image).metadata()).density; return [] } } })
    await request(app).post('/api/materials/recognize-label').attach('image', input, { filename: 'label.png', contentType: 'image/png' }).expect(200)
    expect(density).toBeUndefined()
  })
  it('calculates only supported measured components and reports partial mass', () => {
    const result = calculateEstimate({ analysisId: 'components', items: [{ category: 'jacket', quantity: 1, materialProfile: {
      composition: [], source: 'manual', userConfirmed: true, weightGrams: 700,
      components: [{ kind: 'shell', weightGrams: 400, composition: [{ material: 'cotton', percentage: 100 }] }, { kind: 'padding', weightGrams: 100, composition: [{ material: 'other', percentage: 100 }] }],
    } }], replacesPlannedNewPurchase: false }, { suggestions: [], recognitionMode: 'mock', imageHash: null, duplicateImage: false })
    expect(result.items[0].materialCoverageGrams).toBe(400)
    expect(result.materialStageKgCo2e?.central).toBe(1.82)
    expect(result.items[0].effectiveWeightGrams?.central).toBe(700)
  })

  it('uses a provenance-validated snapshot configured after module import, including elastane', () => {
    const path = join(tmpdir(), 'ecoscan-factor-test-' + randomUUID() + '.json')
    const source = { title: 'Test fixture only', url: 'https://example.org/test-fixture', reference: 'fixture table', method: 'fixture method', geography: 'test', year: 2026, license: 'test-only' }
    writeFileSync(path, JSON.stringify({ version: 'test-fixture-v1', unit: 'kg CO2e/kg fibre', boundary: 'fibre production, cradle-to-gate', review:{reviewer:'Test reviewer',reviewedAt:'2026-11-02T00:00:00.000Z',assessmentMethod:'fixture method',unitsChecked:true,boundaryChecked:true,softwareUsePermitted:true}, factors: { cotton: { low: 1, central: 2, high: 4, source }, elastane: { low: 4, central: 8, high: 16, source } } }))
    vi.stubEnv('MATERIAL_FACTORS_FILE', path)
    try {
      const result = calculateEstimate({ analysisId: 'import', items: [{ category: 'tshirt', quantity: 1, materialProfile: { userConfirmed: true, source: 'manual', weightGrams: 200, composition: [{ material: 'cotton', percentage: 98 }, { material: 'elastane', percentage: 2 }] } }], replacesPlannedNewPurchase: false }, { imageHash: null, recognitionMode: 'mock', duplicateImage: false, suggestions: [] })
      expect(result.factorDatasetVersion).toBe('test-fixture-v1')
      expect(result.materialStageKgCo2e?.central).toBe(0.42)
      expect(result.factorSources?.[0].title).toBe('Test fixture only')
    } finally { unlinkSync(path) }
  })
  it('rejects unsourced imports and non-carbon environmental score units', () => {
    expect(factorImportSchema.safeParse({ version: 'test', unit: 'ECS points', boundary: 'fibre production, cradle-to-gate', factors: { elastane: { low: 1, central: 2, high: 3 } } }).success).toBe(false)
  })
})

describe.skipIf(!process.env.TEST_DATABASE_URL)('database offer inventory', () => {
  it('reserves the last unit once across sessions and refunds once across replicas', async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 4 })
    const first = new PostgresSessionStore(pool, reliabilityConfigSchema.parse({}))
    const second = new PostgresSessionStore(pool, reliabilityConfigSchema.parse({}))
    const owners: string[] = []
    const initial = (await pool.query<{ remaining: number }>("SELECT remaining FROM eco_offer_inventory WHERE offer_id='repair-kit'")).rows[0].remaining
    try {
      await pool.query("UPDATE eco_offer_inventory SET remaining=1 WHERE offer_id='repair-kit'")
      for (const store of [first, second]) {
        const owner = await store.getOrCreate(undefined); owners.push(owner)
        const id = randomUUID()
        await store.addAnalysis(owner, id, { imageHash: randomUUID(), recognitionMode: 'vision', suggestions: [{ id: '1', category: 'tshirt' }] })
        await new ScanService(store).confirm(owner, { analysisId: id, items: [{ category: 'tshirt', quantity: 1 }], replacesPlannedNewPurchase: true })
      }
      const results = await Promise.allSettled(owners.map((owner, i) => new OfferService(i ? second : first).redeem(owner, 'repair-kit')))
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
      expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { code: 'OUT_OF_STOCK' } })
      const winner = owners[results.findIndex(result => result.status === 'fulfilled')]
      const refund = await new OfferService(first).refund(winner, 'repair-kit')
      expect(refund.demoPointsBalance).toBe(25)
      expect(await new OfferService(second).refund(winner, 'repair-kit')).toEqual(refund)
      expect((await pool.query("SELECT remaining FROM eco_offer_inventory WHERE offer_id='repair-kit'")).rows[0].remaining).toBe(1)
    } finally {
      await pool.query('DELETE FROM eco_visual_reward_claims WHERE session_id=ANY($1::uuid[])', [owners])
      await pool.query('DELETE FROM eco_sessions WHERE id=ANY($1::uuid[])', [owners])
      await pool.query("UPDATE eco_offer_inventory SET remaining=$1 WHERE offer_id='repair-kit'", [initial])
      await pool.end()
    }
  })
})
