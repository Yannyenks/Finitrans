import { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../config/prisma'

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  // Étape 1 : vérification JWT pure (pas de DB, ne peut pas causer de faux 401)
  try {
    await request.jwtVerify()
  } catch {
    return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Token invalide ou expiré' })
  }

  // Étape 2 : charger l'utilisateur depuis la DB (peut échouer si Neon est en veille)
  try {
    const payload = request.user as { sub: string }
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true, email: true, nom: true, profil: true, site: true, actif: true,
        permDossier: true, permValidation: true, permFinancier: true,
        permRapports: true, permAdministration: true,
      },
    })

    if (!user || !user.actif) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Compte désactivé ou introuvable' })
    }

    request.user = user as any
  } catch {
    // Erreur DB (Neon en cours de réveil, connexion coupée) — ce n'est PAS une erreur de token.
    // On retourne 503 pour que le frontend garde la session et réessaie.
    return reply.code(503).send({ error: 'SERVICE_UNAVAILABLE', message: 'Service temporairement indisponible — réessayez dans un instant' })
  }
}
