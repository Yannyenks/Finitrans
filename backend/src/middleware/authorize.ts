import { FastifyRequest, FastifyReply } from 'fastify'
import { PermissionNiveau } from '@prisma/client'
import { AuthUser, PERMISSION_RANK } from '../types'

type PermissionKey = 'permDossier' | 'permValidation' | 'permFinancier' | 'permRapports' | 'permAdministration'

export function authorize(permission: PermissionKey, minLevel: PermissionNiveau = 'lecture') {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser
    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Non authentifié' })
    }
    const userRank = PERMISSION_RANK[user[permission]]
    const required  = PERMISSION_RANK[minLevel]
    if (userRank < required) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Permissions insuffisantes' })
    }
  }
}

// Raccourci: seul le DG peut accéder
export async function requireDG(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user as AuthUser
  if (user?.profil !== 'dg') {
    return reply.code(403).send({ error: 'FORBIDDEN', message: 'Réservé au Directeur Général' })
  }
}
