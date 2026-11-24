import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../config/prisma'
import { authenticate } from '../middleware/authenticate'
import { buildPagination, paginate } from '../utils/pagination'
import { NotFoundError } from '../utils/errors'
import { lancerRelancesSiNecessaire } from '../services/relances'
import { timingSafeEqual } from 'crypto'

const notificationsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {

  // GET /api/notifications — notifications de l'utilisateur connecté
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const userId = (request.user as any).id
    const q = z.object({
      page:   z.coerce.number().default(1),
      limit:  z.coerce.number().default(30),
      nonLues: z.coerce.boolean().optional(),
      /** Centre de notifications : non_lues | urgentes | lues | toutes */
      filtre:  z.enum(['non_lues', 'urgentes', 'lues', 'toutes']).optional(),
    }).parse(request.query)

    // Contrôle des délais et relances (au plus toutes les 5 minutes pour toute la plateforme)
    await lancerRelancesSiNecessaire().catch(err => request.log.error({ err }, 'Relances non passées'))

    const where: Record<string, unknown> = { userId }
    if (q.nonLues || q.filtre === 'non_lues') where.lu = false
    if (q.filtre === 'lues') where.lu = true
    if (q.filtre === 'urgentes') where.priorite = 'critique'

    const { skip, take, page, limit } = buildPagination(q.page, q.limit)
    const [data, total, nonLues, urgentes] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          dossier: { select: { numero: true, client: true } },
        },
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId, lu: false } }),
      prisma.notification.count({ where: { userId, lu: false, priorite: 'critique' } }),
    ])

    return reply.send({ ...paginate(data, total, page, limit), nonLues, urgentes })
  })

  // PATCH /api/notifications/:id/lire — marquer une notif comme lue
  fastify.patch('/:id/lire', { preHandler: [authenticate] }, async (request, reply) => {
    const { id }   = z.object({ id: z.string().uuid() }).parse(request.params)
    const userId   = (request.user as any).id
    const existing = await prisma.notification.findFirst({ where: { id, userId } })
    if (!existing) throw new NotFoundError('Notification', id)

    return reply.send(await prisma.notification.update({
      where: { id },
      data: { lu: true, luAt: new Date() },
    }))
  })

  // POST /api/notifications/:id/acquitter — prise en compte (accusé de réception) : fin des relances
  fastify.post('/:id/acquitter', { preHandler: [authenticate] }, async (request, reply) => {
    const { id }   = z.object({ id: z.string().uuid() }).parse(request.params)
    const userId   = (request.user as any).id
    const existing = await prisma.notification.findFirst({ where: { id, userId } })
    if (!existing) throw new NotFoundError('Notification', id)
    const maintenant = new Date()
    return reply.send(await prisma.notification.update({
      where: { id },
      data: { acquitteLe: existing.acquitteLe ?? maintenant, lu: true, luAt: existing.luAt ?? maintenant },
    }))
  })

  // GET /api/notifications/relances/cron — passage quotidien de secours (planificateur Vercel)
  fastify.get('/relances/cron', async (request, reply) => {
    const secret = process.env.CRON_SECRET
    const auth = Buffer.from(request.headers.authorization ?? '')
    const ok = secret
      ? auth.length === Buffer.from(`Bearer ${secret}`).length && timingSafeEqual(auth, Buffer.from(`Bearer ${secret}`))
      : String(request.headers['user-agent'] ?? '').startsWith('vercel-cron/')
    if (!ok) return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Réservé au planificateur' })
    return reply.send(await lancerRelancesSiNecessaire(true))
  })

  // PATCH /api/notifications/tout-lire — marquer tout comme lu
  fastify.patch('/tout-lire', { preHandler: [authenticate] }, async (request, reply) => {
    const userId = (request.user as any).id
    const { count } = await prisma.notification.updateMany({
      where: { userId, lu: false },
      data:  { lu: true, luAt: new Date() },
    })
    return reply.send({ message: `${count} notification(s) marquée(s) comme lue(s)` })
  })

  // PATCH /api/notifications/messages-lus — conversation ouverte : ses notifications de message sont lues
  fastify.patch('/messages-lus', { preHandler: [authenticate] }, async (request, reply) => {
    const userId = (request.user as any).id
    const { conversationId } = z.object({ conversationId: z.string().uuid() }).parse(request.body)
    const { count } = await prisma.notification.updateMany({
      where: { userId, lu: false, type: 'message', actionUrl: `/messagerie?conversation=${conversationId}` },
      data:  { lu: true, luAt: new Date() },
    })
    return reply.send({ lues: count })
  })

  // DELETE /api/notifications/:id
  fastify.delete('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id }   = z.object({ id: z.string().uuid() }).parse(request.params)
    const userId   = (request.user as any).id
    const existing = await prisma.notification.findFirst({ where: { id, userId } })
    if (!existing) throw new NotFoundError('Notification', id)

    await prisma.notification.delete({ where: { id } })
    return reply.code(204).send()
  })

  // POST /api/notifications/broadcast — envoi ciblé (admin/DG seulement)
  fastify.post('/broadcast', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user as any
    if (!['dg', 'exploitation', 'administration'].includes(user.profil)) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Action non autorisée' })
    }

    const body = z.object({
      userIds:   z.array(z.string().uuid()).optional(),
      profils:   z.array(z.string()).optional(),
      type:      z.enum(['alerte', 'message', 'dossier', 'action_requise']),
      titre:     z.string().min(3),
      message:   z.string().min(5),
      dossierId: z.string().uuid().optional(),
      actionUrl: z.string().optional(),
    }).parse(request.body)

    let targetUserIds: string[] = body.userIds ?? []

    if (body.profils && body.profils.length > 0) {
      const users = await prisma.user.findMany({
        where: { profil: { in: body.profils as any }, actif: true },
        select: { id: true },
      })
      targetUserIds = [...new Set([...targetUserIds, ...users.map(u => u.id)])]
    }

    if (targetUserIds.length === 0) {
      return reply.code(422).send({ error: 'NO_TARGETS', message: 'Aucun destinataire spécifié' })
    }

    const notifs = await prisma.notification.createMany({
      data: targetUserIds.map(userId => ({
        userId,
        type:      body.type,
        titre:     body.titre,
        message:   body.message,
        dossierId: body.dossierId,
        actionUrl: body.actionUrl,
      })),
    })

    return reply.code(201).send({ message: `${notifs.count} notification(s) envoyée(s)` })
  })

  // GET /api/notifications/count — badge non-lu uniquement
  fastify.get('/count', { preHandler: [authenticate] }, async (request, reply) => {
    const userId = (request.user as any).id
    const count  = await prisma.notification.count({ where: { userId, lu: false } })
    return reply.send({ nonLues: count })
  })
}

export default notificationsRoutes
