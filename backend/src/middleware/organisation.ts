import { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../config/prisma'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Vérifie côté serveur qu'un dossier désigné par `:id` appartient à l'organisation de l'utilisateur.
 * Un dossier d'une autre organisation répond 404, comme s'il n'existait pas (pas de fuite d'existence).
 * Doit être placé APRÈS `authenticate` : il lit `request.user`.
 */
export async function dossierDeOrganisation(request: FastifyRequest, reply: FastifyReply) {
  const { id } = (request.params ?? {}) as { id?: string }
  if (id === undefined) return

  const organisationId = request.user?.organisationId
  if (!organisationId) {
    return reply.code(403).send({ error: 'FORBIDDEN', message: 'Compte non rattaché à une organisation' })
  }
  if (!UUID.test(id)) {
    return reply.code(404).send({ error: 'NOT_FOUND', message: 'Dossier introuvable' })
  }

  const dossier = await prisma.dossier.findFirst({
    where: { id, organisationId },
    select: { id: true },
  })
  if (!dossier) {
    return reply.code(404).send({ error: 'NOT_FOUND', message: 'Dossier introuvable' })
  }
}
