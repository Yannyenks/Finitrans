import { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../config/prisma'

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()

    // Charger les données fraîches de l'utilisateur
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
    reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Token invalide ou expiré' })
  }
}
