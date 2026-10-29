import { randomUUID } from 'node:crypto'
import { Pool, type PoolClient } from 'pg'
import { analysisJobStatusSchema, analysisResponseSchema, type AnalysisJobStatus, type AnalysisResponse } from 'shared'
import type { ReliabilityConfig } from '../config'
import { ApplicationError } from './applicationError'
import type { ClothingRecognizer } from './vision/types'

export interface ClaimedRecognitionJob {
  analysisId: string
  image: Buffer
  mimeType: string
  attempts: number
  claimToken: string
}

export interface RecognitionJobs {
  hasReady(): Promise<boolean>
  enqueue(sessionId: string, image: Buffer, mimeType: string): Promise<{ analysisId: string; status: 'queued' }>
  status(sessionId: string, analysisId: string): Promise<AnalysisJobStatus>
  claim(): Promise<ClaimedRecognitionJob | undefined>
  complete(job: ClaimedRecognitionJob, suggestions: AnalysisResponse['suggestions'], mode: ClothingRecognizer['mode']): Promise<boolean>
  fail(job: ClaimedRecognitionJob): Promise<boolean>
}

export class PostgresRecognitionJobs implements RecognitionJobs {
  constructor(private readonly pool: Pool, private readonly config: ReliabilityConfig) {}

  async hasReady(): Promise<boolean> {
    const result = await this.pool.query(`SELECT 1 FROM eco_recognition_jobs WHERE (status = 'queued' AND available_at <= now()) OR (status = 'processing' AND lease_until <= now()) LIMIT 1`)
    return !!result.rowCount
  }

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await work(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally { client.release() }
  }

  async enqueue(sessionId: string, image: Buffer, mimeType: string): Promise<{ analysisId: string; status: 'queued' }> {
    const analysisId = randomUUID()
    await this.transaction(async (client) => {
      // Serialize admission across API copies so the database image budget is bounded.
      await client.query('SELECT pg_advisory_xact_lock(17028103)')
      const waiting = await client.query<{ count: string }>('SELECT count(*)::text AS count FROM eco_recognition_jobs')
      if (Number(waiting.rows[0].count) >= this.config.maxQueuedJobs) {
        throw new ApplicationError('JOB_QUEUE_FULL', 'The scanner queue is full. Please try again later.')
      }
      const session = await client.query('SELECT 1 FROM eco_sessions WHERE id = $1 FOR UPDATE', [sessionId])
      if (!session.rowCount) throw new ApplicationError('SESSION_EXPIRED', 'This demo session expired. Start a new scan.')
      await client.query(`INSERT INTO eco_analyses(id, session_id, status, expires_at) VALUES ($1, $2, 'queued', now() + interval '1 day')`, [analysisId, sessionId])
      await client.query(`INSERT INTO eco_recognition_jobs(analysis_id, image, mime_type, status) VALUES ($1, $2, $3, 'queued')`, [analysisId, image, mimeType])
    })
    return { analysisId, status: 'queued' }
  }

