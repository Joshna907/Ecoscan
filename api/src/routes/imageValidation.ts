import type { Express } from 'express'

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function hasBytes(buffer: Buffer, bytes: number[], offset = 0): boolean {
  return bytes.every((byte, index) => buffer[offset + index] === byte)
}

function hasAscii(buffer: Buffer, value: string, offset: number): boolean {
  return buffer.toString('ascii', offset, offset + value.length) === value
}

export function hasSupportedImageSignature(file: Express.Multer.File): boolean {
  if (!IMAGE_MIME_TYPES.has(file.mimetype)) return false
  const buffer = file.buffer

  switch (file.mimetype) {
    case 'image/jpeg':
      return hasBytes(buffer, [0xff, 0xd8, 0xff])
    case 'image/png':
      return hasBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        && hasAscii(buffer, 'IHDR', 12)
    case 'image/webp':
      return hasAscii(buffer, 'RIFF', 0) && hasAscii(buffer, 'WEBP', 8)
    default:
      return false
  }
}
