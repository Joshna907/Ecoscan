import { existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { Pool } from 'pg'
import request from 'supertest'
import sharp from 'sharp'
import { createApp } from './app.js'
import { postgresRuntime } from './postgresRuntime.js'
import { loadReliabilityConfig } from './config.js'

if (existsSync('.env')) process.loadEnvFile('.env')
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 10_000 })
let sessionId: string | undefined
let recoveryReference: string | undefined
try {
  const runtime = postgresRuntime(pool, loadReliabilityConfig(), { ...process.env, VISION_PROVIDER: 'mock' })
  const app = createApp({ mode: 'vision', async recognize() { return [{ id: 'release-item', category: 'tshirt' }] } }, {
    ...runtime, materialRecognizer: { mode: 'mock', async recognizeLabel() { return [] } },
  })
  await runtime.maintenance.run()
  const agent = request.agent(app)
  await agent.get('/api/ready').expect(200)
  const initial = await agent.get('/api/offers').expect(200)
  const cookie = (initial.headers['set-cookie'] as unknown as string[]).find(value => value.startsWith('ecoscan_demo_session='))!
  sessionId = cookie.split(';')[0].split('=')[1]
  const evidence = await agent.get('/api/activity-evidence').expect(200)
  if (evidence.body.verifiedActivityCredits !== 0 || evidence.body.receipts.length !== 0 || evidence.body.partners.some((partner: Record<string, unknown>) => 'secret' in partner)) throw new Error('Activity evidence release contract failed')
  const image = await sharp(randomBytes(64 * 64 * 3), { raw: { width: 64, height: 64, channels: 3 } }).png().toBuffer()
  const upload = await agent.post('/api/analyses').attach('image', image, { filename: 'release.png', contentType: 'image/png' }).expect(200)
  const input = { analysisId: upload.body.analysisId, items: [{ category: 'tshirt', quantity: 1 }], replacesPlannedNewPurchase: true }
  const result = await agent.post('/api/scans/confirm').send(input).expect(200)
  if (result.body.demoPointsAwarded !== 25) throw new Error('Release confirmation did not award expected demo points')
  const redemption = await agent.post('/api/offers/repair-kit/redeem').expect(200)
  recoveryReference=redemption.body.receipt.reference
  const recovery=await agent.post('/api/offers/repair-kit/recovery-key').expect(200)
  const retried = await agent.post('/api/offers/repair-kit/redeem').expect(200)
  if (retried.body.receipt.reference !== redemption.body.receipt.reference || retried.body.demoPointsBalance !== 0) throw new Error('Redemption retry was not idempotent')
  await agent.post('/api/auth/login').send({}).expect(404)
  const latest = await agent.get('/api/scans/latest').expect(200)
  if (latest.body.result.totalEstimatedProductionKgCo2e !== 5) throw new Error('Release result could not be restored')
  const balance = await agent.get('/api/offers').expect(200)
  if (balance.body.demoPointsBalance !== 0) throw new Error('Release redemption balance mismatch')
  const refund = await agent.post('/api/offers/repair-kit/refund').expect(200)
  const refundedAgain = await agent.post('/api/offers/repair-kit/refund').expect(200)
  if (refund.body.demoPointsBalance !== 25 || refundedAgain.body.demoPointsBalance !== 25) throw new Error('Refund retry was not idempotent')
  const recovered=await request(app).post('/api/offers/recover').send({recoveryKey:recovery.body.recoveryKey}).expect(200)
  if (!recovered.body.readOnly||recovered.body.receipt.status!=='refunded') throw new Error('Account-free receipt recovery did not preserve current status')
  console.log('Release check passed: schema, cleanup, independent activity ledger, upload, confirmation, result restore, idempotent redemption/refund, no account routes. Recognition is stubbed; no paid provider calls.')
} finally {
  if (recoveryReference) await pool.query('DELETE FROM eco_receipt_archive WHERE reference=$1',[recoveryReference])
  if (sessionId) {
    await pool.query(`WITH receipts AS (DELETE FROM eco_redemptions WHERE session_id=$1 AND status='issued' RETURNING offer_id) UPDATE eco_offer_inventory i SET remaining=remaining+1 FROM receipts r WHERE i.offer_id=r.offer_id`, [sessionId])
    await pool.query('DELETE FROM eco_visual_reward_claims WHERE session_id = $1', [sessionId])
    await pool.query('DELETE FROM eco_sessions WHERE id = $1', [sessionId])
  }
  await pool.end()
}
