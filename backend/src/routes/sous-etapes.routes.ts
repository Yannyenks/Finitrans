import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../config/prisma'
import { authenticate } from '../middleware/authenticate'
import fs from 'fs'
import path from 'path'
import { pipeline } from 'stream/promises'
import { env } from '../config/env'

// ── Configuration des sous-étapes par étape principale ─────────────────────
export const SOUS_ETAPES_CONFIG: Record<string, { cle: string; label: string }[]> = {
  reception: [
    { cle: 'bl',               label: 'BL' },
    { cle: 'facture_proforma', label: 'Facture proforma' },
    { cle: 'saisie_pr',        label: 'Saisie du PR' },
    { cle: 'paiement_client',  label: 'Paiement par le client' },
    { cle: 'traitement_sgs',   label: 'Traitement SGS' },
    { cle: 'di',               label: 'DI' },
  ],
  soumission_sgs: [
    { cle: 'ff_soumission', label: 'FF et soumission des documents fournisseurs' },
    { cle: 'pvc',           label: 'Obtention du PVC' },
  ],
  codage: [
    { cle: 'etat_codage',  label: 'État de codage et validation' },
    { cle: 'declaration',  label: 'Déclaration' },
    { cle: 'regulation',   label: 'Régulation' },
  ],
  validation: [
    { cle: 'validation_docs', label: 'Validation administrative des documents' },
  ],
  paiement: [
    { cle: 'paiement_droits', label: 'Paiement des droits et taxes' },
  ],
  bon_compagnie: [
    { cle: 'facturation_compagnie', label: 'Facturation & paiement (compagnie maritime)' },
    { cle: 'bon_a_delivrer',        label: 'Soumission & obtention du Bon à Délivrer' },
    { cle: 'facturation_terminal',  label: 'Facturation & paiement (redevance portuaire)' },
    { cle: 'bon_livraison',         label: 'Bon de livraison' },
    { cle: 'gate_pass',             label: 'Gate Pass — Ticket de sortie' },
  ],
  operations_kribi: [
    { cle: 'facturation_terminal', label: 'Facturation & paiement (redevance portuaire)' },
    { cle: 'bon_livraison',        label: 'Bon de livraison' },
    { cle: 'gate_pass',            label: 'Gate Pass — Ticket de sortie' },
  ],
  cloture: [
    { cle: 'rapport_final', label: 'Rapport de clôture du dossier' },
  ],
}

const updateSchema = z.object({
  statut:        z.enum(['todo', 'en_cours', 'valide', 'rejete']).optional(),
  responsableId: z.string().uuid().nullable().optional(),
  deadline:      z.string().datetime().nullable().optional(),
  notes:         z.string().nullable().optional(),
  metadata:      z.record(z.unknown()).optional(),
})

const sousEtapesRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {

  // GET /api/dossiers/:id/sous-etapes
  fastify.get('/:id/sous-etapes', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }

    // Auto-init si aucune sous-étape n'existe
    const count = await prisma.sousEtapeDossier.count({ where: { dossierId: id } })
    if (count === 0) {
      const creates = Object.entries(SOUS_ETAPES_CONFIG).flatMap(([etape, steps]) =>
        steps.map(({ cle }) => ({ dossierId: id, etape, cle }))
      )
      await prisma.sousEtapeDossier.createMany({ data: creates, skipDuplicates: true })
    }

    const rows = await prisma.sousEtapeDossier.findMany({
      where: { dossierId: id },
      include: {
        responsable: { select: { id: true, nom: true, profil: true, role: true, avatarUrl: true } },
        completedBy: { select: { id: true, nom: true } },
      },
      orderBy: [{ etape: 'asc' }, { createdAt: 'asc' }],
    })

    return reply.send(rows)
  })

  // PUT /api/dossiers/:id/sous-etapes/:etape/:cle
  fastify.put('/:id/sous-etapes/:etape/:cle', { preHandler: [authenticate] }, async (request, reply) => {
    const { id, etape, cle } = request.params as { id: string; etape: string; cle: string }
    const actor = request.user as any
    const canManage = actor.profil === 'dg' || actor.profil === 'exploitation'

    const body = updateSchema.parse(request.body)

    // Load existing to check if actor is the assigned responsable
    const existing = await prisma.sousEtapeDossier.findFirst({
      where: { dossierId: id, etape, cle },
    })
    const isOwnStep = existing?.responsableId === actor.id

    // Must be DG/Exploitation OR the assigned responsable of this step
    if (!canManage && !isOwnStep) {
      return reply.code(403).send({
        error: 'FORBIDDEN',
        message: 'Vous ne pouvez modifier que les sous-étapes qui vous sont assignées.',
      })
    }

    // Responsable assignment and final validation restricted to DG/Exploitation
    if ((body.statut === 'valide' || body.responsableId !== undefined) && !canManage) {
      return reply.code(403).send({
        error: 'FORBIDDEN',
        message: 'Seuls le DG et le Chef d\'Exploitation peuvent assigner ou valider les sous-étapes.',
      })
    }

    const data: Record<string, unknown> = {}
    if (body.statut        !== undefined) data.statut        = body.statut
    if (body.responsableId !== undefined) data.responsableId = body.responsableId
    if (body.deadline      !== undefined) data.deadline      = body.deadline ? new Date(body.deadline) : null
    if (body.notes         !== undefined) data.notes         = body.notes
    if (body.metadata      !== undefined) {
      // Merge metadata so preuve_url and other fields are not lost
      const existingMeta = (existing?.metadata ?? {}) as Record<string, unknown>
      data.metadata = { ...existingMeta, ...body.metadata }
    }

    if (body.statut === 'valide') {
      data.completedAt   = new Date()
      data.completedById = actor.id
    }
    if (body.statut === 'todo' || body.statut === 'en_cours') {
      data.completedAt   = null
      data.completedById = null
    }

    const row = await prisma.sousEtapeDossier.upsert({
      where:  { dossierId_etape_cle: { dossierId: id, etape, cle } },
      create: { dossierId: id, etape, cle, ...data },
      update: data,
      include: {
        responsable: { select: { id: true, nom: true, profil: true, role: true, avatarUrl: true } },
        completedBy: { select: { id: true, nom: true } },
      },
    })

    return reply.send(row)
  })

  // POST /api/dossiers/:id/sous-etapes/:etape/:cle/preuve — proof file upload
  fastify.post('/:id/sous-etapes/:etape/:cle/preuve', { preHandler: [authenticate] }, async (request, reply) => {
    const { id, etape, cle } = request.params as { id: string; etape: string; cle: string }
    const actor = request.user as any
    const canManage = actor.profil === 'dg' || actor.profil === 'exploitation'

    const existing = await prisma.sousEtapeDossier.findFirst({
      where: { dossierId: id, etape, cle },
    })
    const isOwnStep = existing?.responsableId === actor.id

    if (!canManage && !isOwnStep) {
      return reply.code(403).send({
        error: 'FORBIDDEN',
        message: 'Vous ne pouvez uploader une preuve que pour vos propres sous-étapes.',
      })
    }

    const fileData = await request.file()
    if (!fileData) return reply.code(400).send({ error: 'NO_FILE', message: 'Aucun fichier fourni' })

    const { filename, file: fileStream } = fileData
    const safeFilename = `${Date.now()}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const uploadDir = path.resolve(process.cwd(), env.UPLOADS_DIR, id, 'preuves')
    await fs.promises.mkdir(uploadDir, { recursive: true })
    const filepath = path.join(uploadDir, safeFilename)

    await pipeline(fileStream, fs.createWriteStream(filepath))

    const preuveUrl = `/uploads/${id}/preuves/${safeFilename}`
    const existingMeta = (existing?.metadata ?? {}) as Record<string, unknown>

    const updated = await prisma.sousEtapeDossier.upsert({
      where:  { dossierId_etape_cle: { dossierId: id, etape, cle } },
      create: { dossierId: id, etape, cle, metadata: { ...existingMeta, preuve_url: preuveUrl, preuve_nom: filename } },
      update: { metadata: { ...existingMeta, preuve_url: preuveUrl, preuve_nom: filename } },
      include: {
        responsable: { select: { id: true, nom: true, profil: true, role: true, avatarUrl: true } },
        completedBy: { select: { id: true, nom: true } },
      },
    })

    return reply.code(201).send(updated)
  })

  // GET /api/dossiers/:id/sous-etapes/check — vérifie si toutes les sous-étapes d'une étape sont validées
  fastify.get('/:id/sous-etapes/check', { preHandler: [authenticate] }, async (request, reply) => {
    const { id }    = request.params as { id: string }
    const { etape } = (request.query as any)

    if (!etape) return reply.code(400).send({ error: 'Paramètre etape requis' })

    const config = SOUS_ETAPES_CONFIG[etape] ?? []
    if (config.length === 0) return reply.send({ allDone: true, count: 0, done: 0 })

    const rows = await prisma.sousEtapeDossier.findMany({
      where: { dossierId: id, etape },
    })

    const done  = rows.filter(r => r.statut === 'valide').length
    const total = config.length

    return reply.send({ allDone: done >= total, done, total })
  })
}

export default sousEtapesRoutes
