import sharp from 'sharp'
import { HttpError } from '../httpError.js'

export async function normalizeImage(image: Buffer): Promise<Buffer> {
  try {
    // Decode every accepted upload, bound decompression, orient and strip metadata.
    const { data, info } = await sharp(image, { limitInputPixels: 25_000_000, failOn: 'error' })
      .rotate().flatten({ background: '#ffffff' }).toColourspace('srgb')
      .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
      .raw().toBuffer({ resolveWithObject: true })
    return await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).png().toBuffer()
  } catch { throw new HttpError(415, 'INVALID_IMAGE', 'Choose a decodable JPEG, PNG or WebP image of at most 25 megapixels.') }
}
