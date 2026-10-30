import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { Pool } from 'pg'
import { randomBytes, randomUUID } from 'node:crypto'
import { jwtVerify } from 'jose'
import { createApp } from '../src/app'
import { AuthService } from '../src/services/authService'
import { PostgresSessionStore } from '../src/store/postgresSessions'
import { reliabilityConfigSchema } from '../src/config'
import { mockRecognizer } from '../src/services/vision/mockRecognizer'

const databaseUrl = process.env.TEST_DATABASE_URL
describe.skipIf(!databaseUrl)('account authentication with PostgreSQL', () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4 })
  const jwtSecret = randomBytes(32).toString('base64url')
  const auth = new AuthService(pool, jwtSecret)
  const app = createApp(mockRecognizer, { auth, store: new PostgresSessionStore(pool, reliabilityConfigSchema.parse({})) })
  const email = `test-${randomUUID()}@example.com`
  const password = 'a-long-test-password-123'
  const accounts: string[] = []

  beforeAll(async () => { await pool.query('SELECT 1 FROM eco_users LIMIT 0') })
  afterAll(async () => {
    for (const id of accounts) {
      const row = await pool.query<{ session_id: string }>('DELETE FROM eco_users WHERE id = $1 RETURNING session_id', [id])
      if (row.rows[0]) await pool.query('DELETE FROM eco_sessions WHERE id = $1', [row.rows[0].session_id])
    }
    await pool.end()
  })

  it('keeps existing points on signup, restores them on login, and revokes logout', async () => {
    const browser = request.agent(app)
    const first = await browser.get('/api/offers').expect(200)
    const demoCookie = first.headers['set-cookie'][0].split(';')[0]
    const demoId = demoCookie.split('=')[1]
    await pool.query('UPDATE eco_sessions SET demo_points_balance = 45 WHERE id = $1', [demoId])
    const signup = await browser.post('/api/auth/signup').send({ email, password }).expect(201)
    accounts.push(signup.body.user.id)
    const signupToken = (signup.headers['set-cookie'] as unknown as string[]).find((cookie) => cookie.startsWith('ecoscan_auth='))?.split(';')[0].split('=')[1]
    expect(signupToken?.split('.')).toHaveLength(3)
    const signupClaims = await jwtVerify(signupToken!, Buffer.from(jwtSecret, 'base64url'), { issuer: 'ecoscan', audience: 'ecoscan-web', algorithms: ['HS256'] })
    expect(signupClaims.payload.sub).toBe(signup.body.user.id)
    expect(signup.body.user.email).toBe(email)
    expect((await browser.get('/api/offers').expect(200)).body.demoPointsBalance).toBe(45)
    expect((await browser.get('/api/auth/me').expect(200)).body.user.id).toBe(signup.body.user.id)
    await request(app).get('/api/offers').set('Cookie', demoCookie).expect(200).then((res) => {
      expect(res.body.demoPointsBalance).toBe(0)
    })
    const parts = signupToken!.split('.')
    const tampered = `${parts[0]}.${parts[1]}.${parts[2].startsWith('A') ? 'B' : 'A'}${parts[2].slice(1)}`
    expect((await request(app).get('/api/auth/me').set('Cookie', `ecoscan_auth=${tampered}`).expect(200)).body.user).toBeNull()
    await browser.post('/api/auth/logout').expect(204)
    expect((await request(app).get('/api/auth/me').set('Cookie', `ecoscan_auth=${signupToken}`).expect(200)).body.user).toBeNull()
    expect((await browser.get('/api/auth/me').expect(200)).body.user).toBeNull()
    expect((await browser.get('/api/offers').expect(200)).body.demoPointsBalance).toBe(0)
    await browser.post('/api/auth/login').send({ email, password: 'wrong-password' }).expect(401)
    const login = await browser.post('/api/auth/login').send({ email, password }).expect(200)
    const loginToken = (login.headers['set-cookie'] as unknown as string[]).find((cookie) => cookie.startsWith('ecoscan_auth='))?.split(';')[0].split('=')[1]
    expect(loginToken?.split('.')).toHaveLength(3)
    expect((await jwtVerify(loginToken!, Buffer.from(jwtSecret, 'base64url'), { issuer: 'ecoscan', audience: 'ecoscan-web', algorithms: ['HS256'] })).payload.sub).toBe(signup.body.user.id)
    expect((await browser.get('/api/offers').expect(200)).body.demoPointsBalance).toBe(45)
  })

  it('validates signups and rejects a duplicate email', async () => {
    await request(app).post('/api/auth/signup').send({ email, password: 'short' }).expect(400)
    await request(app).post('/api/auth/signup').send({ email, password }).expect(409)
  })
})
