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

// ── Suppression définitive d'un compte ───────────────────────────────────────

/** Compte d'archive (inactif, invisible) qui porte l'historique des comptes supprimés. */
export const EMAIL_COMPTE_ARCHIVE = 'compte-supprime@finitrans.archive'

async function compteArchive(): Promise<string> {
  const existant = await prisma.user.findUnique({ where: { email: EMAIL_COMPTE_ARCHIVE }, select: { id: true } })
  if (existant) return existant.id
  const cree = await prisma.user.create({
    data: {
      email: EMAIL_COMPTE_ARCHIVE, nom: 'Compte supprimé', role: 'Archive', site: 'Douala', profil: 'administration', actif: false,
      passwordHash: await bcrypt.hash(crypto.randomUUID() + crypto.randomUUID(), 10),
    },
    select: { id: true },
  })
  return cree.id
}

/** Responsabilités en cours : transmises au successeur. */
const EN_COURS: { table: string; colonne: string; condition?: string }[] = [
  { table: 'dossiers',                 colonne: 'responsable_id', condition: `status::text NOT IN ('cloture', 'facturation')` },
  { table: 'affectations_etapes',      colonne: 'responsable_id' },
  { table: 'sous_etapes_dossier',      colonne: 'responsable_id', condition: `statut::text <> 'valide'` },
  { table: 'vehicules',                colonne: 'responsable_id' },
  { table: 'interchanges',             colonne: 'responsable_id' },
  { table: 'declarations_importation', colonne: 'gestionnaire_id' },
]

/** Historique (auteur d'une action passée) : rattaché au compte d'archive. */
const HISTORIQUE: { table: string; colonne: string }[] = [
  { table: 'dossiers', colonne: 'responsable_id' },
  { table: 'affectations_etapes', colonne: 'assigne_par_id' },
  { table: 'audit_entries', colonne: 'auteur_id' },
  { table: 'bons_kribi', colonne: 'responsable_id' },
  { table: 'bons_livraison', colonne: 'effectue_par' },
  { table: 'commentaires', colonne: 'auteur_id' },
  { table: 'comptes_rendus_kribi', colonne: 'auteur_id' },
  { table: 'contacts', colonne: 'created_by_id' },
  { table: 'conversations', colonne: 'created_by' },
  { table: 'di_documents', colonne: 'uploade_par' },
  { table: 'documents', colonne: 'uploade_par' },
  { table: 'ecritures_comptables', colonne: 'created_by_id' },
  { table: 'gate_passes', colonne: 'emetteur_id' },
  { table: 'messages', colonne: 'auteur_id' },
  { table: 'mouvements_di', colonne: 'created_by' },
  { table: 'soumissions_sgs', colonne: 'soumis_par_id' },
  { table: 'transports', colonne: 'created_by_id' },
  { table: 'virements', colonne: 'effectue_par' },
  { table: 'sous_etapes_dossier', colonne: 'completed_by_id' },
  { table: 'dossier_timings', colonne: 'responsable_id' },
]

/**
 * Supprime définitivement un compte : ses dossiers et tâches en cours passent au successeur,
 * son historique (journal, documents, messages, écritures…) est conservé sous « Compte supprimé »
 * avec son nom dans le journal ; notifications, sessions, fiche RH et congés sont effacés.
 */
export async function supprimerCompte(id: string, successeurId: string) {
  const [cible, successeur] = await Promise.all([
    prisma.user.findUnique({ where: { id }, select: { id: true, nom: true, email: true } }),
    prisma.user.findUnique({ where: { id: successeurId }, select: { id: true, nom: true, actif: true } }),
  ])
  if (!cible) throw new AppError(404, 'NOT_FOUND', 'Compte introuvable')
  if (cible.email === EMAIL_COMPTE_ARCHIVE) throw new AppError(422, 'COMPTE_ARCHIVE', 'Le compte d\'archive ne peut pas être supprimé')
  if (!successeur?.actif || successeur.id === id) throw new AppError(422, 'SUCCESSEUR_INVALIDE', 'Choisissez un compte actif pour reprendre les dossiers en cours')
  const archive = await compteArchive()

  const transmis = await prisma.$transaction(async tx => {
    let n = 0
    for (const r of EN_COURS) {
      n += await tx.$executeRawUnsafe(`UPDATE "${r.table}" SET "${r.colonne}" = $1::uuid WHERE "${r.colonne}" = $2::uuid${r.condition ? ` AND ${r.condition}` : ''}`, successeurId, id)
    }
    await tx.$executeRawUnsafe(`UPDATE "audit_entries" SET "details" = $1 || COALESCE("details", '') WHERE "auteur_id" = $2::uuid`, `[${cible.nom}] `, id)
    for (const r of HISTORIQUE) {
      await tx.$executeRawUnsafe(`UPDATE "${r.table}" SET "${r.colonne}" = $1::uuid WHERE "${r.colonne}" = $2::uuid`, archive, id)
    }
    await tx.user.delete({ where: { id } })
    return n
  })
  return { nom: cible.nom, successeur: successeur.nom, transmis }
}
