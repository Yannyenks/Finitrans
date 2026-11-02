/**
 * Administration de la plateforme SaaS : organisations clientes, abonnements, demandes de démo.
 * Réservé aux administrateurs de la plateforme ; les lectures transverses passent explicitement
 * par `sansIsolation` (aucune autre route ne voit plusieurs organisations).
 */
import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../config/prisma'
import { sansIsolation } from '../config/contexte'
import { env } from '../config/env'
import { PLANS } from '../config/plans'
import { authenticate } from '../middleware/authenticate'
import { requirePlateforme } from '../middleware/authorize'
import { logActivity } from '../utils/audit'
import { NotFoundError } from '../utils/errors'
import { creerEspace, invaliderOrganisation, maxUtilisateurs, resumeOrganisation } from '../services/organisations'

const pre = [authenticate, requirePlateforme]

const creationSchema = z.object({
  entreprise: z.string().trim().min(2).max(160),
  nom:        z.string().trim().min(2).max(120),
  email:      z.string().trim().toLowerCase().email().max(255),
  password:   z.string().min(10).max(200),
  pays:       z.string().trim().regex(/^[A-Za-z]{2}$/).transform(p => p.toUpperCase()).default('CM'),
  langue:     z.enum(['fr', 'en']).default('fr'),
  telephone:  z.string().trim().max(40).optional(),
  plan:       z.enum(['starter', 'business', 'enterprise']).default('business'),
  statut:     z.enum(['essai', 'actif']).default('essai'),
})

const modificationSchema = z.object({
  actif:           z.boolean().optional(),
  plan:            z.enum(['starter', 'business', 'enterprise']).optional(),
  statut:          z.enum(['essai', 'actif', 'impaye', 'suspendu', 'annule']).optional(),
  finEssai:        z.coerce.date().nullable().optional(),
  finPeriode:      z.coerce.date().nullable().optional(),
  maxUtilisateurs: z.number().int().min(1).max(100_000).nullable().optional(),
})

