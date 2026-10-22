import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '../config/prisma'
import { authenticate } from '../middleware/authenticate'
import { authorize, requireSupervisor } from '../middleware/authorize'
import { NotFoundError } from '../utils/errors'
import { buildPagination, paginate } from '../utils/pagination'
import { logActivity } from '../utils/audit'
import {
  SAFE_USER_SELECT, assertCanGrantProfil, assertNotLastDG, compagnieEnum, createUser, createUserSchema,
  permissionEnum, profilEnum, supprimerCompte, EMAIL_COMPTE_ARCHIVE,
} from '../services/users'

const updateEmployeSchema = z.object({
  nom:       z.string().min(2).optional(),
  role:      z.string().optional(),
  site:      z.enum(['Douala', 'Kribi']).optional(),
  telephone: z.string().optional(),
  profil:    profilEnum.optional(),
  actif:     z.boolean().optional(),
  compagniesAssignees: z.array(compagnieEnum).optional(),
  permDossier:        permissionEnum.optional(),
  permValidation:     permissionEnum.optional(),
  permFinancier:      permissionEnum.optional(),
  permRapports:       permissionEnum.optional(),
  permAdministration: permissionEnum.optional(),
})

/** Champs qui relèvent de l'attribution des rôles (superviseurs uniquement). */
const CHAMPS_ROLE = [
  'profil', 'actif', 'compagniesAssignees', 'permDossier', 'permValidation',
  'permFinancier', 'permRapports', 'permAdministration',
] as const

const employesRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {

  // GET /api/employes
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const q = z.object({
      page: z.coerce.number().default(1),
      limit: z.coerce.number().default(100),
      site: z.string().optional(),
      profil: z.string().optional(),
      actif: z.enum(['true', 'false']).optional(),
    }).parse(request.query)

    const where: Record<string, unknown> = { email: { not: EMAIL_COMPTE_ARCHIVE } }
    if (q.site)   where.site  = q.site
    if (q.profil) where.profil = q.profil
    if (q.actif !== undefined) where.actif = q.actif === 'true'

    const { skip, take, page, limit } = buildPagination(q.page, q.limit)
    const [data, total] = await Promise.all([
      prisma.user.findMany({ where, skip, take, orderBy: { nom: 'asc' }, select: SAFE_USER_SELECT }),
      prisma.user.count({ where }),
    ])

    return reply.send(paginate(data, total, page, limit))
  })

  // POST /api/employes — créer un compte (Direction / Exploitation)
  fastify.post('/', { preHandler: [authenticate, requireSupervisor] }, async (request, reply) => {
    const body = createUserSchema.parse(request.body)
    const user = await createUser(request.user, body)
    await logActivity(request.user.id, 'COMPTE_CREE', 'user', user.id, `${user.nom} (${user.profil})`)
    return reply.code(201).send(user)
  })

  // GET /api/employes/:id
  fastify.get('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const user = await prisma.user.findUnique({ where: { id }, select: SAFE_USER_SELECT })
    if (!user) throw new NotFoundError('Employé', id)
    return reply.send(user)
  })

  // PATCH /api/employes/:id
  fastify.patch('/:id', { preHandler: [authenticate, authorize('permAdministration', 'partiel')] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body   = updateEmployeSchema.parse(request.body)
    const actor  = request.user

    const existing = await prisma.user.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('Employé', id)

    const touchesRole = CHAMPS_ROLE.some(k => body[k] !== undefined)
    if (touchesRole) {
      assertCanGrantProfil(actor, body.profil ?? existing.profil)
      if (existing.profil === 'dg' && actor.profil !== 'dg') {
        return reply.code(403).send({ error: 'FORBIDDEN', message: 'Seul le Directeur Général peut modifier un compte DG' })
      }
      if (id === actor.id && ((body.profil && body.profil !== existing.profil) || body.actif === false)) {
        return reply.code(422).send({ error: 'AUTO_MODIFICATION', message: 'Vous ne pouvez pas modifier votre propre rôle ni désactiver votre compte' })
      }
      if ((body.profil && body.profil !== 'dg') || body.actif === false) await assertNotLastDG(id)
    }

    const updated = await prisma.user.update({ where: { id }, data: body, select: SAFE_USER_SELECT })
    await logActivity(actor.id, touchesRole ? 'ROLE_ATTRIBUE' : 'EMPLOYE_MODIFIE', 'user', id, existing.nom, body)
    return reply.send(updated)
  })

  // DELETE /api/employes/:id (désactivation douce)
  fastify.delete('/:id', { preHandler: [authenticate, requireSupervisor] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    if (id === request.user.id) {
      return reply.code(400).send({ error: 'BAD_REQUEST', message: 'Impossible de désactiver son propre compte' })
    }
    const target = await prisma.user.findUnique({ where: { id } })
    if (!target) throw new NotFoundError('Employé', id)
    if (target.profil === 'dg' && request.user.profil !== 'dg') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Seul le Directeur Général peut désactiver un compte DG' })
    }
    await assertNotLastDG(id)

    await prisma.user.update({ where: { id }, data: { actif: false } })
    await prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } })
    await logActivity(request.user.id, 'COMPTE_DESACTIVE', 'user', id, target.nom)
    return reply.code(204).send()
  })

  // POST /api/employes/:id/supprimer — suppression définitive (dossiers en cours transmis au successeur)
  fastify.post('/:id/supprimer', { preHandler: [authenticate, requireSupervisor] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const { successeurId } = z.object({ successeurId: z.string().uuid().optional() }).parse(request.body ?? {})
    if (id === request.user.id) {
      return reply.code(400).send({ error: 'BAD_REQUEST', message: 'Impossible de supprimer son propre compte' })
    }
    const target = await prisma.user.findUnique({ where: { id } })
    if (!target) throw new NotFoundError('Employé', id)
    if (target.profil === 'dg' && request.user.profil !== 'dg') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Seul le Directeur Général peut supprimer un compte DG' })
    }
    await assertNotLastDG(id)
    const r = await supprimerCompte(id, successeurId ?? request.user.id)
    await logActivity(request.user.id, 'COMPTE_SUPPRIME', 'user', id,
      `${r.nom} — ${r.transmis} élément(s) en cours transmis à ${r.successeur}`)
    return reply.send(r)
  })

  // POST /api/employes/:id/reactiver
  fastify.post('/:id/reactiver', { preHandler: [authenticate, requireSupervisor] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const target = await prisma.user.findUnique({ where: { id } })
    if (!target) throw new NotFoundError('Employé', id)
    const updated = await prisma.user.update({ where: { id }, data: { actif: true }, select: SAFE_USER_SELECT })
    await logActivity(request.user.id, 'COMPTE_REACTIVE', 'user', id, target.nom)
    return reply.send(updated)
  })

  // GET /api/employes/:id/performance
  fastify.get('/:id/performance', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)

    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, nom: true, role: true, site: true, profil: true } })
    if (!user) throw new NotFoundError('Employé', id)

    const [dossiers, taches] = await Promise.all([
      prisma.dossier.findMany({
        where: { responsableId: id },
        select: { id: true, status: true, dateLimiteSortie: true, dateCreation: true },
      }),
      prisma.sousEtapeDossier.findMany({
        where: { responsableId: id },
        select: { statut: true, deadline: true, completedAt: true },
      }),
    ])

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
      tachesTotal:    taches.length,
      tachesValidees: taches.filter(t => t.statut === 'valide').length,
      tachesOuvertes: taches.filter(t => t.statut === 'todo' || t.statut === 'en_cours').length,
      tachesEnRetard: taches.filter(t => t.statut !== 'valide' && t.deadline && t.deadline < now).length,
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

  // PATCH /api/employes/:id/reset-password (Direction / Exploitation)
  fastify.patch('/:id/reset-password', { preHandler: [authenticate, requireSupervisor] }, async (request, reply) => {
    const { id }          = z.object({ id: z.string().uuid() }).parse(request.params)
    const { newPassword } = z.object({ newPassword: z.string().min(8) }).parse(request.body)

    const existing = await prisma.user.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('Employé', id)
    if (existing.profil === 'dg' && request.user.profil !== 'dg') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Seul le Directeur Général peut réinitialiser un compte DG' })
    }

    const passwordHash = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({ where: { id }, data: { passwordHash } })

    // Révoquer les tokens actifs
    await prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    await logActivity(request.user.id, 'MOT_DE_PASSE_REINITIALISE', 'user', id, existing.nom)

    return reply.code(204).send()
  })
}

export default employesRoutes
