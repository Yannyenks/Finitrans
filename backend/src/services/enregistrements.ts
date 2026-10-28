/**
 * Une tâche terminée dans le dossier crée automatiquement l'enregistrement métier
 * correspondant (paiement, gate pass…), pour que l'employé n'ait rien à ressaisir
 * ailleurs et que Finance / Comptabilité / Kribi soient à jour immédiatement.
 */
import { ModeReglement, Prisma } from '@prisma/client'
import { prisma } from '../config/prisma'
import { logAudit } from '../utils/audit'
import { nextSequence, withUniqueRetry } from '../utils/sequence'
import { clientParNom } from './crm'
import { enregistrerFacturePhysique } from './facturation'

export const MODES_REGLEMENT = ['virement', 'cheque', 'especes', 'traite', 'mobile_money', 'autre'] as const
export const LIBELLES_MODE: Record<ModeReglement, string> = {
  virement: 'Virement', cheque: 'Chèque', especes: 'Espèces', traite: 'Traite', mobile_money: 'Mobile money', autre: 'Autre',
}

type Meta = Record<string, unknown>

const nombre = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}
const texte = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const date = (v: unknown) => {
  // « 2026-10-19 » (champ date) : midi, pour ne pas changer de jour selon le fuseau
  const brut = texte(v)
  const d = brut ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(brut) ? `${brut}T12:00:00` : brut) : null
  return d && !isNaN(d.getTime()) ? d : new Date()
}

/** Référence unique : celle saisie si libre, sinon suffixée. */
async function referenceLibre(base: string, existe: (r: string) => Promise<boolean>) {
  if (!(await existe(base))) return base
  for (let i = 2; i < 50; i++) if (!(await existe(`${base}-${i}`))) return `${base}-${i}`
  return `${base}-${Date.now().toString(36).toUpperCase()}`
}

/** Date + heure de sortie du gate pass (heure du Cameroun, UTC+1). */
function dateHeureSortie(meta: Record<string, unknown>): Date | null {
  const heure = typeof meta.gp_heure_sortie === 'string' && /^\d{2}:\d{2}$/.test(meta.gp_heure_sortie) ? meta.gp_heure_sortie : null
  if (!heure) return null
  const jour = typeof meta.gp_date_sortie === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(meta.gp_date_sortie)
    ? meta.gp_date_sortie : new Date(Date.now() + 3_600_000).toISOString().slice(0, 10)
  const d = new Date(`${jour}T${heure}:00+01:00`)
  return isNaN(d.getTime()) ? null : d
}

