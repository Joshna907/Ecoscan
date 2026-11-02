import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { randomUUID } from 'node:crypto'
import { rewardImageFingerprint, sameRewardImage } from '../src/services/rewardImage'
import { DemoSessionStore } from '../src/store/demoSessions'
import { ScanService } from '../src/services/scanService'

async function picture() {
  const pixels = Buffer.alloc(64 * 64 * 3)
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const i = (y * 64 + x) * 3
    pixels[i] = x * 3; pixels[i + 1] = y * 3; pixels[i + 2] = (x + y) * 2
  }
  return sharp(pixels, { raw: { width: 64, height: 64, channels: 3 } }).png().toBuffer()
}
async function claim(store: DemoSessionStore, session: string, hash: string) {
  const id = randomUUID()
  await store.addAnalysis(session, id, { imageHash: hash, recognitionMode: 'vision', suggestions: [{ id: '1', category: 'jeans' }, { id: '2', category: 'jeans' }] })
  return new ScanService(store).confirm(session, { analysisId: id, items: [{ category: 'jeans', quantity: 2 }], replacesPlannedNewPurchase: true })
}

describe('reward abuse controls', () => {
  it('matches trailing bytes, metadata, recompression and resizing, but separates different colours', async () => {
    const original = await picture()
    const hash = await rewardImageFingerprint(original)
    const variants = [Buffer.concat([original, Buffer.from('changed-file')]), await sharp(original).withMetadata({ density: 144 }).png().toBuffer(), await sharp(original).resize(128, 128).jpeg({ quality: 85 }).toBuffer()]
    for (const variant of variants) expect(sameRewardImage(hash, await rewardImageFingerprint(variant))).toBe(true)
    const other = await sharp({ create: { width: 64, height: 64, channels: 3, background: 'blue' } }).png().toBuffer()
    expect(sameRewardImage(hash, await rewardImageFingerprint(other))).toBe(false)
  })
  it('blocks changed bytes across fresh sessions and simultaneous confirmations', async () => {
    const store = new DemoSessionStore()
    const original = await picture()
    const hashes = await Promise.all([rewardImageFingerprint(original), rewardImageFingerprint(Buffer.concat([original, Buffer.from('metadata-change')]))])
    const sessions = await Promise.all([store.getOrCreate(undefined), store.getOrCreate(undefined)])
    const results = await Promise.all(sessions.map((session, i) => claim(store, session, hashes[i])))
    expect(results.map(result => result.demoPointsAwarded).sort()).toEqual([0, 100])
    expect(results.find(result => result.demoPointsAwarded === 0)?.rewardStatus).toBe('duplicate_image')
  })
  it('matches rotation and crops that remove only a uniform background', async () => {
    const foreground = await picture()
    const bordered = await sharp(foreground).extend({ top: 30, bottom: 30, left: 30, right: 30, background: '#ffffff' }).png().toBuffer()
    const original = await rewardImageFingerprint(bordered)
    expect(sameRewardImage(original, await rewardImageFingerprint(foreground))).toBe(true)
    expect(sameRewardImage(original, await rewardImageFingerprint(await sharp(bordered).rotate(90).png().toBuffer()))).toBe(true)
  })
  it('caps daily earnings, ignores spending, and resets at midnight UTC', async () => {
    let now = Date.parse('2026-11-02T23:59:00Z')
    const store = new DemoSessionStore(undefined, () => now)
    const session = await store.getOrCreate(undefined)
    expect((await claim(store, session, 'distinct-1')).demoPointsAwarded).toBe(100)
    await store.redeemOnce(session, 'repair-kit', 25)
    expect((await claim(store, session, 'distinct-2')).demoPointsAwarded).toBe(100)
    const limited = await claim(store, session, 'distinct-3')
    expect(limited).toMatchObject({ demoPointsAwarded: 0, rewardStatus: 'reward_limit', demoPointsBalance: 175 })
    now += 60_000
    expect((await claim(store, session, 'distinct-4')).demoPointsAwarded).toBe(100)
    expect((await claim(store, session, 'distinct-1')).rewardStatus).toBe('duplicate_image')
  })
  it('rejects undecodable files before recognition can award points', async () => {
    await expect(rewardImageFingerprint(Buffer.from([255, 216, 255]))).rejects.toMatchObject({ code: 'INVALID_IMAGE' })
  })
  it('retains a claim when an anonymous session expires', async () => {
    let now = 0
    const store = new DemoSessionStore(undefined, () => now)
    const first = await store.getOrCreate(undefined)
    await claim(store, first, 'retained-image')
    now = 31 * 60_000
    const fresh = await store.getOrCreate(undefined)
    expect((await claim(store, fresh, 'retained-image')).rewardStatus).toBe('duplicate_image')
  })

})
