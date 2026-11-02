import { analysisJobStatusSchema, analysisResponseSchema, confirmScanResponseSchema, latestScanResponseSchema,
  materialRecognitionResponseSchema, voucherActionResponseSchema, offersResponseSchema, redeemOfferResponseSchema, activityEvidenceSnapshotSchema, activityRequestResponseSchema, type QualifyingActivity, type ConfirmScanRequest } from 'shared'
import { recoveryKeyResponseSchema,recoveredReceiptSchema } from 'shared'

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
  async createRecoveryKey(offerId: string) { await ensureSession(); return recoveryKeyResponseSchema.parse((await request('/offers/'+encodeURIComponent(offerId)+'/recovery-key',{method:'POST'})).body) },
  async recoverReceipt(recoveryKey: string) { return recoveredReceiptSchema.parse((await request('/offers/recover',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({recoveryKey})})).body) },
  async activityEvidence() { await ensureSession(); return activityEvidenceSnapshotSchema.parse((await request('/activity-evidence')).body) },
  async requestActivityEvidence(partnerId: string, activity: QualifyingActivity) {
    await ensureSession()
    return activityRequestResponseSchema.parse((await request('/activity-evidence/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ partnerId, activity }) })).body)
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
  async recognizeMaterialLabel(file: File) {
    await ensureSession()
    const form = new FormData(); form.append('image', file)
    return materialRecognitionResponseSchema.parse((await request('/materials/recognize-label', { method: 'POST', body: form })).body)
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
  async useDemo(id: string) {
    await ensureSession()
    return voucherActionResponseSchema.parse((await request('/offers/' + encodeURIComponent(id) + '/demo-use', { method: 'POST' })).body)
  },
  async refund(id: string) {
    await ensureSession()
    return voucherActionResponseSchema.parse((await request('/offers/' + encodeURIComponent(id) + '/refund', { method: 'POST' })).body)
  },
  async redeem(id: string) {
    await ensureSession()
    return redeemOfferResponseSchema.parse((await request('/offers/' + encodeURIComponent(id) + '/redeem', { method: 'POST' })).body)
  },
}
export const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.'
