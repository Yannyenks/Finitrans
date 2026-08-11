import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../config/prisma'
import { authenticate } from '../middleware/authenticate'
import { authorize } from '../middleware/authorize'
import { NotFoundError } from '../utils/errors'
import { buildPagination, paginate } from '../utils/pagination'

const kribiRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const readAccess  = [authenticate, authorize('permDossier', 'lecture')]
  const writeAccess = [authenticate, authorize('permDossier', 'partiel')]

  // GET /api/kribi/bons
  fastify.get('/bons', { preHandler: readAccess }, async (request, reply) => {
    const q = z.object({
      page:      z.coerce.number().default(1),
      limit:     z.coerce.number().default(20),
      type:      z.string().optional(),
      statut:    z.string().optional(),
      dossierId: z.string().uuid().optional(),
    }).parse(request.query)

    const where: Record<string, unknown> = {}
    if (q.type)      where.type      = q.type
    if (q.statut)    where.statut    = q.statut
    if (q.dossierId) where.dossierId = q.dossierId

    const { skip, take, page, limit } = buildPagination(q.page, q.limit)
    const [data, total] = await Promise.all([
      prisma.bonKribi.findMany({
        where,
        skip,
        take,
        orderBy: { dateEmission: 'desc' },
        include: {
          dossier:     { select: { numero: true, client: true, conteneur: true } },
          responsable: { select: { nom: true } },
        },
      }),
      prisma.bonKribi.count({ where }),
    ])
    return reply.send(paginate(data, total, page, limit))
  })

  // POST /api/kribi/bons
  fastify.post('/bons', { preHandler: writeAccess }, async (request, reply) => {
    const body = z.object({
      dossierId:    z.string().uuid(),
      type:         z.enum(['douane', 'compagnie_pak', 'portuaire_pad']),
      numero:       z.string().min(3),
      description:  z.string().min(5),
      montant:      z.number().positive().optional(),
      dateEmission: z.string().datetime().optional(),
    }).parse(request.body)

    const userId = (request.user as any).id
    const bon = await prisma.bonKribi.create({
      data: {
        ...body,
        responsableId: userId,
        dateEmission: body.dateEmission ? new Date(body.dateEmission) : new Date(),
      },
      include: {
        dossier:     { select: { numero: true, client: true } },
        responsable: { select: { nom: true } },
      },
    })
    return reply.code(201).send(bon)
  })

  // GET /api/kribi/bons/:id
  fastify.get('/bons/:id', { preHandler: readAccess }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const bon = await prisma.bonKribi.findUnique({
      where: { id },
      include: {
        dossier:     { select: { numero: true, client: true, conteneur: true, compagnie: true } },
        responsable: { select: { nom: true, role: true } },
      },
    })
    if (!bon) throw new NotFoundError('Bon Kribi', id)
    return reply.send(bon)
  })

  // PATCH /api/kribi/bons/:id
  fastify.patch('/bons/:id', { preHandler: writeAccess }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body   = z.object({
      statut: z.enum(['emis', 'valide', 'utilise', 'expire']).optional(),
      description: z.string().optional(),
      montant: z.number().positive().optional(),
    }).parse(request.body)

    const existing = await prisma.bonKribi.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('Bon Kribi', id)

    return reply.send(await prisma.bonKribi.update({ where: { id }, data: body }))
  })

  // GET /api/kribi/stats — tableau de bord Kribi
  fastify.get('/stats', { preHandler: readAccess }, async (request, reply) => {
    const [
      totalBons,
      bonsParType,
      bonsParStatut,
      dossiersKribi,
      paiementsDouane,
    ] = await Promise.all([
      prisma.bonKribi.count(),
      prisma.bonKribi.groupBy({ by: ['type'], _count: true }),
      prisma.bonKribi.groupBy({ by: ['statut'], _count: true }),
      prisma.dossier.count({ where: { site: 'Kribi' } }),
      prisma.paiementDouane.aggregate({
        where: { dossier: { site: 'Kribi' } },
        _sum: { montant: true },
      }),
    ])

    return reply.send({
      totalBons,
      bonsParType:   bonsParType.map(b => ({ type: b.type, count: b._count })),
      bonsParStatut: bonsParStatut.map(b => ({ statut: b.statut, count: b._count })),
      dossiersKribi,
      totalPaiementsDouane: paiementsDouane._sum.montant ?? 0,
    })
  })

  // GET /api/kribi/gate-passes — gate passes port de Kribi
  fastify.get('/gate-passes', { preHandler: readAccess }, async (request, reply) => {
    const q = z.object({
      page:   z.coerce.number().default(1),
      limit:  z.coerce.number().default(20),
      statut: z.string().optional(),
    }).parse(request.query)

    const where: Record<string, unknown> = { dossier: { site: 'Kribi' } }
    if (q.statut) where.statut = q.statut

    const { skip, take, page, limit } = buildPagination(q.page, q.limit)
    const [data, total] = await Promise.all([
      prisma.gatePass.findMany({
        where,
        skip,
        take,
        orderBy: { dateEmission: 'desc' },
        include: {
          dossier:  { select: { numero: true, client: true, conteneur: true } },
          emetteur: { select: { nom: true } },
        },
      }),
      prisma.gatePass.count({ where }),
    ])
    return reply.send(paginate(data, total, page, limit))
  })

  // POST /api/kribi/gate-passes — émettre un gate pass
  fastify.post('/gate-passes', { preHandler: writeAccess }, async (request, reply) => {
    const body = z.object({
      dossierId:   z.string().uuid(),
      conteneur:   z.string().min(3),
      chauffeur:   z.string().min(2),
      telephone:   z.string().min(8),
      destination: z.string().min(2),
      dateEmission: z.string().datetime().optional(),
    }).parse(request.body)

    const userId  = (request.user as any).id
    const counter = await prisma.gatePass.count()
    const numero  = `GP-KRB-${String(counter + 1).padStart(4, '0')}`

    const gp = await prisma.gatePass.create({
      data: {
        ...body,
        numero,
        emetteurId:  userId,
        dateEmission: body.dateEmission ? new Date(body.dateEmission) : new Date(),
      },
      include: {
        dossier:  { select: { numero: true, client: true, conteneur: true } },
        emetteur: { select: { nom: true } },
      },
    })
    return reply.code(201).send(gp)
  })

  // GET /api/kribi/comptes-rendus — compte-rendus journaliers
  fastify.get('/comptes-rendus', { preHandler: readAccess }, async (request, reply) => {
    const q = z.object({
      page:  z.coerce.number().default(1),
      limit: z.coerce.number().default(20),
      site:  z.string().optional(),
    }).parse(request.query)

    const where: Record<string, unknown> = {}
    if (q.site) where.site = q.site

    const { skip, take, page, limit } = buildPagination(q.page, q.limit)
    const [data, total] = await Promise.all([
      prisma.compteRenduKribi.findMany({
        where,
        skip,
        take,
        orderBy: { date: 'desc' },
        include: { auteur: { select: { nom: true } } },
      }),
      prisma.compteRenduKribi.count({ where }),
    ])
    return reply.send(paginate(data, total, page, limit))
  })

  // POST /api/kribi/comptes-rendus — soumettre un compte-rendu journalier
  fastify.post('/comptes-rendus', { preHandler: writeAccess }, async (request, reply) => {
    const body = z.object({
      date:             z.string().datetime(),
      contenu:          z.string().min(10),
      dossiersTraites:  z.coerce.number().default(0),
      bonsEmis:         z.coerce.number().default(0),
      gatePassEmis:     z.coerce.number().default(0),
      observations:     z.string().optional(),
    }).parse(request.body)

    const user = request.user as any
    const cr = await prisma.compteRenduKribi.create({
      data: {
        ...body,
        date:     new Date(body.date),
        site:     user.site ?? 'Kribi',
        auteurId: user.id,
      },
      include: { auteur: { select: { nom: true } } },
    })
    return reply.code(201).send(cr)
  })
}

export default kribiRoutes
