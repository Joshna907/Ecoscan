import type { RequestHandler } from 'express'
import type { ReliabilityConfig } from '../config.js'
import { HttpError } from '../httpError.js'

interface Bucket { tokens: number; updatedAt: number }

export class ScanRateLimiter {
  private readonly buckets = new Map<string, Bucket>()
  constructor(private readonly config: ReliabilityConfig, private readonly now = Date.now) {}

  cleanup(): void {
    const now = this.now()
    for (const [key, bucket] of this.buckets) {
      if (bucket.tokens + (now - bucket.updatedAt) / this.config.scanRateRefillMs >= this.config.scanRateCapacity) {
        this.buckets.delete(key)
      }
    }
  }

  readonly middleware: RequestHandler = (request, _response, next) => {
    try {
      // Express does not trust forwarded IP headers unless explicitly configured.
      const key = request.ip ?? request.socket.remoteAddress ?? 'unknown'
      this.cleanup()
      let bucket = this.buckets.get(key)
      if (!bucket) {
        if (this.buckets.size >= this.config.maxRateClients) {
          throw new HttpError(503, 'RATE_LIMIT_CAPACITY', 'The scanner is busy. Please try again shortly.', 12)
        }
        bucket = { tokens: this.config.scanRateCapacity, updatedAt: this.now() }
        this.buckets.set(key, bucket)
      }
      const now = this.now()
      bucket.tokens = Math.min(this.config.scanRateCapacity,
        bucket.tokens + Math.max(0, now - bucket.updatedAt) / this.config.scanRateRefillMs)
      bucket.updatedAt = now
      if (bucket.tokens < 1) {
        const seconds = Math.max(1, Math.ceil((1 - bucket.tokens) * this.config.scanRateRefillMs / 1000))
        throw new HttpError(429, 'SCAN_RATE_LIMITED', 'Too many scan attempts. Please wait before trying again.', seconds)
      }
      bucket.tokens -= 1
      next()
    } catch (error) { next(error) }
  }
}

export class ScanConcurrencyGate {
  private running = 0
  constructor(private readonly limit: number) {}
  get active(): number { return this.running }

  acquire(): () => void {
    if (this.running >= this.limit) {
      throw new HttpError(503, 'SCANNER_BUSY', 'All scan slots are busy. Please try again shortly.', 2)
    }
    this.running += 1
    let released = false
    return () => {
      if (!released) { released = true; this.running -= 1 }
    }
  }
}
