import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { Profil } from '@prisma/client'
import { prisma } from '../config/prisma'
import { ALL_PROFILS, getRoleTemplate, getRoleTemplates, isSupervisor } from '../config/roles'
import { AuthUser } from '../types'
import { AppError, ConflictError, ForbiddenError } from '../utils/errors'
import { loadCompagnies, zCompagnie } from './compagnies'

export const permissionEnum = z.enum(['complet', 'partiel', 'lecture', 'non'])
export const profilEnum = z.enum(ALL_PROFILS as [Profil, ...Profil[]])
export const compagnieEnum = zCompagnie

export const permissionsSchema = z.object({
  permDossier:        permissionEnum.optional(),
  permValidation:     permissionEnum.optional(),
  permFinancier:      permissionEnum.optional(),
  permRapports:       permissionEnum.optional(),
  permAdministration: permissionEnum.optional(),
})

export const createUserSchema = z.object({
  email:     z.string().email().transform(e => e.trim().toLowerCase()),
  password:  z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
  nom:       z.string().min(2),
  role:      z.string().min(2).optional(),
  site:      z.enum(['Douala', 'Kribi']),
  telephone: z.string().optional(),
  profil:    profilEnum,
  compagniesAssignees: z.array(compagnieEnum).optional(),
}).merge(permissionsSchema)

export const SAFE_USER_SELECT = {
  id: true, email: true, nom: true, role: true, site: true, telephone: true,
  profil: true, actif: true, avatarUrl: true, createdAt: true, compagniesAssignees: true,
  permDossier: true, permValidation: true, permFinancier: true,
  permRapports: true, permAdministration: true,
} as const

/** Seul le DG peut créer / attribuer / retirer le profil DG. */
export function assertCanGrantProfil(actor: AuthUser, profil: Profil) {
  if (!actor.superviseur) throw new ForbiddenError('Attribution des rôles réservée à la Direction et à l\'Exploitation')
  if (profil === 'dg' && actor.profil !== 'dg') throw new ForbiddenError('Seul le Directeur Général peut attribuer le profil DG')
}

export async function createUser(actor: AuthUser, input: z.infer<typeof createUserSchema>) {
  assertCanGrantProfil(actor, input.profil)
  const exists = await prisma.user.findUnique({ where: { email: input.email } })
  if (exists) throw new ConflictError('Cet email est déjà utilisé')

  const template = await getRoleTemplate(input.profil)
  const passwordHash = await bcrypt.hash(input.password, 12)
  return prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      nom: input.nom,
      role: input.role ?? template.label,
      site: input.site,
      telephone: input.telephone,
      profil: input.profil,
      compagniesAssignees: input.compagniesAssignees ?? (await loadCompagnies()).filter(c => c.actif).map(c => c.code),
      permDossier:        input.permDossier        ?? template.permissions.permDossier,
      permValidation:     input.permValidation     ?? template.permissions.permValidation,
      permFinancier:      input.permFinancier      ?? template.permissions.permFinancier,
      permRapports:       input.permRapports       ?? template.permissions.permRapports,
      permAdministration: input.permAdministration ?? template.permissions.permAdministration,
    },
    select: SAFE_USER_SELECT,
  })
}

/** Empêche de retirer le dernier DG actif (verrouillage du système). */
export async function assertNotLastDG(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { profil: true, actif: true } })
  if (user?.profil !== 'dg' || !user.actif) return
  const dgActifs = await prisma.user.count({ where: { profil: 'dg', actif: true } })
  if (dgActifs <= 1) throw new AppError(422, 'DERNIER_DG', 'Impossible : c\'est le dernier compte Directeur Général actif')
}

/** Profil public enrichi (modules, libellé du rôle) renvoyé au frontend. */
export async function buildSessionUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: SAFE_USER_SELECT })
  if (!user) return null
  const templates = await getRoleTemplates()
  const template = templates[user.profil]
  const superviseur = isSupervisor(user.profil)
  const perms = superviseur
    ? { permDossier: 'complet', permValidation: 'complet', permFinancier: 'complet', permRapports: 'complet', permAdministration: 'complet' } as const
    : {}
  return {
    ...user,
    ...perms,
    superviseur,
    modules: template.modules,
    profilLabel: template.label,
  }
}
