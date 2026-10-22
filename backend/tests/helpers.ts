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

/** Place directement un dossier à une étape (base de test uniquement) — évite de dérouler tout le parcours. */
export async function placerEtape(dossierId: string, status: string) {
  const { prisma } = await import('../src/config/prisma')
  await prisma.dossier.update({ where: { id: dossierId }, data: { status: status as never } })
}

/** Ordre des tâches d'une étape (configuration du parcours). */
export async function ordreTaches(etape: string): Promise<string[]> {
  const { SOUS_ETAPES_CONFIG } = await import('../src/services/workflow')
  return (SOUS_ETAPES_CONFIG as Record<string, { cle: string }[]>)[etape]?.map(s => s.cle) ?? []
}

/** Trie des tâches dans l'ordre du parcours. */
export async function dansLOrdre<T extends { cle: string }>(etape: string, taches: T[]): Promise<T[]> {
  const ordre = await ordreTaches(etape)
  return [...taches].sort((a, b) => ordre.indexOf(a.cle) - ordre.indexOf(b.cle))
}

/** Amène une tâche à son tour (base de test) : dossier à l'étape, tâches précédentes de l'étape validées. */
export async function aSonTour(dossierId: string, etape: string, cle: string) {
  const { prisma } = await import('../src/config/prisma')
  const d = await prisma.dossier.findUnique({ where: { id: dossierId }, select: { status: true } })
  if (d?.status !== etape) await placerEtape(dossierId, etape)
  const ordre = await ordreTaches(etape)
  const avant = ordre.slice(0, Math.max(0, ordre.indexOf(cle)))
  if (avant.length) await prisma.sousEtapeDossier.updateMany({ where: { dossierId, etape, cle: { in: avant } }, data: { statut: 'valide' } })
}

/** Rend l'étape franchissable (base de test) : tâches validées + une preuve déposée par la Direction. */
export async function preparerPassage(dossierId: string, etape: string) {
  const { prisma } = await import('../src/config/prisma')
  await prisma.sousEtapeDossier.updateMany({ where: { dossierId, etape }, data: { statut: 'valide' } })
  const r = await upload('delba', `/api/dossiers/${dossierId}/upload`,
    { name: `preuve-${etape}-${Date.now()}.pdf`, type: 'application/pdf', content: `%PDF preuve ${etape} ${Math.random()}` }, { etape })
  expectStatus(r, 201, `preuve ${etape}`)
}
