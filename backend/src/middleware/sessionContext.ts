import type { Request, Response } from 'express'
import type { EcoScanStore } from '../services/ports.js'

const COOKIE_NAME = 'ecoscan_demo_session'
export type ResolveSession = (request: Request, response: Response) => Promise<string>
export function createSessionContext(store: Pick<EcoScanStore, 'getOrCreate'>): ResolveSession {
  return async (request, response) => {
    const existing = request.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(COOKIE_NAME + '='))?.slice(COOKIE_NAME.length + 1)
    const id = await store.getOrCreate(existing)
    response.cookie(COOKIE_NAME, id, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 30 * 86400000 })
    return id
  }
}
