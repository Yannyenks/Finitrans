/**
 * Moteur de workflow des dossiers : étapes, sous-étapes, attribution automatique
 * des tâches aux comptes selon leur profil (et leurs compagnies / site).
 */
import { DossierStatus, Profil, Site, Prisma } from '@prisma/client'
import { prisma } from '../config/prisma'
import { marquerNotifies } from './evenements'

export const STATUS_ORDER: DossierStatus[] = [
  'reception', 'soumission_sgs', 'codage', 'validation',
  'paiement', 'bon_compagnie', 'operations_douala', 'operations_kribi', 'cloture', 'facturation',
]

export const STATUS_LABELS: Record<DossierStatus, string> = {
  reception: 'Réception', soumission_sgs: 'Soumission SGS', codage: 'Codage',
  validation: 'Validation', paiement: 'Paiement', bon_compagnie: 'Bon Compagnie',
  operations_douala: 'Opérations Douala', operations_kribi: 'Opérations Kribi', cloture: 'Clôture', facturation: 'Facturation client',
}

/** Parcours d'un dossier selon son site : « Opérations Douala » pour Douala, « Opérations Kribi » pour Kribi. */
export function stagesForSite(site: Site): DossierStatus[] {
  return STATUS_ORDER.filter(s => site === 'Kribi' ? s !== 'operations_douala' : s !== 'operations_kribi')
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
    { cle: 'di',               label: 'DI' },
  ],
  soumission_sgs: [
    { cle: 'ff_soumission', label: 'FF et soumission des documents fournisseurs' },
    { cle: 'pvc',           label: 'Obtention du RVC' },
  ],
  codage: [
    { cle: 'etat_codage', label: 'État de codage et validation' },
    { cle: 'declaration', label: 'Déclaration' },
  ],
  validation: [
  ],
  paiement: [
    { cle: 'paiement_droits', label: 'Paiement des droits et taxes' },
  ],
  bon_compagnie: [
    { cle: 'facturation_compagnie', label: 'Bon de la compagnie maritime' },
    { cle: 'bon_a_delivrer',        label: 'Soumission & obtention du Bon à Délivrer' },
  ],
  // Partie terminal de Douala (mêmes tâches que Kribi, sans gate pass ; bon à délivrer au lieu du bon de livraison)
  operations_douala: [
    { cle: 'facturation_terminal', label: 'Facturation & paiement (redevance portuaire)', sites: ['Douala'] },
    { cle: 'bad_terminal',         label: 'Bon à délivrer', sites: ['Douala'] },
  ],
  operations_kribi: [
    { cle: 'facturation_terminal', label: 'Facturation & paiement (redevance portuaire)', sites: ['Kribi'] },
    { cle: 'bon_livraison',        label: 'Bon de livraison', sites: ['Kribi'] },
    { cle: 'gate_pass',            label: 'Gate Pass — Ticket de sortie', sites: ['Kribi'] },
  ],
  cloture: [
    { cle: 'rapport_final', label: 'Rapport de clôture du dossier' },
  ],
  facturation: [
    { cle: 'facture_client', label: 'Établissement de la facture client' },
    { cle: 'remise_facture', label: 'Remise de la facture au client' },
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
      paiement_client: 'comptabilite', di: 'administration',
    },
  },
  // Fournisseur & soumission : M. Soudi (et Mme Samira) ; RVC : M. Delba et M. Soudi
  soumission_sgs:   { owner: 'exploitation', sousEtapes: { ff_soumission: 'exploitation', pvc: 'exploitation' } },
  codage:           { owner: 'validation', sousEtapes: { etat_codage: 'validation', declaration: 'validation' } },
  // Plus de sous-étape : la responsable de la validation termine l'étape avec une preuve
  validation:       { owner: 'validation', sousEtapes: {} },
  paiement:         { owner: 'logistique', sousEtapes: { paiement_droits: 'logistique' } },
  bon_compagnie: {
    owner: 'gestion_sorties',
    sousEtapes: {
      facturation_compagnie: 'gestion_sorties', bon_a_delivrer: 'gestion_sorties',
    },
  },
  operations_douala: {
    owner: 'gestion_sorties',
    sousEtapes: { facturation_terminal: 'gestion_sorties', bad_terminal: 'gestion_sorties' },
  },
  operations_kribi: {
    owner: 'terrain_kribi',
    sousEtapes: { facturation_terminal: 'terrain_kribi', bon_livraison: 'terrain_kribi', gate_pass: 'terrain_kribi' },
  },
  cloture: { owner: 'administration', sousEtapes: { rapport_final: 'administration' } },
  // Après la clôture : facturation du dossier au client (comptabilité)
  facturation: { owner: 'comptabilite', sousEtapes: { facture_client: 'comptabilite', remise_facture: 'comptabilite' } },
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
  return rows.length
}

/**
 * Responsable pressenti d'une étape : le compte du profil responsable qui détient déjà
 * des tâches de cette étape (cohérence dossier ↔ tâches), sinon le moins chargé du profil.
 */
