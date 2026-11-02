import sharp from 'sharp'
import { createHash } from 'node:crypto'
import { HttpError } from '../httpError.js'

// Fingerprint decoded pixels, never file metadata. Limits bound decoding work.
async function fingerprint(image: Buffer): Promise<string> {
  try {
    const normalized = sharp(image, { limitInputPixels: 25_000_000, failOn: 'error' }).rotate().flatten({ background: '#ffffff' }).toColourspace('srgb')
    const pixels = await normalized.clone().resize(64, 64, { fit: 'fill' }).removeAlpha().raw().toBuffer()
    const small = await normalized.clone().resize(9, 8, { fit: 'fill' }).greyscale().raw().toBuffer()
    let bits = 0n
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits = (bits << 1n) | BigInt(small[y * 9 + x] > small[y * 9 + x + 1] ? 1 : 0)
    const colours = [0, 1, 2].map(channel => {
      let sum = 0
      for (let i = channel; i < pixels.length; i += 3) sum += pixels[i]
      return Math.round(sum / (pixels.length / 3))
    })
    return `visual-v1:${createHash('sha256').update(pixels).digest('hex')}:${bits.toString(16).padStart(16, '0')}:${colours.join(',')}`
  } catch { throw new HttpError(415, 'INVALID_IMAGE', 'Choose a decodable image of at most 25 megapixels.') }
}

function sameFingerprint(a: string, b: string): boolean {
  if (a === b) return true
  const pattern = /^visual-v1:([0-9a-f]{64}):([0-9a-f]{16}):(\d+),(\d+),(\d+)$/
  const left = pattern.exec(a), right = pattern.exec(b)
  if (!left || !right) return false
  if (left[1] === right[1]) return true
  if ([3, 4, 5].some(i => Math.abs(Number(left[i]) - Number(right[i])) > 12)) return false
  let difference = BigInt(`0x${left[2]}`) ^ BigInt(`0x${right[2]}`)
  let distance = 0
  while (difference) { difference &= difference - 1n; distance++ }
  return distance <= 4
}

// Multiple orientations plus background trimming cover the common rotate/crop bypass.
export async function rewardImageFingerprint(image: Buffer): Promise<string> {
  const variants: string[] = [await fingerprint(image)]
  const base = await sharp(image, { limitInputPixels: 25_000_000, failOn: 'error' }).rotate().flatten({ background: '#ffffff' }).trim().png().toBuffer().catch(() => image)
  for (const angle of [0, 90, 180, 270]) {
    const rotated = await sharp(base).rotate(angle).png().toBuffer()
    variants.push(await fingerprint(rotated))
  }
  return [...new Set(variants)].join('~')
}
export function sameRewardImage(a: string, b: string): boolean {
  return a.split('~').some(left => b.split('~').some(right => sameFingerprint(left, right)))
}

export const REWARD_CLAIM_RETENTION_MS = 90 * 24 * 60 * 60_000
export const MAX_DAILY_REWARD_POINTS = 250
export const MAX_MEMORY_REWARD_CLAIMS = 50_000
