/**
 * Moteur de workflow des dossiers : étapes, sous-étapes, attribution automatique
 * des tâches aux comptes selon leur profil (et leurs compagnies / site).
 */
import { DossierStatus, Profil, Site, Prisma } from '@prisma/client'
import { prisma } from '../config/prisma'

export const STATUS_ORDER: DossierStatus[] = [
  'reception', 'soumission_sgs', 'codage', 'validation',
  'paiement', 'bon_compagnie', 'operations_kribi', 'cloture',
]

export const STATUS_LABELS: Record<DossierStatus, string> = {
  reception: 'Réception', soumission_sgs: 'Soumission SGS', codage: 'Codage',
  validation: 'Validation', paiement: 'Paiement', bon_compagnie: 'Bon Compagnie',
  operations_kribi: 'Opérations Kribi', cloture: 'Clôture',
}

/** Parcours d'un dossier selon son site : l'étape Kribi n'existe que pour les dossiers Kribi. */
export function stagesForSite(site: Site): DossierStatus[] {
  return site === 'Kribi' ? STATUS_ORDER : STATUS_ORDER.filter(s => s !== 'operations_kribi')
}

export function nextStage(current: DossierStatus, site: Site): DossierStatus | null {
  const stages = stagesForSite(site)
  const idx = stages.indexOf(current)
  if (idx === -1) {
    // Étape hors parcours (ex. ancien dossier Douala en operations_kribi) → reprendre à la suivante globale
    const g = STATUS_ORDER.indexOf(current)
    return STATUS_ORDER.slice(g + 1).find(s => stages.includes(s)) ?? null
  }
  return stages[idx + 1] ?? null
}

// ── Sous-étapes ────────────────────────────────────────────────────────────

export interface SousEtapeDef { cle: string; label: string; sites?: Site[] }

export const SOUS_ETAPES_CONFIG: Record<DossierStatus, SousEtapeDef[]> = {
  reception: [
    { cle: 'bl',               label: 'BL' },
    { cle: 'facture_proforma', label: 'Facture proforma' },
    { cle: 'saisie_pr',        label: 'Saisie du PR' },
    { cle: 'paiement_client',  label: 'Paiement par le client' },
    { cle: 'traitement_sgs',   label: 'Traitement SGS' },
    { cle: 'di',               label: 'DI' },
  ],
  soumission_sgs: [
    { cle: 'ff_soumission', label: 'FF et soumission des documents fournisseurs' },
    { cle: 'pvc',           label: 'Obtention du PVC' },
  ],
  codage: [
    { cle: 'etat_codage', label: 'État de codage et validation' },
    { cle: 'declaration', label: 'Déclaration' },
    { cle: 'regulation',  label: 'Régulation' },
  ],
  validation: [
    { cle: 'validation_docs', label: 'Validation administrative des documents' },
  ],
  paiement: [
    { cle: 'paiement_droits', label: 'Paiement des droits et taxes' },
  ],
  bon_compagnie: [
    { cle: 'facturation_compagnie', label: 'Facturation & paiement (compagnie maritime)' },
    { cle: 'bon_a_delivrer',        label: 'Soumission & obtention du Bon à Délivrer' },
    // Partie terminal : à Kribi elle est traitée à l'étape « Opérations Kribi »
    { cle: 'facturation_terminal',  label: 'Facturation & paiement (redevance portuaire)', sites: ['Douala'] },
    { cle: 'bon_livraison',         label: 'Bon de livraison', sites: ['Douala'] },
    { cle: 'gate_pass',             label: 'Gate Pass — Ticket de sortie', sites: ['Douala'] },
  ],
  operations_kribi: [
    { cle: 'facturation_terminal', label: 'Facturation & paiement (redevance portuaire)', sites: ['Kribi'] },
    { cle: 'bon_livraison',        label: 'Bon de livraison', sites: ['Kribi'] },
    { cle: 'gate_pass',            label: 'Gate Pass — Ticket de sortie', sites: ['Kribi'] },
  ],
  cloture: [
    { cle: 'rapport_final', label: 'Rapport de clôture du dossier' },
  ],
}

export function applicableSousEtapes(etape: DossierStatus, site: Site): SousEtapeDef[] {
  return (SOUS_ETAPES_CONFIG[etape] ?? []).filter(s => !s.sites || s.sites.includes(site))
}

