import type { Request, Response } from 'express'
import type { EcoScanStore } from '../services/ports'
import type { AuthService } from '../services/authService'

const COOKIE_NAME = 'ecoscan_demo_session'
export const AUTH_COOKIE_NAME = 'ecoscan_auth'
export type ResolveSession = (request: Request, response: Response) => Promise<string>

export function cookieValue(request: Request, name: string): string | undefined {
  return request.headers.cookie?.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1)
}

export function createSessionContext(store: Pick<EcoScanStore, 'getOrCreate'>, auth?: AuthService): ResolveSession {
  return async (request, response) => {
    const account = await auth?.accountForToken(cookieValue(request, AUTH_COOKIE_NAME))
    if (account) return account.sessionId
    const id = await store.getOrCreate(cookieValue(request, COOKIE_NAME))
    response.cookie(COOKIE_NAME, id, {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/',
    })
    return id
  }
}
