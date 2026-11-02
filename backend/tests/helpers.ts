import { createApp } from '../src/app'
import { mockRecognizer } from '../src/services/vision/mockRecognizer'
import type { ClothingRecognizer } from '../src/services/vision/types'

export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAE0lEQVQImWP4z8DwnwGM/zMwAAAf7gP9qS/A4gAAAABJRU5ErkJggg==', 'base64',
)

export const verifiedRecognizer: ClothingRecognizer = {
  mode: 'vision',
  async recognize() {
    return [{ id: 'item-1', category: 'jeans' }, { id: 'item-2', category: 'jeans' }]
  },
}

export function createTestApp(
  recognizer = mockRecognizer,
  options: Parameters<typeof createApp>[1] = {},
) {
  return createApp(recognizer, { logger: () => {}, ...options })
}
