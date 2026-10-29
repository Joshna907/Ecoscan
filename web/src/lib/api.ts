import { analysisJobStatusSchema, analysisResponseSchema, confirmScanResponseSchema, latestScanResponseSchema,
  offersResponseSchema, redeemOfferResponseSchema, type ConfirmScanRequest } from 'shared'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}
async function request(path: string, init: RequestInit = {}) {
  let response: Response
  try {
    response = await fetch('/api' + path, { ...init, credentials: 'same-origin',
      signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(45_000)]) : AbortSignal.timeout(45_000) })
  } catch (error) {
    if (init.signal?.aborted) throw error
    throw new ApiError('We could not reach EcoScan. Check your connection and try again.', 0)
  }
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const wait = response.headers.get('Retry-After')
    throw new ApiError((body?.error?.message ?? 'The request failed. Please try again.') + (wait ? ' Try again in ' + wait + ' seconds.' : ''), response.status)
  }
  if (!body) throw new ApiError('EcoScan returned an unreadable response. Please try again.', 0)
  return { body, status: response.status }
}
// Establish the anonymous cookie before concurrent page requests or an upload.
let session: Promise<unknown> | undefined
function ensureSession() {
  session ??= request('/offers').catch((error: unknown) => { session = undefined; throw error })
  return session
}
export const api = {
  async me(): Promise<{ user: { id: string; email: string } | null }> {
    return (await request('/auth/me')).body
  },
  async signup(email: string, password: string): Promise<{ user: { id: string; email: string } }> {
    await ensureSession()
    const result = (await request('/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).body
    session = undefined
    return result
  },
  async login(email: string, password: string): Promise<{ user: { id: string; email: string } }> {
    const result = (await request('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).body
    session = undefined
    return result
  },
  async logout(): Promise<void> {
    const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
    if (!response.ok) throw new ApiError('Could not log out. Please try again.', response.status)
    session = undefined
  },
  async upload(file: File) {
    await ensureSession()
    const form = new FormData(); form.append('image', file)
    const { body, status } = await request('/analyses', { method: 'POST', body: form })
    if (status === 202) {
      const job = analysisJobStatusSchema.parse(body)
      if (job.status !== 'queued') throw new Error('Unexpected scan status.')
      return { kind: 'queued' as const, job }
    }
    return { kind: 'ready' as const, analysis: analysisResponseSchema.parse(body) }
  },
  async status(id: string, signal: AbortSignal) {
    await ensureSession()
    return analysisJobStatusSchema.parse((await request('/analyses/' + encodeURIComponent(id), { signal })).body)
  },
  async confirm(input: ConfirmScanRequest) {
    await ensureSession()
    return confirmScanResponseSchema.parse((await request('/scans/confirm', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    })).body)
  },
  async latestScan() {
    await ensureSession()
    return latestScanResponseSchema.parse((await request('/scans/latest')).body)
  },
  async offers() { await ensureSession(); return offersResponseSchema.parse((await request('/offers')).body) },
  async redeem(id: string) {
    await ensureSession()
    return redeemOfferResponseSchema.parse((await request('/offers/' + encodeURIComponent(id) + '/redeem', { method: 'POST' })).body)
  },
}
export const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.'
