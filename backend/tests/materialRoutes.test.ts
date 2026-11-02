import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createTestApp, PNG_1X1 } from './helpers'
import { VisionAdmissionError } from '../src/services/visionAdmission'

describe('care-label OCR', () => {
  it('returns suggestions requiring confirmation without creating points', async () => {
    const app = createTestApp(undefined, { materialRecognizer: { mode: 'vision', async recognizeLabel() { return [{ material: 'cotton', percentage: 100 }] } } })
    const agent = request.agent(app)
    const response = await agent.post('/api/materials/recognize-label').attach('image', PNG_1X1, { filename: 'label.png', contentType: 'image/png' }).expect(200)
    expect(response.body).toMatchObject({ needsConfirmation: true, materials: [{ material: 'cotton', percentage: 100 }] })
    expect((await agent.get('/api/offers')).body.demoPointsBalance).toBe(0)
  })
  it('enforces the shared AI budget before calling OCR', async () => {
    let calls = 0
    const app = createTestApp(undefined, {
      materialRecognizer: { mode: 'vision', async recognizeLabel() { calls++; return [] } },
      visionAdmission: { async acquire() { throw new VisionAdmissionError('VISION_BUDGET_EXHAUSTED') } },
    })
    await request(app).post('/api/materials/recognize-label').attach('image', PNG_1X1, { filename: 'label.png', contentType: 'image/png' }).expect(429)
    expect(calls).toBe(0)
  })
  it('rejects non-image labels', async () => {
    await request(createTestApp()).post('/api/materials/recognize-label').attach('image', Buffer.from('text'), { filename: 'label.png', contentType: 'image/png' }).expect(415)
  })
})
