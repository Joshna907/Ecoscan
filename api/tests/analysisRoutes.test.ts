import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createTestApp as createApp } from './helpers'
import { VisionUnavailableError } from '../src/services/vision/openAIRecognizer'

// A tiny, valid PNG keeps these checks independent of a vision API or image files.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=',
  'base64',
)

describe('POST /api/analyses', () => {
  it('accepts a PNG and labels its suggestion as a mock requiring review', async () => {
    const response = await request(createApp())
      .post('/api/analyses')
      .attach('image', PNG_1X1, { filename: 'shirt.png', contentType: 'image/png' })
      .expect(200)

    expect(response.body).toMatchObject({
      recognitionMode: 'mock',
      needsReview: true,
      suggestions: [{ id: 'item-1', category: 'tshirt' }],
    })
    expect(response.body.analysisId).toMatch(/^[0-9a-f-]{36}$/)
    expect(response.headers['set-cookie']?.[0]).toContain('HttpOnly')
  })

  it('rejects a missing image', async () => {
    const response = await request(createApp()).post('/api/analyses').expect(400)
    expect(response.body.error.code).toBe('IMAGE_REQUIRED')
  })

  it('rejects text disguised as a PNG', async () => {
    const response = await request(createApp())
      .post('/api/analyses')
      .attach('image', Buffer.from('not an image'), {
        filename: 'fake.png',
        contentType: 'image/png',
      })
      .expect(415)
    expect(response.body.error.code).toBe('UNSUPPORTED_IMAGE')
  })

  it('rejects an image over 5 MB', async () => {
    const response = await request(createApp())
      .post('/api/analyses')
      .attach('image', Buffer.alloc(5 * 1024 * 1024 + 1), {
        filename: 'huge.png',
        contentType: 'image/png',
      })
      .expect(413)
    expect(response.body.error.code).toBe('IMAGE_TOO_LARGE')
  })

  it('requires the documented multipart field name', async () => {
    const response = await request(createApp())
      .post('/api/analyses')
      .attach('photo', PNG_1X1, { filename: 'shirt.png', contentType: 'image/png' })
      .expect(400)
    expect(response.body.error.code).toBe('INVALID_UPLOAD')
  })

  it('returns a safe 503 when image recognition is unavailable', async () => {
    const app = createApp({
      mode: 'vision',
      recognize: async () => { throw new VisionUnavailableError() },
    })
    const response = await request(app)
      .post('/api/analyses')
      .attach('image', PNG_1X1, { filename: 'shirt.png', contentType: 'image/png' })
      .expect(503)

    expect(response.body.error).toEqual({
      code: 'VISION_UNAVAILABLE',
      message: 'Image recognition is temporarily unavailable. Please try again.',
    })
    expect(response.body.analysisId).toBeUndefined()
  })
})
