/**
 * Organisations clientes du SaaS : état de l'abonnement, droits d'accès, administrateurs de plateforme.
 */
import type { Abonnement, Organisation, PlanAbonnement } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { addDays } from 'date-fns'
import { prisma } from '../config/prisma'
import { dansOrganisation, sansIsolation } from '../config/contexte'
import { DUREE_ESSAI_JOURS } from '../config/plans'
import { reglagesPays } from '../config/pays'
import { DEFAULT_ROLES } from '../config/roles'
import { ENTREPRISE_DEFAUT } from '../config/entreprise'
import { PLANS } from '../config/plans'
import type { ModuleKey } from '../config/roles'

export type EtatAcces =
  | { ok: true; lectureSeule: boolean }
  | { ok: false; code: 'ORGANISATION_INTROUVABLE' | 'ORGANISATION_SUSPENDUE' | 'ESSAI_TERMINE' | 'ABONNEMENT_INACTIF'; message: string }

export type OrganisationAvecAbonnement = Organisation & { abonnement: Abonnement | null }

// Cache très court : une suspension prend effet en moins de 15 s, sans requête supplémentaire à chaque appel
const DUREE_CACHE_MS = 15_000
const cache = new Map<string, { at: number; org: OrganisationAvecAbonnement | null }>()

export async function chargerOrganisation(id: string): Promise<OrganisationAvecAbonnement | null> {
  const e = cache.get(id)
  if (e && Date.now() - e.at < DUREE_CACHE_MS) return e.org
  const org = await prisma.organisation.findUnique({ where: { id }, include: { abonnement: true } })
  cache.set(id, { at: Date.now(), org })
  return org
}

export function invaliderOrganisation(id: string) { cache.delete(id) }

/** Une organisation sans ligne d'abonnement (historique) est traitée comme « Enterprise actif ». */
export function planDe(org: OrganisationAvecAbonnement): PlanAbonnement {
  return org.abonnement?.plan ?? 'enterprise'
}

export function modulesDuPlan(org: OrganisationAvecAbonnement): ModuleKey[] {
  return PLANS[planDe(org)].modules
}

export function maxUtilisateurs(org: OrganisationAvecAbonnement): number | null {
  return org.abonnement?.maxUtilisateurs ?? PLANS[planDe(org)].maxUtilisateurs
}

/** Droit d'accès de l'organisation à la plateforme, selon son état et son abonnement. */
export function etatAcces(org: OrganisationAvecAbonnement | null, maintenant = new Date()): EtatAcces {
  if (!org) return { ok: false, code: 'ORGANISATION_INTROUVABLE', message: 'Espace introuvable' }
  if (!org.actif) return { ok: false, code: 'ORGANISATION_SUSPENDUE', message: 'Cet espace est suspendu. Contactez le support.' }
  const a = org.abonnement
  if (!a) return { ok: true, lectureSeule: false }
  switch (a.statut) {
    case 'actif':
      return { ok: true, lectureSeule: false }
    case 'essai':
      if (a.finEssai && a.finEssai < maintenant) {
        return { ok: false, code: 'ESSAI_TERMINE', message: 'La période d\'essai est terminée. Contactez-nous pour activer votre abonnement.' }
      }
      return { ok: true, lectureSeule: false }
    case 'impaye':
      // Les données restent consultables ; aucune modification tant que la situation n'est pas régularisée
      return { ok: true, lectureSeule: true }
    default:
      return { ok: false, code: 'ABONNEMENT_INACTIF', message: 'L\'abonnement de cet espace n\'est pas actif.' }
  }
}

