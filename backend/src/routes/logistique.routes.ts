/**
 * Logistique transport : véhicules (camions), chauffeurs et transports de conteneurs (TC) datés.
 * Lecture des chauffeurs / camions ouverte à tous (gate-pass Kribi) ; gestion réservée au module Logistique.
 */
import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../config/prisma'
import { authenticate } from '../middleware/authenticate'
import { requireModule } from '../middleware/authorize'
import { logAudit } from '../utils/audit'
import { NotFoundError } from '../utils/errors'
import { buildPagination, paginate } from '../utils/pagination'

const chauffeurSchema = z.object({
  nom:          z.string().trim().min(2).max(255),
  telephone:    z.string().trim().min(6).max(50),
  numeroPermis: z.string().max(50).nullable().optional(),
  cni:          z.string().max(50).nullable().optional(),
  transporteur: z.string().max(255).nullable().optional(),
  actif:        z.boolean().optional(),
  notes:        z.string().nullable().optional(),
})

const camionSchema = z.object({
  immatriculation: z.string().trim().min(3).max(50).transform(s => s.toUpperCase()),
  marque:          z.string().max(100).nullable().optional(),
  typeVehicule:    z.enum(['porte_conteneur', 'plateau', 'benne', 'utilitaire', 'autre']).optional(),
  capacite:        z.string().max(20).nullable().optional(),
  transporteur:    z.string().max(255).nullable().optional(),
  actif:           z.boolean().optional(),
  notes:           z.string().nullable().optional(),
})

const STATUTS = ['planifie', 'en_route', 'livre', 'retour_vide', 'annule'] as const

const transportSchema = z.object({
  dossierId:      z.string().uuid().nullable().optional(),
  conteneur:      z.string().trim().min(3).max(100).transform(s => s.toUpperCase()),
  camionId:       z.string().uuid().nullable().optional(),
  chauffeurId:    z.string().uuid().nullable().optional(),
  dateEnlevement: z.string().datetime(),
  dateLivraison:  z.string().datetime().nullable().optional(),
  origine:        z.string().max(255).nullable().optional(),
  destination:    z.string().trim().min(2).max(255),
  /** Trajet aller-retour (ex. Douala ⇄ Kribi) */
  allerRetour:    z.boolean().optional(),
  statut:         z.enum(STATUTS).optional(),
  notes:          z.string().nullable().optional(),
  /** Obligatoire pour passer le TC en « vide retourné » */
  justificationRetourVide: z.string().trim().max(1000).nullable().optional(),
})

const includeTransport = {
  dossier:   { select: { id: true, numero: true, client: true, compagnie: true } },
  camion:    { select: { id: true, immatriculation: true, marque: true, capacite: true } },
  chauffeur: { select: { id: true, nom: true, telephone: true } },
  createdBy: { select: { nom: true } },
} satisfies Prisma.TransportInclude

const logistiqueRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const gestion = [authenticate, requireModule('logistique')]

  // ── Chauffeurs ─────────────────────────────────────────────────────────
  fastify.get('/chauffeurs', { preHandler: [authenticate] }, async (request, reply) => {
    const q = z.object({ actifs: z.enum(['true', 'false']).optional(), q: z.string().optional() }).parse(request.query)
    return reply.send(await prisma.chauffeur.findMany({
      where: {
        ...(q.actifs ? { actif: q.actifs === 'true' } : {}),
        ...(q.q ? { OR: [{ nom: { contains: q.q, mode: 'insensitive' } }, { telephone: { contains: q.q } }] } : {}),
      },
      orderBy: [{ actif: 'desc' }, { nom: 'asc' }],
      include: { _count: { select: { transports: true } } },
    }))
  })

  fastify.post('/chauffeurs', { preHandler: gestion }, async (request, reply) => {
    const body = chauffeurSchema.parse(request.body)
    return reply.code(201).send(await prisma.chauffeur.create({ data: body }))
  })

  fastify.patch('/chauffeurs/:id', { preHandler: gestion }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body = chauffeurSchema.partial().parse(request.body)
    if (!(await prisma.chauffeur.findUnique({ where: { id } }))) throw new NotFoundError('Chauffeur', id)
    return reply.send(await prisma.chauffeur.update({ where: { id }, data: body }))
  })

  // ── Véhicules (camions) ────────────────────────────────────────────────
  fastify.get('/camions', { preHandler: [authenticate] }, async (request, reply) => {
    const q = z.object({ actifs: z.enum(['true', 'false']).optional() }).parse(request.query)
    return reply.send(await prisma.camion.findMany({
      where: q.actifs ? { actif: q.actifs === 'true' } : undefined,
      orderBy: [{ actif: 'desc' }, { immatriculation: 'asc' }],
      include: { _count: { select: { transports: true } } },
    }))
  })

  fastify.post('/camions', { preHandler: gestion }, async (request, reply) => {
    const body = camionSchema.parse(request.body)
    return reply.code(201).send(await prisma.camion.create({ data: body }))
  })

  fastify.patch('/camions/:id', { preHandler: gestion }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body = camionSchema.partial().parse(request.body)
    if (!(await prisma.camion.findUnique({ where: { id } }))) throw new NotFoundError('Véhicule', id)
    return reply.send(await prisma.camion.update({ where: { id }, data: body }))
  })

  // ── Transports de conteneurs ───────────────────────────────────────────
  fastify.get('/transports', { preHandler: gestion }, async (request, reply) => {
    const q = z.object({
      page:        z.coerce.number().default(1),
      limit:       z.coerce.number().default(50),
      statut:      z.string().optional(),
      from:        z.string().datetime().optional(),
      to:          z.string().datetime().optional(),
      q:           z.string().optional(),
      chauffeurId: z.string().uuid().optional(),
      camionId:    z.string().uuid().optional(),
      dossierId:   z.string().uuid().optional(),
    }).parse(request.query)

    const statuts = q.statut?.split(',').filter((s): s is typeof STATUTS[number] => (STATUTS as readonly string[]).includes(s))
    const where: Prisma.TransportWhereInput = {
      ...(statuts?.length ? { statut: { in: statuts } } : {}),
      ...(q.from || q.to ? { dateEnlevement: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}),
      ...(q.chauffeurId ? { chauffeurId: q.chauffeurId } : {}),
      ...(q.camionId ? { camionId: q.camionId } : {}),
      ...(q.dossierId ? { dossierId: q.dossierId } : {}),
      ...(q.q ? { OR: [
        { conteneur: { contains: q.q, mode: 'insensitive' } },
        { destination: { contains: q.q, mode: 'insensitive' } },
        { dossier: { numero: { contains: q.q, mode: 'insensitive' } } },
        { dossier: { client: { contains: q.q, mode: 'insensitive' } } },
      ] } : {}),
    }
    const { skip, take, page, limit } = buildPagination(q.page, q.limit)
    const [data, total] = await Promise.all([
      prisma.transport.findMany({ where, skip, take, orderBy: { dateEnlevement: 'desc' }, include: includeTransport }),
      prisma.transport.count({ where }),
    ])
    return reply.send(paginate(data, total, page, limit))
  })

  fastify.post('/transports', { preHandler: gestion }, async (request, reply) => {
    const body = transportSchema.parse(request.body)
    if (body.dossierId && !(await prisma.dossier.findUnique({ where: { id: body.dossierId }, select: { id: true } }))) {
      throw new NotFoundError('Dossier', body.dossierId)
    }
    const t = await prisma.transport.create({
      data: {
        ...body,
        dateEnlevement: new Date(body.dateEnlevement),
        dateLivraison: body.dateLivraison ? new Date(body.dateLivraison) : null,
        createdById: request.user.id,
      },
      include: includeTransport,
    })
    if (t.dossierId) {
      await logAudit(t.dossierId, request.user.id, 'TRANSPORT',
        `TC ${t.conteneur} — ${t.camion?.immatriculation ?? 'véhicule ?'} / ${t.chauffeur?.nom ?? 'chauffeur ?'} : ${t.origine ?? '?'} ${t.allerRetour ? '<->' : '->'} ${t.destination} le ${t.dateEnlevement.toLocaleDateString('fr-FR')}`)
    }
    return reply.code(201).send(t)
  })

  fastify.patch('/transports/:id', { preHandler: gestion }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body = transportSchema.partial().parse(request.body)
    const existing = await prisma.transport.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('Transport', id)
    const data: Prisma.TransportUncheckedUpdateInput = {
      ...body,
      dateEnlevement: body.dateEnlevement ? new Date(body.dateEnlevement) : undefined,
      dateLivraison: body.dateLivraison === undefined ? undefined : body.dateLivraison ? new Date(body.dateLivraison) : null,
    }
    // TC vide retourné : justification obligatoire
    if (body.statut === 'retour_vide' && existing.statut !== 'retour_vide') {
      const justification = (body.justificationRetourVide ?? existing.justificationRetourVide ?? '').trim()
      if (justification.length < 5) {
        return reply.code(422).send({ error: 'JUSTIFICATION_REQUISE', message: 'Indiquez la justification du retour du TC vide (au moins 5 caractères).' })
      }
      data.justificationRetourVide = justification
      data.dateRetourVide = new Date()
    }
    // Livraison : date renseignée automatiquement si absente
    if (body.statut === 'livre' && !existing.dateLivraison && body.dateLivraison === undefined) data.dateLivraison = new Date()
    const t = await prisma.transport.update({ where: { id }, data, include: includeTransport })
    if (t.dossierId && body.statut && body.statut !== existing.statut) {
      await logAudit(t.dossierId, request.user.id, 'TRANSPORT_STATUT', `TC ${t.conteneur} : ${existing.statut} → ${body.statut}${body.statut === 'retour_vide' ? ` — justification : ${t.justificationRetourVide}` : ''}`)
    }
    return reply.send(t)
  })

  // ── Synthèse ───────────────────────────────────────────────────────────
  fastify.get('/resume', { preHandler: gestion }, async (_request, reply) => {
    const debutJour = new Date(); debutJour.setHours(0, 0, 0, 0)
    const finJour = new Date(debutJour.getTime() + 86_400_000)
    const [parStatut, aujourdhui, chauffeurs, camions] = await Promise.all([
      prisma.transport.groupBy({ by: ['statut'], _count: true }),
      prisma.transport.count({ where: { dateEnlevement: { gte: debutJour, lt: finJour } } }),
      prisma.chauffeur.count({ where: { actif: true } }),
      prisma.camion.count({ where: { actif: true } }),
    ])
    return reply.send({
      parStatut: Object.fromEntries(parStatut.map(s => [s.statut, s._count])),
      aujourdhui, chauffeursActifs: chauffeurs, camionsActifs: camions,
    })
  })
}

export default logistiqueRoutes
