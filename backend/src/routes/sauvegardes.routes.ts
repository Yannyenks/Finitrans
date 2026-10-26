import { timingSafeEqual } from 'crypto'
import { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma } from '../config/prisma'
import { authenticate } from '../middleware/authenticate'
import { requireSupervisor } from '../middleware/authorize'
import { logActivity } from '../utils/audit'
import { NotFoundError } from '../utils/errors'
import { envoyerContenu } from '../services/televersement'
import { A_CONSERVER, creerSauvegarde } from '../services/sauvegarde'

/** Appel du cron Vercel : jeton CRON_SECRET s'il est défini, sinon en-tête du planificateur Vercel. */
function appelCron(request: FastifyRequest) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.authorization ?? ''
  if (secret) {
    const a = Buffer.from(auth), b = Buffer.from(`Bearer ${secret}`)
    return a.length === b.length && timingSafeEqual(a, b)
  }
  return String(request.headers['user-agent'] ?? '').startsWith('vercel-cron/')
}

const sauvegardesRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /api/sauvegardes — historique (Direction)
  fastify.get('/', { preHandler: [authenticate, requireSupervisor] }, async (_request, reply) => {
    const liste = await prisma.sauvegarde.findMany({
      orderBy: { createdAt: 'desc' }, take: 30,
      select: { id: true, declencheur: true, statut: true, auteur: true, tailleOctets: true, lignes: true, message: true, dureeMs: true, createdAt: true },
    })
    const derniere = liste.find(s => s.statut === 'ok')
    return reply.send({ sauvegardes: liste, conservees: A_CONSERVER, derniereReussie: derniere?.createdAt ?? null })
  })

  // POST /api/sauvegardes — sauvegarde immédiate
  fastify.post('/', { preHandler: [authenticate, requireSupervisor] }, async (request, reply) => {
    const s = await creerSauvegarde('manuelle', request.user.nom)
    await logActivity(request.user.id, 'SAUVEGARDE', 'sauvegarde', s.id, 'Sauvegarde manuelle de la base')
    return reply.code(201).send(s)
  })

  // GET /api/sauvegardes/:id/fichier — téléchargement (JSON compressé)
  fastify.get('/:id/fichier', { preHandler: [authenticate, requireSupervisor] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const s = await prisma.sauvegarde.findUnique({ where: { id }, select: { contenu: true, createdAt: true } })
    if (!s?.contenu) throw new NotFoundError('Sauvegarde', id)
    const nom = `sauvegarde-finitrans-${s.createdAt.toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json.gz`
    return envoyerContenu(request, reply, s.contenu, { 'Content-Type': 'application/gzip', 'Content-Disposition': `attachment; filename="${nom}"` })
  })

  // GET /api/sauvegardes/cron — sauvegarde hebdomadaire (planificateur Vercel)
  fastify.get('/cron', async (request, reply) => {
    if (!appelCron(request)) return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Réservé au planificateur' })
    // Pas plus d'une sauvegarde automatique par tranche de 6 h (appels répétés)
    const recente = await prisma.sauvegarde.findFirst({ where: { declencheur: 'hebdomadaire', statut: 'ok', createdAt: { gt: new Date(Date.now() - 6 * 3_600_000) } } })
    if (recente) return reply.send({ ignore: true, derniere: recente.createdAt })
    const s = await creerSauvegarde('hebdomadaire', 'Planificateur')
    return reply.send({ id: s.id, tailleOctets: s.tailleOctets })
  })
}

export default sauvegardesRoutes
