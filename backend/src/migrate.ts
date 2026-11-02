import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { Pool } from 'pg'

if (existsSync('.env')) process.loadEnvFile('.env')
const migrationUrl = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL
if (!migrationUrl) throw new Error('DATABASE_MIGRATION_URL or DATABASE_URL is required')
if (new URL(migrationUrl).hostname.includes('-pooler.')) throw new Error('Migrations require a direct database URL; set DATABASE_MIGRATION_URL')
const pool = new Pool({ connectionString: migrationUrl, max: 1, connectionTimeoutMillis: 10_000, statement_timeout: 60_000 })
try {
  const client = await pool.connect()
  try {
    const directory = fileURLToPath(new URL('../db/', import.meta.url))
    await client.query("SET lock_timeout = '10s'")
    await client.query('SELECT pg_advisory_lock(17028102)')
    await client.query('CREATE TABLE IF NOT EXISTS eco_schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
    for (const name of readdirSync(directory).filter((file) => /^\d+_.*\.sql$/.test(file)).sort()) {
      const applied = await client.query('SELECT 1 FROM eco_schema_migrations WHERE name = $1', [name])
      if (applied.rowCount) continue
      await client.query('BEGIN')
      try {
        await client.query(readFileSync(join(directory, name), 'utf8'))
        await client.query('INSERT INTO eco_schema_migrations(name) VALUES ($1)', [name])
        await client.query('COMMIT')
      } catch (error) { await client.query('ROLLBACK'); throw error }
      console.log(`Applied ${name}`)
    }
    console.log('EcoScan database schema is ready')
  } finally {
    await client.query('SELECT pg_advisory_unlock(17028102)')
    client.release()
  }
} finally { await pool.end() }
