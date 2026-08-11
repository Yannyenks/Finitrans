import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../config/prisma'
import { authenticate } from '../middleware/authenticate'
import { authorize } from '../middleware/authorize'

const parametresRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {

  // GET /api/parametres
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
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

  // PATCH /api/parametres/:cle
  fastify.patch('/:cle', { preHandler: [authenticate, authorize('permAdministration', 'partiel')] }, async (request, reply) => {
    const { cle }   = z.object({ cle: z.string() }).parse(request.params)
    const { valeur } = z.object({ valeur: z.unknown() }).parse(request.body)
    const userId    = (request.user as any).id

    const param = await prisma.parametre.upsert({
      where:  { cle },
      update: { valeur, updatedBy: userId },
      create: { cle, valeur, updatedBy: userId },
    })

    return reply.send(param)
  })

  // PATCH /api/parametres — mise à jour en masse
  fastify.patch('/', { preHandler: [authenticate, authorize('permAdministration', 'complet')] }, async (request, reply) => {
    const body   = z.record(z.unknown()).parse(request.body)
    const userId = (request.user as any).id

    const updates = await Promise.all(
      Object.entries(body).map(([cle, valeur]) =>
        prisma.parametre.upsert({
          where:  { cle },
          update: { valeur, updatedBy: userId },
          create: { cle, valeur, updatedBy: userId },
        }),
      ),
    )

    return reply.send(updates)
  })
}

export default parametresRoutes
