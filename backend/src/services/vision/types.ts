import type { ClothingCategory, MaterialRecognitionResponse } from '../../../../shared/src/index.js'

export interface RecognitionSuggestion {
  id: string
  category: ClothingCategory
}

export interface ClothingRecognizer {
  mode: 'mock' | 'vision'
  recognize(image: Buffer, mimeType: string): Promise<RecognitionSuggestion[]>
}

export interface MaterialRecognizer {
  mode: 'mock' | 'vision'
  recognizeLabel(image: Buffer, mimeType: string): Promise<MaterialRecognitionResponse['materials']>
}
