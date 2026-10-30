import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import type { ResolveSession } from '../middleware/sessionContext'
import type { AnalysisService } from '../services/analysisService'
import { hasSupportedImageSignature } from './imageValidation'
import { HttpError } from '../httpError'
import type { RequestHandler } from 'express'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export interface ScanRateControl { middleware: RequestHandler }
export interface ScanUploadGate {
  readonly active: number
  acquire(): (() => void | Promise<void>) | Promise<() => void | Promise<void>>
}

export function createAnalysisRouter(
  service: AnalysisService,
  resolveSession: ResolveSession,
  rateLimiter: ScanRateControl,
  gate: ScanUploadGate,
): Router {
  const router = Router()
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 0 },
  })

  const singleImage = upload.single('image')
  const receiveImage = (request: Request, response: Response) => new Promise<void>((resolve, reject) => {
    const aborted = () => { reject(new HttpError(400, 'UPLOAD_ABORTED', 'The upload was interrupted.')) }
    request.once('aborted', aborted)
    singleImage(request, response, (error?: unknown) => {
      request.removeListener('aborted', aborted)
      if (error) reject(error)
      else resolve()
    })
  })

  router.post('/', (request, response, next) => {
    response.locals.operation = 'image.analyse'
    rateLimiter.middleware(request, response, next)
  }, async (request, response) => {
    // Admission is before Multer allocates a file buffer or recognition calls a provider.
    const releaseSlot = await gate.acquire()
    let releaseReservation: (() => Promise<void>) | undefined
    try {
      const sessionId = await resolveSession(request, response)
      releaseReservation = await service.reserveUpload(sessionId)
      await receiveImage(request, response)
      if (!request.file || request.file.size === 0) {
        throw new HttpError(400, 'IMAGE_REQUIRED', 'Choose an image to scan.')
      }
      if (!hasSupportedImageSignature(request.file)) {
        throw new HttpError(415, 'UNSUPPORTED_IMAGE', 'Upload a JPEG, PNG, or WebP image.')
      }
      const submission = await service.submit(sessionId, request.file.buffer, request.file.mimetype, {
        isCancelled: () => response.destroyed,
        onRecognitionFinished: ({ mode, outcome, durationMs }) => {
          response.locals.recognitionMode = mode
          response.locals.recognitionOutcome = outcome
          response.locals.recognitionDurationMs = durationMs
        },
      })
      if (submission) response.status(submission.kind === 'queued' ? 202 : 200).json(submission.result)
    } finally {
      await releaseReservation?.()
      await releaseSlot()
    }
  })
  router.get('/:analysisId', async (request, response) => {
    response.locals.operation = 'image.status'
    const sessionId = await resolveSession(request, response)
    response.json(await service.status(sessionId, request.params.analysisId))
  })
  return router
}
