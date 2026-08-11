import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../config/prisma'
import { authenticate } from '../middleware/authenticate'
import { NotFoundError, ForbiddenError } from '../utils/errors'
import { buildPagination, paginate } from '../utils/pagination'

const messagerieRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {

  // GET /api/messagerie/conversations
  fastify.get('/conversations', { preHandler: [authenticate] }, async (request, reply) => {
    const userId = (request.user as any).id
    const q = z.object({
      page:  z.coerce.number().default(1),
      limit: z.coerce.number().default(20),
      type:  z.string().optional(),
    }).parse(request.query)

    const where: Record<string, unknown> = {
      participants: { some: { userId } },
    }
    if (q.type) where.type = q.type

    const { skip, take, page, limit } = buildPagination(q.page, q.limit)
    const [data, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        skip,
        take,
        orderBy: { updatedAt: 'desc' },
        include: {
          dossier:      { select: { numero: true, client: true } },
          participants: { include: { user: { select: { id: true, nom: true, avatarUrl: true } } } },
          messages:     { take: 1, orderBy: { createdAt: 'desc' }, select: { contenu: true, createdAt: true } },
        },
      }),
      prisma.conversation.count({ where }),
    ])

    return reply.send(paginate(data, total, page, limit))
  })

  // POST /api/messagerie/conversations
  fastify.post('/conversations', { preHandler: [authenticate] }, async (request, reply) => {
    const userId = (request.user as any).id
    const body = z.object({
      titre:          z.string().min(2),
      type:           z.enum(['dossier', 'general', 'urgence']).default('general'),
      dossierId:      z.string().uuid().optional(),
      participantIds: z.array(z.string().uuid()).min(1),
    }).parse(request.body)

    const allParticipants = [...new Set([userId, ...body.participantIds])]

    const conversation = await prisma.conversation.create({
      data: {
        titre:     body.titre,
        type:      body.type,
        dossierId: body.dossierId,
        createdBy: userId,
        participants: {
          create: allParticipants.map(uid => ({ userId: uid })),
        },
      },
      include: {
        participants: { include: { user: { select: { id: true, nom: true } } } },
      },
    })

    return reply.code(201).send(conversation)
  })

  // GET /api/messagerie/conversations/:id
  fastify.get('/conversations/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id }   = z.object({ id: z.string().uuid() }).parse(request.params)
    const userId   = (request.user as any).id

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        dossier:      { select: { numero: true, client: true } },
        participants: { include: { user: { select: { id: true, nom: true, avatarUrl: true } } } },
      },
    })
    if (!conversation) throw new NotFoundError('Conversation', id)

    const isMember = conversation.participants.some(p => p.userId === userId)
    if (!isMember) throw new ForbiddenError('Vous n\'êtes pas membre de cette conversation')

    return reply.send(conversation)
  })

  // GET /api/messagerie/conversations/:id/messages
  fastify.get('/conversations/:id/messages', { preHandler: [authenticate] }, async (request, reply) => {
    const { id }   = z.object({ id: z.string().uuid() }).parse(request.params)
    const userId   = (request.user as any).id
    const q = z.object({
      page:   z.coerce.number().default(1),
      limit:  z.coerce.number().default(50),
    }).parse(request.query)

    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: id, userId } },
    })
    if (!participant) throw new ForbiddenError('Accès refusé à cette conversation')

    const { skip, take, page, limit } = buildPagination(q.page, q.limit)
    const [data, total] = await Promise.all([
      prisma.message.findMany({
        where: { conversationId: id },
        skip,
        take,
        orderBy: { createdAt: 'asc' },
        include: { auteur: { select: { id: true, nom: true, avatarUrl: true } } },
      }),
      prisma.message.count({ where: { conversationId: id } }),
    ])

    // Marquer les messages comme lus
    await prisma.message.updateMany({
      where: { conversationId: id, lu: false, auteurId: { not: userId } },
      data: { lu: true },
    })

    return reply.send(paginate(data, total, page, limit))
  })

  // POST /api/messagerie/conversations/:id/messages
  fastify.post('/conversations/:id/messages', { preHandler: [authenticate] }, async (request, reply) => {
    const { id }   = z.object({ id: z.string().uuid() }).parse(request.params)
    const userId   = (request.user as any).id
    const { contenu } = z.object({ contenu: z.string().min(1) }).parse(request.body)

    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: id, userId } },
    })
    if (!participant) throw new ForbiddenError('Vous n\'êtes pas membre de cette conversation')

    const message = await prisma.message.create({
      data: { conversationId: id, auteurId: userId, contenu },
      include: { auteur: { select: { id: true, nom: true, avatarUrl: true } } },
    })

    // Mettre à jour le dernier message de la conversation
    await prisma.conversation.update({
      where: { id },
      data: { dernierMessage: contenu.substring(0, 100) },
    })

    // Broadcast via WebSocket
    if (fastify.websocketServer) {
      const evt = JSON.stringify({ type: 'NEW_MESSAGE', payload: { conversationId: id, message } })
      fastify.websocketServer.clients.forEach(client => {
        if (client.readyState === 1) client.send(evt)
      })
    }

    return reply.code(201).send(message)
  })

  // DELETE /api/messagerie/conversations/:id (quitter)
  fastify.delete('/conversations/:id/leave', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const userId = (request.user as any).id

    await prisma.conversationParticipant.deleteMany({
      where: { conversationId: id, userId },
    })
    return reply.code(204).send()
  })

  // GET /api/messagerie/non-lus — compteur global
  fastify.get('/non-lus', { preHandler: [authenticate] }, async (request, reply) => {
    const userId = (request.user as any).id
    const count = await prisma.message.count({
      where: {
        lu: false,
        auteurId: { not: userId },
        conversation: { participants: { some: { userId } } },
      },
    })
    return reply.send({ count })
  })
}

export default messagerieRoutes