export async function stageOwner(
  dossier: { id: string; compagnie: string; site: Site },
  etape: DossierStatus,
): Promise<string | null> {
  // Responsable désigné à l'avance dans le parcours du dossier : prioritaire
  const affectation = await prisma.affectationEtape.findUnique({
    where: { dossierId_etape: { dossierId: dossier.id, etape } },
    select: { responsableId: true, responsable: { select: { actif: true } } },
  })
  if (affectation?.responsable.actif) return affectation.responsableId

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
  data: { type: 'alerte' | 'message' | 'dossier' | 'action_requise'; titre: string; message: string; dossierId?: string; actionUrl?: string; echeance?: Date | null },
) {
  const ids = [...new Set(userIds.filter((u): u is string => !!u))]
  if (ids.length === 0) return
  await prisma.notification.createMany({ data: ids.map(userId => ({ userId, ...data })) })
  marquerNotifies(ids)
}

// ── Délais des sous-étapes (SLA en heures, paramètre « sla_sous_etapes ») ──

/** SLA par défaut d'une sous-étape, en heures (clé « etape.cle »). */
export const DEFAULT_SLA_SOUS_ETAPES: Record<string, number> = {
  'reception.bl': 4, 'reception.facture_proforma': 8, 'reception.saisie_pr': 8, 'reception.paiement_client': 24,
  'reception.di': 24,
  'soumission_sgs.ff_soumission': 24, 'soumission_sgs.pvc': 48,
  'codage.etat_codage': 8, 'codage.declaration': 8,
  'paiement.paiement_droits': 24,
  'bon_compagnie.facturation_compagnie': 24, 'bon_compagnie.bon_a_delivrer': 24,
  'operations_douala.facturation_terminal': 24, 'operations_douala.bad_terminal': 24,
  'operations_kribi.facturation_terminal': 24, 'operations_kribi.bon_livraison': 8, 'operations_kribi.gate_pass': 8,
  'cloture.rapport_final': 8,
  'facturation.facture_client': 24, 'facturation.remise_facture': 24,
}

export async function loadSlaSousEtapes(): Promise<Record<string, number>> {
  const row = await prisma.parametre.findUnique({ where: { cle: 'sla_sous_etapes' } })
  return { ...DEFAULT_SLA_SOUS_ETAPES, ...((row?.valeur ?? {}) as Record<string, number>) }
}

/**
 * Le dossier entre dans une étape : chaque tâche attribuée démarre automatiquement
 * (plus de bouton « Démarrer ») et son échéance est calculée d'après le SLA (sauf délai déjà fixé).
 */
export async function demarrerEtape(dossierId: string, etape: DossierStatus, debut = new Date()) {
  const sla = await loadSlaSousEtapes()
  const rows = await prisma.sousEtapeDossier.findMany({
    where: { dossierId, etape, statut: { not: 'valide' } },
    select: { id: true, cle: true, statut: true, responsableId: true, startedAt: true, deadline: true },
  })
  for (const r of rows) {
    const heures = sla[`${etape}.${r.cle}`]
    const data: Prisma.SousEtapeDossierUpdateInput = {}
    if (!r.startedAt) data.startedAt = debut
    if (!r.deadline && heures > 0) data.deadline = new Date(debut.getTime() + heures * 3_600_000)
    if (r.statut === 'todo' && r.responsableId) data.statut = 'en_cours'
    if (Object.keys(data).length > 0) await prisma.sousEtapeDossier.update({ where: { id: r.id }, data })
  }
}

/** Échéance d'une tâche qui démarre maintenant (SLA de la sous-étape). */
export async function echeanceSla(etape: string, cle: string, debut = new Date()): Promise<Date | null> {
  const heures = (await loadSlaSousEtapes())[`${etape}.${cle}`]
  return heures > 0 ? new Date(debut.getTime() + heures * 3_600_000) : null
}

/**
 * Prévient chaque titulaire des tâches ouvertes d'une étape, avec l'échéance de sa tâche la plus urgente :
 * le compte à rebours s'affiche dès la réception de la notification.
 */
export async function notifierTitulaires(
  dossierId: string,
  etape: DossierStatus,
  data: { titre: string; message: string },
  options: { sauf?: string; aussi?: (string | null | undefined)[] } = {},
) {
  const taches = await prisma.sousEtapeDossier.findMany({
    where: { dossierId, etape, statut: { not: 'valide' }, responsableId: { not: null } },
    select: { responsableId: true, deadline: true },
  })
  const parCompte = new Map<string, Date | null>()
  for (const t of taches) {
    const actuelle = parCompte.get(t.responsableId!)
    if (!parCompte.has(t.responsableId!) || (t.deadline && (!actuelle || t.deadline < actuelle))) parCompte.set(t.responsableId!, t.deadline)
  }
  for (const id of options.aussi ?? []) if (id && !parCompte.has(id)) parCompte.set(id, null)
  for (const [userId, echeance] of parCompte) {
    if (userId === options.sauf) continue
    await notify([userId], { type: 'action_requise', ...data, dossierId, actionUrl: `/dossiers/${dossierId}`, echeance })
  }
}

/** Alerte Direction Générale : les événements qui demandent l'attention du DG lui sont signalés. */
export async function notifierDirection(
  data: { titre: string; message: string; dossierId?: string; actionUrl?: string },
  sauf?: string,
) {
  const dg = await prisma.user.findMany({ where: { profil: 'dg', actif: true }, select: { id: true } })
  await notify(dg.map(u => u.id).filter(id => id !== sauf), { type: 'alerte', ...data })
}