export async function enregistrerDepuisSousEtape(
  dossierId: string, etape: string, cle: string, meta: Meta, userId: string,
): Promise<Meta | null> {
  if (meta.enregistrement_id) return null // déjà créé (révision puis revalidation)
  const dossier = await prisma.dossier.findUnique({ where: { id: dossierId } })
  if (!dossier) return null

  // Facturation client (après la clôture) : facture établie physiquement, seules ses références sont enregistrées
  if (cle === 'facture_client') {
    const facture = await enregistrerFacturePhysique(dossierId, meta)
    await logAudit(dossierId, userId, 'FACTURE_CLIENT', `Facture n° ${facture.numero} établie physiquement : ${Number(facture.montant).toLocaleString('fr-FR')} FCFA TTC`)
    return { enregistrement_id: facture.id, enregistrement_type: 'facture_client', facture_numero: facture.numero }
  }

  // Facture fournisseur (FF et soumission) : débitée sur la DI par appliquerFactureFournisseur (services/di.ts)

  // Liquidation par la douane → montant des droits et taxes du dossier (repris au paiement)
  if (cle === 'liquidation') {
    const montant = Math.round(Number(String(meta.liq_montant ?? '').replace(/\s/g, '').replace(',', '.')))
    const inspecteur = texte(meta.liq_inspecteur)
    if (montant > 0) await prisma.dossier.update({ where: { id: dossierId }, data: { montantTaxes: montant } })
    await logAudit(dossierId, userId, 'LIQUIDATION',
      `Déclaration liquidée${texte(meta.liq_numero) ? ` (n° ${texte(meta.liq_numero)})` : ''} par ${texte(meta.liq_responsable) ?? 'la douane'}${inspecteur ? ` — inspecteur ${inspecteur}` : ''}${montant > 0 ? ` : ${montant.toLocaleString('fr-FR')} FCFA de droits et taxes` : ''}`)
    return null
  }

  // Paiement par le client → règlement client (mode, payeur, référence), rattaché à la fiche CRM
  if (cle === 'paiement_client') {
    const montant = nombre(meta.reglement_montant)
    const mode = texte(meta.reglement_mode)
    if (!montant || !mode || !(MODES_REGLEMENT as readonly string[]).includes(mode)) return null
    const clientNom = texte(meta.reglement_client) ?? dossier.client
    const client = await clientParNom(clientNom, userId).catch(() => null)
    const r = await prisma.reglementClient.create({
      data: {
        dossierId, clientId: client?.id ?? dossier.clientId, clientNom, mode: mode as ModeReglement, montant,
        payeur: texte(meta.reglement_payeur), reference: texte(meta.reglement_reference), banque: texte(meta.reglement_banque),
        dateReglement: date(meta.reglement_date),
        dateEcheance: texte(meta.reglement_echeance) ? date(meta.reglement_echeance) : null,
        observations: texte(meta.reglement_observations), saisiParId: userId,
      },
    })
    await logAudit(dossierId, userId, 'REGLEMENT_CLIENT', `Règlement client (${LIBELLES_MODE[mode as ModeReglement]}) : ${montant.toLocaleString('fr-FR')} FCFA — ${clientNom}`)
    return { enregistrement_id: r.id, enregistrement_type: 'reglement_client' }
  }

  // Paiement des droits et taxes → paiement douane (payé)
  if (cle === 'paiement_droits') {
    const montant = nombre(meta.paiement_montant)
    if (!montant) return null
    const base = texte(meta.paiement_quittance) ?? texte(meta.reference) ?? `QIT-${dossier.numero}`
    const reference = await referenceLibre(base, async r => !!(await prisma.paiementDouane.findUnique({ where: { reference: r } })))
    const p = await prisma.paiementDouane.create({
      data: { dossierId, type: 'droits', montant, statut: 'paye', reference, datePaiement: date(meta.paiement_date) },
    })
    await logAudit(dossierId, userId, 'PAIEMENT_DOUANE', `Droits et taxes payés : ${montant.toLocaleString('fr-FR')} FCFA (${reference})`)
    return { enregistrement_id: p.id, enregistrement_type: 'paiement_douane' }
  }

  // Facturation compagnie / redevance terminal → paiement compagnie (payé)
  const compagnieCfg: Record<string, { montant: string; numero: string; date: string; type: 'frais_portuaires' | 'terminal' }> = {
    'bon_compagnie.facturation_compagnie': { montant: 'bc_montant', numero: 'bc_facture_numero', date: 'bc_date_paiement', type: 'frais_portuaires' },
    'bon_compagnie.facturation_terminal':  { montant: 'term_montant', numero: 'term_facture_numero', date: 'term_date_paiement', type: 'terminal' },
    'operations_douala.facturation_terminal': { montant: 'term_montant', numero: 'term_facture_numero', date: 'term_date_paiement', type: 'terminal' },
    'operations_kribi.facturation_terminal': { montant: 'kct_montant', numero: 'kct_facture_numero', date: 'kct_date_paiement', type: 'terminal' },
  }
  const cfg = compagnieCfg[`${etape}.${cle}`]
  if (cfg) {
    const montant = nombre(meta[cfg.montant])
    if (!montant) return null
    const base = texte(meta[cfg.numero]) ?? `${cfg.type === 'terminal' ? 'TERM' : 'CIE'}-${dossier.numero}`
    const reference = await referenceLibre(base, async r => !!(await prisma.paiementCompagnie.findUnique({ where: { reference: r } })))
    const p = await prisma.paiementCompagnie.create({
      data: { dossierId, compagnie: dossier.compagnie, type: cfg.type, montant, statut: 'paye', reference, datePaiement: date(meta[cfg.date]) },
    })
    await logAudit(dossierId, userId, 'PAIEMENT_COMPAGNIE', `${cfg.type === 'terminal' ? 'Redevance terminal' : 'Facture compagnie'} payée : ${montant.toLocaleString('fr-FR')} FCFA (${reference})`)
    return { enregistrement_id: p.id, enregistrement_type: 'paiement_compagnie' }
  }

  // Gate pass → ticket de sortie enregistré (visible dans Kribi / exports), avec l'heure de sortie
  if (cle === 'gate_pass') {
    const chauffeur = texte(meta.gp_chauffeur) ?? texte(meta.kgp_chauffeur)
    const telephone = texte(meta.gp_telephone)
    const destination = texte(meta.gp_destination)
    if (!chauffeur || !telephone || !destination) return null
    const prefixe = dossier.site === 'Kribi' ? 'GP-KRB-' : 'GP-DLA-'
    const gp = await withUniqueRetry(async () => {
      const numero = await nextSequence(prefixe, async pre =>
        (await prisma.gatePass.findFirst({ where: { numero: { startsWith: pre } }, orderBy: { numero: 'desc' }, select: { numero: true } }))?.numero)
      return prisma.gatePass.create({
        data: {
          dossierId, numero, conteneur: texte(meta.gp_conteneur) ?? dossier.conteneur, chauffeur, telephone, destination,
          dateEmission: new Date(), emetteurId: userId, dateSortie: dateHeureSortie(meta),
        },
      })
    })
    await logAudit(dossierId, userId, 'GATE_PASS', `Gate pass ${gp.numero} — ${chauffeur} (${texte(meta.immatriculation) ?? 'immat. ?'}) → ${destination}${gp.dateSortie ? ` — sortie le ${gp.dateSortie.toLocaleDateString('fr-FR', { timeZone: 'Africa/Douala' })} à ${texte(meta.gp_heure_sortie)}` : ''}`)
    return { enregistrement_id: gp.id, enregistrement_type: 'gate_pass', gate_pass_numero: gp.numero }
  }

  return null
}

/** Fusionne la référence de l'enregistrement créé dans les métadonnées de la sous-étape. */
export async function memoriserEnregistrement(sousEtapeId: string, meta: Meta, ajout: Meta) {
  await prisma.sousEtapeDossier.update({
    where: { id: sousEtapeId },
    data: { metadata: { ...meta, ...ajout } as Prisma.InputJsonValue },
  })
}