export function isStatus(v: string): v is DossierStatus {
  return (STATUS_ORDER as string[]).includes(v)
}

// ── Attribution des étapes (qui fait quoi) ─────────────────────────────────

export interface StageAttribution { owner: Profil; sousEtapes: Record<string, Profil> }
export type AttributionConfig = Record<DossierStatus, StageAttribution>

/** Correspondance par défaut issue de l'organigramme FINITRANS. DG et Exploitation supervisent. */
export const DEFAULT_ATTRIBUTION: AttributionConfig = {
  reception: {
    owner: 'administration',
    sousEtapes: {
      bl: 'administration', facture_proforma: 'administration', saisie_pr: 'validation',
      paiement_client: 'comptabilite', traitement_sgs: 'administration', di: 'administration',
    },
  },
  soumission_sgs:   { owner: 'administration', sousEtapes: { ff_soumission: 'administration', pvc: 'administration' } },
  codage:           { owner: 'validation', sousEtapes: { etat_codage: 'validation', declaration: 'validation', regulation: 'validation' } },
  validation:       { owner: 'validation', sousEtapes: { validation_docs: 'validation' } },
  paiement:         { owner: 'logistique', sousEtapes: { paiement_droits: 'logistique' } },
  bon_compagnie: {
    owner: 'gestion_sorties',
    sousEtapes: {
      facturation_compagnie: 'gestion_sorties', bon_a_delivrer: 'gestion_sorties',
      facturation_terminal: 'gestion_sorties', bon_livraison: 'gestion_sorties', gate_pass: 'gestion_sorties',
    },
  },
  operations_kribi: {
    owner: 'terrain_kribi',
    sousEtapes: { facturation_terminal: 'terrain_kribi', bon_livraison: 'terrain_kribi', gate_pass: 'terrain_kribi' },
  },
  cloture: { owner: 'administration', sousEtapes: { rapport_final: 'administration' } },
}

let attrCache: { at: number; value: AttributionConfig } | null = null

export async function loadAttribution(): Promise<AttributionConfig> {
  if (attrCache && Date.now() - attrCache.at < 30_000) return attrCache.value
  const row = await prisma.parametre.findUnique({ where: { cle: 'attribution_etapes' } })
  const overrides = (row?.valeur ?? {}) as Partial<Record<DossierStatus, Partial<StageAttribution>>>
  const value = {} as AttributionConfig
  for (const etape of STATUS_ORDER) {
    const base = DEFAULT_ATTRIBUTION[etape]
    const o = overrides[etape] ?? {}
    value[etape] = { owner: o.owner ?? base.owner, sousEtapes: { ...base.sousEtapes, ...(o.sousEtapes ?? {}) } }
  }
  attrCache = { at: Date.now(), value }
  return value
}

export function invalidateAttributionCache() { attrCache = null }

/** Profils dont le périmètre dépend des compagnies maritimes assignées. */
const SCOPED_BY_COMPAGNIE: Profil[] = ['gestion_sorties', 'terrain_kribi']

/**
 * Trouve le compte qui doit traiter une tâche du profil donné pour ce dossier :
 * même profil, compagnie couverte (sorties / Kribi), site Kribi pour le terrain,
 * puis le moins chargé en tâches ouvertes.
 */
export async function resolveAssignee(
  profil: Profil,
  dossier: { compagnie: string; site: Site },
  tx: Prisma.TransactionClient = prisma,
): Promise<string | null> {
  let candidates = await tx.user.findMany({
    where: { profil, actif: true },
    select: { id: true, site: true, compagniesAssignees: true },
    orderBy: { createdAt: 'asc' },
  })
  if (SCOPED_BY_COMPAGNIE.includes(profil)) {
    const covering = candidates.filter(c => c.compagniesAssignees.includes(dossier.compagnie))
    if (covering.length > 0) candidates = covering
  }
  if (profil === 'terrain_kribi') {
    const kribi = candidates.filter(c => c.site === 'Kribi')
    if (kribi.length > 0) candidates = kribi
  }
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0].id

  const charges = await tx.sousEtapeDossier.groupBy({
    by: ['responsableId'],
    where: { responsableId: { in: candidates.map(c => c.id) }, statut: { in: ['todo', 'en_cours'] } },
    _count: true,
  })
  const load = new Map(charges.map(c => [c.responsableId, c._count]))
  return [...candidates].sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0))[0].id
}

