import { createApp } from '../src/app'
import { mockRecognizer } from '../src/services/vision/mockRecognizer'

export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=', 'base64',
)

export function createTestApp(
  recognizer = mockRecognizer,
  options: Parameters<typeof createApp>[1] = {},
) {
  return createApp(recognizer, { logger: () => {}, ...options })
}
