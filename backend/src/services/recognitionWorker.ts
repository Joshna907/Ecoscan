import type { ClothingRecognizer } from './vision/types.js'
import type { RecognitionJobs } from './recognitionJobs.js'
import type { PostgresVisionAdmission } from './visionAdmission.js'

export class RecognitionWorker {
  constructor(private readonly jobs: RecognitionJobs, private readonly recognizer: ClothingRecognizer,
    private readonly admission?: Pick<PostgresVisionAdmission, 'acquire'>) {}

  async runOne(): Promise<boolean> {
    if (this.admission && !await this.jobs.hasReady()) return false
    const permit = await this.admission?.acquire()
    try {
      const job = await this.jobs.claim()
      if (!job) return false
      permit?.markUsed()
      try {
        const suggestions = await this.recognizer.recognize(job.image, job.mimeType)
        await this.jobs.complete(job, suggestions, this.recognizer.mode)
      } catch {
        // Raw provider errors and image content are never persisted or logged.
        await this.jobs.fail(job)
      }
      return true
    } finally { await permit?.release() }
  }
}
