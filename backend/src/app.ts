import { getMaterialDataset } from './domain/carbonCatalogue.js'
import { timingSafeEqual } from 'node:crypto'
import { randomBytes } from 'node:crypto'
import { MemorySafetyStore, RewardSafetyService, partnerSubject, type SafetyStore } from './services/rewardSafety.js'
import { createRewardSafetyRouter } from './routes/rewardSafetyRoutes.js'
import type { IncomingMessage } from 'node:http'
import { ActivityEvidenceService, evidenceConfig, type EvidenceConfig, type EvidenceStore } from './services/activityEvidence.js'
import { MemoryEvidenceStore } from './store/activityEvidence.js'
import { createActivityEvidenceRouter } from './routes/activityEvidenceRoutes.js'
import type { Maintenance } from './services/maintenance.js'
import express, { type ErrorRequestHandler } from 'express'
import multer from 'multer'
import { createAnalysisRouter } from './routes/analysisRoutes.js'
import { createScanRouter } from './routes/scanRoutes.js'
import { createOfferRouter } from './routes/offerRoutes.js'
import { selectRecognizer } from './services/vision/selectRecognizer.js'
import { VisionUnavailableError } from './services/vision/openAIRecognizer.js'
import type { ClothingRecognizer } from './services/vision/types.js'
import { DemoSessionStore } from './store/demoSessions.js'
import { reliabilityConfigSchema, type ReliabilityConfig } from './config.js'
import { HttpError } from './httpError.js'
import { ScanConcurrencyGate, ScanRateLimiter } from './middleware/trafficControl.js'
import { consoleLogSink, requestLogging, type LogSink } from './middleware/requestLogging.js'
import { createSessionContext } from './middleware/sessionContext.js'
import { AnalysisService } from './services/analysisService.js'
import { ScanService } from './services/scanService.js'
import { OfferService } from './services/offerService.js'
import { ApplicationError, type ApplicationErrorCode } from './services/applicationError.js'
import type { EcoScanStore } from './services/ports.js'
import type { RecognitionJobs } from './services/recognitionJobs.js'
import type { ScanRateControl, ScanUploadGate } from './routes/analysisRoutes.js'
import { VisionAdmissionError, type PostgresVisionAdmission } from './services/visionAdmission.js'
import { createMaterialRouter } from './routes/materialRoutes.js'
import { selectMaterialRecognizer } from './services/vision/materialRecognizer.js'
import type { MaterialRecognizer } from './services/vision/types.js'

const applicationStatuses: Record<ApplicationErrorCode, number> = {
  INVALID_SCAN: 400, ANALYSIS_NOT_FOUND: 404, ANALYSIS_EXPIRED: 410,
  CONFIRMATION_CONFLICT: 409, OFFER_NOT_FOUND: 404, ALREADY_REDEEMED: 409,
  INSUFFICIENT_POINTS: 409, SESSION_CAPACITY: 503, SCAN_STORAGE_LIMIT: 429, SESSION_EXPIRED: 410,
  ANALYSIS_NOT_READY: 409, ANALYSIS_FAILED: 409,
  JOB_QUEUE_FULL: 503, OUT_OF_STOCK: 409, VOUCHER_UNAVAILABLE: 409,
}

interface AppOptions {
  safetyStore?: SafetyStore
  safetyHashKey?:string
  evidenceStore?: EvidenceStore
  evidenceConfig?: EvidenceConfig
  config?: Partial<ReliabilityConfig>
  now?: () => number
  logger?: LogSink
  store?: EcoScanStore
  jobs?: RecognitionJobs
  visionAdmission?: Pick<PostgresVisionAdmission, 'acquire'>
  rateLimiter?: ScanRateControl & { cleanup(): void | Promise<void> }
  uploadGate?: ScanUploadGate
  maintenance?: Pick<Maintenance, 'run'>
  readiness?: () => Promise<void>
  trustedProxyHops?: number
  staticDir?: string
  materialRecognizer?: MaterialRecognizer
}

