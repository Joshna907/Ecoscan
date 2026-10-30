import { Pool } from 'pg'
import { createApp } from './app.js'
import { loadReliabilityConfig } from './config.js'
import { PostgresSessionStore } from './store/postgresSessions.js'
import { PostgresScanRateLimiter, PostgresUploadGate } from './middleware/postgresTrafficControl.js'
import { AuthService } from './services/authService.js'
import { PostgresVisionAdmission } from './services/visionAdmission.js'

// A Vercel invocation cannot rely on a continuously running recognition worker.
// createApp's direct recognition path completes the image analysis in the request.
export function createServerlessApp() {
  const connectionString = process.env.DATABASE_URL
  const jwtSecret = process.env.AUTH_JWT_SECRET
  const rateLimitKey = process.env.RATE_LIMIT_HASH_KEY
  if (!connectionString || !jwtSecret || !rateLimitKey) {
    throw new Error('DATABASE_URL, AUTH_JWT_SECRET, and RATE_LIMIT_HASH_KEY are required')
  }
  const config = loadReliabilityConfig()
  const pool = new Pool({ connectionString, max: 2, idleTimeoutMillis: 10_000 })
  return createApp(undefined, {
    config,
    store: new PostgresSessionStore(pool, config),
    rateLimiter: new PostgresScanRateLimiter(pool, config, rateLimitKey),
    uploadGate: new PostgresUploadGate(pool, config.maxConcurrentScans),
    visionAdmission: process.env.VISION_PROVIDER === 'openai' ? new PostgresVisionAdmission(pool, config) : undefined,
    readiness: async () => { await pool.query('SELECT 1 FROM eco_scan_rate_buckets LIMIT 0') },
    trustedProxyHops: 1,
    auth: new AuthService(pool, jwtSecret),
  })
}
