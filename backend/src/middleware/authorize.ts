import { FastifyRequest, FastifyReply } from 'fastify'
import { PermissionNiveau } from '@prisma/client'
import { PERMISSION_RANK } from '../types'
import type { ModuleKey, PermissionKey } from '../config/roles'

export function authorize(permission: PermissionKey, minLevel: PermissionNiveau = 'lecture') {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user
    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Non authentifié' })
    }
    const userRank = PERMISSION_RANK[user[permission]]
    const required = PERMISSION_RANK[minLevel]
    if (userRank < required) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Permissions insuffisantes' })
    }
  }
}

/** Accès conditionné à un module attribué au profil (voir config/roles.ts). */
export function requireModule(...modules: ModuleKey[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user
    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Non authentifié' })
    }
    if (!modules.some(m => user.modules.includes(m))) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Module non attribué à votre profil' })
    }
  }
}

// Réservé aux superviseurs (DG + Responsable Exploitation)
export async function requireSupervisor(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user?.superviseur) {
    return reply.code(403).send({ error: 'FORBIDDEN', message: 'Réservé à la Direction et à l\'Exploitation' })
  }
}

// Raccourci: seul le DG peut accéder
export async function requireDG(request: FastifyRequest, reply: FastifyReply) {
  if (request.user?.profil !== 'dg') {
    return reply.code(403).send({ error: 'FORBIDDEN', message: 'Réservé au Directeur Général' })
  }
}
