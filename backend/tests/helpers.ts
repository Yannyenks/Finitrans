/**
 * Outils de test : application Fastify en mémoire (inject) sur la base de TEST locale.
 * Lancer `npm run test:reset` avant `npm test` pour repartir d'un jeu de données propre.
 */
import assert from 'node:assert/strict'
import type { FastifyInstance } from 'fastify'

if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? '')) {
  throw new Error('Les tests doivent tourner sur une base locale (.env.test) — jamais sur la production')
}

export const PASSWORD = 'finitrans2025'
export const USERS = {
  delba: 'delba@finitrans.cm', soudi: 'soudi@finitrans.cm', yaya: 'yaya@finitrans.cm',
  odette: 'odette@finitrans.cm', wandala: 'wandala@finitrans.cm', rasoul: 'rasoul@finitrans.cm',
  yasmine: 'yasmine@finitrans.cm', honore: 'honore@finitrans.cm', aliou: 'aliou@finitrans.cm',
  raphael: 'raphael@finitrans.cm',
} as const
export type UserKey = keyof typeof USERS

let app: FastifyInstance | null = null

export async function getApp(): Promise<FastifyInstance> {
  if (app) return app
  const { buildApp } = await import('../src/app')
  app = await buildApp({ serverless: true })
  await app.ready()
  return app
}

export async function closeApp() {
  if (app) {
    await app.close()
    const { prisma } = await import('../src/config/prisma')
    await prisma.$disconnect()
    app = null
  }
}

const sessions = new Map<string, { token: string; refresh: string; user: any }>()

export async function login(who: UserKey | string, password = PASSWORD) {
  const email = (USERS as Record<string, string>)[who] ?? who
  const cached = sessions.get(email)
  if (cached) return cached
  const a = await getApp()
  const res = await a.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } })
  assert.equal(res.statusCode, 200, `login ${email}: ${res.body}`)
  const body = res.json()
  const s = { token: body.accessToken, refresh: body.refreshToken, user: body.user }
  sessions.set(email, s)
  return s
}

export function forgetSession(who: UserKey | string) {
  sessions.delete((USERS as Record<string, string>)[who] ?? who)
}

export interface Res<T = any> { status: number; body: T; raw: string; headers: Record<string, unknown> }

export async function api<T = any>(who: UserKey | null, method: string, url: string, payload?: unknown): Promise<Res<T>> {
  const a = await getApp()
  const headers: Record<string, string> = {}
  if (who) headers.authorization = `Bearer ${(await login(who)).token}`
  const res = await a.inject({ method: method as any, url, headers, payload: payload as any })
  let body: any = undefined
  try { body = res.body ? JSON.parse(res.body) : undefined } catch { body = res.body }
  return { status: res.statusCode, body, raw: res.body, headers: res.headers as Record<string, unknown> }
}

/** Envoi multipart (fichier + champs). */
export async function upload<T = any>(who: UserKey, url: string, file: { name: string; type: string; content: string | Buffer }, fields: Record<string, string> = {}): Promise<Res<T>> {
  const a = await getApp()
  const boundary = '----finitransTestBoundary' + Math.random().toString(16).slice(2)
  const parts: Buffer[] = []
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`))
  }
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`))
  parts.push(Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content))
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`))
  const res = await a.inject({
    method: 'POST', url,
    headers: {
      authorization: `Bearer ${(await login(who)).token}`,
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    payload: Buffer.concat(parts),
  })
  let body: any = undefined
  try { body = res.body ? JSON.parse(res.body) : undefined } catch { body = res.body }
  return { status: res.statusCode, body, raw: res.body, headers: res.headers as Record<string, unknown> }
}

export function expectStatus(res: Res, expected: number | number[], context = '') {
  const list = Array.isArray(expected) ? expected : [expected]
  assert.ok(list.includes(res.status), `${context} → attendu ${list.join('/')} reçu ${res.status} : ${res.raw?.slice(0, 400)}`)
}

/** Identifiants utilisateurs (via l'API, pour ne pas dépendre de l'ordre du seed). */
export async function userIds(): Promise<Record<UserKey, string>> {
  const res = await api('delba', 'GET', '/api/employes?limit=100')
  const out = {} as Record<UserKey, string>
  for (const [k, email] of Object.entries(USERS)) {
    const u = res.body.data.find((x: any) => x.email === email)
    assert.ok(u, `utilisateur ${email} introuvable`)
    out[k as UserKey] = u.id
  }
  return out
}

let uniq = Date.now() % 100000
export const unique = (prefix: string) => `${prefix}-${++uniq}`
