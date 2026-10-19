/**
 * Registre central des rôles FINITRANS.
 *
 * Chaque type de compte (profil) définit :
 *   - les modules (écrans / API) auxquels il a accès
 *   - ses niveaux de permission par défaut (appliqués lors de l'attribution du rôle)
 *   - s'il est superviseur (DG, Exploitation) : contrôle total sur tous les process
 *
 * Le DG peut surcharger modules / permissions par profil (paramètre `roles_config`).
 */
import { PermissionNiveau, Profil } from '@prisma/client'
import { prisma } from './prisma'

export const PERMISSION_KEYS = [
  'permDossier', 'permValidation', 'permFinancier', 'permRapports', 'permAdministration',
] as const
export type PermissionKey = typeof PERMISSION_KEYS[number]
export type PermissionSet = Record<PermissionKey, PermissionNiveau>

export const MODULES = {
  dashboard:            'Tableau de bord',
  mon_espace:           'Mon espace (tâches, congés, profil)',
  repertoire:           'Répertoire des contacts',
  bibliotheque:         'Bibliothèque documentaire',
  supervision:          'Supervision des process',
  exploitation:         'Exploitation',
  dossiers:             'Dossiers',
  codage:               'Codage & Validation',
  sorties:              'Gestion des sorties',
  logistique:           'Logistique',
  messagerie:           'Messagerie',
  alertes:              'Alertes',
  finance:              'Finance',
  di:                   'Gestion DI',
  comptabilite:         'Comptabilité opérationnelle',
  comptabilite_avancee: 'Comptabilité avancée (SYSCOHADA)',
  administratif:        'Administratif',
  employes:             'Employés',
  kribi:                'Kribi',
  reporting:            'Reporting',
  performance:          'Performance',
  administration:       'Administration de l\'entreprise',
  parametres:           'Paramètres',
  crm:                  'CRM — relation client',
} as const
export type ModuleKey = keyof typeof MODULES
export const ALL_MODULES = Object.keys(MODULES) as ModuleKey[]

/** Modules accessibles à tout compte actif. */
const SOCLE: ModuleKey[] = ['dashboard', 'mon_espace', 'bibliotheque', 'repertoire', 'messagerie', 'alertes']

export interface RoleTemplate {
  profil:       Profil
  label:        string
  description:  string
  superviseur:  boolean
  modules:      ModuleKey[]
  permissions:  PermissionSet
}

const P = (d: PermissionNiveau, v: PermissionNiveau, f: PermissionNiveau, r: PermissionNiveau, a: PermissionNiveau): PermissionSet =>
  ({ permDossier: d, permValidation: v, permFinancier: f, permRapports: r, permAdministration: a })

export const DEFAULT_ROLES: Record<Profil, RoleTemplate> = {
  dg: {
    profil: 'dg', label: 'Directeur Général', superviseur: true,
    description: 'Supervision générale, contrôle total, administration de l\'entreprise et comptabilité avancée.',
    modules: [...ALL_MODULES],
    permissions: P('complet', 'complet', 'complet', 'complet', 'complet'),
  },
  exploitation: {
    profil: 'exploitation', label: 'Responsable Exploitation', superviseur: true,
    description: 'Supervision et contrôle total des opérations et des process de tous les dossiers.',
    modules: ALL_MODULES.filter(m => m !== 'administration' && m !== 'comptabilite_avancee'),
    permissions: P('complet', 'complet', 'complet', 'complet', 'complet'),
  },
  logistique: {
    profil: 'logistique', label: 'Responsable Logistique', superviseur: false,
    description: 'Transport, dédouanement véhicules, paiement des droits et taxes.',
    modules: [...SOCLE, 'dossiers', 'logistique', 'finance'],
    permissions: P('partiel', 'non', 'partiel', 'non', 'non'),
  },
  validation: {
    profil: 'validation', label: 'Responsable Validation', superviseur: false,
    description: 'États de codage, validation des déclarations, saisie PR, fiches conteneurs.',
    modules: [...SOCLE, 'dossiers', 'codage'],
    permissions: P('partiel', 'complet', 'non', 'non', 'non'),
  },
  gestion_sorties: {
    profil: 'gestion_sorties', label: 'Responsable Gestion des Sorties', superviseur: false,
    description: 'Sorties conteneurs, interchanges, détentions, factures et bons compagnie (selon compagnies assignées).',
    modules: [...SOCLE, 'dossiers', 'sorties', 'finance'],
    permissions: P('partiel', 'non', 'partiel', 'non', 'non'),
  },
  administration: {
    profil: 'administration', label: 'Service Administratif', superviseur: false,
    description: 'Enregistrement et classement des dossiers, transferts de fonds, suivi DI, factures proforma.',
    modules: [...SOCLE, 'dossiers', 'administratif', 'di', 'finance', 'employes', 'crm'],
    permissions: P('partiel', 'non', 'partiel', 'non', 'partiel'),
  },
  comptabilite: {
    profil: 'comptabilite', label: 'Comptable', superviseur: false,
    description: 'Factures, journaux comptables, bilans, analyse financière, conformité OHADA.',
    modules: [...SOCLE, 'dossiers', 'comptabilite', 'comptabilite_avancee', 'finance', 'di', 'reporting', 'crm'],
    permissions: P('lecture', 'non', 'complet', 'complet', 'non'),
  },
  terrain_kribi: {
    profil: 'terrain_kribi', label: 'Responsable Douanier Kribi', superviseur: false,
    description: 'Bon douane / PAK, redevances portuaires, gate-pass, visite douane à Kribi.',
    modules: [...SOCLE, 'dossiers', 'kribi', 'finance'],
    permissions: P('partiel', 'non', 'partiel', 'non', 'non'),
  },
  operations: {
    profil: 'operations', label: 'Agent d\'opérations', superviseur: false,
    description: 'Exécution des tâches opérationnelles qui lui sont attribuées.',
    modules: [...SOCLE, 'dossiers'],
    permissions: P('partiel', 'non', 'non', 'non', 'non'),
  },
}