  async status(sessionId: string, analysisId: string): Promise<AnalysisJobStatus> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(analysisId)) throw new ApplicationError('ANALYSIS_NOT_FOUND', 'This analysis is unavailable. Upload an image again.')
    const found = await this.pool.query<{ status: string; expires_at: Date; suggestions: unknown; recognition_mode: string | null }>('SELECT status, expires_at, suggestions, recognition_mode FROM eco_analyses WHERE id = $1 AND session_id = $2', [analysisId, sessionId])
    const row = found.rows[0]
    if (!row || (row.status !== 'queued' && row.status !== 'processing' && row.expires_at.getTime() <= Date.now())) {
      throw new ApplicationError('ANALYSIS_NOT_FOUND', 'This analysis is unavailable. Upload an image again.')
    }
    if (row.status === 'awaiting_review') return analysisJobStatusSchema.parse({
      analysisId, status: 'ready', recognitionMode: row.recognition_mode, suggestions: row.suggestions, needsReview: true,
    })
    if (row.status === 'queued' || row.status === 'processing' || row.status === 'failed' || row.status === 'confirmed') {
      return analysisJobStatusSchema.parse({ analysisId, status: row.status })
    }
    throw new ApplicationError('ANALYSIS_NOT_FOUND', 'This analysis is unavailable. Upload an image again.')
  }


  async claim(): Promise<ClaimedRecognitionJob | undefined> {
    return this.transaction(async (client) => {
      // A worker may die on its final attempt. Retire that job before claiming another.
      const exhausted = await client.query<{ analysis_id: string }>(`SELECT analysis_id FROM eco_recognition_jobs WHERE status = 'processing' AND attempts >= 3 AND lease_until <= now() FOR UPDATE SKIP LOCKED`)
      for (const row of exhausted.rows) {
        await client.query(`UPDATE eco_analyses SET status = 'failed', expires_at = now() + ($1::bigint * interval '1 millisecond') WHERE id = $2`, [this.config.resultRetentionMs, row.analysis_id])
        await client.query('DELETE FROM eco_recognition_jobs WHERE analysis_id = $1', [row.analysis_id])
      }
      const claimToken = randomUUID()
      const found = await client.query<{ analysis_id: string; image: Buffer; mime_type: string; attempts: number }>(`
        WITH candidate AS (
          SELECT analysis_id FROM eco_recognition_jobs
          WHERE (status = 'queued' AND available_at <= now())
             OR (status = 'processing' AND attempts < 3 AND lease_until <= now())
          ORDER BY available_at, created_at
          FOR UPDATE SKIP LOCKED LIMIT 1
        )
        UPDATE eco_recognition_jobs j SET status = 'processing', attempts = attempts + 1,
          claim_token = $1, lease_until = now() + interval '2 minutes'
        FROM candidate WHERE j.analysis_id = candidate.analysis_id
        RETURNING j.analysis_id, j.image, j.mime_type, j.attempts`, [claimToken])
      const row = found.rows[0]
      if (!row) return
      await client.query(`UPDATE eco_analyses SET status = 'processing' WHERE id = $1`, [row.analysis_id])
      return { analysisId: row.analysis_id, image: row.image, mimeType: row.mime_type, attempts: row.attempts, claimToken }
    })
  }

  async complete(job: ClaimedRecognitionJob, suggestions: AnalysisResponse['suggestions'], mode: ClothingRecognizer['mode']): Promise<boolean> {
    const validated = analysisResponseSchema.parse({ analysisId: job.analysisId, recognitionMode: mode, suggestions, needsReview: true })
    return this.transaction(async (client) => {
      const locked = await client.query('SELECT 1 FROM eco_recognition_jobs WHERE analysis_id = $1 AND claim_token = $2 AND status = \'processing\' AND lease_until > now() FOR UPDATE', [job.analysisId, job.claimToken])
      if (!locked.rowCount) return false
      await client.query(`UPDATE eco_analyses SET status = 'awaiting_review', suggestions = $1::jsonb, recognition_mode = $2, expires_at = now() + ($3::bigint * interval '1 millisecond') WHERE id = $4`, [JSON.stringify(validated.suggestions), mode, this.config.analysisTtlMs, job.analysisId])
      await client.query('DELETE FROM eco_recognition_jobs WHERE analysis_id = $1', [job.analysisId])
      return true
    })
  }

  async fail(job: ClaimedRecognitionJob): Promise<boolean> {
    return this.transaction(async (client) => {
      const locked = await client.query<{ attempts: number }>('SELECT attempts FROM eco_recognition_jobs WHERE analysis_id = $1 AND claim_token = $2 AND status = \'processing\' AND lease_until > now() FOR UPDATE', [job.analysisId, job.claimToken])
      if (!locked.rows[0]) return false
      if (locked.rows[0].attempts >= 3) {
        await client.query(`UPDATE eco_analyses SET status = 'failed', expires_at = now() + ($1::bigint * interval '1 millisecond') WHERE id = $2`, [this.config.resultRetentionMs, job.analysisId])
        await client.query('DELETE FROM eco_recognition_jobs WHERE analysis_id = $1', [job.analysisId])
      } else {
        await client.query(`UPDATE eco_recognition_jobs SET status = 'queued', available_at = now() + ($1::integer * interval '5 seconds'), lease_until = NULL, claim_token = NULL WHERE analysis_id = $2`, [locked.rows[0].attempts, job.analysisId])
        await client.query(`UPDATE eco_analyses SET status = 'queued' WHERE id = $1`, [job.analysisId])
      }
      return true
    })
  }
}
