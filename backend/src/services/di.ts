/**
 * Débit d'une Déclaration d'Importation depuis le workflow (ex. facture fournisseur saisie à l'étape
 * « FF et soumission ») : mêmes règles que la saisie manuelle — pas de facture en double,
 * solde jamais négatif, alertes de seuil automatiques.
 */
import { prisma } from '../config/prisma'
import { AppError } from '../utils/errors'

export interface DebitDI {
  diId: string
  montant: number
  motif: string
  referenceFacture?: string | null
  dossierId?: string | null
  userId: string
}

/** Vérifie qu'un débit est possible (lève une erreur explicite sinon). */
export async function verifierDebitDI(diId: string, montant: number, referenceFacture?: string | null) {
  const di = await prisma.declarationImportation.findUnique({ where: { id: diId } })
  if (!di) throw new AppError(422, 'DI_INTROUVABLE', 'La DI liée au dossier est introuvable.')
  const ref = referenceFacture?.trim().toUpperCase() || null
  if (ref) {
    const doublon = await prisma.mouvementDI.findFirst({
      where: { diId, type: 'debit', referenceFacture: { equals: ref, mode: 'insensitive' } },
      select: { createdAt: true },
    })
    if (doublon) {
      throw new AppError(409, 'FACTURE_DUPLIQUEE', `La facture « ${referenceFacture!.trim()} » a déjà été débitée sur la DI ${di.numero} le ${doublon.createdAt.toLocaleDateString('fr-FR')}.`)
    }
  }
  const solde = Number(di.soldeActuel)
  if (solde - montant < 0) {
    throw new AppError(422, 'SOLDE_DI_INSUFFISANT',
      `Solde de la DI ${di.numero} insuffisant : ${Math.round(solde).toLocaleString('fr-FR')} FCFA disponibles pour une facture de ${Math.round(montant).toLocaleString('fr-FR')} FCFA.`)
  }
  return di
}

export async function debiterDI(p: DebitDI) {
  const di = await verifierDebitDI(p.diId, p.montant, p.referenceFacture)
  const nouveauSolde = Number(di.soldeActuel) - p.montant
  const [mouvement] = await prisma.$transaction([
    prisma.mouvementDI.create({
      data: {
        diId: p.diId, type: 'debit', categorie: 'frais_divers', montant: p.montant, motif: p.motif,
        referenceFacture: p.referenceFacture?.trim().toUpperCase() || null, dossierId: p.dossierId ?? null, createdBy: p.userId,
      },
    }),
    prisma.declarationImportation.update({ where: { id: p.diId }, data: { soldeActuel: nouveauSolde } }),
  ])
  const tauxRestant = (nouveauSolde / Number(di.montant)) * 100
  if (tauxRestant <= di.seuilAlerte2 || tauxRestant <= di.seuilAlerte1) {
    const critique = tauxRestant <= di.seuilAlerte2
    await prisma.alerte.create({
      data: {
        type: 'di_seuil', severity: critique ? 'critical' : 'warning', dossierId: p.dossierId ?? undefined,
        message: critique
          ? `🔴 DI ${di.numero} (${di.client}) : solde CRITIQUE — ${Math.round(tauxRestant)}% restant (seuil ${di.seuilAlerte2}%)`
          : `⚠️ DI ${di.numero} (${di.client}) : solde faible — ${Math.round(tauxRestant)}% restant (seuil ${di.seuilAlerte1}%)`,
      },
    })
  }
  return { mouvement, nouveauSolde, numero: di.numero }
}

// ── Facture fournisseur saisie à « FF et soumission » ─────────────────────────

const montantSaisi = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0
}

/** Montant déjà débité sur la DI pour cette tâche (anciennes saisies : mouvement d'origine). */
async function dejaDebite(meta: Record<string, unknown>): Promise<number> {
  if (meta.ff_montant_debite !== undefined) return Number(meta.ff_montant_debite) || 0
  if (meta.enregistrement_type === 'debit_di' && typeof meta.enregistrement_id === 'string') {
    const mv = await prisma.mouvementDI.findUnique({ where: { id: meta.enregistrement_id }, select: { montant: true } })
    return mv ? Number(mv.montant) : 0
  }
  return 0
}

