import type { Pool } from 'pg'
import type { ReliabilityConfig } from './config.js'
import { assertSchemaReady } from './schemaReadiness.js'
import { PostgresSessionStore } from './store/postgresSessions.js'
import { PostgresScanRateLimiter, PostgresUploadGate } from './middleware/postgresTrafficControl.js'
import { PostgresVisionAdmission } from './services/visionAdmission.js'
import { Maintenance } from './services/maintenance.js'
import { PostgresEvidenceStore } from './store/activityEvidence.js'
import { PostgresSafetyStore } from './services/rewardSafety.js'

// Both entry points share dependency construction, including OCR's AI budget.
export function postgresRuntime(pool: Pool, config: ReliabilityConfig, env: NodeJS.ProcessEnv = process.env) {
  if (!env.RATE_LIMIT_HASH_KEY) throw new Error('RATE_LIMIT_HASH_KEY is required')
  const store = new PostgresSessionStore(pool, config)
  const rateLimiter = new PostgresScanRateLimiter(pool, config, env.RATE_LIMIT_HASH_KEY)
  const admission = new PostgresVisionAdmission(pool, config)
  const evidenceStore = new PostgresEvidenceStore(pool)
  const safetyStore = new PostgresSafetyStore(pool)
  const maintenance = new Maintenance(pool, async () => {
    await store.cleanup()
    await rateLimiter.cleanup()
    await admission.cleanup()
    await evidenceStore.cleanup()
    await safetyStore.cleanup()
    const risk=await safetyStore.snapshot()
    console.log(JSON.stringify({event:'reward_fraud_monitor',counts24h:risk.counts24h,openReviews:risk.reviews.length,oldestOpenSeconds:risk.oldestOpenSeconds,severity:risk.oldestOpenSeconds>3600?'warning':'info'}))
    await pool.query('DELETE FROM eco_upload_slots WHERE expires_at <= now()')
  })
  return {
    store, rateLimiter, maintenance, evidenceStore, safetyStore,safetyHashKey:env.RATE_LIMIT_HASH_KEY,
    uploadGate: new PostgresUploadGate(pool, config.maxConcurrentScans),
    visionAdmission: env.VISION_PROVIDER === 'openai' ? admission : undefined,
    readiness: async () => { await assertSchemaReady(pool); await maintenance.ready() },
  }
}
