import type { ClothingCategory } from 'shared'

export interface RecognitionSuggestion {
  id: string
  category: ClothingCategory
}

export interface ClothingRecognizer {
  mode: 'mock' | 'vision'
  recognize(image: Buffer, mimeType: string): Promise<RecognitionSuggestion[]>
}
