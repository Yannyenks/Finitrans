/**
 * Une tâche terminée dans le dossier crée automatiquement l'enregistrement métier
 * correspondant (paiement, gate pass…), pour que l'employé n'ait rien à ressaisir
 * ailleurs et que Finance / Comptabilité / Kribi soient à jour immédiatement.
 */
import { Prisma } from '@prisma/client'
import { prisma } from '../config/prisma'
import { logAudit } from '../utils/audit'
import { nextSequence, withUniqueRetry } from '../utils/sequence'

type Meta = Record<string, unknown>

const nombre = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}
const texte = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const date = (v: unknown) => {
  const d = texte(v) ? new Date(String(v)) : null
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