export const plateformeRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /api/plateforme/organisations — vue d'ensemble des espaces clients
  fastify.get('/organisations', { preHandler: pre }, async (_request, reply) => {
    const organisations = await sansIsolation(async () => {
      const [orgs, utilisateurs, dossiers] = await Promise.all([
        prisma.organisation.findMany({ include: { abonnement: true }, orderBy: { createdAt: 'desc' } }),
        prisma.user.groupBy({ by: ['organisationId'], where: { actif: true }, _count: { _all: true } }),
        prisma.dossier.groupBy({ by: ['organisationId'], _count: { _all: true } }),
      ])
      const nb = (rows: { organisationId: string | null; _count: { _all: number } }[], id: string) =>
        rows.find(r => r.organisationId === id)?._count._all ?? 0
      return orgs.map(o => ({
        ...resumeOrganisation(o), actif: o.actif, createdAt: o.createdAt,
        utilisateursActifs: nb(utilisateurs, o.id), dossiers: nb(dossiers, o.id),
      }))
    })
    return reply.send({ organisations, plans: Object.values(PLANS) })
  })

  // POST /api/plateforme/organisations — ouverture d'un espace par la plateforme (vente accompagnée)
  fastify.post('/organisations', { preHandler: pre }, async (request, reply) => {
    const body = creationSchema.parse(request.body)
    const existant = await sansIsolation(() => prisma.user.findUnique({ where: { email: body.email }, select: { id: true } }))
    if (existant) return reply.code(409).send({ error: 'EMAIL_UTILISE', message: 'Un compte existe déjà avec cet email' })
    const { organisation } = await sansIsolation(() => creerEspace(body))
    await logActivity(request.user.id, 'ORGANISATION_CREEE', 'organisation', organisation.id, organisation.nom)
    return reply.code(201).send({ id: organisation.id, slug: organisation.slug, nom: organisation.nom })
  })

  // PATCH /api/plateforme/organisations/:id — suspension, offre, statut d'abonnement
  fastify.patch('/organisations/:id', { preHandler: pre }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body = modificationSchema.parse(request.body)
    const bloquant = body.actif === false || (body.statut !== undefined && !['essai', 'actif'].includes(body.statut))
    if (id === request.user.organisationId && bloquant) {
      return reply.code(422).send({ error: 'AUTO_SUSPENSION', message: 'Vous ne pouvez pas suspendre l\'organisation de la plateforme' })
    }
    const org = await prisma.organisation.findUnique({ where: { id }, include: { abonnement: true } })
    if (!org) throw new NotFoundError('Organisation', id)

    const { actif, ...abonnement } = body
    await prisma.$transaction(async tx => {
      if (actif !== undefined) await tx.organisation.update({ where: { id }, data: { actif } })
      if (Object.keys(abonnement).length) {
        await tx.abonnement.upsert({
          where: { organisationId: id },
          update: abonnement,
          create: { ...abonnement, organisationId: id, plan: abonnement.plan ?? 'business', statut: abonnement.statut ?? 'actif' },
        })
      }
    })
    invaliderOrganisation(id)
    await logActivity(request.user.id, 'ORGANISATION_MODIFIEE', 'organisation', id, org.nom, body)
    const maj = (await prisma.organisation.findUnique({ where: { id }, include: { abonnement: true } }))!
    return reply.send({ ...resumeOrganisation(maj), actif: maj.actif, maxUtilisateurs: maxUtilisateurs(maj) })
  })

  // GET /api/plateforme/demandes-demo
  fastify.get('/demandes-demo', { preHandler: pre }, async (_request, reply) => {
    const demandes = await prisma.demandeDemo.findMany({ orderBy: { createdAt: 'desc' }, take: 200 })
    return reply.send({ demandes })
  })

  // PATCH /api/plateforme/demandes-demo/:id — marquer comme traitée
  fastify.patch('/demandes-demo/:id', { preHandler: pre }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const { traitee } = z.object({ traitee: z.boolean() }).parse(request.body)
    const d = await prisma.demandeDemo.update({ where: { id }, data: { traitee } })
    return reply.send(d)
  })
}

const demandeSchema = z.object({
  nom:        z.string().trim().min(2, 'Indiquez votre nom').max(120),
  entreprise: z.string().trim().min(2, 'Indiquez votre entreprise').max(160),
  email:      z.string().trim().toLowerCase().email('Adresse email invalide').max(255),
  telephone:  z.string().trim().max(40).optional(),
  pays:       z.string().trim().max(80).optional(),
  taille:     z.enum(['1-10', '11-50', '51-200', '200+']).optional(),
  message:    z.string().trim().max(2000).optional(),
  langue:     z.enum(['fr', 'en']).default('fr'),
  /** Champ piège invisible : seuls les robots le remplissent */
  site:       z.string().max(0).optional(),
})

/** Routes publiques du site vitrine (sans compte). */
export const sitePublicRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // POST /api/public/demandes-demo — la confirmation n'est renvoyée qu'après l'écriture en base
  fastify.post('/demandes-demo', {
    config: { rateLimit: { max: env.NODE_ENV === 'test' ? 1000 : 5, timeWindow: '10 minutes' } },
  }, async (request, reply) => {
    const { site: _piege, ...body } = demandeSchema.parse(request.body)
    const d = await prisma.demandeDemo.create({ data: body, select: { id: true, createdAt: true } })
    return reply.code(201).send(d)
  })

  // GET /api/public/offres — offres publiées (sans prix tant que la grille n'est pas validée)
  fastify.get('/offres', async (_request, reply) => {
    reply.header('Cache-Control', 'public, max-age=300')
    return reply.send(Object.values(PLANS).map(p => ({ cle: p.cle, libelle: p.libelle, description: p.description, maxUtilisateurs: p.maxUtilisateurs })))
  })
}
