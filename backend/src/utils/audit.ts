import { Prisma } from '@prisma/client'
import { prisma } from '../config/prisma'
import { notifierDossier } from '../services/evenements'

export async function logAudit(
  dossierId: string,
  auteurId: string,
  action: string,
  details?: string,
  metadata?: Record<string, unknown>,
) {
  await prisma.auditEntry.create({
    data: { dossierId, auteurId, action, details, metadata: metadata as Prisma.InputJsonValue | undefined },
  })
  // Chaque action posée sur un dossier est notifiée aux personnes concernées (jamais bloquant)
  try {
    await notifierDossier(dossierId, auteurId, LIBELLES_ACTION[action] ?? action.replace(/_/g, ' ').toLowerCase(), details)
  } catch { /* la notification ne doit pas faire échouer l'action */ }
}

export const LIBELLES_ACTION: Record<string, string> = {
  CREATION_DOSSIER: 'Dossier créé', MODIFICATION_DOSSIER: 'Dossier modifié', CHANGEMENT_STATUT: 'Changement d\'étape',
  SOUS_ETAPE_VALIDEE: 'Tâche terminée', SOUS_ETAPE_REJETEE: 'Blocage signalé', SOUS_ETAPE_DEMARREE: 'Tâche reprise',
  SOUS_ETAPE_REINITIALISEE: 'Tâche réinitialisée', SOUS_ETAPE_PRISE_EN_CHARGE: 'Tâche prise en charge',
  UPLOAD_PREUVE: 'Preuve jointe', UPLOAD_DOCUMENT: 'Document ajouté', SUPPRESSION_DOCUMENT: 'Document supprimé',
  AFFECTATION_ETAPE: 'Étape confiée', REATTRIBUTION: 'Tâches transférées', COMMENTAIRE: 'Nouveau commentaire',
  ETAT_CODAGE_CREE: 'Position tarifaire ajoutée', ETAT_CODAGE_SOUMIS: 'Position tarifaire soumise',
  ETAT_CODAGE_VALIDE: 'Position tarifaire validée', ETAT_CODAGE_REJETE: 'Position tarifaire rejetée', CODAGE_VALIDE: 'Codage validé',
  PAIEMENT_DOUANE: 'Droits et taxes payés', PAIEMENT_COMPAGNIE: 'Paiement compagnie', REGLEMENT_CLIENT: 'Règlement client',
  GATE_PASS: 'Gate pass émis', BON_LIVRAISON: 'Bon de livraison', CREATION_FACTURE: 'Facture créée', VIREMENT: 'Virement',
  PENALITE: 'Pénalité', DEBIT_DI: 'DI débitée', FACTURE_CLIENT: 'Facture client émise', TRANSPORT: 'Transport', TRANSPORT_STATUT: 'Transport mis à jour', COMPTE_RENDU_ARCHIVE: 'Compte rendu archivé',
}

/** Journal d'activité global (actions hors dossier). Ne fait jamais échouer la requête. */
export async function logActivity(
  userId: string | null,
  action: string,
  entite: string,
  entiteId?: string | null,
  details?: string,
  metadata?: Record<string, unknown>,
) {
  try {
    await prisma.activityLog.create({
      data: {
        userId, action, entite, entiteId: entiteId ?? null, details,
        metadata: metadata as Prisma.InputJsonValue | undefined,
      },
    })
  } catch {
    /* journalisation best-effort */
  }
}
