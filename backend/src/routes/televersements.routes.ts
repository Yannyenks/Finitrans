import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../middleware/authenticate'
import { enregistrerMorceau } from '../services/televersement'

/** Envoi des gros fichiers en plusieurs morceaux (voir services/televersement.ts). */
const televersementsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // POST /api/televersements/:id/morceaux/:index?total=&nom=&type=
  fastify.post('/:id/morceaux/:index', { preHandler: [authenticate] }, async (request, reply) => {
    const { id, index } = z.object({ id: z.string().uuid(), index: z.coerce.number().int().min(0).max(99) }).parse(request.params)
    const q = z.object({
      total: z.coerce.number().int().min(1).max(100),
      nom:   z.string().trim().min(1).max(255),
      type:  z.string().max(100).default('application/octet-stream'),
    }).parse(request.query)
    if (index >= q.total) return reply.code(400).send({ error: 'BAD_REQUEST', message: 'Index de morceau invalide' })
    await enregistrerMorceau(request, { id, index, total: q.total, nom: q.nom, type: q.type || 'application/octet-stream' })
    return reply.send({ recu: index, total: q.total })
  })
}

export default televersementsRoutes
