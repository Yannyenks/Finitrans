/**
 * Facturation client : proposition pré-remplie (étape « Facturation client ») et facture PDF.
 */
import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../middleware/authenticate'
import { authorize } from '../middleware/authorize'
import { NotFoundError } from '../utils/errors'
import { genererFacturePdf, propositionFacture } from '../services/facturation'
import { envoyerContenu } from '../services/televersement'

const facturationRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const preHandler = [authenticate, authorize('permDossier', 'lecture')]

  // GET /api/facturation/dossiers/:id/proposition — lignes pré-remplies depuis le dossier
  fastify.get('/dossiers/:id/proposition', { preHandler }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const p = await propositionFacture(id)
    if (!p) throw new NotFoundError('Dossier', id)
    return reply.send(p)
  })

  // GET /api/facturation/factures/:id/pdf?telecharger=1 — facture aux couleurs FINITRANS
  fastify.get('/factures/:id/pdf', { preHandler }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const { telecharger } = z.object({ telecharger: z.enum(['0', '1']).optional() }).parse(request.query)
    const pdf = await genererFacturePdf(id)
    if (!pdf) throw new NotFoundError('Facture', id)
    return envoyerContenu(request, reply, pdf.buffer, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${telecharger === '1' ? 'attachment' : 'inline'}; filename="${pdf.nomFichier}"`,
      'Cache-Control': 'no-store',
    })
  })
}

export default facturationRoutes
