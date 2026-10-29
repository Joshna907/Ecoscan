import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { analysisResponseSchema, type AnalysisJobStatus, type AnalysisResponse } from 'shared'
import type { EcoScanStore } from './ports'
import type { ClothingRecognizer } from './vision/types'
import type { RecognitionJobs } from './recognitionJobs'
import { ApplicationError } from './applicationError'

interface AnalysisContext {
  isCancelled?: () => boolean
  onRecognitionFinished?: (event: {
    mode: ClothingRecognizer['mode']; outcome: 'success' | 'failure'; durationMs: number
  }) => void
}

export type AnalysisSubmission =
  | { kind: 'queued'; result: { analysisId: string; status: 'queued' } }
  | { kind: 'ready'; result: AnalysisResponse }

export class AnalysisService {
  constructor(
    private readonly store: Pick<EcoScanStore, 'reserveUpload' | 'addAnalysis'>,
    private readonly recognizer: ClothingRecognizer,
    private readonly jobs?: Pick<RecognitionJobs, 'enqueue' | 'status'>,
  ) {}

  // Reserve before transport buffers an upload; caller releases in finally.
  reserveUpload(sessionId: string): Promise<() => Promise<void>> { return this.store.reserveUpload(sessionId) }

  async submit(sessionId: string, image: Buffer, mimeType: string, context: AnalysisContext = {}): Promise<AnalysisSubmission | undefined> {
    if (this.jobs) {
      // Once the upload is accepted, the durable job survives a browser disconnect.
      return { kind: 'queued', result: await this.jobs.enqueue(sessionId, image, mimeType) }
    }
    const result = await this.analyse(sessionId, image, mimeType, context)
    return result ? { kind: 'ready', result } : undefined
  }

  status(sessionId: string, analysisId: string): Promise<AnalysisJobStatus> {
    if (!this.jobs) throw new ApplicationError('ANALYSIS_NOT_FOUND', 'This analysis is unavailable. Upload an image again.')
    return this.jobs.status(sessionId, analysisId)
  }

  async analyse(sessionId: string, image: Buffer, mimeType: string, context: AnalysisContext = {}): Promise<AnalysisResponse | undefined> {
    if (context.isCancelled?.()) return
    const started = performance.now()
    let outcome: 'success' | 'failure' = 'failure'
    let suggestions
    try {
      suggestions = await this.recognizer.recognize(image, mimeType)
      outcome = 'success'
    } finally {
      context.onRecognitionFinished?.({ mode: this.recognizer.mode, outcome, durationMs: Math.round(performance.now() - started) })
    }
    if (context.isCancelled?.()) return
    const result = analysisResponseSchema.parse({
      analysisId: randomUUID(), recognitionMode: this.recognizer.mode, suggestions, needsReview: true,
    })
    await this.store.addAnalysis(sessionId, result.analysisId, result.suggestions)
    return result
  }
}