/** Administrateurs de la plateforme SaaS : liste fermée définie côté serveur (variable d'environnement). */
export function estAdminPlateforme(email: string): boolean {
  const liste = (process.env.PLATFORM_ADMIN_EMAILS ?? '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  return liste.includes(email.trim().toLowerCase())
}

/** Identifiant lisible et unique dérivé du nom de l'entreprise (ex. « Trans Logistique SA » → « trans-logistique-sa »). */
export async function slugLibre(nom: string): Promise<string> {
  const base = nom.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'entreprise'
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`
    if (!(await prisma.organisation.findUnique({ where: { slug }, select: { id: true } }))) return slug
  }
  return `${base}-${Date.now().toString(36)}`
}

/** Résumé de l'organisation renvoyé au navigateur (jamais de donnée d'une autre organisation). */
export function resumeOrganisation(org: OrganisationAvecAbonnement) {
  const plan = PLANS[planDe(org)]
  return {
    id: org.id, slug: org.slug, nom: org.nom, pays: org.pays, devise: org.devise, fuseau: org.fuseau, langue: org.langue,
    abonnement: {
      plan: plan.cle, libelle: plan.libelle,
      statut: org.abonnement?.statut ?? 'actif',
      finEssai: org.abonnement?.finEssai ?? null,
      maxUtilisateurs: maxUtilisateurs(org),
    },
  }
}

export interface NouvelEspace {
  entreprise: string
  nom: string
  email: string
  password: string
  pays: string
  langue: 'fr' | 'en'
  telephone?: string
  plan: PlanAbonnement
  statut: 'essai' | 'actif'
}

/**
 * Crée l'espace complet d'une entreprise en une transaction : organisation, abonnement,
 * compte du dirigeant (profil DG) et fiche entreprise. Rien n'est créé si une étape échoue.
 */
export async function creerEspace(e: NouvelEspace) {
  const slug = await slugLibre(e.entreprise)
  const { devise, fuseau } = reglagesPays(e.pays)
  const passwordHash = await bcrypt.hash(e.password, 12)
  const dg = DEFAULT_ROLES.dg

  return prisma.$transaction(async tx => {
    const organisation = await tx.organisation.create({
      data: { slug, nom: e.entreprise, pays: e.pays, devise, fuseau, langue: e.langue },
    })
    await tx.abonnement.create({
      data: {
        organisationId: organisation.id, plan: e.plan, statut: e.statut,
        finEssai: e.statut === 'essai' ? addDays(new Date(), DUREE_ESSAI_JOURS) : null,
      },
    })
    const user = await tx.user.create({
      data: {
        organisationId: organisation.id, email: e.email, passwordHash, nom: e.nom, telephone: e.telephone,
        role: dg.label, profil: 'dg', site: 'Douala', ...dg.permissions,
      },
    })
    await tx.parametre.create({
      data: {
        organisationId: organisation.id, cle: 'entreprise', description: 'Fiche entreprise', updatedBy: user.id,
        valeur: { ...ENTREPRISE_DEFAUT, raisonSociale: e.entreprise, sigle: e.entreprise, telephone: e.telephone ?? '', email: e.email },
      },
    })
    return { organisation, user }
  })
}

/**
 * Exécute un traitement de maintenance (scripts de déploiement) une fois par organisation,
 * dans son périmètre : chaque entreprise est traitée avec sa propre configuration.
 */
export async function pourChaqueOrganisation(traitement: (org: Organisation) => Promise<void>) {
  const organisations = await prisma.organisation.findMany({ orderBy: { createdAt: 'asc' } })
  for (const org of organisations) {
    await dansOrganisation(org.id, () => traitement(org))
  }
}

/** Notifie les administrateurs de la plateforme (événements techniques : sauvegardes, incidents). */
export async function notifierPlateforme(data: { titre: string; message: string; actionUrl?: string }) {
  const emails = (process.env.PLATFORM_ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  if (!emails.length) return
  await sansIsolation(async () => {
    const admins = await prisma.user.findMany({ where: { email: { in: emails }, actif: true }, select: { id: true } })
    if (admins.length) {
      await prisma.notification.createMany({ data: admins.map(a => ({ userId: a.id, type: 'alerte' as const, ...data })) })
    }
  })
}
