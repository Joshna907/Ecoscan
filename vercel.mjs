// Vercel builds the React site. The existing API and worker need a separate
// long-running host; proxying /api keeps cookies on the site's origin.
const rawOrigin = process.env.API_ORIGIN
if (!rawOrigin) {
  throw new Error('Set API_ORIGIN to the public HTTPS origin of the EcoScan backend before deploying to Vercel.')
}

const origin = new URL(rawOrigin)
if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash) {
  throw new Error('API_ORIGIN must be an HTTPS origin without a path, query, or fragment.')
}

export const config = {
  framework: 'vite',
  buildCommand: 'npm run build:web',
  outputDirectory: 'web/dist',
  rewrites: [
    { source: '/api/:path*', destination: `${origin.origin}/api/:path*` },
  ],
}
