import { z } from 'zod'

export const reliabilityConfigSchema = z.object({
  sessionTtlMs: z.number().int().positive().default(30 * 60_000),
  analysisTtlMs: z.number().int().positive().default(15 * 60_000),
  resultRetentionMs: z.number().int().positive().default(60 * 60_000),
  cleanupIntervalMs: z.number().int().positive().max(2_147_483_647).default(60_000),
  maxSessions: z.number().int().positive().default(1_000),
  maxAnalysesPerSession: z.number().int().positive().default(50),
  scanRateCapacity: z.number().int().positive().default(5),
  scanRateRefillMs: z.number().int().positive().default(12_000),
  maxRateClients: z.number().int().positive().default(5_000),
  maxConcurrentScans: z.number().int().positive().default(5),
  maxQueuedJobs: z.number().int().positive().default(100),
  maxConcurrentVision: z.number().int().positive().default(3),
  maxDailyVisionCalls: z.number().int().positive().default(500),
})

export type ReliabilityConfig = z.infer<typeof reliabilityConfigSchema>

export function loadReliabilityConfig(env: NodeJS.ProcessEnv = process.env): ReliabilityConfig {
  const names: Record<keyof ReliabilityConfig, string> = {
    sessionTtlMs: 'SESSION_TTL_MS', analysisTtlMs: 'ANALYSIS_TTL_MS',
    resultRetentionMs: 'RESULT_RETENTION_MS', cleanupIntervalMs: 'CLEANUP_INTERVAL_MS',
    maxSessions: 'MAX_SESSIONS', maxAnalysesPerSession: 'MAX_ANALYSES_PER_SESSION',
    scanRateCapacity: 'SCAN_RATE_CAPACITY', scanRateRefillMs: 'SCAN_RATE_REFILL_MS',
    maxRateClients: 'MAX_RATE_CLIENTS', maxConcurrentScans: 'MAX_CONCURRENT_SCANS',
    maxQueuedJobs: 'MAX_QUEUED_JOBS',
    maxConcurrentVision: 'MAX_CONCURRENT_VISION', maxDailyVisionCalls: 'MAX_DAILY_VISION_CALLS',
  }
  const values: Partial<ReliabilityConfig> = {}
  for (const [key, name] of Object.entries(names)) {
    if (env[name] !== undefined) {
      const value = Number(env[name])
      if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`)
      values[key as keyof ReliabilityConfig] = value
    }
  }
  return reliabilityConfigSchema.parse(values)
}
