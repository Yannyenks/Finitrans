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
