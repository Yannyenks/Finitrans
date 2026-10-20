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
import { debiterDI } from './di'

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

export async function enregistrerDepuisSousEtape(
  dossierId: string, etape: string, cle: string, meta: Meta, userId: string,
): Promise<Meta | null> {
  if (meta.enregistrement_id) return null // déjà créé (révision puis revalidation)
  const dossier = await prisma.dossier.findUnique({ where: { id: dossierId } })
  if (!dossier) return null

  // Facture fournisseur (FF et soumission) → débit de la DI du dossier
  if (cle === 'ff_soumission') {
    const montant = nombre(meta.ff_montant_facture)
    if (!montant || !dossier.diId) return null
    const ref = texte(meta.ff_reference_facture)
    const debit = await debiterDI({
      diId: dossier.diId, montant, referenceFacture: ref, dossierId, userId,
      motif: `Facture fournisseur${ref ? ` ${ref}` : ''} — dossier ${dossier.numero}`,
    })
    await logAudit(dossierId, userId, 'DEBIT_DI', `Facture fournisseur ${ref ?? ''} : ${montant.toLocaleString('fr-FR')} FCFA débités sur la DI ${debit.numero} (solde ${Math.round(debit.nouveauSolde).toLocaleString('fr-FR')} FCFA)`.replace('  ', ' '))
    return { enregistrement_id: debit.mouvement.id, enregistrement_type: 'debit_di' }
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

  // Gate pass → ticket de sortie enregistré (visible dans Kribi / exports)
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
          dateEmission: new Date(), emetteurId: userId,
        },
      })
    })
    await logAudit(dossierId, userId, 'GATE_PASS', `Gate pass ${gp.numero} — ${chauffeur} (${texte(meta.immatriculation) ?? 'immat. ?'}) → ${destination}`)
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
