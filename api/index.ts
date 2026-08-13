import type { IncomingMessage, ServerResponse } from 'http'
import { buildApp } from '../backend/src/app'

// Singleton — Lambda containers are reused between invocations
let _app: Awaited<ReturnType<typeof buildApp>> | null = null

async function getApp() {
  if (_app) return _app
  _app = await buildApp({ serverless: true })
  await _app.ready()
  return _app
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await getApp()
  app.server.emit('request', req, res)
}
