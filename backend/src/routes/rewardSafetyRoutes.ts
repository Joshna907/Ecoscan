import { timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../httpError.js'
import type { RewardSafetyService } from '../services/rewardSafety.js'
import type { ScanRateControl } from './analysisRoutes.js'

export function createRewardSafetyRouter(service: RewardSafetyService, rateLimiter: ScanRateControl) {
  const operators = z.array(z.object({ id:z.string().regex(/^[a-z0-9-]{1,64}$/),token:z.string().min(32) }).strict()).max(20).parse(JSON.parse(process.env.REWARD_REVIEW_OPERATORS || '[]'))
  if (new Set(operators.map(o=>o.id)).size !== operators.length || new Set(operators.map(o=>o.token)).size !== operators.length) throw new Error('Review operators need unique IDs and tokens')
  const router = Router()
  router.use(rateLimiter.middleware, (request,response,next) => {
    response.locals.operation = 'rewards.review'
    response.setHeader('Cache-Control','no-store')
    if (!operators.length) throw new HttpError(503,'REVIEW_UNAVAILABLE','Operator review is not configured.')
    const token = Buffer.from(request.headers.authorization ?? '')
    const operator = operators.find(o => { const expected=Buffer.from('Bearer '+o.token); return expected.length===token.length && timingSafeEqual(expected,token) })
    if (!operator) throw new HttpError(401,'UNAUTHORIZED','Authorized operator access is required.')
    response.locals.operatorId=operator.id; next()
  })
  router.get('/',async (_request,response) => response.json(await service.store.snapshot()))
  router.get('/:id/audit',async (request,response) => {
    if (!z.uuid().safeParse(request.params.id).success) throw new HttpError(400,'INVALID_REVIEW','Invalid review reference.')
    response.json({ audit:await service.store.audit(request.params.id) })
  })
  router.post('/:id',async (request,response) => {
    const input=z.object({ expectedVersion:z.number().int().nonnegative(),decision:z.enum(['dismiss','hold','release']),reason:z.enum(['investigating','confirmed_abuse','false_positive','resolved']) }).strict().safeParse(request.body)
    if (!input.success || !z.uuid().safeParse(request.params.id).success) throw new HttpError(400,'INVALID_REVIEW','Provide a review version, decision and reason.')
    response.json(await service.store.review(request.params.id,input.data.expectedVersion,input.data.decision,input.data.reason,response.locals.operatorId))
  })
  return router
}
