import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { SignJWT, jwtVerify } from 'jose'
import type { Pool, PoolClient } from 'pg'
import { HttpError } from '../httpError.js'

const scrypt = promisify(scryptCallback)
const LOGIN_TTL_DAYS = 30
const JWT_ISSUER = 'ecoscan'
const JWT_AUDIENCE = 'ecoscan-web'
const INVALID_LOGIN = 'Email or password is incorrect.'
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254
export type Account = { id: string; email: string; sessionId: string }

export class AuthService {
  private readonly jwtKey: Uint8Array
  constructor(private readonly pool: Pool, secret: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(secret) || Buffer.from(secret, 'base64url').length !== 32) {
      throw new Error('AUTH_JWT_SECRET must be a base64url-encoded 32-byte random value')
    }
    this.jwtKey = Buffer.from(secret, 'base64url')
  }

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await work(client)
      await client.query('COMMIT')
      return result
    } catch (error) { await client.query('ROLLBACK'); throw error }
    finally { client.release() }
  }

  async register(emailInput: string, password: string, anonymousSessionId?: string): Promise<{ account: Account; token: string }> {
    const email = emailInput.trim().toLowerCase()
    if (!validEmail(email)) throw new HttpError(400, 'INVALID_EMAIL', 'Enter a valid email address.')
    if (password.length < 12 || password.length > 128) throw new HttpError(400, 'INVALID_PASSWORD', 'Use a password between 12 and 128 characters.')
    const salt = randomBytes(16).toString('hex')
    const hash = (await scrypt(password, salt, 64) as Buffer).toString('hex')
    try {
      const account = await this.transaction(async (client) => {
        let sessionId: string = randomUUID()
        if (anonymousSessionId && /^[0-9a-f-]{36}$/i.test(anonymousSessionId)) {
          const existing = await client.query<{ id: string }>(`SELECT s.id FROM eco_sessions s WHERE s.id = $1
            AND NOT EXISTS (SELECT 1 FROM eco_users u WHERE u.session_id = s.id) FOR UPDATE`, [anonymousSessionId])
          if (existing.rows[0]) sessionId = existing.rows[0].id
        }
        if (sessionId !== anonymousSessionId) await client.query('INSERT INTO eco_sessions(id) VALUES ($1)', [sessionId])
        const id = randomUUID()
        await client.query('INSERT INTO eco_users(id, email, password_hash, session_id) VALUES ($1, $2, $3, $4)', [id, email, `${salt}:${hash}`, sessionId])
        return { id, email, sessionId }
      })
      return { account, token: await this.issueToken(account.id) }
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
        throw new HttpError(409, 'EMAIL_IN_USE', 'An account with this email already exists.')
      }
      throw error
    }
  }

  async login(emailInput: string, password: string): Promise<{ account: Account; token: string }> {
    const email = emailInput.trim().toLowerCase()
    if (!validEmail(email) || typeof password !== 'string') throw new HttpError(401, 'INVALID_CREDENTIALS', INVALID_LOGIN)
    const key = digest(email)
    // A shared database limit works across API replicas. Successful login clears the counter.
    const attempt = await this.pool.query<{ attempts: number }>(`INSERT INTO eco_auth_attempts(email_hash, attempts, window_started_at)
      VALUES ($1, 1, now()) ON CONFLICT (email_hash) DO UPDATE SET
      attempts = CASE WHEN eco_auth_attempts.window_started_at < now() - interval '15 minutes' THEN 1 ELSE eco_auth_attempts.attempts + 1 END,
      window_started_at = CASE WHEN eco_auth_attempts.window_started_at < now() - interval '15 minutes' THEN now() ELSE eco_auth_attempts.window_started_at END
      RETURNING attempts`, [key])
    if (attempt.rows[0].attempts > 5) throw new HttpError(429, 'LOGIN_LIMIT', 'Too many attempts. Try again in 15 minutes.')
    const found = await this.pool.query<{ id: string; email: string; password_hash: string; session_id: string }>(
      'SELECT id, email, password_hash, session_id FROM eco_users WHERE email = $1', [email])
    const row = found.rows[0]
    const [salt, expectedHex] = (row?.password_hash ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':')
    const actual = await scrypt(password, salt, 64) as Buffer
    const expected = Buffer.from(expectedHex, 'hex')
    if (!row || expected.length !== actual.length || !timingSafeEqual(actual, expected)) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', INVALID_LOGIN)
    }
    await this.pool.query('DELETE FROM eco_auth_attempts WHERE email_hash = $1', [key])
    return { account: { id: row.id, email: row.email, sessionId: row.session_id }, token: await this.issueToken(row.id) }
  }

  private async issueToken(userId: string): Promise<string> {
    const now = Math.floor(Date.now() / 1000)
    const expiresAt = now + LOGIN_TTL_DAYS * 24 * 60 * 60
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(JWT_ISSUER).setAudience(JWT_AUDIENCE).setSubject(userId)
      .setJti(randomUUID()).setIssuedAt(now).setExpirationTime(expiresAt)
      .sign(this.jwtKey)
    await this.pool.query(`INSERT INTO eco_auth_sessions(token_hash, user_id, expires_at)
      VALUES ($1, $2, to_timestamp($3))`, [digest(token), userId, expiresAt])
    return token
  }

  async accountForToken(token: string | undefined): Promise<Account | null> {
    if (!token || token.length > 2048) return null
    let subject: string | undefined
    try {
      const { payload } = await jwtVerify(token, this.jwtKey, {
        issuer: JWT_ISSUER, audience: JWT_AUDIENCE, algorithms: ['HS256'],
      })
      if (typeof payload.jti !== 'string') return null
      subject = payload.sub
    } catch { return null }
    if (!subject) return null
    const found = await this.pool.query<{ id: string; email: string; session_id: string }>(`SELECT u.id, u.email, u.session_id
      FROM eco_auth_sessions a JOIN eco_users u ON u.id = a.user_id
      WHERE a.token_hash = $1 AND a.user_id = $2 AND a.expires_at > now()`, [digest(token), subject])
    const row = found.rows[0]
    return row ? { id: row.id, email: row.email, sessionId: row.session_id } : null
  }

  async logout(token: string | undefined): Promise<void> {
    if (token) await this.pool.query('DELETE FROM eco_auth_sessions WHERE token_hash = $1', [digest(token)])
  }

  async cleanup(): Promise<void> {
    await this.pool.query('DELETE FROM eco_auth_sessions WHERE expires_at <= now()')
    await this.pool.query("DELETE FROM eco_auth_attempts WHERE window_started_at < now() - interval '1 day'")
  }
}
