import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '../config/prisma'
import { authenticate } from '../middleware/authenticate'
import { ConflictError, UnauthorizedError } from '../utils/errors'
import { addDays } from 'date-fns'

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(6),
})

const registerSchema = z.object({
  email:     z.string().email(),
  password:  z.string().min(8),
  nom:       z.string().min(2),
  role:      z.string().min(2),
  site:      z.enum(['Douala', 'Kribi']),
  telephone: z.string().optional(),
  profil:    z.enum(['dg', 'exploitation', 'operations', 'validation', 'administration', 'comptabilite', 'terrain_kribi']),
  permDossier:        z.enum(['complet', 'partiel', 'lecture', 'non']).optional(),
  permValidation:     z.enum(['complet', 'partiel', 'lecture', 'non']).optional(),
  permFinancier:      z.enum(['complet', 'partiel', 'lecture', 'non']).optional(),
  permRapports:       z.enum(['complet', 'partiel', 'lecture', 'non']).optional(),
  permAdministration: z.enum(['complet', 'partiel', 'lecture', 'non']).optional(),
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword:     z.string().min(8),
})

const authRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {

  // POST /api/auth/login
  fastify.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body)

    const user = await prisma.user.findUnique({ where: { email: body.email } })
    if (!user || !user.actif) {
      throw new UnauthorizedError('Identifiants incorrects')
    }

    const valid = await bcrypt.compare(body.password, user.passwordHash)
    if (!valid) {
      throw new UnauthorizedError('Identifiants incorrects')
    }

    const payload = { sub: user.id, email: user.email, profil: user.profil, nom: user.nom }
    const accessToken  = fastify.jwt.sign(payload, { expiresIn: '8h' })
    const refreshToken = fastify.jwt.sign({ sub: user.id }, { expiresIn: '30d' })

    await prisma.refreshToken.create({
      data: {
        userId:    user.id,
        token:     refreshToken,
        expiresAt: addDays(new Date(), 30),
      },
    })

    const { passwordHash: _, ...safeUser } = user
    return reply.code(200).send({ accessToken, refreshToken, user: safeUser })
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

    // Révoquer l'ancien token (rotation)
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    })

    const payload       = { sub: user.id, email: user.email, profil: user.profil, nom: user.nom }
    const accessToken   = fastify.jwt.sign(payload, { expiresIn: '8h' })
    const newRefresh    = fastify.jwt.sign({ sub: user.id }, { expiresIn: '30d' })

    await prisma.refreshToken.create({
      data: { userId: user.id, token: newRefresh, expiresAt: addDays(new Date(), 30) },
    })

    return reply.send({ accessToken, refreshToken: newRefresh })
  })

  // POST /api/auth/logout
  fastify.post('/logout', { preHandler: [authenticate] }, async (request, reply) => {
    const { refreshToken } = z.object({ refreshToken: z.string().optional() }).parse(request.body ?? {})
    if (refreshToken) {
      await prisma.refreshToken.updateMany({
        where: { token: refreshToken, revokedAt: null },
        data: { revokedAt: new Date() },
      })
    }
    return reply.code(204).send()
  })

  // GET /api/auth/me
  fastify.get('/me', { preHandler: [authenticate] }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: (request.user as any).id },
      select: {
        id: true, email: true, nom: true, role: true, site: true, telephone: true,
        profil: true, actif: true, avatarUrl: true, createdAt: true,
        permDossier: true, permValidation: true, permFinancier: true,
        permRapports: true, permAdministration: true,
      },
    })
    return reply.send(user)
  })

  // PATCH /api/auth/me/password
  fastify.patch('/me/password', { preHandler: [authenticate] }, async (request, reply) => {
    const body = changePasswordSchema.parse(request.body)
    const user = await prisma.user.findUniqueOrThrow({ where: { id: (request.user as any).id } })

    const valid = await bcrypt.compare(body.currentPassword, user.passwordHash)
    if (!valid) throw new UnauthorizedError('Mot de passe actuel incorrect')

    const newHash = await bcrypt.hash(body.newPassword, 12)
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } })

    // Révoquer tous les refresh tokens
    await prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    })

    return reply.code(204).send()
  })

  // POST /api/auth/register (admin seulement)
  fastify.post('/register', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user as any
    if (user.permAdministration !== 'complet' && user.profil !== 'dg') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Réservé aux administrateurs' })
    }

    const body = registerSchema.parse(request.body)
    const exists = await prisma.user.findUnique({ where: { email: body.email } })
    if (exists) throw new ConflictError('Cet email est déjà utilisé')

    const passwordHash = await bcrypt.hash(body.password, 12)
    const newUser = await prisma.user.create({
      data: {
        email: body.email,
        passwordHash,
        nom: body.nom,
        role: body.role,
        site: body.site,
        telephone: body.telephone,
        profil: body.profil,
        permDossier: body.permDossier ?? 'lecture',
        permValidation: body.permValidation ?? 'non',
        permFinancier: body.permFinancier ?? 'non',
        permRapports: body.permRapports ?? 'non',
        permAdministration: body.permAdministration ?? 'non',
      },
      select: {
        id: true, email: true, nom: true, role: true, site: true,
        profil: true, createdAt: true,
      },
    })

    return reply.code(201).send(newUser)
  })
}

export default authRoutes
