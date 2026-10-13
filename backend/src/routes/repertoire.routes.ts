/**
 * Répertoire partagé des contacts externes (clients, fournisseurs, compagnies,
 * transporteurs, administrations, banques). Consultable et alimenté par tous les comptes.
 */
import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../config/prisma'
import { authenticate } from '../middleware/authenticate'
import { NotFoundError } from '../utils/errors'

const TYPES = ['client', 'fournisseur', 'compagnie', 'transporteur', 'administration', 'banque', 'autre'] as const

const contactSchema = z.object({
  type:       z.enum(TYPES).default('client'),
  nom:        z.string().trim().min(2).max(255),
  societe:    z.string().max(255).nullable().optional(),
  fonction:   z.string().max(255).nullable().optional(),
  telephone:  z.string().max(50).nullable().optional(),
  telephone2: z.string().max(50).nullable().optional(),
  email:      z.string().email().max(255).or(z.literal('')).nullable().optional().transform(v => v || null),
  adresse:    z.string().nullable().optional(),
  niu:        z.string().max(50).nullable().optional(),
  notes:      z.string().nullable().optional(),
})

const repertoireRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const q = z.object({ type: z.enum(TYPES).optional(), q: z.string().optional() }).parse(request.query)
    const where: Prisma.ContactWhereInput = {
      ...(q.type ? { type: q.type } : {}),
      ...(q.q ? { OR: [
        { nom: { contains: q.q, mode: 'insensitive' } },
        { societe: { contains: q.q, mode: 'insensitive' } },
        { telephone: { contains: q.q } },
        { email: { contains: q.q, mode: 'insensitive' } },
      ] } : {}),
    }
    const [contacts, parType] = await Promise.all([
      prisma.contact.findMany({ where, orderBy: [{ societe: 'asc' }, { nom: 'asc' }], take: 500, include: { createdBy: { select: { nom: true } } } }),
      prisma.contact.groupBy({ by: ['type'], _count: true }),
    ])
    return reply.send({ contacts, parType: Object.fromEntries(parType.map(p => [p.type, p._count])) })
  })

  fastify.post('/', { preHandler: [authenticate] }, async (request, reply) => {
    const body = contactSchema.parse(request.body)
    return reply.code(201).send(await prisma.contact.create({ data: { ...body, createdById: request.user.id } }))
  })

  fastify.patch('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body = contactSchema.partial().parse(request.body)
    if (!(await prisma.contact.findUnique({ where: { id } }))) throw new NotFoundError('Contact', id)
    return reply.send(await prisma.contact.update({ where: { id }, data: body }))
  })

  fastify.delete('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const c = await prisma.contact.findUnique({ where: { id } })
    if (!c) throw new NotFoundError('Contact', id)
    if (c.createdById !== request.user.id && !request.user.superviseur) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Seul l\'auteur du contact (ou la Direction) peut le supprimer' })
    }
    await prisma.contact.delete({ where: { id } })
    return reply.code(204).send()
  })
}

export default repertoireRoutes
