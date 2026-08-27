import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../config/prisma'
import { authenticate } from '../middleware/authenticate'
import { authorize } from '../middleware/authorize'
import { buildPagination, paginate } from '../utils/pagination'
import { NotFoundError, ForbiddenError } from '../utils/errors'

const codageRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const readAccess     = [authenticate, authorize('permDossier', 'lecture')]
  const writeAccess    = [authenticate, authorize('permDossier', 'partiel')]
  const validateAccess = [authenticate, authorize('permValidation', 'complet')]

  // GET /api/codage — liste des états de codage
  fastify.get('/', { preHandler: readAccess }, async (request, reply) => {
    const q = z.object({
      page:      z.coerce.number().default(1),
      limit:     z.coerce.number().default(20),
      statut:    z.string().optional(),
      dossierId: z.string().uuid().optional(),
    }).parse(request.query)

    const where: Record<string, unknown> = {}
    if (q.statut)    where.statut    = q.statut
    if (q.dossierId) where.dossierId = q.dossierId

    const { skip, take, page, limit } = buildPagination(q.page, q.limit)
    const [data, total] = await Promise.all([
      prisma.etatCodage.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          dossier:   { select: { numero: true, client: true, marchandise: true } },
          soumisPar: { select: { nom: true } },
          validePar: { select: { nom: true } },
        },
      }),
      prisma.etatCodage.count({ where }),
    ])
    return reply.send(paginate(data, total, page, limit))
  })

  // GET /api/codage/:id
  fastify.get('/:id', { preHandler: readAccess }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const ec = await prisma.etatCodage.findUnique({
      where: { id },
      include: {
        dossier:   { select: { numero: true, client: true, marchandise: true, compagnie: true } },
        soumisPar: { select: { id: true, nom: true } },
        validePar: { select: { id: true, nom: true } },
      },
    })
    if (!ec) throw new NotFoundError('État de codage', id)
    return reply.send(ec)
  })

  // POST /api/codage — créer un état de codage (brouillon)
  fastify.post('/', { preHandler: writeAccess }, async (request, reply) => {
    const body = z.object({
      dossierId:    z.string().uuid(),
      codeDouanier: z.string().min(4).max(20),
      designation:  z.string().min(3),
      tauxDroits:   z.number().min(0).max(100),
      tauxTVA:      z.number().min(0).max(100),
      valeurCIF:    z.number().positive(),
    }).parse(request.body)

    const montantDroits = (body.valeurCIF * body.tauxDroits) / 100
    const montantTVA    = ((body.valeurCIF + montantDroits) * body.tauxTVA) / 100

    const ec = await prisma.etatCodage.create({
      data: {
        ...body,
        montantDroits,
        montantTVA,
        statut: 'brouillon',
      },
    })
    return reply.code(201).send(ec)
  })

  // PATCH /api/codage/:id — modifier un brouillon
  fastify.patch('/:id', { preHandler: writeAccess }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body   = z.object({
      codeDouanier: z.string().optional(),
      designation:  z.string().optional(),
      tauxDroits:   z.number().min(0).max(100).optional(),
      tauxTVA:      z.number().min(0).max(100).optional(),
      valeurCIF:    z.number().positive().optional(),
    }).parse(request.body)

    const existing = await prisma.etatCodage.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('État de codage', id)
    if (existing.statut !== 'brouillon') {
      return reply.code(422).send({ error: 'NON_EDITABLE', message: 'Seul un brouillon peut être modifié' })
    }

    const valeurCIF   = body.valeurCIF   ?? Number(existing.valeurCIF)
    const tauxDroits  = body.tauxDroits  ?? Number(existing.tauxDroits)
    const tauxTVA     = body.tauxTVA     ?? Number(existing.tauxTVA)
    const montantDroits = (valeurCIF * tauxDroits) / 100
    const montantTVA    = ((valeurCIF + montantDroits) * tauxTVA) / 100

    return reply.send(await prisma.etatCodage.update({
      where: { id },
      data: { ...body, montantDroits, montantTVA },
    }))
  })

  // POST /api/codage/:id/soumettre — passer en statut "soumis"
  fastify.post('/:id/soumettre', { preHandler: writeAccess }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const existing = await prisma.etatCodage.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('État de codage', id)
    if (existing.statut !== 'brouillon') {
      return reply.code(422).send({ error: 'DEJA_SOUMIS', message: 'Cet état a déjà été soumis' })
    }

    const userId = (request.user as any).id
    const ec = await prisma.etatCodage.update({
      where: { id },
      data: { statut: 'soumis', soumisParId: userId, soumisAt: new Date() },
    })

    // Notification pour la validation
    await prisma.notification.createMany({
      data: await prisma.user.findMany({
        where: { profil: 'validation', actif: true },
        select: { id: true },
      }).then(users => users.map(u => ({
        userId:    u.id,
        type:      'action_requise' as const,
        titre:     'État de codage à valider',
        message:   `Un état de codage pour le dossier ${existing.dossierId} est en attente de validation`,
        dossierId: existing.dossierId,
        actionUrl: `/codage/${id}`,
      }))),
    })

    return reply.send(ec)
  })

  // POST /api/codage/:id/valider — validation par Mme ODETTE
  fastify.post('/:id/valider', { preHandler: validateAccess }, async (request, reply) => {
    const { id }   = z.object({ id: z.string().uuid() }).parse(request.params)
    const { commentaire } = z.object({ commentaire: z.string().optional() }).parse(request.body)

    const existing = await prisma.etatCodage.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('État de codage', id)
    if (existing.statut !== 'soumis') {
      return reply.code(422).send({ error: 'NON_SOUMIS', message: 'Seul un état soumis peut être validé' })
    }

    const userId = (request.user as any).id
    return reply.send(await prisma.etatCodage.update({
      where: { id },
      data: {
        statut:               'valide',
        valideParId:          userId,
        valideAt:             new Date(),
        commentaireValidation: commentaire,
      },
    }))
  })

  // POST /api/codage/:id/rejeter — rejeter un état soumis
  fastify.post('/:id/rejeter', { preHandler: validateAccess }, async (request, reply) => {
    const { id }   = z.object({ id: z.string().uuid() }).parse(request.params)
    const { commentaire } = z.object({ commentaire: z.string().min(5) }).parse(request.body)

    const existing = await prisma.etatCodage.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('État de codage', id)
    if (existing.statut !== 'soumis') {
      return reply.code(422).send({ error: 'NON_SOUMIS', message: 'Seul un état soumis peut être rejeté' })
    }

    const userId = (request.user as any).id
    return reply.send(await prisma.etatCodage.update({
      where: { id },
      data: {
        statut:               'rejete',
        valideParId:          userId,
        valideAt:             new Date(),
        commentaireValidation: commentaire,
      },
    }))
  })

  // DELETE /api/codage/:id — supprimer un brouillon
  fastify.delete('/:id', { preHandler: writeAccess }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const existing = await prisma.etatCodage.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('État de codage', id)
    if (existing.statut !== 'brouillon') {
      return reply.code(422).send({ error: 'NON_EDITABLE', message: 'Seule une position en brouillon peut être supprimée' })
    }
    await prisma.etatCodage.delete({ where: { id } })
    return reply.code(204).send()
  })

  // GET /api/codage/stats/resume
  fastify.get('/stats/resume', { preHandler: readAccess }, async (request, reply) => {
    const stats = await prisma.etatCodage.groupBy({
      by: ['statut'],
      _count: true,
      _sum: { montantDroits: true, montantTVA: true },
    })
    return reply.send(stats.map(s => ({
      statut: s.statut,
      count:  s._count,
      totalDroits: s._sum.montantDroits ?? 0,
      totalTVA:    s._sum.montantTVA ?? 0,
    })))
  })
}

export default codageRoutes