export const ALL_PROFILS = Object.keys(DEFAULT_ROLES) as Profil[]

/** Modules qu'on ne peut jamais retirer au DG (évite de se verrouiller hors du système). */
const DG_LOCKED: ModuleKey[] = ['administration', 'parametres', 'employes', 'supervision']

/** Modules ajoutés après la mise en production des surcharges de rôles (paramètre roles_config). */
const MODULES_RECENTS: ModuleKey[] = ['crm']

// ── Surcharges éditables par le DG (paramètre roles_config) ─────────────────

type RoleOverride = Partial<Pick<RoleTemplate, 'label' | 'description' | 'modules' | 'permissions'>>
const CACHE_TTL_MS = 30_000
let cache: { at: number; value: Record<string, RoleOverride> } | null = null

export async function loadRoleOverrides(): Promise<Record<string, RoleOverride>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value
  const row = await prisma.parametre.findUnique({ where: { cle: 'roles_config' } })
  const value = (row?.valeur ?? {}) as Record<string, RoleOverride>
  cache = { at: Date.now(), value }
  return value
}

export function invalidateRoleCache() { cache = null }

export async function getRoleTemplates(): Promise<Record<Profil, RoleTemplate>> {
  const overrides = await loadRoleOverrides()
  const out = {} as Record<Profil, RoleTemplate>
  for (const profil of ALL_PROFILS) {
    const base = DEFAULT_ROLES[profil]
    const o = overrides[profil] ?? {}
    let modules = (o.modules ?? base.modules).filter((m): m is ModuleKey => m in MODULES)
    // Modules créés après l'enregistrement des surcharges : ajoutés aux profils qui les ont par défaut
    if (o.modules) for (const m of MODULES_RECENTS) if (base.modules.includes(m) && !modules.includes(m)) modules.push(m)
    for (const m of SOCLE) if (!modules.includes(m)) modules.push(m)
    if (profil === 'dg') for (const m of DG_LOCKED) if (!modules.includes(m)) modules.push(m)
    modules = ALL_MODULES.filter(m => modules.includes(m))
    out[profil] = {
      ...base,
      label:       o.label ?? base.label,
      description: o.description ?? base.description,
      modules,
      permissions: { ...base.permissions, ...(o.permissions ?? {}) },
    }
  }
  return out
}

export async function getRoleTemplate(profil: Profil): Promise<RoleTemplate> {
  return (await getRoleTemplates())[profil]
}

export function isSupervisor(profil: Profil | string | undefined): boolean {
  return profil === 'dg' || profil === 'exploitation'
}

/**
 * Permissions effectives : les superviseurs ont toujours le contrôle total,
 * les autres comptes utilisent les permissions stockées sur leur fiche.
 */
export function effectivePermissions(user: { profil: Profil } & PermissionSet): PermissionSet {
  if (isSupervisor(user.profil)) return P('complet', 'complet', 'complet', 'complet', 'complet')
  const out = {} as PermissionSet
  for (const k of PERMISSION_KEYS) out[k] = user[k]
  return out
}
