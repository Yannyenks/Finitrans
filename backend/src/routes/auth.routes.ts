import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { prisma } from '../config/prisma'
import { env } from '../config/env'
import { authenticate } from '../middleware/authenticate'
import { UnauthorizedError } from '../utils/errors'
import { logActivity } from '../utils/audit'
import { buildSessionUser, createUser, createUserSchema, estCompteArchive } from '../services/users'
import { definirOrganisation } from '../config/contexte'
import { chargerOrganisation, creerEspace, etatAcces } from '../services/organisations'
import { addDays } from 'date-fns'

const loginSchema = z.object({
  email:    z.string().email().transform(e => e.trim().toLowerCase()),
  password: z.string().min(6),
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword:     z.string().min(8, 'Le nouveau mot de passe doit contenir au moins 8 caractères'),
})

const ACCESS_EXPIRES  = env.JWT_ACCESS_EXPIRES
const REFRESH_DAYS    = 30

const inscriptionSchema = z.object({
  entreprise:  z.string().trim().min(2, 'Nom de l\'entreprise trop court').max(160),
  nom:         z.string().trim().min(2, 'Indiquez votre nom').max(120),
  email:       z.string().trim().toLowerCase().email('Adresse email invalide').max(255),
  password:    z.string().min(10, 'Le mot de passe doit contenir au moins 10 caractères').max(200)
    .regex(/[A-Za-z]/, 'Le mot de passe doit contenir au moins une lettre')
    .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre'),
  pays:        z.string().trim().length(2).regex(/^[A-Za-z]{2}$/).transform(p => p.toUpperCase()).default('CM'),
  telephone:   z.string().trim().max(40).optional(),
  langue:      z.enum(['fr', 'en']).default('fr'),
  accepteConditions: z.literal(true, { errorMap: () => ({ message: 'Acceptez les conditions d\'utilisation' }) }),
})

/**
 * Accès à l'espace de l'organisation : null si autorisé, sinon le refus à renvoyer.
 * Inscrit aussi l'organisation dans le contexte de la requête (les requêtes suivantes y sont bornées).
 */
async function accesOrganisationRefuse(organisationId: string | null) {
  if (!organisationId) return { statut: 403, code: 'FORBIDDEN', message: 'Compte non rattaché à une organisation' }
  const acces = etatAcces(await chargerOrganisation(organisationId))
  if (!acces.ok) return { statut: 402, code: acces.code, message: acces.message }
  definirOrganisation(organisationId)
  return null
}

const authRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {

  async function issueTokens(userId: string) {
    // jti aléatoire : deux jetons émis dans la même seconde restent distincts (contrainte d'unicité)
    const accessToken  = fastify.jwt.sign({ sub: userId, jti: randomUUID() } as never, { expiresIn: ACCESS_EXPIRES })
    const refreshToken = fastify.jwt.sign({ sub: userId, typ: 'refresh', jti: randomUUID() } as never, { expiresIn: `${REFRESH_DAYS}d` })
    await prisma.refreshToken.create({
      data: { userId, token: refreshToken, expiresAt: addDays(new Date(), REFRESH_DAYS) },
    })
    return { accessToken, refreshToken }
  }

  // POST /api/auth/login — limité contre le bruteforce
  fastify.post('/login', {
    config: { rateLimit: { max: env.NODE_ENV === 'test' ? 1000 : 30, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const body = loginSchema.parse(request.body)

    const user = await prisma.user.findUnique({ where: { email: body.email } })
    if (!user || !user.actif) {
      throw new UnauthorizedError('Identifiants incorrects')
    }

    const valid = await bcrypt.compare(body.password, user.passwordHash)
    if (!valid) {
      throw new UnauthorizedError('Identifiants incorrects')
    }

    // L'email suffit à retrouver l'espace de l'entreprise : on vérifie qu'il est accessible
    const refus = await accesOrganisationRefuse(user.organisationId)
    if (refus) return reply.code(refus.statut).send({ error: refus.code, message: refus.message })

    const tokens = await issueTokens(user.id)
    const sessionUser = await buildSessionUser(user.id)
    await logActivity(user.id, 'CONNEXION', 'user', user.id)
    return reply.code(200).send({ ...tokens, user: sessionUser })
  })

  // POST /api/auth/inscription — création en libre-service de l'espace d'une entreprise (essai gratuit)
  fastify.post('/inscription', {
    config: { rateLimit: { max: env.NODE_ENV === 'test' ? 1000 : 5, timeWindow: '1 hour' } },
  }, async (request, reply) => {
    const body = inscriptionSchema.parse(request.body)
    if (estCompteArchive(body.email)) return reply.code(422).send({ error: 'EMAIL_RESERVE', message: 'Cette adresse est réservée' })

    // L'email identifie l'espace : un même email ne peut pas ouvrir deux espaces
    const existant = await prisma.user.findUnique({ where: { email: body.email }, select: { id: true } })
    if (existant) {
      return reply.code(409).send({ error: 'EMAIL_UTILISE', message: 'Un compte existe déjà avec cet email. Connectez-vous pour retrouver votre espace.' })
    }

    const { organisation, user } = await creerEspace({ ...body, plan: 'business', statut: 'essai' })

    definirOrganisation(organisation.id)
    const tokens = await issueTokens(user.id)
    await logActivity(user.id, 'INSCRIPTION', 'organisation', organisation.id, organisation.nom)
    return reply.code(201).send({ ...tokens, user: await buildSessionUser(user.id) })
  })

  // POST /api/auth/refresh
  fastify.post('/refresh', async (request, reply) => {
    const { refreshToken } = z.object({ refreshToken: z.string() }).parse(request.body)

    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } })
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedError('Refresh token invalide ou expiré')
    }

    let decoded: { sub: string }
    try {
      decoded = fastify.jwt.verify<{ sub: string }>(refreshToken)
    } catch {
      throw new UnauthorizedError('Token invalide')
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.sub } })
    if (!user || !user.actif) {
      throw new UnauthorizedError('Compte introuvable ou désactivé')
    }
    const refus = await accesOrganisationRefuse(user.organisationId)
    if (refus) return reply.code(refus.statut).send({ error: refus.code, message: refus.message })

    // Révoquer l'ancien token (rotation)
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    })

    const tokens = await issueTokens(user.id)
    return reply.send({ ...tokens, user: await buildSessionUser(user.id) })
  })

  // POST /api/auth/logout
  fastify.post('/logout', { preHandler: [authenticate] }, async (request, reply) => {
    const { refreshToken } = z.object({ refreshToken: z.string().optional() }).parse(request.body ?? {})
    if (refreshToken) {
      await prisma.refreshToken.updateMany({
        where: { token: refreshToken, userId: request.user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      })
    }
    return reply.code(204).send()
  })

  // GET /api/auth/me — profil + modules accessibles
  fastify.get('/me', { preHandler: [authenticate] }, async (request, reply) => {
    return reply.send(await buildSessionUser(request.user.id))
  })

  // PATCH /api/auth/me — l'utilisateur met à jour ses coordonnées
  fastify.patch('/me', { preHandler: [authenticate] }, async (request, reply) => {
    const body = z.object({
      telephone: z.string().max(50).optional(),
      avatarUrl: z.string().url().max(500).optional(),
    }).parse(request.body)
    await prisma.user.update({ where: { id: request.user.id }, data: body })
    return reply.send(await buildSessionUser(request.user.id))
  })

  // PATCH /api/auth/me/password
  fastify.patch('/me/password', { preHandler: [authenticate] }, async (request, reply) => {
    const body = changePasswordSchema.parse(request.body)
    const user = await prisma.user.findUniqueOrThrow({ where: { id: request.user.id } })

    const valid = await bcrypt.compare(body.currentPassword, user.passwordHash)
    if (!valid) throw new UnauthorizedError('Mot de passe actuel incorrect')

    const newHash = await bcrypt.hash(body.newPassword, 12)
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } })

    // Révoquer tous les refresh tokens
    await prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    await logActivity(user.id, 'MOT_DE_PASSE_MODIFIE', 'user', user.id)

    return reply.code(204).send()
  })

  // POST /api/auth/register — création de compte (Direction / Exploitation)
  fastify.post('/register', { preHandler: [authenticate] }, async (request, reply) => {
    const body = createUserSchema.parse(request.body)
    const newUser = await createUser(request.user, body)
    await logActivity(request.user.id, 'COMPTE_CREE', 'user', newUser.id, `${newUser.nom} (${newUser.profil})`)
    return reply.code(201).send(newUser)
  })
}

export default authRoutes
