import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { createTestApp } from './helpers'

const temporaryDirs: string[] = []
afterEach(async () => {
  await Promise.all(temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('same-origin web hosting', () => {
  it('serves the built UI while preserving API routes and API 404s', async () => {
    const staticDir = await mkdtemp(join(tmpdir(), 'ecoscan-web-'))
    temporaryDirs.push(staticDir)
    await writeFile(join(staticDir, 'index.html'), '<!doctype html><title>EcoScan</title>')
    const app = createTestApp(undefined, { staticDir })

    const home = await request(app).get('/').expect(200)
    expect(home.text).toContain('<title>EcoScan</title>')
    await request(app).get('/api/health').expect(200)
    const missing = await request(app).get('/api/not-a-route').expect(404)
    expect(missing.body.error.code).toBe('NOT_FOUND')
  })
})
