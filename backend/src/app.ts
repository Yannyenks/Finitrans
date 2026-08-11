import Fastify, { FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import websocket from '@fastify/websocket'
import staticFiles from '@fastify/static'
import path from 'path'

import { env } from './config/env'
import { authenticate } from './middleware/authenticate'
import { AppError } from './utils/errors'

import authRoutes          from './routes/auth.routes'
import dossiersRoutes      from './routes/dossiers.routes'
import employesRoutes      from './routes/employes.routes'
import financeRoutes       from './routes/finance.routes'
import alertesRoutes       from './routes/alertes.routes'
import messagerieRoutes    from './routes/messagerie.routes'
import kribiRoutes         from './routes/kribi.routes'
import dashboardRoutes     from './routes/dashboard.routes'
import reportingRoutes     from './routes/reporting.routes'
import parametresRoutes    from './routes/parametres.routes'
import diRoutes            from './routes/di.routes'
import detentionsRoutes    from './routes/detentions.routes'
import codageRoutes        from './routes/codage.routes'
import vehiculesRoutes     from './routes/vehicules.routes'
import interchangesRoutes  from './routes/interchanges.routes'
import notificationsRoutes from './routes/notifications.routes'
import employeRoutes       from './routes/employe.routes'
import exportsRoutes       from './routes/exports.routes'
import sgsRoutes           from './routes/sgs.routes'
import sousEtapesRoutes    from './routes/sous-etapes.routes'

export async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV === 'development' && {
        transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } },
      }),
    },
    ajv: { customOptions: { coerceTypes: true, removeAdditional: 'all' } },
  })

  // ─── Plugins ──────────────────────────────────────────────

  await fastify.register(cors, {
    origin: env.CORS_ORIGIN.split(',').map(s => s.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  })

  await fastify.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { algorithm: 'HS256' },
  })

  await fastify.register(multipart, {
    limits: { fileSize: env.MAX_FILE_SIZE_MB * 1_000_000, files: 5 },
  })

  await fastify.register(staticFiles, {
    root:           path.resolve(process.cwd(), env.UPLOADS_DIR),
    prefix:         '/uploads/',
    decorateReply:  false,
  })

  await fastify.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      error: 'RATE_LIMIT',
      message: 'Trop de requêtes, veuillez patienter',
    }),
  })

  await fastify.register(websocket, { options: { maxPayload: 1_048_576 } })

  // ─── Décoration globale ───────────────────────────────────

  fastify.decorate('authenticate', authenticate)

  // ─── Health check (sans auth) ─────────────────────────────

  fastify.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: env.NODE_ENV,
  }))

  // ─── WebSocket global (notifications temps réel) ──────────

  fastify.register(async function wsRoutes(f) {
    f.get('/ws', { websocket: true }, (connection) => {
      connection.socket.on('message', (msg: Buffer) => {
        try {
          const data = JSON.parse(msg.toString())
          // Echo ping/pong
          if (data.type === 'PING') connection.socket.send(JSON.stringify({ type: 'PONG' }))
        } catch { /* ignorer les messages malformés */ }
      })
    })
  })

  // ─── Routes API ───────────────────────────────────────────

  fastify.register(authRoutes,          { prefix: '/api/auth' })
  fastify.register(dossiersRoutes,      { prefix: '/api/dossiers' })
  fastify.register(employesRoutes,      { prefix: '/api/employes' })
  fastify.register(financeRoutes,       { prefix: '/api/finance' })
  fastify.register(alertesRoutes,       { prefix: '/api/alertes' })
  fastify.register(messagerieRoutes,    { prefix: '/api/messagerie' })
  fastify.register(kribiRoutes,         { prefix: '/api/kribi' })
  fastify.register(dashboardRoutes,     { prefix: '/api/dashboard' })
  fastify.register(reportingRoutes,     { prefix: '/api/reporting' })
  fastify.register(parametresRoutes,    { prefix: '/api/parametres' })
  fastify.register(diRoutes,            { prefix: '/api/di' })
  fastify.register(detentionsRoutes,    { prefix: '/api/detentions' })
  fastify.register(codageRoutes,        { prefix: '/api/codage' })
  fastify.register(vehiculesRoutes,     { prefix: '/api/vehicules' })
  fastify.register(interchangesRoutes,  { prefix: '/api/interchanges' })
  fastify.register(notificationsRoutes, { prefix: '/api/notifications' })
  fastify.register(employeRoutes,       { prefix: '/api/employe' })
  fastify.register(exportsRoutes,       { prefix: '/api/exports' })
  fastify.register(sgsRoutes,           { prefix: '/api/sgs' })
  fastify.register(sousEtapesRoutes,    { prefix: '/api/dossiers' })

  // ─── Gestion d'erreurs globale ────────────────────────────

  fastify.setErrorHandler((error, _request, reply) => {
    fastify.log.error(error)

    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error:   error.code,
        message: error.message,
      })
    }

    // Erreurs Zod (validation)
    if (error.name === 'ZodError') {
      return reply.code(400).send({
        error:   'VALIDATION_ERROR',
        message: 'Données invalides',
        details: (error as any).errors,
      })
    }

    // Erreurs Prisma
    if (error.code === 'P2002') {
      return reply.code(409).send({
        error:   'CONFLICT',
        message: 'Cette valeur existe déjà (contrainte d\'unicité)',
      })
    }
    if (error.code === 'P2025') {
      return reply.code(404).send({
        error:   'NOT_FOUND',
        message: 'Enregistrement introuvable',
      })
    }

    // Erreur JWT
    if (error.statusCode === 401) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: error.message })
    }

    return reply.code(500).send({
      error:   'INTERNAL_ERROR',
      message: env.NODE_ENV === 'production' ? 'Erreur interne du serveur' : error.message,
    })
  })

  fastify.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ error: 'NOT_FOUND', message: 'Route inexistante' })
  })

  return fastify
}
