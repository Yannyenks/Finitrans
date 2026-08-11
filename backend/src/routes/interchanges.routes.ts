import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../config/prisma'
import { authenticate } from '../middleware/authenticate'
import { authorize } from '../middleware/authorize'
import { buildPagination, paginate } from '../utils/pagination'
import { NotFoundError } from '../utils/errors'
import { differenceInDays, isPast } from 'date-fns'

const interchangesRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const readAccess  = [authenticate, authorize('permDossier', 'lecture')]
  const writeAccess = [authenticate, authorize('permDossier', 'partiel')]

  // GET /api/interchanges
  fastify.get('/', { preHandler: readAccess }, async (request, reply) => {
    const q = z.object({
      page:      z.coerce.number().default(1),
      limit:     z.coerce.number().default(20),
      statut:    z.string().optional(),
      compagnie: z.string().optional(),
      dossierId: z.string().uuid().optional(),
      enRetard:  z.coerce.boolean().optional(),
    }).parse(request.query)

    const where: Record<string, unknown> = {}
    if (q.statut)    where.statut    = q.statut
    if (q.compagnie) where.compagnie = q.compagnie
    if (q.dossierId) where.dossierId = q.dossierId
    if (q.enRetard)  where.statut    = 'emis', where.dateLimite = { lt: new Date() }

    const { skip, take, page, limit } = buildPagination(q.page, q.limit)
    const [data, total] = await Promise.all([
      prisma.interchange.findMany({
        where,
        skip,
        take,
        orderBy: { dateEmission: 'desc' },
        include: {
          dossier:     { select: { numero: true, client: true } },
          responsable: { select: { nom: true } },
        },
      }),
      prisma.interchange.count({ where }),
    ])

    const now = new Date()
    const enriched = data.map(ic => {
      const enRetard  = ic.statut === 'emis' && isPast(ic.dateLimite)
      const joursRetard = enRetard ? differenceInDays(now, ic.dateLimite) : 0
      return { ...ic, enRetard, joursRetard }
    })

    return reply.send(paginate(enriched, total, page, limit))
  })

  // GET /api/interchanges/en-retard — liste des conteneurs non retournés à temps
  fastify.get('/en-retard', { preHandler: readAccess }, async (request, reply) => {
    const retards = await prisma.interchange.findMany({
      where: { statut: 'emis', dateLimite: { lt: new Date() } },
      orderBy: { dateLimite: 'asc' },
      include: {
        dossier: {
          select: {
            numero: true, client: true, conteneur: true,
            responsable: { select: { nom: true } },
          },
        },
        responsable: { select: { nom: true } },
      },
    })

    const now = new Date()
    return reply.send(retards.map(ic => ({
      ...ic,
      joursRetard: differenceInDays(now, ic.dateLimite),
    })))
  })

  // GET /api/interchanges/:id
  fastify.get('/:id', { preHandler: readAccess }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const ic = await prisma.interchange.findUnique({
      where: { id },
      include: {
        dossier:     { select: { numero: true, client: true, conteneur: true, status: true } },
        responsable: { select: { id: true, nom: true } },
      },
    })
    if (!ic) throw new NotFoundError('Interchange', id)

    const enRetard    = ic.statut === 'emis' && isPast(ic.dateLimite)
    const joursRetard = enRetard ? differenceInDays(new Date(), ic.dateLimite) : 0
    return reply.send({ ...ic, enRetard, joursRetard })
  })

  // POST /api/interchanges
  fastify.post('/', { preHandler: writeAccess }, async (request, reply) => {
    const body = z.object({
      dossierId:   z.string().uuid(),
      conteneur:   z.string().min(3),
      compagnie:   z.enum(['MSC', 'COSCO', 'MAERSK', 'CMA_CGM']),
      dateLimite:  z.string().datetime(),
      notes:       z.string().optional(),
    }).parse(request.body)

    const userId = (request.user as any).id
    const ic = await prisma.interchange.create({
      data: {
        ...body,
        responsableId: userId,
        dateLimite:    new Date(body.dateLimite),
      },
    })
    return reply.code(201).send(ic)
  })

  // PATCH /api/interchanges/:id — marquer retourné / en litige
  fastify.patch('/:id', { preHandler: writeAccess }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body   = z.object({
      statut:     z.enum(['emis', 'retourne', 'en_litige']).optional(),
      dateRetour: z.string().datetime().optional(),
      notes:      z.string().optional(),
    }).parse(request.body)

    const existing = await prisma.interchange.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('Interchange', id)

    return reply.send(await prisma.interchange.update({
      where: { id },
      data: {
        ...body,
        dateRetour: body.dateRetour ? new Date(body.dateRetour) : undefined,
      },
    }))
  })

  // GET /api/interchanges/stats/par-compagnie
  fastify.get('/stats/par-compagnie', { preHandler: readAccess }, async (request, reply) => {
    const stats = await prisma.interchange.groupBy({
      by: ['compagnie', 'statut'],
      _count: true,
    })
    return reply.send(stats.map(s => ({ compagnie: s.compagnie, statut: s.statut, count: s._count })))
  })
}

export default interchangesRoutes
