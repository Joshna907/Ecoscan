import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { Pool } from 'pg'

if (existsSync('.env')) process.loadEnvFile('.env')
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
try {
  const client = await pool.connect()
  try {
    const directory = fileURLToPath(new URL('../db/', import.meta.url))
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
