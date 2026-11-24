import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../config/prisma'
import { authenticate } from '../middleware/authenticate'
import { clesVapid } from '../services/push'

/** Abonnements Web Push : notifications natives du système, même plateforme fermée. */
const pushRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /api/push/cle — clé publique VAPID (nécessaire au navigateur pour s'abonner)
  fastify.get('/cle', { preHandler: [authenticate] }, async (_request, reply) => {
    const { publicKey } = await clesVapid()
    return reply.send({ publicKey })
  })

  // POST /api/push/abonnements — enregistre (ou rattache au compte) l'abonnement de ce navigateur
  fastify.post('/abonnements', { preHandler: [authenticate] }, async (request, reply) => {
    const body = z.object({
      endpoint: z.string().url().max(2000),
      keys: z.object({ p256dh: z.string().min(10).max(500), auth: z.string().min(8).max(200) }),
      navigateur: z.string().max(255).optional(),
    }).parse(request.body)
    const a = await prisma.pushAbonnement.upsert({
      where: { endpoint: body.endpoint },
      update: { userId: request.user.id, p256dh: body.keys.p256dh, auth: body.keys.auth, navigateur: body.navigateur },
      create: { userId: request.user.id, endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth, navigateur: body.navigateur },
      select: { id: true, createdAt: true },
    })
    return reply.code(201).send(a)
  })

  // POST /api/push/abonnements/retirer — désabonne ce navigateur (déconnexion, désactivation)
  fastify.post('/abonnements/retirer', { preHandler: [authenticate] }, async (request, reply) => {
    const { endpoint } = z.object({ endpoint: z.string().url() }).parse(request.body)
    await prisma.pushAbonnement.deleteMany({ where: { endpoint, userId: request.user.id } })
    return reply.code(204).send()
  })

  // GET /api/push/etat — nombre d'appareils abonnés pour ce compte
  fastify.get('/etat', { preHandler: [authenticate] }, async (request, reply) => {
    const appareils = await prisma.pushAbonnement.count({ where: { userId: request.user.id } })
    return reply.send({ appareils })
  })

  // POST /api/push/test — notification d'essai pour vérifier la réception sur ce PC
  fastify.post('/test', { preHandler: [authenticate] }, async (request, reply) => {
    const n = await prisma.notification.create({
      data: {
        userId: request.user.id, type: 'action_requise', priorite: 'normale',
        titre: 'Notifications activées ✅', message: 'Vous recevrez ici les tâches, validations, retards et messages qui vous concernent.',
        actionUrl: '/notifications',
      },
    })
    return reply.code(201).send({ id: n.id })
  })
}

export default pushRoutes
