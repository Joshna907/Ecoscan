import { Pool } from 'pg'
import { createApp } from './app.js'
import { loadReliabilityConfig } from './config.js'
import { postgresRuntime } from './postgresRuntime.js'

// A Vercel invocation cannot rely on a continuously running recognition worker.
// createApp's direct recognition path completes the image analysis in the request.
export function createServerlessApp() {
  const connectionString = process.env.DATABASE_URL
  const rateLimitKey = process.env.RATE_LIMIT_HASH_KEY
  if (!connectionString || !rateLimitKey) {
    throw new Error('DATABASE_URL and RATE_LIMIT_HASH_KEY are required')
  }
  const config = loadReliabilityConfig()
  const pool = new Pool({ connectionString, max: 2, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000, statement_timeout: 15_000 })
  const runtime = postgresRuntime(pool, config)
  return createApp(undefined, {
    config,
    ...runtime,
    readiness: async () => {
      await runtime.readiness()
      if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 32) throw new Error('CRON_SECRET is required for scheduled retention')
    },
    trustedProxyHops: 1,
  })
}
