import type { IncomingMessage, ServerResponse } from 'node:http'
import { createServerlessApp } from '../backend/src/serverless'

const app = createServerlessApp()

export default function handler(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? '/', 'https://ecoscan.invalid')
  const path = url.searchParams.get('path')
  if (path !== null) {
    url.searchParams.delete('path')
    request.url = `/api/${path}${url.search}`
  }
  return app(request, response)
}