export function createApp(recognizer: ClothingRecognizer = selectRecognizer(), options: AppOptions = {}) {
  getMaterialDataset() // Validate configured factor snapshots after environment loading.
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', options.trustedProxyHops ?? 0)
  const config = reliabilityConfigSchema.parse(options.config ?? {})
  const sessions = options.store ?? new DemoSessionStore(config, options.now)
  const rateLimiter = options.rateLimiter ?? new ScanRateLimiter(config, options.now)
  const gate = options.uploadGate ?? new ScanConcurrencyGate(config.maxConcurrentScans)
  const resolveSession = createSessionContext(sessions)
  const analyses = new AnalysisService(sessions, recognizer, options.jobs, options.visionAdmission)
  const safetyStore = options.safetyStore ?? new MemorySafetyStore(options.now)
  if (process.env.NODE_ENV==='production'&&!safetyStore.persistent) throw new Error('Reward monitoring requires persistent PostgreSQL storage in production')
  const safety = new RewardSafetyService(safetyStore,options.safetyHashKey ?? process.env.RATE_LIMIT_HASH_KEY ?? randomBytes(32).toString('hex'),options.now)
  const scans = new ScanService(sessions,safety)
  const offers = new OfferService(sessions,safety)
  const evidenceStore = options.evidenceStore ?? new MemoryEvidenceStore(options.now)
  const partnerConfig = options.evidenceConfig ?? evidenceConfig()
  if (process.env.NODE_ENV === 'production' && partnerConfig.partners.length && !evidenceStore.persistent) throw new Error('Activity verification requires persistent PostgreSQL storage in production')
  const activityEvidence = new ActivityEvidenceService(partnerConfig, evidenceStore, options.now,safety)
  const rawBodies = new WeakMap<IncomingMessage, Buffer>()

  // server.ts owns the timer so tests and embedded apps do not leak background handles.
  app.locals.cleanup = async () => { if (options.maintenance) return options.maintenance.run(); await sessions.cleanup(); await rateLimiter.cleanup(); await evidenceStore.cleanup(); await safetyStore.cleanup(); }
  app.use(requestLogging(options.logger ?? consoleLogSink, () => gate.active))

  app.use(express.json({ limit: '16kb', verify: (request, _response, buffer) => { if (request.url?.startsWith('/api/activity-evidence/partner/')) rawBodies.set(request, Buffer.from(buffer)) } }))

  app.get('/api/health', (_request, response) => {
    response.locals.operation = 'health'
    response.json({ status: 'ok' })
  })
  app.get('/api/ready', async (_request, response) => {
    response.locals.operation = 'ready'
    response.setHeader('Cache-Control', 'no-store')
    try {
      await options.readiness?.()
      response.json({ status: 'ready' })
    } catch (error) {
      const details = error instanceof Error
        ? { name: error.name, message: error.message, code: (error as NodeJS.ErrnoException).code }
        : { name: 'UnknownError', message: 'Unknown readiness failure' }
      console.error(JSON.stringify({ event: 'readiness_failure', error: details }))
      response.locals.errorCode = 'NOT_READY'
      response.status(503).json({ error: { code: 'NOT_READY', message: 'The API is not ready to serve requests.' } })
    }
  })
  app.get('/api/internal/cleanup', async (request, response) => {
    response.locals.operation = 'retention.cleanup'
    response.setHeader('Cache-Control', 'no-store')
    const secret = process.env.CRON_SECRET
    if (!secret || secret.length < 32 || !options.maintenance) throw new HttpError(503, 'MAINTENANCE_UNAVAILABLE', 'Maintenance is not configured.')
    const expected = Buffer.from('Bearer ' + secret)
    const actual = Buffer.from(request.headers.authorization ?? '')
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new HttpError(401, 'UNAUTHORIZED', 'Unauthorized.')
    response.json(await options.maintenance.run())
  })
  app.use('/api/analyses', createAnalysisRouter(analyses, resolveSession, rateLimiter, gate))
  app.use('/api/materials', createMaterialRouter(options.materialRecognizer ?? selectMaterialRecognizer(), resolveSession, rateLimiter, gate, options.visionAdmission))
  app.use('/api/scans', createScanRouter(scans, resolveSession))
  app.use('/api/offers', createOfferRouter(offers, resolveSession,rateLimiter,safety))
  app.use('/api/activity-evidence', createActivityEvidenceRouter(activityEvidence, resolveSession, rateLimiter, rawBodies, options.now,safety))
  app.use('/api/internal/rewards-risk',createRewardSafetyRouter(safety,rateLimiter))

  // A hosted web service can serve the Vite build on the same origin as /api.
  // The UI uses hash routes, so Express only needs to serve / and the assets.
  if (options.staticDir) app.use(express.static(options.staticDir))

  app.use((_request, response) => {
    response.locals.errorCode = 'NOT_FOUND'
    response.status(404).json({
      error: { code: 'NOT_FOUND', message: 'This endpoint does not exist.' },
    })
  })

  const handleError: ErrorRequestHandler = async (error: unknown, request, response, _next) => {
    if (response.destroyed || response.headersSent) return
    if (error instanceof HttpError && request.path.startsWith('/api/activity-evidence/partner/')) {
      const rule = error.code === 'INVALID_PARTNER_SIGNATURE' ? 'invalid_partner_signature' : error.code === 'ACTIVITY_ALREADY_CLAIMED' ? 'activity_claim_conflict' : error.code === 'ACTIVITY_LIMIT' ? 'activity_limit' : null
      if (rule) {
        const partnerId=request.get('X-EcoScan-Partner')
        const subject=rule !== 'invalid_partner_signature' && partnerConfig.partners.some(p=>p.id===partnerId) ? partnerSubject(partnerId!) : safety.ipSubject(request.ip ?? 'unknown')
        try { await safety.record(rule,subject) } catch { console.error(JSON.stringify({event:'reward_monitor_failure'})) }
      }
    }
    if (error instanceof ApplicationError) {
      response.locals.errorCode = error.code
      if (error.code === 'SESSION_CAPACITY' || error.code === 'SCAN_STORAGE_LIMIT' || error.code === 'JOB_QUEUE_FULL') response.setHeader('Retry-After', 60)
      response.status(applicationStatuses[error.code]).json({ error: { code: error.code, message: error.message } })
      return
    }
    if (error instanceof HttpError) {
      response.locals.errorCode = error.code
      if (error.retryAfterSeconds) response.setHeader('Retry-After', error.retryAfterSeconds)
      response.status(error.status).json({ error: { code: error.code, message: error.message } })
      return
    }
    if (error instanceof VisionUnavailableError) {
      response.locals.errorCode = 'VISION_UNAVAILABLE'
      response.status(503).json({
        error: {
          code: 'VISION_UNAVAILABLE',
          message: 'Image recognition is temporarily unavailable. Please try again.',
        },
      })
      return
    }
    if (error instanceof VisionAdmissionError) {
      response.locals.errorCode = error.code
      response.setHeader('Retry-After', error.code === 'VISION_BUSY' ? 30 : 3600)
      response.status(error.code === 'VISION_BUSY' ? 503 : 429).json({
        error: {
          code: error.code,
          message: error.code === 'VISION_BUSY'
            ? 'Image recognition is busy. Please try again shortly.'
            : 'The daily image recognition limit has been reached. Please try again later.',
        },
      })
      return
    }
    if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
      response.locals.errorCode = 'INVALID_JSON'
      response.status(400).json({
        error: { code: 'INVALID_JSON', message: 'Send a valid JSON request body.' },
      })
      return
    }
    if (error instanceof multer.MulterError) {
      const tooLarge = error.code === 'LIMIT_FILE_SIZE'
      response.locals.errorCode = tooLarge ? 'IMAGE_TOO_LARGE' : 'INVALID_UPLOAD'
      response.status(tooLarge ? 413 : 400).json({
        error: {
          code: tooLarge ? 'IMAGE_TOO_LARGE' : 'INVALID_UPLOAD',
          message: tooLarge
            ? 'The image must be 4 MB or smaller.'
            : 'Send one image in the image field.',
        },
      })
      return
    }

    if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large') {
      response.locals.errorCode = 'BODY_TOO_LARGE'
      response.status(413).json({ error: { code: 'BODY_TOO_LARGE', message: 'The request body is too large.' } })
      return
    }
    response.locals.errorCode = 'INTERNAL_ERROR'
    response.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Try again.' },
    })
  }
  app.use(handleError)
  return app
}
