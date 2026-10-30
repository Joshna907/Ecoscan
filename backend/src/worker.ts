import { existsSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { Pool } from 'pg'
import { loadReliabilityConfig } from './config.js'
import { PostgresRecognitionJobs } from './services/recognitionJobs.js'
import { RecognitionWorker } from './services/recognitionWorker.js'
import { selectRecognizer } from './services/vision/selectRecognizer.js'
import { PostgresVisionAdmission, VisionAdmissionError } from './services/visionAdmission.js'

if (existsSync('.env')) process.loadEnvFile('.env')
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for the recognition worker')
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 })
await pool.query('SELECT 1 FROM eco_recognition_jobs LIMIT 0')
const config = loadReliabilityConfig()
const admission = new PostgresVisionAdmission(pool, config)
const worker = new RecognitionWorker(new PostgresRecognitionJobs(pool, config), selectRecognizer(), admission)
const controller = new AbortController()
process.once('SIGINT', () => controller.abort())
process.once('SIGTERM', () => controller.abort())
console.log('EcoScan recognition worker started')
try {
  while (!controller.signal.aborted) {
    try {
      const worked = await worker.runOne()
      if (!worked) await delay(1000, undefined, { signal: controller.signal })
    } catch (error) {
      if (controller.signal.aborted) break
      if (!(error instanceof VisionAdmissionError)) console.error('EcoScan worker could not process a job')
      const pauseMs = error instanceof VisionAdmissionError && error.code === 'VISION_BUDGET_EXHAUSTED' ? 60_000 : 3000
      try { await delay(pauseMs, undefined, { signal: controller.signal }) }
      catch { if (!controller.signal.aborted) throw new Error('EcoScan worker retry delay failed') }
    }
  }
} finally { await pool.end() }
