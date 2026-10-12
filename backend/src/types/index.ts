import { PermissionNiveau, Profil, Site } from '@prisma/client'
import type { ModuleKey } from '../config/roles'

// Payload JWT (access token)
export interface JwtPayload {
  sub: string           // user id
  email?: string
  profil?: Profil
  nom?: string
}

// Objet user attaché à chaque requête authentifiée
export interface AuthUser {
  id: string
  email: string
  nom: string
  profil: Profil
  site: Site
  compagniesAssignees: string[]
  permDossier: PermissionNiveau
  permValidation: PermissionNiveau
  permFinancier: PermissionNiveau
  permRapports: PermissionNiveau
  permAdministration: PermissionNiveau
  /** DG / Exploitation : contrôle total, supervision */
  superviseur: boolean
  modules: ModuleKey[]
}

// Hiérarchie des niveaux de permission
export const PERMISSION_RANK: Record<PermissionNiveau, number> = {
  complet: 3,
  partiel: 2,
  lecture: 1,
  non: 0,
}

// Pagination
export interface PaginationQuery {
  page: number
  limit: number
}

export interface PaginatedResult<T> {
  data: T[]
  meta: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

// WebSocket événements
export type WsEvent =
  | { type: 'NEW_MESSAGE';     payload: { conversationId: string; message: unknown } }
  | { type: 'NEW_ALERTE';      payload: { alerte: unknown } }
  | { type: 'DOSSIER_UPDATED'; payload: { dossierId: string; status: string } }

// Déclarations de modules Fastify
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload
    user: AuthUser
  }
}
