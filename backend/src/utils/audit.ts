import { Prisma } from '@prisma/client'
import { prisma } from '../config/prisma'

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