/** Contrôle avant enregistrement : DI liée et solde suffisant pour l'écart à débiter. */
export async function verifierFactureFournisseur(diId: string | null, meta: Record<string, unknown>) {
  const montant = montantSaisi(meta.ff_montant_facture)
  const ecart = montant - await dejaDebite(meta)
  if (ecart === 0 || montant === 0 && ecart <= 0) return
  if (!diId) {
    throw new AppError(422, 'DI_REQUISE', 'Aucune DI n\'est liée à ce dossier : liez la déclaration d\'importation pour que la facture fournisseur soit débitée.')
  }
  if (ecart > 0) {
    const premiere = !(await dejaDebite(meta))
    await verifierDebitDI(diId, ecart, premiere && typeof meta.ff_reference_facture === 'string' ? meta.ff_reference_facture : null)
  }
}

/**
 * Applique sur la DI le montant de la facture fournisseur de la tâche « FF et soumission » :
 * débit à la première saisie, puis ajustement de l'écart si le montant est corrigé.
 * Renvoie les métadonnées à fusionner (montant débité, solde) ou null si rien à faire.
 */
export async function appliquerFactureFournisseur(sousEtapeId: string, userId: string): Promise<Record<string, unknown> | null> {
  const t = await prisma.sousEtapeDossier.findUnique({
    where: { id: sousEtapeId },
    include: { dossier: { select: { id: true, numero: true, diId: true } } },
  })
  if (!t || t.cle !== 'ff_soumission') return null
  const meta = (t.metadata ?? {}) as Record<string, unknown>
  const montant = montantSaisi(meta.ff_montant_facture)
  const deja = await dejaDebite(meta)
  const ecart = montant - deja
  if (ecart === 0 || !t.dossier.diId) return null
  const ref = typeof meta.ff_reference_facture === 'string' && meta.ff_reference_facture.trim() ? meta.ff_reference_facture.trim() : null

  let mouvementId: string
  let solde: number
  let numero: string
  if (ecart > 0) {
    const r = await debiterDI({
      diId: t.dossier.diId, montant: ecart, dossierId: t.dossier.id, userId,
      referenceFacture: deja === 0 ? ref : null,
      motif: deja === 0
        ? `Facture fournisseur${ref ? ` ${ref}` : ''} — dossier ${t.dossier.numero}`
        : `Correction facture fournisseur${ref ? ` ${ref}` : ''} (+${ecart.toLocaleString('fr-FR')}) — dossier ${t.dossier.numero}`,
    })
    mouvementId = r.mouvement.id; solde = r.nouveauSolde; numero = r.numero
  } else {
    const di = await prisma.declarationImportation.findUnique({ where: { id: t.dossier.diId } })
    if (!di) return null
    solde = Number(di.soldeActuel) - ecart
    numero = di.numero
    const [mv] = await prisma.$transaction([
      prisma.mouvementDI.create({
        data: {
          diId: di.id, type: 'credit', categorie: 'remboursement', montant: -ecart, dossierId: t.dossier.id, createdBy: userId,
          motif: `Correction facture fournisseur${ref ? ` ${ref}` : ''} (${ecart.toLocaleString('fr-FR')}) — dossier ${t.dossier.numero}`,
        },
      }),
      prisma.declarationImportation.update({ where: { id: di.id }, data: { soldeActuel: solde } }),
    ])
    mouvementId = mv.id
  }
  const ajout = {
    ff_montant_debite: montant, ff_solde_di_apres: Math.round(solde),
    enregistrement_type: 'debit_di', enregistrement_id: (meta.enregistrement_id as string | undefined) ?? mouvementId,
  }
  await prisma.sousEtapeDossier.update({ where: { id: t.id }, data: { metadata: { ...meta, ...ajout } } })
  const { logAudit } = await import('../utils/audit')
  await logAudit(t.dossier.id, userId, 'DEBIT_DI',
    `${ecart > 0 ? 'Débit' : 'Crédit'} de ${Math.abs(ecart).toLocaleString('fr-FR')} FCFA sur la DI ${numero} (facture fournisseur${ref ? ` ${ref}` : ''}) — solde ${Math.round(solde).toLocaleString('fr-FR')} FCFA`)
  return ajout
}
