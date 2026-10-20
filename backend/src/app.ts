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
import { crochetNotifications, ouvrirContexteNotifications } from './services/evenements'

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
import rolesRoutes         from './routes/roles.routes'
import supervisionRoutes   from './routes/supervision.routes'
import adminRoutes         from './routes/admin.routes'
import rhRoutes            from './routes/rh.routes'
import comptaRoutes        from './routes/compta.routes'
import logistiqueRoutes    from './routes/logistique.routes'
import repertoireRoutes    from './routes/repertoire.routes'
import bibliothequeRoutes  from './routes/bibliotheque.routes'
import televersementsRoutes from './routes/televersements.routes'
import crmRoutes           from './routes/crm.routes'

export async function buildApp(opts: { serverless?: boolean } = {}): Promise<FastifyInstance> {
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

  if (!opts.serverless) {
    await fastify.register(staticFiles, {
      root:           path.resolve(process.cwd(), env.UPLOADS_DIR),
      prefix:         '/uploads/',
      decorateReply:  false,
    })
  }

  // Quota par utilisateur (et non par IP) : tout le bureau partage souvent la même IP publique
  await fastify.register(rateLimit, {
    max: env.NODE_ENV === 'test' ? 100_000 : 600,
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      const auth = request.headers.authorization
      if (auth?.startsWith('Bearer ')) {
        try {
          const payload = JSON.parse(Buffer.from(auth.split('.')[1] ?? '', 'base64url').toString('utf8'))
          if (typeof payload.sub === 'string') return `${request.ip}:${payload.sub}`
        } catch { /* jeton illisible : quota par IP */ }
      }
      return request.ip
    },
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: 'RATE_LIMIT',
      message: `Trop de requêtes, réessayez dans ${Math.ceil(context.ttl / 1000)} s`,
    }),
  })

  if (!opts.serverless) {
    await fastify.register(websocket, { options: { maxPayload: 1_048_576 } })
  }

  // ─── Décoration globale ───────────────────────────────────

  fastify.decorate('authenticate', authenticate)

  // ─── Health check (sans auth) ─────────────────────────────

  fastify.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: env.NODE_ENV,
  }))

  // ─── WebSocket global (notifications temps réel) ──────────

  if (!opts.serverless) {
    fastify.register(async function wsRoutes(f) {
      f.get('/ws', { websocket: true }, (connection) => {
        connection.socket.on('message', (msg: Buffer) => {
          try {
            const data = JSON.parse(msg.toString())
            if (data.type === 'PING') connection.socket.send(JSON.stringify({ type: 'PONG' }))
          } catch { /* ignorer les messages malformés */ }
        })
      })
    })
  }

  // ─── Routes API ───────────────────────────────────────────

  // Chaque action réussie est notifiée aux personnes concernées (voir services/evenements.ts)
  fastify.addHook('onRequest', ouvrirContexteNotifications)
  fastify.addHook('onSend', crochetNotifications)

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
  fastify.register(rolesRoutes,         { prefix: '/api/roles' })
  fastify.register(supervisionRoutes,   { prefix: '/api/supervision' })
  fastify.register(adminRoutes,         { prefix: '/api/admin' })
  fastify.register(rhRoutes,            { prefix: '/api/rh' })
  fastify.register(comptaRoutes,        { prefix: '/api/compta' })
  fastify.register(logistiqueRoutes,    { prefix: '/api/logistique' })
  fastify.register(repertoireRoutes,    { prefix: '/api/repertoire' })
  fastify.register(bibliothequeRoutes,  { prefix: '/api/bibliotheque' })
  fastify.register(televersementsRoutes, { prefix: '/api/televersements' })
  fastify.register(crmRoutes,           { prefix: '/api/crm' })

  // ─── Gestion d'erreurs globale ────────────────────────────

  fastify.setErrorHandler((err, _request, reply) => {
    const error = err as Error & { code?: string; statusCode?: number; errors?: unknown; issues?: { path: (string | number)[]; message: string }[] }

    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ error: error.code, message: error.message })
    }

    // Erreurs Zod (validation) — message lisible : premier champ en erreur
    if (error.name === 'ZodError') {
      const issue = error.issues?.[0]
      const champ = issue?.path?.join('.')
      return reply.code(400).send({
        error:   'VALIDATION_ERROR',
        message: issue ? `Données invalides${champ ? ` (${champ})` : ''} : ${issue.message}` : 'Données invalides',
        details: error.issues,
      })
    }

    // Paramètre de filtre invalide transmis à Prisma (ex. statut inconnu) → erreur client, pas serveur
    if (error.name === 'PrismaClientValidationError') {
      return reply.code(400).send({ error: 'BAD_REQUEST', message: 'Paramètres de requête invalides' })
    }

    // Erreurs Prisma
    if (error.code === 'P2002') {
      return reply.code(409).send({ error: 'CONFLICT', message: 'Cette valeur existe déjà (contrainte d\'unicité)' })
    }
    if (error.code === 'P2025') {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Enregistrement introuvable' })
    }
    if (error.code === 'P2003') {
      return reply.code(409).send({ error: 'REFERENCE', message: 'Opération impossible : l\'élément est référencé ailleurs' })
    }

    // Fichier trop volumineux (multipart)
    if (error.code === 'FST_REQ_FILE_TOO_LARGE' || error.code === 'FST_FILES_LIMIT') {
      return reply.code(413).send({ error: 'FILE_TOO_LARGE', message: `Fichier trop volumineux (max ${env.MAX_FILE_SIZE_MB} Mo)` })
    }

    // Erreurs client Fastify (JSON invalide, rate-limit, 401 JWT…)
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ error: error.code ?? 'BAD_REQUEST', message: error.message })
    }

    fastify.log.error(error)
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
