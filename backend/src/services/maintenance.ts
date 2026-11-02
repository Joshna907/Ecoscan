import type { Pool } from 'pg'

export class Maintenance {
  constructor(private readonly pool: Pool, private readonly work: () => Promise<void>) {}

  async ready(): Promise<void> {
    const result = await this.pool.query<{ healthy: boolean }>(`SELECT
      last_success_at > now() - interval '26 hours'
      AND (last_failure_at IS NULL OR last_failure_at < last_success_at) AS healthy
      FROM eco_maintenance WHERE name = 'retention'`)
    if (!result.rows[0]?.healthy) throw new Error('Retention maintenance is overdue or failed')
  }

  async run(): Promise<{ status: 'completed' | 'already_running' }> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const lock = await client.query<{ acquired: boolean }>('SELECT pg_try_advisory_xact_lock(17028108) AS acquired')
      if (!lock.rows[0].acquired) { await client.query('ROLLBACK'); return { status: 'already_running' } }
      await this.work()
      await client.query("UPDATE eco_maintenance SET last_success_at = now(), last_failure_at = NULL WHERE name = 'retention'")
      await client.query('COMMIT')
      console.log(JSON.stringify({ event: 'retention_cleanup', outcome: 'success' }))
      return { status: 'completed' }
    } catch (error) {
      await client.query('ROLLBACK')
      await client.query("UPDATE eco_maintenance SET last_failure_at = now() WHERE name = 'retention'").catch(() => {})
      console.error(JSON.stringify({ event: 'retention_cleanup', outcome: 'failure' }))
      throw error
    } finally { client.release() }
  }
}
