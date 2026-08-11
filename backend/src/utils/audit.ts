import { prisma } from '../config/prisma'

export async function logAudit(
  dossierId: string,
  auteurId: string,
  action: string,
  details?: string,
  metadata?: Record<string, unknown>,
) {
  await prisma.auditEntry.create({
    data: { dossierId, auteurId, action, details, metadata },
  })
}
