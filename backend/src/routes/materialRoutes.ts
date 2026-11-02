import { MAX_UPLOAD_BYTES } from '../../../shared/src/index.js'
import { normalizeImage } from '../services/imageInput.js'
import { Router } from 'express'
import multer from 'multer'
import { materialRecognitionResponseSchema } from '../../../shared/src/index.js'
import type { ResolveSession } from '../middleware/sessionContext.js'
import type { MaterialRecognizer } from '../services/vision/types.js'
import { HttpError } from '../httpError.js'
import { hasSupportedImageSignature } from './imageValidation.js'
import type { PostgresVisionAdmission } from '../services/visionAdmission.js'
import type { ScanRateControl, ScanUploadGate } from './analysisRoutes.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0 },
})

export function createMaterialRouter(
  recognizer: MaterialRecognizer,
  resolveSession: ResolveSession,
  rateLimiter: ScanRateControl,
  gate: ScanUploadGate,
  admission?: Pick<PostgresVisionAdmission, 'acquire'>,
): Router {
  const router = Router()
  router.post('/recognize-label', rateLimiter.middleware, async (request, response) => {
    const release = await gate.acquire()
    try {
      response.locals.operation = 'material.label.read'
      await resolveSession(request, response)
      await new Promise<void>((resolve, reject) => {
        const aborted = () => reject(new HttpError(400, 'UPLOAD_ABORTED', 'The upload was interrupted.'))
        request.once('aborted', aborted)
        upload.single('image')(request, response, (error?: unknown) => {
          request.removeListener('aborted', aborted)
          if (error) reject(error)
          else resolve()
        })
      })
      if (!request.file || !request.file.size) throw new HttpError(400, 'IMAGE_REQUIRED', 'Choose a care-label image.')
      if (!hasSupportedImageSignature(request.file)) throw new HttpError(415, 'UNSUPPORTED_IMAGE', 'Upload a JPEG, PNG, or WebP image.')
      const normalized = await normalizeImage(request.file.buffer)
      const permit = recognizer.mode === 'vision' ? await admission?.acquire() : undefined
      try {
        permit?.markUsed()
        const materials = await recognizer.recognizeLabel(normalized, 'image/png')
        response.json(materialRecognitionResponseSchema.parse({ recognitionMode: recognizer.mode, materials, needsConfirmation: true }))
      } finally { await permit?.release() }
    } finally { await release() }
  })
  return router
}
