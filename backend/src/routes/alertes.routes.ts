import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../config/prisma'
import { authenticate } from '../middleware/authenticate'
import { authorize } from '../middleware/authorize'
import { NotFoundError } from '../utils/errors'

const alertesRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {

  // GET /api/alertes
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const q = z.object({
      lu:       z.coerce.boolean().optional(),
      severity: z.string().optional(),
      type:     z.string().optional(),
      limit:    z.coerce.number().default(50),
    }).parse(request.query)

    const where: Record<string, unknown> = {}
    if (q.lu !== undefined) where.lu = q.lu
    if (q.severity) where.severity = q.severity
    if (q.type)     where.type     = q.type

    const alertes = await prisma.alerte.findMany({
      where,
      take: q.limit,
      orderBy: { createdAt: 'desc' },
      include: { dossier: { select: { numero: true, client: true } } },
    })

    const nonLues = await prisma.alerte.count({ where: { lu: false } })
    return reply.send({ data: alertes, nonLues })
  })

  // PATCH /api/alertes/:id/lire
  fastify.patch('/:id/lire', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const user   = request.user as any

    const alerte = await prisma.alerte.findUnique({ where: { id } })
    if (!alerte) throw new NotFoundError('Alerte', id)

    const updated = await prisma.alerte.update({
      where: { id },
      data: { lu: true, luPar: user.id, luAt: new Date() },
    })
    return reply.send(updated)
  })

  // PATCH /api/alertes/lire-tout
  fastify.patch('/lire-tout', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user as any
    await prisma.alerte.updateMany({
      where: { lu: false },
      data: { lu: true, luPar: user.id, luAt: new Date() },
    })
    return reply.code(204).send()
  })

  // DELETE /api/alertes/:id
  fastify.delete('/:id', { preHandler: [authenticate, authorize('permAdministration', 'partiel')] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const alerte = await prisma.alerte.findUnique({ where: { id } })
    if (!alerte) throw new NotFoundError('Alerte', id)
    await prisma.alerte.delete({ where: { id } })
    return reply.code(204).send()
  })

  // POST /api/alertes (créer manuellement)
  fastify.post('/', { preHandler: [authenticate, authorize('permAdministration', 'partiel')] }, async (request, reply) => {
    const body = z.object({
      type:      z.enum(['detention', 'paiement', 'blocage', 'document', 'charge', 'di_seuil']),
      message:   z.string().min(5),
      dossierId: z.string().uuid().optional(),
      severity:  z.enum(['critical', 'warning', 'info']).default('warning'),
    }).parse(request.body)

    const alerte = await prisma.alerte.create({ data: body })
    return reply.code(201).send(alerte)
  })

  // ─── Configurations des alertes ───────────────────────────

  // GET /api/alertes/config
  fastify.get('/config', { preHandler: [authenticate] }, async (request, reply) => {
    return reply.send(await prisma.alerteConfig.findMany({ orderBy: { label: 'asc' } }))
  })

  // PATCH /api/alertes/config/:id
  fastify.patch('/config/:id', { preHandler: [authenticate, authorize('permAdministration', 'partiel')] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body   = z.object({
      seuil: z.number().positive().optional(),
      actif: z.boolean().optional(),
    }).parse(request.body)

    const existing = await prisma.alerteConfig.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('Config alerte', id)

    return reply.send(await prisma.alerteConfig.update({ where: { id }, data: body }))
  })
}

export default alertesRoutes
