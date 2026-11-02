import { createHmac, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import { Router, type Request } from 'express'
import { activityRequestInputSchema, activityEvidenceSnapshotSchema, activityReceiptSchema } from '../../../shared/src/index.js'
import type { ResolveSession } from '../middleware/sessionContext.js'
import type { ScanRateControl } from './analysisRoutes.js'
import { ActivityEvidenceService, activityAttestationSchema, activityReversalSchema, evidenceError } from '../services/activityEvidence.js'
import type { RewardSafetyService } from '../services/rewardSafety.js'

// Sign the exact UTF-8 JSON bytes. Method + path + timestamp prevent cross-route
// replay; event uniqueness and request binding prevent repeated credits.
export const evidenceSignature = (secret: string, timestamp: string, path: string, body: string) => createHmac('sha256', secret).update(`${timestamp}\nPOST\n${path}\n${body}`).digest('hex')

export function createActivityEvidenceRouter(service: ActivityEvidenceService, resolveSession: ResolveSession, rateLimiter: ScanRateControl, rawBodies: WeakMap<IncomingMessage, Buffer>, now = Date.now,safety?:RewardSafetyService) {
  const router = Router()
  router.use((_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); response.setHeader('Referrer-Policy', 'no-referrer'); next() })
  router.use('/partner',async(request,_response,next)=>{await safety?.assertAllowed(safety.ipSubject(request.ip??'unknown'));next()})
  router.get('/', async (request, response) => {
    response.locals.operation = 'activity.list'
    response.json(activityEvidenceSnapshotSchema.parse(await service.snapshot(await resolveSession(request, response))))
  })
  router.post('/requests', rateLimiter.middleware, async (request, response) => {
    response.locals.operation = 'activity.request'
    if (!service.config.partners.length) evidenceError(503, 'VERIFICATION_UNAVAILABLE', 'No activity verification partner is connected yet.')
    const input = activityRequestInputSchema.safeParse(request.body)
    if (!input.success) evidenceError(400, 'INVALID_ACTIVITY_REQUEST', 'Choose a partner and activity.')
    response.status(201).json(await service.request(await resolveSession(request, response), input.data.partnerId, input.data.activity))
  })
  function authenticate(request: Request) {
    const partner = service.config.partners.find(p => p.id === request.get('X-EcoScan-Partner'))
    const timestamp = request.get('X-EcoScan-Timestamp') ?? ''
    const signature = request.get('X-EcoScan-Signature') ?? ''
    const raw = rawBodies.get(request)
    if (!partner || !/^\d{10}$/.test(timestamp) || Math.abs(now() - Number(timestamp) * 1000) > 300_000 || !/^[a-f0-9]{64}$/.test(signature) || !raw) evidenceError(401, 'INVALID_PARTNER_SIGNATURE', 'A valid signed partner request is required.')
    const expected = evidenceSignature(partner.secret, timestamp, request.originalUrl, raw.toString('utf8'))
    if (!timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))) evidenceError(401, 'INVALID_PARTNER_SIGNATURE', 'A valid signed partner request is required.')
    return partner
  }
  router.post('/partner/confirm', rateLimiter.middleware, async (request, response) => {
    response.locals.operation = 'activity.confirm'
    const partner = authenticate(request)
    const input = activityAttestationSchema.safeParse(request.body)
    if (!input.success) evidenceError(400, 'INVALID_ACTIVITY_EVIDENCE', 'Provide a request code, completed activity, event and participant references, and completion time. Do not send personal information.')
    response.json(activityReceiptSchema.parse(await service.confirm(partner, input.data)))
  })
  router.post('/partner/reverse', rateLimiter.middleware, async (request, response) => {
    response.locals.operation = 'activity.reverse'
    const partner = authenticate(request)
    const input = activityReversalSchema.safeParse(request.body)
    if (!input.success) evidenceError(400, 'INVALID_ACTIVITY_EVIDENCE', 'Provide the original event reference and a reversal reason.')
    response.json(activityReceiptSchema.parse(await service.reverse(partner, input.data.eventReference, input.data.reason)))
  })
  return router
}
