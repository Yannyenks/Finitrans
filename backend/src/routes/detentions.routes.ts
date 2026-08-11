import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../config/prisma'
import { authenticate } from '../middleware/authenticate'
import { authorize } from '../middleware/authorize'
import { buildPagination, paginate } from '../utils/pagination'
import { NotFoundError } from '../utils/errors'
import { differenceInDays } from 'date-fns'

const detentionsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const readAccess  = [authenticate, authorize('permFinancier', 'lecture')]
  const writeAccess = [authenticate, authorize('permFinancier', 'partiel')]

  // GET /api/detentions
  fastify.get('/', { preHandler: readAccess }, async (request, reply) => {
    const q = z.object({
      page:      z.coerce.number().default(1),
      limit:     z.coerce.number().default(20),
      statut:    z.string().optional(),
      compagnie: z.string().optional(),
      dossierId: z.string().uuid().optional(),
    }).parse(request.query)

    const where: Record<string, unknown> = {}
    if (q.statut)    where.statut    = q.statut
    if (q.compagnie) where.compagnie = q.compagnie
    if (q.dossierId) where.dossierId = q.dossierId

    const { skip, take, page, limit } = buildPagination(q.page, q.limit)
    const [data, total] = await Promise.all([
      prisma.detention.findMany({
        where,
        skip,
        take,
        orderBy: { dateDebut: 'desc' },
        include: {
          dossier: { select: { numero: true, client: true, conteneur: true, site: true } },
        },
      }),
      prisma.detention.count({ where }),
    ])

    // Recalcule jours et montant en temps réel pour les détentions actives
    const now = new Date()
    const enriched = data.map(d => {
      if (d.statut === 'en_cours') {
        const jours = differenceInDays(now, d.dateDebut)
        const montantTotal = jours * Number(d.tarifJournalier)
        return { ...d, joursDetention: jours, montantTotal }
      }
      return d
    })

    return reply.send(paginate(enriched, total, page, limit))
  })

  // GET /api/detentions/en-cours — détentions actives avec coût temps réel
  fastify.get('/en-cours', { preHandler: readAccess }, async (request, reply) => {
    const detentions = await prisma.detention.findMany({
      where: { statut: 'en_cours' },
      orderBy: { dateDebut: 'asc' },
      include: {
        dossier: {
          select: {
            numero: true, client: true, conteneur: true,
            site: true, responsable: { select: { nom: true } },
          },
        },
      },
    })

    const now = new Date()
    const enriched = detentions.map(d => {
      const jours        = differenceInDays(now, d.dateDebut)
      const montantTotal = jours * Number(d.tarifJournalier)
      const urgente      = jours > 14
      return { ...d, joursDetention: jours, montantTotal, urgente }
    })

    const totalCout = enriched.reduce((s, d) => s + d.montantTotal, 0)

    return reply.send({ detentions: enriched, totalCout, count: enriched.length })
  })

  // GET /api/detentions/:id
  fastify.get('/:id', { preHandler: readAccess }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const det = await prisma.detention.findUnique({
      where: { id },
      include: {
        dossier: {
          select: {
            numero: true, client: true, conteneur: true,
            site: true, status: true, dateLimiteSortie: true,
          },
        },
      },
    })
    if (!det) throw new NotFoundError('Détention', id)

    if (det.statut === 'en_cours') {
      const jours        = differenceInDays(new Date(), det.dateDebut)
      const montantTotal = jours * Number(det.tarifJournalier)
      return reply.send({ ...det, joursDetention: jours, montantTotal })
    }
    return reply.send(det)
  })

  // POST /api/detentions
  fastify.post('/', { preHandler: writeAccess }, async (request, reply) => {
    const body = z.object({
      dossierId:       z.string().uuid(),
      conteneur:       z.string().min(3),
      compagnie:       z.enum(['MSC', 'COSCO', 'MAERSK', 'CMA_CGM']),
      dateDebut:       z.string().datetime(),
      tarifJournalier: z.number().positive(),
      notes:           z.string().optional(),
    }).parse(request.body)

    const dateDebut = new Date(body.dateDebut)
    const jours     = differenceInDays(new Date(), dateDebut)

    const detention = await prisma.detention.create({
      data: {
        ...body,
        dateDebut,
        joursDetention: jours,
        montantTotal:   jours * body.tarifJournalier,
      },
    })

    // Crée automatiquement une alerte si la détention a déjà commencé
    if (jours > 0) {
      await prisma.alerte.create({
        data: {
          type:      'detention',
          severity:  jours > 7 ? 'critical' : 'warning',
          message:   `Détention conteneur ${body.conteneur} (${body.compagnie}) : ${jours} jour(s) — coût : ${(jours * body.tarifJournalier).toLocaleString('fr-FR')} XAF`,
          dossierId: body.dossierId,
        },
      })
    }

    return reply.code(201).send(detention)
  })

  // PATCH /api/detentions/:id
  fastify.patch('/:id', { preHandler: writeAccess }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body   = z.object({
      statut:  z.enum(['en_cours', 'resolue']).optional(),
      dateFin: z.string().datetime().optional(),
      notes:   z.string().optional(),
    }).parse(request.body)

    const existing = await prisma.detention.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('Détention', id)

    const updateData: Record<string, unknown> = { ...body }
    if (body.statut === 'resolue' && body.dateFin) {
      const dateFin = new Date(body.dateFin)
      const jours   = differenceInDays(dateFin, existing.dateDebut)
      updateData.joursDetention = jours
      updateData.montantTotal   = jours * Number(existing.tarifJournalier)
      updateData.dateFin        = dateFin
      delete updateData.statut
      updateData.statut = 'resolue'
    }

    return reply.send(await prisma.detention.update({ where: { id }, data: updateData }))
  })

  // GET /api/detentions/stats/par-compagnie
  fastify.get('/stats/par-compagnie', { preHandler: readAccess }, async (request, reply) => {
    const detentions = await prisma.detention.findMany({
      where: { statut: 'en_cours' },
      select: { compagnie: true, tarifJournalier: true, dateDebut: true },
    })

    const now = new Date()
    const parCompagnie: Record<string, { count: number; totalCout: number }> = {}

    detentions.forEach(d => {
      const jours = differenceInDays(now, d.dateDebut)
      const cout  = jours * Number(d.tarifJournalier)
      if (!parCompagnie[d.compagnie]) parCompagnie[d.compagnie] = { count: 0, totalCout: 0 }
      parCompagnie[d.compagnie].count++
      parCompagnie[d.compagnie].totalCout += cout
    })

    return reply.send(Object.entries(parCompagnie).map(([compagnie, stats]) => ({ compagnie, ...stats })))
  })
}

export default detentionsRoutes
