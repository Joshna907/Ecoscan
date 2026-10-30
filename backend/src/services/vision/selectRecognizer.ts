import type { ClothingRecognizer } from './types'
import { mockRecognizer } from './mockRecognizer'
import { createOpenAIRecognizer } from './openAIRecognizer'

export function selectRecognizer(): ClothingRecognizer {
  const provider = process.env.VISION_PROVIDER ?? 'mock'
  if (provider === 'mock') return mockRecognizer
  if (provider !== 'openai') {
    throw new Error('VISION_PROVIDER must be mock or openai')
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required when VISION_PROVIDER=openai')
  }
  return createOpenAIRecognizer(
    process.env.OPENAI_API_KEY,
    process.env.OPENAI_VISION_MODEL ?? 'gpt-6-luna',
  )
}
