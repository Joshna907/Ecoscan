import type { ClothingRecognizer } from './types'

// This is a product demo, not image recognition. The UI must display `mock` mode
// and require the user to correct or confirm every suggested category.
export const mockRecognizer: ClothingRecognizer = {
  mode: 'mock',
  async recognize(_image, _mimeType) {
    return [{ id: 'item-1', category: 'tshirt' }]
  },
}
