import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../config/prisma'
import { authenticate } from '../middleware/authenticate'
import { authorize } from '../middleware/authorize'
import { buildPagination, paginate } from '../utils/pagination'
import { NotFoundError } from '../utils/errors'

const financeRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const readAccess  = [authenticate, authorize('permFinancier', 'lecture')]
  const writeAccess = [authenticate, authorize('permFinancier', 'partiel')]

  // ─── Paiements Douane ─────────────────────────────────────

  fastify.get('/paiements-douane', { preHandler: readAccess }, async (request, reply) => {
    const q = z.object({
      page:      z.coerce.number().default(1),
      limit:     z.coerce.number().default(20),
      statut:    z.string().optional(),
      type:      z.string().optional(),
      dossierId: z.string().uuid().optional(),
    }).parse(request.query)

    const where: Record<string, unknown> = {}
    if (q.statut)    where.statut    = q.statut
    if (q.type)      where.type      = q.type
    if (q.dossierId) where.dossierId = q.dossierId

    const { skip, take, page, limit } = buildPagination(q.page, q.limit)
    const [data, total] = await Promise.all([
      prisma.paiementDouane.findMany({
        where,
        skip,
        take,
        orderBy: { datePaiement: 'desc' },
        include: { dossier: { select: { numero: true, client: true } } },
      }),
      prisma.paiementDouane.count({ where }),
    ])
    return reply.send(paginate(data, total, page, limit))
  })

  fastify.post('/paiements-douane', { preHandler: writeAccess }, async (request, reply) => {
    const body = z.object({
      dossierId:    z.string().uuid(),
      type:         z.enum(['droits', 'taxes', 'redevances', 'penalite']),
      montant:      z.number().positive(),
      datePaiement: z.string().datetime(),
      statut:       z.enum(['paye', 'en_attente', 'en_retard']).default('en_attente'),
      reference:    z.string(),
    }).parse(request.body)

    const paiement = await prisma.paiementDouane.create({
      data: { ...body, datePaiement: new Date(body.datePaiement) },
    })
    return reply.code(201).send(paiement)
  })

  fastify.patch('/paiements-douane/:id', { preHandler: writeAccess }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body   = z.object({
      statut: z.enum(['paye', 'en_attente', 'en_retard']).optional(),
      montant: z.number().positive().optional(),
    }).parse(request.body)

    const existing = await prisma.paiementDouane.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('Paiement douane', id)

    return reply.send(await prisma.paiementDouane.update({ where: { id }, data: body }))
  })

  // ─── Paiements Compagnie ──────────────────────────────────

  fastify.get('/paiements-compagnie', { preHandler: readAccess }, async (request, reply) => {
    const q = z.object({
      page:      z.coerce.number().default(1),
      limit:     z.coerce.number().default(20),
      statut:    z.string().optional(),
      type:      z.string().optional(),
      compagnie: z.string().optional(),
      dossierId: z.string().uuid().optional(),
    }).parse(request.query)

    const where: Record<string, unknown> = {}
    if (q.statut)    where.statut    = q.statut
    if (q.type)      where.type      = q.type
    if (q.compagnie) where.compagnie = q.compagnie
    if (q.dossierId) where.dossierId = q.dossierId

    const { skip, take, page, limit } = buildPagination(q.page, q.limit)
    const [data, total] = await Promise.all([
      prisma.paiementCompagnie.findMany({
        where,
        skip,
        take,
        orderBy: { datePaiement: 'desc' },
        include: { dossier: { select: { numero: true, client: true } } },
      }),
      prisma.paiementCompagnie.count({ where }),
    ])
    return reply.send(paginate(data, total, page, limit))
  })

  fastify.post('/paiements-compagnie', { preHandler: writeAccess }, async (request, reply) => {
    const body = z.object({
      dossierId:    z.string().uuid(),
      compagnie:    z.enum(['MSC', 'COSCO', 'MAERSK', 'CMA_CGM']),
      type:         z.enum(['surestaries', 'frais_portuaires', 'manutention', 'terminal']),
      montant:      z.number().positive(),
      datePaiement: z.string().datetime(),
      statut:       z.enum(['paye', 'en_attente', 'en_retard']).default('en_attente'),
      reference:    z.string(),
    }).parse(request.body)

    const paiement = await prisma.paiementCompagnie.create({
      data: { ...body, datePaiement: new Date(body.datePaiement) },
    })
    return reply.code(201).send(paiement)
  })

  fastify.patch('/paiements-compagnie/:id', { preHandler: writeAccess }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body   = z.object({
      statut: z.enum(['paye', 'en_attente', 'en_retard']).optional(),
      montant: z.number().positive().optional(),
    }).parse(request.body)

    const existing = await prisma.paiementCompagnie.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('Paiement compagnie', id)

    return reply.send(await prisma.paiementCompagnie.update({ where: { id }, data: body }))
  })

  // ─── Virements (vue globale) ──────────────────────────────

  fastify.get('/virements', { preHandler: readAccess }, async (request, reply) => {
    const q = z.object({
      page:   z.coerce.number().default(1),
      limit:  z.coerce.number().default(20),
      statut: z.string().optional(),
    }).parse(request.query)

    const where: Record<string, unknown> = {}
    if (q.statut) where.statut = q.statut

    const { skip, take, page, limit } = buildPagination(q.page, q.limit)
    const [data, total] = await Promise.all([
      prisma.virement.findMany({
        where,
        skip,
        take,
        orderBy: { dateVirement: 'desc' },
        include: {
          dossier:     { select: { numero: true, client: true } },
          responsable: { select: { nom: true } },
        },
      }),
      prisma.virement.count({ where }),
    ])
    return reply.send(paginate(data, total, page, limit))
  })

  // ─── Statistiques financières ─────────────────────────────

  fastify.get('/stats', { preHandler: readAccess }, async (request, reply) => {
    const [
      totalTaxes,
      totalHonoraires,
      totalRedevances,
      virementsPendants,
      paiementsEnRetard,
      totalDI,
    ] = await Promise.all([
      prisma.dossier.aggregate({ _sum: { montantTaxes: true } }),
      prisma.dossier.aggregate({ _sum: { montantHonoraires: true } }),
      prisma.dossier.aggregate({ _sum: { montantRedevances: true } }),
      prisma.virement.count({ where: { statut: 'en_attente' } }),
      prisma.paiementDouane.count({ where: { statut: 'en_retard' } }),
      prisma.dossier.aggregate({ _sum: { montantDI: true } }),
    ])

    const totalDIUtilise = await prisma.paiementDouane.aggregate({ _sum: { montant: true } })

    return reply.send({
      totalTaxes:        totalTaxes._sum.montantTaxes ?? 0,
      totalHonoraires:   totalHonoraires._sum.montantHonoraires ?? 0,
      totalRedevances:   totalRedevances._sum.montantRedevances ?? 0,
      virementsPendants,
      paiementsEnRetard,
      totalDI:           totalDI._sum.montantDI ?? 0,
      totalDIUtilise:    totalDIUtilise._sum.montant ?? 0,
    })
  })

  // ─── Factures (vue globale) ───────────────────────────────

  fastify.get('/factures', { preHandler: readAccess }, async (request, reply) => {
    const q = z.object({
      page:   z.coerce.number().default(1),
      limit:  z.coerce.number().default(20),
      type:   z.string().optional(),
    }).parse(request.query)

    const where: Record<string, unknown> = {}
    if (q.type) where.type = q.type

    const { skip, take, page, limit } = buildPagination(q.page, q.limit)
    const [data, total] = await Promise.all([
      prisma.facture.findMany({
        where,
        skip,
        take,
        orderBy: { dateFacture: 'desc' },
        include: { dossier: { select: { numero: true, client: true } } },
      }),
      prisma.facture.count({ where }),
    ])
    return reply.send(paginate(data, total, page, limit))
  })

  fastify.patch('/factures/:id', { preHandler: writeAccess }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body = z.object({
      type: z.enum(['proforma', 'validee', 'reglee']).optional(),
      datePaiement: z.string().datetime().optional(),
    }).parse(request.body)

    const existing = await prisma.facture.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('Facture', id)

    return reply.send(await prisma.facture.update({
      where: { id },
      data: { ...body, datePaiement: body.datePaiement ? new Date(body.datePaiement) : undefined },
    }))
  })
}

export default financeRoutes
