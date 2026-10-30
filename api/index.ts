import type { IncomingMessage, ServerResponse } from 'node:http'

type ServerlessApp = (request: IncomingMessage, response: ServerResponse) => unknown
let app: ServerlessApp | undefined

async function getApp(): Promise<ServerlessApp> {
  if (!app) {
    const { createServerlessApp } = await import('../backend/src/serverless.js')
    app = createServerlessApp()
  }
  return app
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  const serverlessApp = await getApp()
  const url = new URL(request.url ?? '/', 'https://ecoscan.invalid')
  const path = url.searchParams.get('path')
  if (path !== null) {
    url.searchParams.delete('path')
    request.url = `/api/${path}${url.search}`
  }
  return serverlessApp(request, response)
}
