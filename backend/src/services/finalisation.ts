/**
 * Finalisation du dossier : une fois toutes les tâches de la facturation client remplies,
 * le dossier est terminé (facturé). Le chronomètre de la facturation s'arrête, la Direction
 * est prévenue et le compte rendu archivé est régénéré avec la facturation.
 */
import { prisma } from '../config/prisma'
import { AppError } from '../utils/errors'
import { logAudit } from '../utils/audit'
import { notifierDirection, stageCompletion } from './workflow'
import { archiverCompteRendu } from './compteRendu'

export async function finaliserDossier(dossierId: string, user: { id: string; nom: string }, options: { silencieux?: boolean } = {}) {
  const d = await prisma.dossier.findUnique({ where: { id: dossierId }, select: { id: true, numero: true, client: true, status: true, site: true, finaliseLe: true, responsableId: true } })
  if (!d) throw new AppError(404, 'NOT_FOUND', 'Dossier introuvable')
  if (d.finaliseLe) return { dejaFinalise: true, finaliseLe: d.finaliseLe }
  if (d.status !== 'facturation') {
    if (options.silencieux) return null
    throw new AppError(422, 'ETAPE_INVALIDE', 'Le dossier se finalise à l\'étape « Facturation client », après la clôture.')
  }
  const c = await stageCompletion(dossierId, 'facturation', d.site)
  if (!c.allDone) {
    if (options.silencieux) return null
    throw new AppError(422, 'SOUS_ETAPES_INCOMPLETES', `Tâches de facturation à terminer avant de finaliser : ${c.manquantes.join(', ')}`)
  }
  const maintenant = new Date()
  await prisma.$transaction([
    prisma.dossier.update({ where: { id: dossierId }, data: { finaliseLe: maintenant } }),
    prisma.dossierTiming.updateMany({ where: { dossierId, etape: 'facturation', dateFin: null }, data: { dateFin: maintenant, responsableId: d.responsableId } }),
  ])
  await logAudit(dossierId, user.id, 'DOSSIER_FINALISE', `Dossier ${d.numero} finalisé : facturation terminée, dossier clos`)
  await notifierDirection({
    titre: 'Dossier finalisé',
    message: `${d.numero} (${d.client}) : facturation terminée, le dossier est clos.`,
    dossierId, actionUrl: `/dossiers/${dossierId}`,
  }, user.id)
  await archiverCompteRendu(dossierId, user.id, { nom: user.nom }).catch(() => null)
  return { dejaFinalise: false, finaliseLe: maintenant }
}
