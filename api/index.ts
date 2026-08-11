import type { IncomingMessage, ServerResponse } from 'http'
import type { FastifyInstance } from 'fastify'

// Singleton — Vercel Lambda containers are reused between requests
let _app: FastifyInstance | null = null

async function getApp(): Promise<FastifyInstance> {
  if (_app) return _app
  const { buildApp } = await import('../backend/src/app')
  _app = await buildApp({ serverless: true })
  await _app.ready()
  return _app
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await getApp()
  app.server.emit('request', req, res)
}
