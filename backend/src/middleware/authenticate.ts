import { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../config/prisma'
import { definirOrganisation } from '../config/contexte'
import { effectivePermissions, getRoleTemplate, isSupervisor } from '../config/roles'
import { chargerOrganisation, estAdminPlateforme, etatAcces, modulesDuPlan } from '../services/organisations'
import { AuthUser } from '../types'

const LECTURES = new Set(['GET', 'HEAD', 'OPTIONS'])

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

  // Étape 2 : charger l'utilisateur et son organisation (peut échouer si Neon est en veille)
  let user, organisation
  try {
    user = await prisma.user.findUnique({
      where: { id: sub },
      select: {
        id: true, email: true, nom: true, profil: true, site: true, actif: true,
        organisationId: true, compagniesAssignees: true,
        permDossier: true, permValidation: true, permFinancier: true,
        permRapports: true, permAdministration: true,
      },
    })
    if (!user || !user.actif) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Compte désactivé ou introuvable' })
    }
    if (!user.organisationId) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Compte non rattaché à une organisation' })
    }
    organisation = await chargerOrganisation(user.organisationId)
  } catch {
    // Erreur DB (Neon en cours de réveil, connexion coupée) — ce n'est PAS une erreur de token.
    // On retourne 503 pour que le frontend garde la session et réessaie.
    return reply.code(503).send({ error: 'SERVICE_UNAVAILABLE', message: 'Service temporairement indisponible — réessayez dans un instant' })
  }

  const acces = etatAcces(organisation)
  if (!acces.ok) return reply.code(402).send({ error: acces.code, message: acces.message })
  if (acces.lectureSeule && !LECTURES.has(request.method) && !request.url.startsWith('/api/auth/')) {
    return reply.code(402).send({ error: 'ABONNEMENT_IMPAYE', message: 'Espace en lecture seule : régularisez l\'abonnement pour modifier les données.' })
  }

  // À partir d'ici, toute requête Prisma de cette requête HTTP est bornée à l'organisation
  definirOrganisation(user.organisationId)

  try {
    const template = await getRoleTemplate(user.profil)
    const modulesPlan = modulesDuPlan(organisation!)
    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      nom: user.nom,
      profil: user.profil,
      site: user.site,
      organisationId: user.organisationId,
      compagniesAssignees: user.compagniesAssignees ?? [],
      ...effectivePermissions(user),
      superviseur: isSupervisor(user.profil),
      modules: template.modules.filter(m => modulesPlan.includes(m)),
      plateformeAdmin: estAdminPlateforme(user.email),
    }
    request.user = authUser
  } catch {
    return reply.code(503).send({ error: 'SERVICE_UNAVAILABLE', message: 'Service temporairement indisponible — réessayez dans un instant' })
  }
}
