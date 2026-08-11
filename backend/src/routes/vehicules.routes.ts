import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../config/prisma'
import { authenticate } from '../middleware/authenticate'
import { authorize } from '../middleware/authorize'
import { buildPagination, paginate } from '../utils/pagination'
import { NotFoundError } from '../utils/errors'

const vehiculesRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const readAccess  = [authenticate, authorize('permDossier', 'lecture')]
  const writeAccess = [authenticate, authorize('permDossier', 'partiel')]

  // GET /api/vehicules
  fastify.get('/', { preHandler: readAccess }, async (request, reply) => {
    const q = z.object({
      page:      z.coerce.number().default(1),
      limit:     z.coerce.number().default(20),
      statut:    z.string().optional(),
      dossierId: z.string().uuid().optional(),
      marque:    z.string().optional(),
    }).parse(request.query)

    const where: Record<string, unknown> = {}
    if (q.statut)    where.statut    = q.statut
    if (q.dossierId) where.dossierId = q.dossierId
    if (q.marque)    where.marque    = { contains: q.marque, mode: 'insensitive' }

    const { skip, take, page, limit } = buildPagination(q.page, q.limit)
    const [data, total] = await Promise.all([
      prisma.vehicule.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          dossier:     { select: { numero: true, client: true, compagnie: true } },
          responsable: { select: { nom: true } },
        },
      }),
      prisma.vehicule.count({ where }),
    ])
    return reply.send(paginate(data, total, page, limit))
  })

  // GET /api/vehicules/:id
  fastify.get('/:id', { preHandler: readAccess }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const vehicule = await prisma.vehicule.findUnique({
      where: { id },
      include: {
        dossier: {
          select: {
            id: true, numero: true, client: true, compagnie: true,
            status: true, site: true, dateArrivee: true,
          },
        },
        responsable: { select: { id: true, nom: true, role: true } },
      },
    })
    if (!vehicule) throw new NotFoundError('Véhicule', id)
    return reply.send(vehicule)
  })

  // POST /api/vehicules
  fastify.post('/', { preHandler: writeAccess }, async (request, reply) => {
    const body = z.object({
      dossierId:      z.string().uuid(),
      marque:         z.string().min(2),
      modele:         z.string().min(1),
      annee:          z.number().int().min(1900).max(new Date().getFullYear() + 1),
      numeroSerie:    z.string().min(5),
      immatriculation: z.string().optional(),
      valeurCIF:      z.number().positive(),
      notes:          z.string().optional(),
    }).parse(request.body)

    const userId   = (request.user as any).id
    const vehicule = await prisma.vehicule.create({
      data: { ...body, responsableId: userId },
    })
    return reply.code(201).send(vehicule)
  })

  // PATCH /api/vehicules/:id
  fastify.patch('/:id', { preHandler: writeAccess }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body   = z.object({
      statut:         z.enum(['en_attente', 'en_cours', 'cloture']).optional(),
      immatriculation: z.string().optional(),
      dateFin:        z.string().datetime().optional(),
      notes:          z.string().optional(),
    }).parse(request.body)

    const existing = await prisma.vehicule.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('Véhicule', id)

    return reply.send(await prisma.vehicule.update({
      where: { id },
      data: {
        ...body,
        dateFin: body.dateFin ? new Date(body.dateFin) : undefined,
      },
    }))
  })

  // GET /api/vehicules/stats/resume
  fastify.get('/stats/resume', { preHandler: readAccess }, async (request, reply) => {
    const [parStatut, totalValeur, enCours] = await Promise.all([
      prisma.vehicule.groupBy({ by: ['statut'], _count: true }),
      prisma.vehicule.aggregate({ _sum: { valeurCIF: true } }),
      prisma.vehicule.count({ where: { statut: 'en_cours' } }),
    ])
    return reply.send({
      parStatut: parStatut.map(s => ({ statut: s.statut, count: s._count })),
      totalValeurCIF: totalValeur._sum.valeurCIF ?? 0,
      enCours,
    })
  })
}

export default vehiculesRoutes
