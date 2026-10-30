import { Router } from 'express'
import type { ResolveSession } from '../middleware/sessionContext'
import type { OfferService } from '../services/offerService'

export function createOfferRouter(service: OfferService, resolveSession: ResolveSession): Router {
  const router = Router()
  router.get('/', async (request, response) => {
    response.locals.operation = 'offers.list'
    response.json(await service.list(await resolveSession(request, response)))
  })
  router.post('/:offerId/redeem', async (request, response) => {
    response.locals.operation = 'offers.redeem'
    response.json(await service.redeem(await resolveSession(request, response), request.params.offerId))
  })
  return router
}
