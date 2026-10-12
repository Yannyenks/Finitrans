import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../config/prisma'
import { authenticate } from '../middleware/authenticate'
import { authorize } from '../middleware/authorize'
import { logActivity } from '../utils/audit'
import { invalidateRoleCache } from '../config/roles'
import { invalidateAttributionCache } from '../services/workflow'

/** Clés gérées par des écrans dédiés (rôles, attribution, entreprise) : DG uniquement. */
const CLES_DG = ['roles_config', 'attribution_etapes', 'entreprise']

const jsonValue = z.custom<Prisma.InputJsonValue>(v => v !== undefined, { message: 'Valeur requise' })

const parametresRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {

  // GET /api/parametres
  fastify.get('/', { preHandler: [authenticate] }, async (_request, reply) => {
    const params = await prisma.parametre.findMany({ orderBy: { cle: 'asc' } })
    // Retourner comme map clé→valeur pour facilité frontend
    const map = params.reduce<Record<string, unknown>>((acc, p) => {
      acc[p.cle] = p.valeur
      return acc
    }, {})
    return reply.send(map)
  })

  // GET /api/parametres/:cle
  fastify.get('/:cle', { preHandler: [authenticate] }, async (request, reply) => {
    const { cle } = z.object({ cle: z.string() }).parse(request.params)
    const param = await prisma.parametre.findUnique({ where: { cle } })
    if (!param) return reply.code(404).send({ error: 'NOT_FOUND', message: `Paramètre ${cle} introuvable` })
    return reply.send(param)
  })

  async function upsert(cle: string, valeur: Prisma.InputJsonValue, userId: string) {
    const param = await prisma.parametre.upsert({
      where:  { cle },
      update: { valeur, updatedBy: userId },
      create: { cle, valeur, updatedBy: userId },
    })
    if (cle === 'roles_config') invalidateRoleCache()
    if (cle === 'attribution_etapes') invalidateAttributionCache()
    return param
  }

  // PATCH /api/parametres/:cle
  fastify.patch('/:cle', { preHandler: [authenticate, authorize('permAdministration', 'partiel')] }, async (request, reply) => {
    const { cle }    = z.object({ cle: z.string().min(1).max(100) }).parse(request.params)
    const { valeur } = z.object({ valeur: jsonValue }).parse(request.body)
    if (CLES_DG.includes(cle) && request.user.profil !== 'dg') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Paramètre réservé au Directeur Général' })
    }
    const param = await upsert(cle, valeur, request.user.id)
    await logActivity(request.user.id, 'PARAMETRE_MODIFIE', 'parametre', cle, `Paramètre « ${cle} » modifié`)
    return reply.send(param)
  })

  // PATCH /api/parametres — mise à jour en masse
  fastify.patch('/', { preHandler: [authenticate, authorize('permAdministration', 'complet')] }, async (request, reply) => {
    const body = z.record(jsonValue).parse(request.body)
    if (Object.keys(body).some(k => CLES_DG.includes(k)) && request.user.profil !== 'dg') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Paramètre réservé au Directeur Général' })
    }
    const updates = []
    for (const [cle, valeur] of Object.entries(body)) updates.push(await upsert(cle, valeur, request.user.id))
    await logActivity(request.user.id, 'PARAMETRES_MODIFIES', 'parametre', null, Object.keys(body).join(', '))
    return reply.send(updates)
  })
}

export default parametresRoutes
