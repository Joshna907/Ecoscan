import { postgresRuntime } from './postgresRuntime.js'
import { assertSchemaReady } from './schemaReadiness.js'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { createApp } from './app.js'
import { loadReliabilityConfig } from './config.js'
import { Pool } from 'pg'
import { PostgresRecognitionJobs } from './services/recognitionJobs.js'

if (existsSync('.env')) process.loadEnvFile('.env')

const port = Number(process.env.PORT ?? 5000)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be a valid TCP port')
}

const config = loadReliabilityConfig()
const trustedProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0)
if (!Number.isSafeInteger(trustedProxyHops) || trustedProxyHops < 0 || trustedProxyHops > 3) {
  throw new Error('TRUST_PROXY_HOPS must be an integer from 0 to 3')
}
const storeMode = process.env.DATA_STORE ?? 'memory'
if (storeMode !== 'memory' && storeMode !== 'postgres') throw new Error('DATA_STORE must be memory or postgres')
if (process.env.NODE_ENV === 'production' && storeMode !== 'postgres') throw new Error('Production requires DATA_STORE=postgres')
if (storeMode === 'postgres' && !process.env.DATABASE_URL) throw new Error('DATABASE_URL is required when DATA_STORE=postgres')
if (storeMode === 'postgres' && !process.env.RATE_LIMIT_HASH_KEY) throw new Error('RATE_LIMIT_HASH_KEY is required when DATA_STORE=postgres')
const pool = storeMode === 'postgres' ? new Pool({ connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 10_000, statement_timeout: 15_000 }) : undefined
if (pool) await assertSchemaReady(pool)
const staticDir = process.env.SERVE_WEB === 'true' ? fileURLToPath(new URL('../../web/dist/', import.meta.url)) : undefined
if (staticDir && !existsSync(join(staticDir, 'index.html'))) {
  throw new Error('SERVE_WEB=true requires a built web/dist directory; run npm run build:web')
}
const app = createApp(undefined, {
  config,
  ...(pool ? postgresRuntime(pool, config) : {}),
  jobs: pool ? new PostgresRecognitionJobs(pool, config) : undefined,
  trustedProxyHops,
  staticDir,
})
const cleanup = setInterval(() => { void app.locals.cleanup().catch(() => console.error('EcoScan cleanup failed')) }, config.cleanupIntervalMs)
cleanup.unref()
const server = app.listen(port, () => {
  console.log(`EcoScan API listening on http://localhost:${port}`)
})
// Bound slow uploads as well as the number of uploads admitted at once.
server.requestTimeout = 30_000
server.headersTimeout = 15_000

let shuttingDown = false
function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  clearInterval(cleanup)
  // Finish admitted requests before releasing the database pool. The outer
  // container grace period is longer than this deadline.
  const deadline = setTimeout(() => server.closeAllConnections(), 25_000)
  void new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  }).then(async () => {
    await pool?.end()
  }).catch(() => {
    console.error('EcoScan API shutdown failed')
    process.exitCode = 1
  }).finally(() => clearTimeout(deadline))
}
process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
