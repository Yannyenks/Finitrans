import { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../config/prisma'
import { effectivePermissions, getRoleTemplate, isSupervisor } from '../config/roles'
import { AuthUser } from '../types'

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  // Étape 1 : vérification JWT pure (pas de DB, ne peut pas causer de faux 401)
  let sub: string
  try {
    const payload = await request.jwtVerify<{ sub: string; typ?: string }>()
    // Un refresh token ne doit jamais servir de jeton d'accès
    if (payload.typ === 'refresh' || !payload.sub) throw new Error('invalid token type')
    sub = payload.sub
  } catch {
    return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Token invalide ou expiré' })
  }

  // Étape 2 : charger l'utilisateur depuis la DB (peut échouer si Neon est en veille)
  try {
    const user = await prisma.user.findUnique({
      where: { id: sub },
      select: {
        id: true, email: true, nom: true, profil: true, site: true, actif: true,
        compagniesAssignees: true,
        permDossier: true, permValidation: true, permFinancier: true,
        permRapports: true, permAdministration: true,
      },
    })

    if (!user || !user.actif) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Compte désactivé ou introuvable' })
    }

    const template = await getRoleTemplate(user.profil)
    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      nom: user.nom,
      profil: user.profil,
      site: user.site,
      compagniesAssignees: user.compagniesAssignees ?? [],
      ...effectivePermissions(user),
      superviseur: isSupervisor(user.profil),
      modules: template.modules,
    }
    request.user = authUser
  } catch {
    // Erreur DB (Neon en cours de réveil, connexion coupée) — ce n'est PAS une erreur de token.
    // On retourne 503 pour que le frontend garde la session et réessaie.
    return reply.code(503).send({ error: 'SERVICE_UNAVAILABLE', message: 'Service temporairement indisponible — réessayez dans un instant' })
  }
}
