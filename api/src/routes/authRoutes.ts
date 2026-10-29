import { Router, type Response } from 'express'
import { z } from 'zod'
import { HttpError } from '../httpError'
import { AUTH_COOKIE_NAME, cookieValue } from '../middleware/sessionContext'
import type { AuthService } from '../services/authService'

const DEMO_COOKIE_NAME = 'ecoscan_demo_session'
const credentials = z.object({ email: z.string(), password: z.string() }).strict()
const cookieOptions = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 30 * 24 * 60 * 60 * 1000 }
const publicAccount = (account: { id: string; email: string }) => ({ id: account.id, email: account.email })

function setLogin(response: Response, token: string) {
  response.cookie(AUTH_COOKIE_NAME, token, cookieOptions)
  response.clearCookie(DEMO_COOKIE_NAME, { path: '/' })
}

export function createAuthRouter(auth?: AuthService): Router {
  const router = Router()
  router.get('/me', async (request, response) => {
    response.locals.operation = 'auth.me'
    const account = await auth?.accountForToken(cookieValue(request, AUTH_COOKIE_NAME))
    response.json({ user: account ? publicAccount(account) : null })
  })
  router.post('/signup', async (request, response) => {
    response.locals.operation = 'auth.signup'
    if (!auth) throw new HttpError(503, 'AUTH_UNAVAILABLE', 'Accounts require PostgreSQL mode.')
    const parsed = credentials.safeParse(request.body)
    if (!parsed.success) throw new HttpError(400, 'INVALID_CREDENTIALS', 'Enter an email and password.')
    const { account, token } = await auth.register(parsed.data.email, parsed.data.password, cookieValue(request, DEMO_COOKIE_NAME))
    setLogin(response, token)
    response.status(201).json({ user: publicAccount(account) })
  })
  router.post('/login', async (request, response) => {
    response.locals.operation = 'auth.login'
    if (!auth) throw new HttpError(503, 'AUTH_UNAVAILABLE', 'Accounts require PostgreSQL mode.')
    const parsed = credentials.safeParse(request.body)
    if (!parsed.success) throw new HttpError(400, 'INVALID_CREDENTIALS', 'Enter an email and password.')
    const { account, token } = await auth.login(parsed.data.email, parsed.data.password)
    setLogin(response, token)
    response.json({ user: publicAccount(account) })
  })
  router.post('/logout', async (request, response) => {
    response.locals.operation = 'auth.logout'
    await auth?.logout(cookieValue(request, AUTH_COOKIE_NAME))
    response.clearCookie(AUTH_COOKIE_NAME, { path: '/' })
    response.clearCookie(DEMO_COOKIE_NAME, { path: '/' })
    response.status(204).end()
  })
  return router
}
