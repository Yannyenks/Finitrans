import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../config/prisma'
import { authenticate } from '../middleware/authenticate'
import { buildPagination, paginate } from '../utils/pagination'
import { NotFoundError } from '../utils/errors'

const notificationsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {

  // GET /api/notifications — notifications de l'utilisateur connecté
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const userId = (request.user as any).id
    const q = z.object({
      page:   z.coerce.number().default(1),
      limit:  z.coerce.number().default(30),
      nonLues: z.coerce.boolean().optional(),
    }).parse(request.query)

    const where: Record<string, unknown> = { userId }
    if (q.nonLues) where.lu = false

    const { skip, take, page, limit } = buildPagination(q.page, q.limit)
    const [data, total, nonLues] = await Promise.all([
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
    ])

    return reply.send({ ...paginate(data, total, page, limit), nonLues })
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

  // PATCH /api/notifications/tout-lire — marquer tout comme lu
  fastify.patch('/tout-lire', { preHandler: [authenticate] }, async (request, reply) => {
    const userId = (request.user as any).id
    const { count } = await prisma.notification.updateMany({
      where: { userId, lu: false },
      data:  { lu: true, luAt: new Date() },
    })
    return reply.send({ message: `${count} notification(s) marquée(s) comme lue(s)` })
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
