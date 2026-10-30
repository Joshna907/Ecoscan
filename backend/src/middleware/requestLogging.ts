import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import type { RequestHandler } from 'express'

export interface RequestLog {
  event: 'http_request'
  requestId: string
  operation: string
  statusCode: number
  durationMs: number
  outcome: 'completed' | 'aborted'
  errorCode?: string
  recognitionMode?: 'mock' | 'vision'
  recognitionDurationMs?: number
  recognitionOutcome?: 'success' | 'failure'
  activeScans: number
}

export type LogSink = (event: RequestLog) => void
export const consoleLogSink: LogSink = (event) => console.log(JSON.stringify(event))

export function requestLogging(log: LogSink, activeScans: () => number): RequestHandler {
  return (request, response, next) => {
    const started = performance.now()
    const requestId = randomUUID()
    response.locals.requestId = requestId
    const path = request.path.replace(/\/$/, '')
    response.locals.operation = request.method === 'POST' && path === '/api/analyses' ? 'image.analyse'
      : request.method === 'POST' && path === '/api/scans/confirm' ? 'scan.confirm'
      : request.method === 'GET' && path === '/api/scans/latest' ? 'scan.latest'
      : request.method === 'GET' && path === '/api/offers' ? 'offers.list'
      : request.method === 'POST' && /^\/api\/offers\/[^/]+\/redeem$/.test(path) ? 'offers.redeem'
      : request.method === 'GET' && path === '/api/health' ? 'health' : 'unknown'
    response.setHeader('X-Request-ID', requestId)
    let logged = false
    const write = (outcome: RequestLog['outcome']) => {
      if (logged) return
      logged = true
      // Only allowlisted fields: never log URLs, cookies, bodies, images, headers, or raw errors.
      const entry: RequestLog = {
        event: 'http_request', requestId, operation: response.locals.operation,
        statusCode: outcome === 'aborted' ? 499 : response.statusCode,
        durationMs: Math.round(performance.now() - started), outcome,
        errorCode: response.locals.errorCode,
        recognitionMode: response.locals.recognitionMode,
        recognitionDurationMs: response.locals.recognitionDurationMs,
        recognitionOutcome: response.locals.recognitionOutcome,
        activeScans: activeScans(),
      }
      // A broken logging destination must not break a response or crash the server.
      try { log(entry) } catch { /* Logging is best effort in this demo. */ }
    }
    response.once('finish', () => write('completed'))
    response.once('close', () => write(response.writableFinished ? 'completed' : 'aborted'))
    next()
  }
}
