import type { Pool } from 'pg'

export const REQUIRED_MIGRATIONS = [
  '001_initial.sql', '002_recognition_jobs.sql', '003_shared_limits.sql',
  '004_accounts.sql', '005_demo_receipts.sql', '006_latest_result.sql',
  '007_reward_integrity.sql', '008_reward_abuse.sql', '009_maintenance.sql', '010_anonymous_offers.sql',
  '011_activity_evidence.sql',
  '012_recovery_and_review.sql',
] as const

export async function assertSchemaReady(pool: Pool): Promise<void> {
  const applied = await pool.query<{ name: string }>('SELECT name FROM eco_schema_migrations')
  const names = new Set(applied.rows.map(row => row.name))
  if (REQUIRED_MIGRATIONS.some(name => !names.has(name))) throw new Error('Database migrations are pending; run db:migrate before release')
  // Check actual columns as well as migration history; no user data is read.
  await pool.query(`SELECT s.latest_result, a.image_hash, j.image,
    r.demo_reference, r.status, r.expires_at, i.remaining, c.image_hash, v.points, m.last_success_at,
    b.tokens, l.expires_at, vs.expires_at, vu.calls, ul.expires_at
    FROM eco_offer_inventory i, eco_sessions s, eco_analyses a, eco_recognition_jobs j,
    eco_redemptions r, eco_reward_claims c, eco_visual_reward_claims v,
    eco_maintenance m, eco_scan_rate_buckets b,
    eco_upload_slots l, eco_vision_slots vs, eco_vision_daily_usage vu,
    eco_upload_leases ul LIMIT 0`)
  await pool.query('SELECT r.code_hash, r.partner_id, r.activity, r.expires_at, e.event_hash, e.participant_hash, e.credits, e.reversal_reason FROM eco_activity_requests r, eco_activity_events e LIMIT 0')
  await pool.query('SELECT a.recovery_hash,e.rule,r.version,h.subject,u.operator_id FROM eco_receipt_archive a,eco_reward_security_events e,eco_reward_reviews r,eco_reward_holds h,eco_reward_review_audit u LIMIT 0')
}