/** Crée les sous-étapes applicables d'un dossier et les attribue automatiquement. */
export async function initSousEtapes(dossierId: string, tx: Prisma.TransactionClient = prisma) {
  const dossier = await tx.dossier.findUnique({ where: { id: dossierId }, select: { id: true, compagnie: true, site: true } })
  if (!dossier) return
  const attribution = await loadAttribution()
  const existing = await tx.sousEtapeDossier.findMany({ where: { dossierId }, select: { etape: true, cle: true } })
  const has = new Set(existing.map(e => `${e.etape}:${e.cle}`))
  const assigneeCache = new Map<Profil, string | null>()

  const rows: Prisma.SousEtapeDossierCreateManyInput[] = []
  for (const etape of stagesForSite(dossier.site)) {
    for (const se of applicableSousEtapes(etape, dossier.site)) {
      if (has.has(`${etape}:${se.cle}`)) continue
      const profil = attribution[etape].sousEtapes[se.cle] ?? attribution[etape].owner
      if (!assigneeCache.has(profil)) assigneeCache.set(profil, await resolveAssignee(profil, dossier, tx))
      rows.push({ dossierId, etape, cle: se.cle, responsableId: assigneeCache.get(profil) ?? null })
    }
  }
  if (rows.length > 0) await tx.sousEtapeDossier.createMany({ data: rows, skipDuplicates: true })
}

/**
 * Responsable pressenti d'une étape : le compte du profil responsable qui détient déjà
 * des tâches de cette étape (cohérence dossier ↔ tâches), sinon le moins chargé du profil.
 */
export async function stageOwner(
  dossier: { id: string; compagnie: string; site: Site },
  etape: DossierStatus,
): Promise<string | null> {
  const attribution = await loadAttribution()
  const owner = attribution[etape].owner
  const holders = await prisma.sousEtapeDossier.findMany({
    where: { dossierId: dossier.id, etape, responsableId: { not: null }, responsable: { profil: owner, actif: true } },
    select: { responsableId: true },
  })
  if (holders.length > 0) {
    const freq = new Map<string, number>()
    holders.forEach(h => freq.set(h.responsableId!, (freq.get(h.responsableId!) ?? 0) + 1))
    return [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0]
  }
  return resolveAssignee(owner, dossier)
}

/** Attribue les sous-étapes non attribuées d'une étape et renvoie le responsable de l'étape. */
export async function assignStage(
  dossier: { id: string; compagnie: string; site: Site },
  etape: DossierStatus,
): Promise<string | null> {
  const attribution = await loadAttribution()
  const rows = await prisma.sousEtapeDossier.findMany({ where: { dossierId: dossier.id, etape, responsableId: null } })
  for (const row of rows) {
    const profil = attribution[etape].sousEtapes[row.cle] ?? attribution[etape].owner
    const uid = await resolveAssignee(profil, dossier)
    if (uid) await prisma.sousEtapeDossier.update({ where: { id: row.id }, data: { responsableId: uid } })
  }
  return stageOwner(dossier, etape)
}

/** Vérifie que toutes les sous-étapes applicables d'une étape sont validées. */
export async function stageCompletion(dossierId: string, etape: DossierStatus, site: Site) {
  const required = applicableSousEtapes(etape, site)
  if (required.length === 0) return { allDone: true, done: 0, total: 0, manquantes: [] as string[] }
  const rows = await prisma.sousEtapeDossier.findMany({ where: { dossierId, etape } })
  const valid = new Set(rows.filter(r => r.statut === 'valide').map(r => r.cle))
  const manquantes = required.filter(r => !valid.has(r.cle)).map(r => r.label)
  return { allDone: manquantes.length === 0, done: required.length - manquantes.length, total: required.length, manquantes }
}

export async function notify(
  userIds: (string | null | undefined)[],
  data: { type: 'alerte' | 'message' | 'dossier' | 'action_requise'; titre: string; message: string; dossierId?: string; actionUrl?: string },
) {
  const ids = [...new Set(userIds.filter((u): u is string => !!u))]
  if (ids.length === 0) return
  await prisma.notification.createMany({ data: ids.map(userId => ({ userId, ...data })) })
}
