import { timingSafeEqual } from 'node:crypto'
import { HttpError } from '../httpError.js'
import { Router } from 'express'
import type { ResolveSession } from '../middleware/sessionContext.js'
import type { OfferService } from '../services/offerService.js'
import { z } from 'zod'
import type { ScanRateControl } from './analysisRoutes.js'
import type { RewardSafetyService } from '../services/rewardSafety.js'

export function createOfferRouter(service: OfferService, resolveSession: ResolveSession, rateLimiter: ScanRateControl, safety: RewardSafetyService): Router {
  const router = Router()
  router.use((_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); next() })
  router.get('/', async (request, response) => {
    response.locals.operation = 'offers.list'
    response.json(await service.list(await resolveSession(request, response)))
  })
  router.post('/recover',rateLimiter.middleware,async(request,response) => {
    response.locals.operation='receipt.recover'
    const input=z.object({ recoveryKey:z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict().safeParse(request.body)
    const subject=safety.ipSubject(request.ip ?? 'unknown')
    await safety.assertAllowed(subject)
    try {
      if (!input.success) throw new HttpError(400,'INVALID_RECOVERY_KEY','Enter the private recovery key saved with your receipt.')
      const recovered=await service.recover(input.data.recoveryKey)
      await safety.record('recovery_success',subject)
      response.json(recovered)
    } catch(error) { await safety.record('recovery_failed',subject); throw error }
  })
  router.post('/:offerId/recovery-key',rateLimiter.middleware,async(request,response) => {
    response.locals.operation='receipt.recovery_key'
    response.json(await service.createRecovery(await resolveSession(request,response),String(request.params.offerId)))
  })
  router.post('/:offerId/redeem', async (request, response) => {
    response.locals.operation = 'offers.redeem'
    response.json(await service.redeem(await resolveSession(request, response), request.params.offerId))
  })
  router.post('/:offerId/refund', async (request, response) => {
    response.locals.operation = 'offers.refund'
    response.json(await service.refund(await resolveSession(request, response), request.params.offerId))
  })
  router.post('/:offerId/demo-use', async (request, response) => {
    response.locals.operation = 'offers.demo_fulfil'
    response.json(await service.fulfilDemo(await resolveSession(request, response), request.params.offerId))
  })
  router.post('/vouchers/:reference/use', async (request, response) => {
    response.locals.operation = 'offers.partner_fulfil'
    const secret = process.env.PARTNER_API_SECRET
    if (!secret || secret.length < 32) throw new HttpError(503, 'PARTNER_UNAVAILABLE', 'Partner fulfilment is not configured.')
    const expected = Buffer.from('Bearer ' + secret), actual = Buffer.from(request.headers.authorization ?? '')
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new HttpError(401, 'UNAUTHORIZED', 'Unauthorized.')
    response.json(await service.fulfil(request.params.reference))
  })
  return router
}
