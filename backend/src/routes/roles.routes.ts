/**
 * Attribution des rôles par type de compte.
 *  - Modèles de rôle (profils) : modules + permissions par défaut, éditables par le DG
 *  - Attribution d'un rôle à un compte (Direction / Exploitation)
 *  - Attribution des étapes du workflow aux profils (qui traite quoi)
 */
import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { DossierStatus, Prisma, Profil } from '@prisma/client'
import { prisma } from '../config/prisma'
import { authenticate } from '../middleware/authenticate'
import { requireDG, requireSupervisor } from '../middleware/authorize'
import {
  ALL_MODULES, ALL_PROFILS, DEFAULT_ROLES, MODULES, PERMISSION_KEYS, getRoleTemplate, getRoleTemplates,
  invalidateRoleCache, isSupervisor, loadRoleOverrides,
} from '../config/roles'
import {
  DEFAULT_ATTRIBUTION, SOUS_ETAPES_CONFIG, STATUS_LABELS, STATUS_ORDER, invalidateAttributionCache, loadAttribution,
} from '../services/workflow'
import { SAFE_USER_SELECT, assertCanGrantProfil, assertNotLastDG, compagnieEnum, permissionsSchema, profilEnum } from '../services/users'
import { logActivity } from '../utils/audit'
import { NotFoundError } from '../utils/errors'

const moduleEnum = z.enum(ALL_MODULES as [string, ...string[]])

const rolesRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {

  // GET /api/roles — catalogue des modules et des rôles (avec effectifs)
  fastify.get('/', { preHandler: [authenticate] }, async (_request, reply) => {
    const [templates, counts, overrides] = await Promise.all([
      getRoleTemplates(),
      prisma.user.groupBy({ by: ['profil'], where: { actif: true }, _count: true }),
      loadRoleOverrides(),
    ])
    const effectif = new Map(counts.map(c => [c.profil, c._count]))
    return reply.send({
      modules: Object.entries(MODULES).map(([cle, label]) => ({ cle, label })),
      profils: ALL_PROFILS.map(p => ({
        ...templates[p],
        effectif: effectif.get(p) ?? 0,
        personnalise: !!overrides[p],
      })),
    })
  })

  // PUT /api/roles/:profil — modifier le modèle d'un rôle (DG)
  fastify.put('/:profil', { preHandler: [authenticate, requireDG] }, async (request, reply) => {
    const { profil } = z.object({ profil: profilEnum }).parse(request.params)
    const body = z.object({
      label:       z.string().min(2).max(100).optional(),
      description: z.string().max(500).optional(),
      modules:     z.array(moduleEnum).optional(),
      permissions: permissionsSchema.optional(),
      appliquerAuxComptes: z.boolean().default(false),
    }).parse(request.body)

    if (isSupervisor(profil) && body.permissions) {
      return reply.code(422).send({ error: 'SUPERVISEUR', message: 'Les superviseurs (DG, Exploitation) ont toujours le contrôle total.' })
    }

    const overrides = { ...(await loadRoleOverrides()) }
    const { appliquerAuxComptes, ...patch } = body
    overrides[profil] = { ...(overrides[profil] ?? {}), ...patch } as never
    await prisma.parametre.upsert({
      where:  { cle: 'roles_config' },
      update: { valeur: overrides as Prisma.InputJsonValue, updatedBy: request.user.id },
      create: { cle: 'roles_config', valeur: overrides as Prisma.InputJsonValue, updatedBy: request.user.id, description: 'Modèles de rôles personnalisés' },
    })
    invalidateRoleCache()

    let comptesMisAJour = 0
    if (appliquerAuxComptes && body.permissions) {
      const tpl = await getRoleTemplate(profil)
      const res = await prisma.user.updateMany({ where: { profil }, data: tpl.permissions })
      comptesMisAJour = res.count
    }

    await logActivity(request.user.id, 'ROLE_MODELE_MODIFIE', 'role', profil, `Modèle « ${profil} » modifié`, patch)
    return reply.send({ ...(await getRoleTemplate(profil)), comptesMisAJour })
  })

  // POST /api/roles/:profil/reinitialiser — revenir au modèle par défaut (DG)
  fastify.post('/:profil/reinitialiser', { preHandler: [authenticate, requireDG] }, async (request, reply) => {
    const { profil } = z.object({ profil: profilEnum }).parse(request.params)
    const overrides = { ...(await loadRoleOverrides()) }
    delete overrides[profil]
    await prisma.parametre.upsert({
      where:  { cle: 'roles_config' },
      update: { valeur: overrides as Prisma.InputJsonValue, updatedBy: request.user.id },
      create: { cle: 'roles_config', valeur: overrides as Prisma.InputJsonValue, updatedBy: request.user.id },
    })
    invalidateRoleCache()
    await logActivity(request.user.id, 'ROLE_MODELE_REINITIALISE', 'role', profil)
    return reply.send(await getRoleTemplate(profil))
  })

  // POST /api/roles/attribuer/:userId — attribuer un rôle à un compte (Direction / Exploitation)
  fastify.post('/attribuer/:userId', { preHandler: [authenticate, requireSupervisor] }, async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const body = z.object({
      profil:              profilEnum,
      appliquerModele:     z.boolean().default(true),
      permissions:         permissionsSchema.optional(),
      compagniesAssignees: z.array(compagnieEnum).optional(),
      site:                z.enum(['Douala', 'Kribi']).optional(),
      role:                z.string().min(2).max(255).optional(),
    }).parse(request.body)

    const target = await prisma.user.findUnique({ where: { id: userId } })
    if (!target) throw new NotFoundError('Employé', userId)

    assertCanGrantProfil(request.user, body.profil)
    if (target.profil === 'dg' && request.user.profil !== 'dg') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Seul le Directeur Général peut modifier un compte DG' })
    }
    if (target.id === request.user.id && body.profil !== target.profil) {
      return reply.code(422).send({ error: 'AUTO_ATTRIBUTION', message: 'Vous ne pouvez pas changer votre propre rôle' })
    }
    if (target.profil === 'dg' && body.profil !== 'dg') await assertNotLastDG(target.id)

    const tpl = await getRoleTemplate(body.profil)
    const perms = body.appliquerModele ? { ...tpl.permissions } : {} as Record<string, string>
    if (body.permissions) Object.assign(perms, Object.fromEntries(Object.entries(body.permissions).filter(([, v]) => v)))

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        profil: body.profil,
        ...perms,
        ...(body.compagniesAssignees ? { compagniesAssignees: body.compagniesAssignees } : {}),
        ...(body.site ? { site: body.site } : {}),
        role: body.role ?? (body.profil !== target.profil ? tpl.label : undefined),
      },
      select: SAFE_USER_SELECT,
    })

    await logActivity(request.user.id, 'ROLE_ATTRIBUE', 'user', userId,
      `${target.nom} : ${target.profil} → ${body.profil}`,
      { avant: { profil: target.profil }, apres: { profil: body.profil, ...perms } })

    await prisma.notification.create({
      data: {
        userId, type: 'message', titre: 'Votre rôle a été mis à jour',
        message: `Vous êtes désormais « ${tpl.label} ». Reconnectez-vous si certains modules n'apparaissent pas.`,
      },
    })
    return reply.send({ ...updated, modules: tpl.modules, profilLabel: tpl.label })
  })

  // POST /api/roles/:profil/synchroniser — réappliquer les permissions du modèle à tous les comptes du profil (DG)
  fastify.post('/:profil/synchroniser', { preHandler: [authenticate, requireDG] }, async (request, reply) => {
    const { profil } = z.object({ profil: profilEnum }).parse(request.params)
    const tpl = await getRoleTemplate(profil)
    const res = await prisma.user.updateMany({ where: { profil }, data: tpl.permissions })
    await logActivity(request.user.id, 'ROLE_SYNCHRONISE', 'role', profil, `${res.count} compte(s)`)
    return reply.send({ comptesMisAJour: res.count, permissions: tpl.permissions })
  })

  // ── Attribution des étapes du workflow ─────────────────────────────────

  // GET /api/roles/attribution — qui traite chaque étape / sous-étape
  fastify.get('/attribution', { preHandler: [authenticate] }, async (_request, reply) => {
    const [attribution, templates] = await Promise.all([loadAttribution(), getRoleTemplates()])
    return reply.send({
      etapes: STATUS_ORDER.map(etape => ({
        etape,
        label: STATUS_LABELS[etape],
        owner: attribution[etape].owner,
        sousEtapes: SOUS_ETAPES_CONFIG[etape].map(se => ({
          cle: se.cle, label: se.label, sites: se.sites ?? ['Douala', 'Kribi'],
          profil: attribution[etape].sousEtapes[se.cle] ?? attribution[etape].owner,
        })),
      })),
      profils: ALL_PROFILS.map(p => ({ profil: p, label: templates[p].label })),
      defaut: DEFAULT_ATTRIBUTION,
    })
  })

  // PUT /api/roles/attribution — modifier l'attribution (DG)
  fastify.put('/attribution', { preHandler: [authenticate, requireDG] }, async (request, reply) => {
    const etapeEnum = z.enum(STATUS_ORDER as [DossierStatus, ...DossierStatus[]])
    const body = z.record(etapeEnum, z.object({
      owner:      profilEnum.optional(),
      sousEtapes: z.record(z.string(), profilEnum).optional(),
    })).parse(request.body)

    for (const [etape, cfg] of Object.entries(body)) {
      const cles = SOUS_ETAPES_CONFIG[etape as DossierStatus].map(s => s.cle)
      const inconnues = Object.keys(cfg?.sousEtapes ?? {}).filter(c => !cles.includes(c))
      if (inconnues.length) {
        return reply.code(422).send({ error: 'SOUS_ETAPE_INCONNUE', message: `Sous-étape inconnue pour ${etape} : ${inconnues.join(', ')}` })
      }
    }

    const existing = await prisma.parametre.findUnique({ where: { cle: 'attribution_etapes' } })
    const merged = { ...((existing?.valeur ?? {}) as Record<string, { owner?: Profil; sousEtapes?: Record<string, Profil> }>) }
    for (const [etape, cfg] of Object.entries(body)) {
      merged[etape] = {
        owner: cfg?.owner ?? merged[etape]?.owner,
        sousEtapes: { ...(merged[etape]?.sousEtapes ?? {}), ...(cfg?.sousEtapes ?? {}) },
      }
    }
    await prisma.parametre.upsert({
      where:  { cle: 'attribution_etapes' },
      update: { valeur: merged as Prisma.InputJsonValue, updatedBy: request.user.id },
      create: { cle: 'attribution_etapes', valeur: merged as Prisma.InputJsonValue, updatedBy: request.user.id, description: 'Attribution des étapes du workflow aux profils' },
    })
    invalidateAttributionCache()
    await logActivity(request.user.id, 'ATTRIBUTION_ETAPES_MODIFIEE', 'workflow', null, Object.keys(body).join(', '))
    return reply.send(await loadAttribution())
  })

  // DELETE /api/roles/attribution — revenir à l'attribution par défaut (DG)
  fastify.delete('/attribution', { preHandler: [authenticate, requireDG] }, async (request, reply) => {
    await prisma.parametre.deleteMany({ where: { cle: 'attribution_etapes' } })
    invalidateAttributionCache()
    await logActivity(request.user.id, 'ATTRIBUTION_ETAPES_REINITIALISEE', 'workflow')
    return reply.send(await loadAttribution())
  })

  // GET /api/roles/defauts — modèles d'origine (référence)
  fastify.get('/defauts', { preHandler: [authenticate] }, async (_request, reply) => {
    return reply.send({ roles: DEFAULT_ROLES, permissionKeys: PERMISSION_KEYS })
  })
}

export default rolesRoutes
