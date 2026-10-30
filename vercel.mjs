const rawOrigin = process.env.API_ORIGIN

let apiOrigin
if (rawOrigin) {
  const origin = new URL(rawOrigin)
  if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('API_ORIGIN must be an HTTPS origin without a path, query, or fragment.')
  }
  apiOrigin = origin.origin
}

export const config = {
  framework: 'vite',
  buildCommand: 'npm run build:web',
  outputDirectory: 'web/dist',
  ...(apiOrigin
    ? { rewrites: [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }] }
    : {}),
}