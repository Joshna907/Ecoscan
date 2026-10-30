import { Router } from 'express'
import type { ResolveSession } from '../middleware/sessionContext.js'
import type { ScanService } from '../services/scanService.js'

export function createScanRouter(service: ScanService, resolveSession: ResolveSession): Router {
  const router = Router()
  router.get('/latest', async (request, response) => {
    response.locals.operation = 'scan.latest'
    response.json(await service.latest(await resolveSession(request, response)))
  })
  router.post('/confirm', async (request, response) => {
    response.locals.operation = 'scan.confirm'
    response.json(await service.confirm(await resolveSession(request, response), request.body))
  })
  return router
}
