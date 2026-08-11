import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../config/prisma'
import { authenticate } from '../middleware/authenticate'
import { authorize } from '../middleware/authorize'
import { buildPagination, paginate } from '../utils/pagination'
import { NotFoundError } from '../utils/errors'
import { differenceInDays, isPast, isAfter } from 'date-fns'

// ── Délais SLA SGS par type de vérification (jours ouvrés) ──
const SLA_SGS: Record<string, number> = {
  documentaire:      3,
  pre_embarquement:  5,
  a_destination:     7,
  physique_complet: 10,
}

const sgsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const readAccess  = [authenticate, authorize('permDossier', 'lecture')]
  const writeAccess = [authenticate, authorize('permDossier', 'partiel')]

  // GET /api/sgs — liste des soumissions SGS
  fastify.get('/', { preHandler: readAccess }, async (request, reply) => {
    const q = z.object({
      page:      z.coerce.number().default(1),
      limit:     z.coerce.number().default(20),
      statut:    z.string().optional(),
      type:      z.string().optional(),
      dossierId: z.string().uuid().optional(),
      enAttente: z.coerce.boolean().optional(),
    }).parse(request.query)

    const where: Record<string, unknown> = {}
    if (q.statut)    where.statut           = q.statut
    if (q.type)      where.typeVerification  = q.type
    if (q.dossierId) where.dossierId         = q.dossierId
    if (q.enAttente) where.statut = { notIn: ['adv_emise', 'rejete'] }

    const { skip, take, page, limit } = buildPagination(q.page, q.limit)
    const [data, total] = await Promise.all([
      prisma.soumissionSGS.findMany({
        where, skip, take,
        orderBy: { dateDepot: 'desc' },
        include: {
          dossier:   { select: { numero: true, client: true, conteneur: true, compagnie: true } },
          soumisPar: { select: { nom: true } },
        },
      }),
      prisma.soumissionSGS.count({ where }),
    ])

    const now = new Date()
    const enriched = data.map(s => {
      const slaJours     = SLA_SGS[s.typeVerification] ?? 5
      const enRetard     = !['adv_emise', 'rejete'].includes(s.statut) &&
                           isPast(new Date(s.dateDepot.getTime() + slaJours * 86_400_000))
      const joursEcoules = differenceInDays(now, s.dateDepot)
      return { ...s, slaJours, enRetard, joursEcoules }
    })

    return reply.send(paginate(enriched, total, page, limit))
  })

  // GET /api/sgs/en-attente — soumissions non finalisées avec alerte retard
  fastify.get('/en-attente', { preHandler: readAccess }, async (request, reply) => {
    const soumissions = await prisma.soumissionSGS.findMany({
      where: { statut: { notIn: ['adv_emise', 'rejete'] } },
      orderBy: { dateDepot: 'asc' },
      include: {
        dossier: {
          select: {
            numero: true, client: true, conteneur: true, compagnie: true, site: true,
            responsable: { select: { nom: true } },
          },
        },
        soumisPar: { select: { nom: true } },
      },
    })

    const now = new Date()
    return reply.send(soumissions.map(s => {
      const slaJours     = SLA_SGS[s.typeVerification] ?? 5
      const dateLimiteSLA = new Date(s.dateDepot.getTime() + slaJours * 86_400_000)
      const enRetard     = isPast(dateLimiteSLA)
      const joursRetard  = enRetard ? differenceInDays(now, dateLimiteSLA) : 0
      const joursRestants = !enRetard ? differenceInDays(dateLimiteSLA, now) : 0
      return { ...s, slaJours, dateLimiteSLA, enRetard, joursRetard, joursRestants }
    }))
  })

  // GET /api/sgs/:id
  fastify.get('/:id', { preHandler: readAccess }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const sgs = await prisma.soumissionSGS.findUnique({
      where: { id },
      include: {
        dossier: {
          select: {
            id: true, numero: true, client: true, conteneur: true,
            compagnie: true, site: true, status: true,
            responsable: { select: { nom: true, email: true } },
          },
        },
        soumisPar: { select: { id: true, nom: true, role: true } },
      },
    })
    if (!sgs) throw new NotFoundError('Soumission SGS', id)

    const now       = new Date()
    const slaJours  = SLA_SGS[sgs.typeVerification] ?? 5
    const dateLimiteSLA = new Date(sgs.dateDepot.getTime() + slaJours * 86_400_000)
    const enRetard  = !['adv_emise', 'rejete'].includes(sgs.statut) && isPast(dateLimiteSLA)
    return reply.send({ ...sgs, slaJours, dateLimiteSLA, enRetard, joursEcoules: differenceInDays(now, sgs.dateDepot) })
  })

  // POST /api/sgs — créer une soumission SGS
  fastify.post('/', { preHandler: writeAccess }, async (request, reply) => {
    const body = z.object({
      dossierId:        z.string().uuid(),
      typeVerification: z.enum(['pre_embarquement', 'a_destination', 'documentaire', 'physique_complet']),
      dateDepot:        z.string().datetime(),
      datePrevueRetour: z.string().datetime().optional(),
      valeurDeclaree:   z.number().positive().optional(),
      observations:     z.string().optional(),
      documentsJoints:  z.array(z.string()).default([]),
    }).parse(request.body)

    const dossier = await prisma.dossier.findUnique({ where: { id: body.dossierId } })
    if (!dossier) throw new NotFoundError('Dossier', body.dossierId)

    const count     = await prisma.soumissionSGS.count()
    const reference = `SGS-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`

    const slaJours          = SLA_SGS[body.typeVerification] ?? 5
    const dateDepot          = new Date(body.dateDepot)
    const datePrevueRetour   = body.datePrevueRetour
      ? new Date(body.datePrevueRetour)
      : new Date(dateDepot.getTime() + slaJours * 86_400_000)

    const userId = (request.user as any).id
    const sgs = await prisma.soumissionSGS.create({
      data: {
        ...body,
        reference,
        dateDepot,
        datePrevueRetour,
        soumisParId: userId,
      },
      include: {
        dossier:   { select: { numero: true, client: true } },
        soumisPar: { select: { nom: true } },
      },
    })

    // Audit sur le dossier
    await prisma.auditEntry.create({
      data: {
        dossierId: body.dossierId,
        auteurId:  userId,
        action:    'SGS_SOUMISSION',
        details:   `Soumission SGS ${reference} — ${body.typeVerification}`,
      },
    })

    return reply.code(201).send({ ...sgs, slaJours, datePrevueRetour })
  })

  // PATCH /api/sgs/:id — mettre à jour (statut, résultat, ADV)
  fastify.patch('/:id', { preHandler: writeAccess }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body   = z.object({
      statut:          z.enum(['deposee', 'en_cours_inspection', 'inspection_physique', 'resultat_disponible', 'adv_emise', 'rejete']).optional(),
      dateRetour:      z.string().datetime().optional(),
      numeroADV:       z.string().optional(),
      resultat:        z.string().optional(),
      observations:    z.string().optional(),
      documentsJoints: z.array(z.string()).optional(),
    }).parse(request.body)

    const existing = await prisma.soumissionSGS.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('Soumission SGS', id)

    const updated = await prisma.soumissionSGS.update({
      where: { id },
      data: {
        ...body,
        dateRetour: body.dateRetour ? new Date(body.dateRetour) : undefined,
      },
    })

    // Audit si changement de statut important
    if (body.statut && ['adv_emise', 'rejete'].includes(body.statut)) {
      await prisma.auditEntry.create({
        data: {
          dossierId: existing.dossierId,
          auteurId:  (request.user as any).id,
          action:    body.statut === 'adv_emise' ? 'SGS_ADV_EMISE' : 'SGS_REJETE',
          details:   body.statut === 'adv_emise'
            ? `ADV SGS obtenue — N° ${body.numeroADV}`
            : `SGS rejeté — ${body.observations ?? 'sans motif'}`,
        },
      })
    }

    return reply.send(updated)
  })

  // POST /api/sgs/:id/escalader — signaler un retard SGS (crée alerte)
  fastify.post('/:id/escalader', { preHandler: writeAccess }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const { message } = z.object({ message: z.string().min(5) }).parse(request.body)

    const sgs = await prisma.soumissionSGS.findUnique({ where: { id } })
    if (!sgs) throw new NotFoundError('Soumission SGS', id)

    const alerte = await prisma.alerte.create({
      data: {
        type:      'blocage',
        severity:  'critical',
        message:   `SGS ${sgs.reference} : ${message}`,
        dossierId: sgs.dossierId,
      },
    })

    return reply.code(201).send({ alerte, message: 'Escalade enregistrée' })
  })

  // GET /api/sgs/stats/resume — tableau de bord SGS
  fastify.get('/stats/resume', { preHandler: readAccess }, async (request, reply) => {
    const [parStatut, parType, enAttente] = await Promise.all([
      prisma.soumissionSGS.groupBy({ by: ['statut'], _count: true }),
      prisma.soumissionSGS.groupBy({ by: ['typeVerification'], _count: true }),
      prisma.soumissionSGS.findMany({
        where: { statut: { notIn: ['adv_emise', 'rejete'] } },
        select: { typeVerification: true, dateDepot: true },
      }),
    ])

    const now = new Date()
    const enRetard = enAttente.filter(s => {
      const slaJours = SLA_SGS[s.typeVerification] ?? 5
      return isPast(new Date(s.dateDepot.getTime() + slaJours * 86_400_000))
    }).length

    return reply.send({
      parStatut: parStatut.map(s => ({ statut: s.statut, count: s._count })),
      parType:   parType.map(t => ({ type: t.typeVerification, count: t._count })),
      enAttente: enAttente.length,
      enRetard,
    })
  })
}

export default sgsRoutes
