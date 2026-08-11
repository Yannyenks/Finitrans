import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '../config/prisma'
import { authenticate } from '../middleware/authenticate'
import { authorize } from '../middleware/authorize'
import { NotFoundError, ConflictError } from '../utils/errors'
import { buildPagination, paginate } from '../utils/pagination'

const updateEmployeSchema = z.object({
  nom:       z.string().min(2).optional(),
  role:      z.string().optional(),
  site:      z.enum(['Douala', 'Kribi']).optional(),
  telephone: z.string().optional(),
  profil:    z.enum(['dg', 'exploitation', 'operations', 'validation', 'administration', 'comptabilite', 'terrain_kribi']).optional(),
  actif:     z.boolean().optional(),
  permDossier:        z.enum(['complet', 'partiel', 'lecture', 'non']).optional(),
  permValidation:     z.enum(['complet', 'partiel', 'lecture', 'non']).optional(),
  permFinancier:      z.enum(['complet', 'partiel', 'lecture', 'non']).optional(),
  permRapports:       z.enum(['complet', 'partiel', 'lecture', 'non']).optional(),
  permAdministration: z.enum(['complet', 'partiel', 'lecture', 'non']).optional(),
})

const employesRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {

  // GET /api/employes
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const q = z.object({
      page: z.coerce.number().default(1),
      limit: z.coerce.number().default(20),
      site: z.string().optional(),
      profil: z.string().optional(),
      actif: z.coerce.boolean().optional(),
    }).parse(request.query)

    const where: Record<string, unknown> = {}
    if (q.site)   where.site  = q.site
    if (q.profil) where.profil = q.profil
    if (q.actif !== undefined) where.actif = q.actif

    const { skip, take, page, limit } = buildPagination(q.page, q.limit)
    const [data, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { nom: 'asc' },
        select: {
          id: true, email: true, nom: true, role: true, site: true, telephone: true,
          profil: true, actif: true, avatarUrl: true, createdAt: true,
          permDossier: true, permValidation: true, permFinancier: true,
          permRapports: true, permAdministration: true,
        },
      }),
      prisma.user.count({ where }),
    ])

    return reply.send(paginate(data, total, page, limit))
  })

  // GET /api/employes/:id
  fastify.get('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, nom: true, role: true, site: true, telephone: true,
        profil: true, actif: true, avatarUrl: true, createdAt: true,
        permDossier: true, permValidation: true, permFinancier: true,
        permRapports: true, permAdministration: true,
      },
    })
    if (!user) throw new NotFoundError('Employé', id)
    return reply.send(user)
  })

  // PATCH /api/employes/:id
  fastify.patch('/:id', { preHandler: [authenticate, authorize('permAdministration', 'partiel')] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body   = updateEmployeSchema.parse(request.body)

    const existing = await prisma.user.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('Employé', id)

    const updated = await prisma.user.update({
      where: { id },
      data: body,
      select: {
        id: true, email: true, nom: true, role: true, site: true, telephone: true,
        profil: true, actif: true, permDossier: true, permValidation: true,
        permFinancier: true, permRapports: true, permAdministration: true,
      },
    })
    return reply.send(updated)
  })

  // DELETE /api/employes/:id (désactivation douce)
  fastify.delete('/:id', { preHandler: [authenticate, authorize('permAdministration', 'complet')] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const selfId = (request.user as any).id
    if (id === selfId) {
      return reply.code(400).send({ error: 'BAD_REQUEST', message: 'Impossible de désactiver son propre compte' })
    }

    await prisma.user.update({ where: { id }, data: { actif: false } })
    return reply.code(204).send()
  })

  // GET /api/employes/:id/performance
  fastify.get('/:id/performance', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)

    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, nom: true, role: true, site: true, profil: true } })
    if (!user) throw new NotFoundError('Employé', id)

    const dossiers = await prisma.dossier.findMany({
      where: { responsableId: id },
      select: { id: true, status: true, dateLimiteSortie: true, dateCreation: true },
    })

    const now = new Date()
    const dossiersActifs   = dossiers.filter(d => d.status !== 'cloture').length
    const dossiersClotures = dossiers.filter(d => d.status === 'cloture').length
    const enRetard         = dossiers.filter(d => d.dateLimiteSortie && d.dateLimiteSortie < now && d.status !== 'cloture').length
    const rendement        = dossiers.length > 0 ? Math.round((dossiersClotures / dossiers.length) * 100) : 0
    const tauxRetard       = dossiersActifs > 0 ? Math.round((enRetard / dossiersActifs) * 100) : 0

    return reply.send({
      ...user,
      dossiersTotal: dossiers.length,
      dossiersActifs,
      dossiersClotures,
      enRetard,
      rendement,
      tauxRetard,
    })
  })

  // GET /api/employes/:id/dossiers
  fastify.get('/:id/dossiers', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const q = z.object({
      page: z.coerce.number().default(1),
      limit: z.coerce.number().default(10),
      status: z.string().optional(),
    }).parse(request.query)

    const where: Record<string, unknown> = { responsableId: id }
    if (q.status) where.status = q.status

    const { skip, take, page, limit } = buildPagination(q.page, q.limit)
    const [data, total] = await Promise.all([
      prisma.dossier.findMany({ where, skip, take, orderBy: { dateCreation: 'desc' } }),
      prisma.dossier.count({ where }),
    ])

    return reply.send(paginate(data, total, page, limit))
  })

  // PATCH /api/employes/:id/reset-password (admin)
  fastify.patch('/:id/reset-password', { preHandler: [authenticate, authorize('permAdministration', 'complet')] }, async (request, reply) => {
    const { id }          = z.object({ id: z.string().uuid() }).parse(request.params)
    const { newPassword } = z.object({ newPassword: z.string().min(8) }).parse(request.body)

    const existing = await prisma.user.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('Employé', id)

    const passwordHash = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({ where: { id }, data: { passwordHash } })

    // Révoquer les tokens actifs
    await prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    })

    return reply.code(204).send()
  })
}

export default employesRoutes
