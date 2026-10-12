import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { createHash } from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../config/prisma'
import { authenticate } from '../middleware/authenticate'
import { logAudit } from '../utils/audit'
import { NotFoundError } from '../utils/errors'
import {
  SOUS_ETAPES_CONFIG, STATUS_LABELS, applicableSousEtapes, initSousEtapes,
  isStatus, loadAttribution, notify, stageCompletion,
} from '../services/workflow'

export { SOUS_ETAPES_CONFIG }

const updateSchema = z.object({
  statut:        z.enum(['todo', 'en_cours', 'valide', 'rejete']).optional(),
  responsableId: z.string().uuid().nullable().optional(),
  deadline:      z.string().datetime().nullable().optional(),
  notes:         z.string().nullable().optional(),
  metadata:      z.record(z.unknown()).optional(),
})

const paramsSchema = z.object({ id: z.string().uuid(), etape: z.string(), cle: z.string() })

const includeUsers = {
  responsable: { select: { id: true, nom: true, profil: true, role: true, avatarUrl: true } },
  completedBy: { select: { id: true, nom: true } },
} as const

function labelOf(etape: string, cle: string) {
  return (SOUS_ETAPES_CONFIG as Record<string, { cle: string; label: string }[]>)[etape]?.find(s => s.cle === cle)?.label ?? cle
}

const sousEtapesRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {

  async function loadContext(params: unknown) {
    const { id, etape, cle } = paramsSchema.parse(params)
    if (!isStatus(etape) || !(SOUS_ETAPES_CONFIG[etape] ?? []).some(s => s.cle === cle)) {
      throw new NotFoundError('Sous-étape', `${etape}/${cle}`)
    }
    const dossier = await prisma.dossier.findUnique({ where: { id } })
    if (!dossier) throw new NotFoundError('Dossier', id)
    const existing = await prisma.sousEtapeDossier.findUnique({
      where: { dossierId_etape_cle: { dossierId: id, etape, cle } },
    })
    return { id, etape, cle, dossier, existing }
  }

  // GET /api/dossiers/:id/sous-etapes
  fastify.get('/:id/sous-etapes', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const dossier = await prisma.dossier.findUnique({ where: { id }, select: { id: true } })
    if (!dossier) throw new NotFoundError('Dossier', id)

    // Crée et attribue automatiquement les sous-étapes manquantes
    await initSousEtapes(id)

    const rows = await prisma.sousEtapeDossier.findMany({
      where: { dossierId: id },
      include: includeUsers,
      orderBy: [{ etape: 'asc' }, { createdAt: 'asc' }],
    })
    return reply.send(rows)
  })

  // PUT /api/dossiers/:id/sous-etapes/:etape/:cle
  fastify.put('/:id/sous-etapes/:etape/:cle', { preHandler: [authenticate] }, async (request, reply) => {
    const { id, etape, cle, dossier, existing } = await loadContext(request.params)
    const actor = request.user
    const body  = updateSchema.parse(request.body)
    const isOwnStep = !!existing?.responsableId && existing.responsableId === actor.id

    // Superviseurs (DG / Exploitation) : contrôle total. Sinon : uniquement ses propres sous-étapes.
    if (!actor.superviseur && !isOwnStep) {
      return reply.code(403).send({
        error: 'FORBIDDEN',
        message: 'Vous ne pouvez modifier que les sous-étapes qui vous sont attribuées.',
      })
    }
    if (body.responsableId !== undefined && !actor.superviseur) {
      return reply.code(403).send({
        error: 'FORBIDDEN',
        message: 'Seuls le DG et le Responsable Exploitation peuvent réattribuer une sous-étape.',
      })
    }
    if (body.responsableId) {
      const target = await prisma.user.findUnique({ where: { id: body.responsableId }, select: { actif: true } })
      if (!target?.actif) return reply.code(422).send({ error: 'INVALID_USER', message: 'Responsable introuvable ou inactif' })
    }

    const data: Record<string, unknown> = {}
    if (body.statut        !== undefined) data.statut        = body.statut
    if (body.responsableId !== undefined) data.responsableId = body.responsableId
    if (body.deadline      !== undefined) data.deadline      = body.deadline ? new Date(body.deadline) : null
    if (body.notes         !== undefined) data.notes         = body.notes
    if (body.metadata      !== undefined) {
      // Fusion : préserve preuve_url et les autres champs déjà saisis
      const existingMeta = (existing?.metadata ?? {}) as Record<string, unknown>
      data.metadata = { ...existingMeta, ...body.metadata } as Prisma.InputJsonValue
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
      include: includeUsers,
    })

    const label = labelOf(etape, cle)
    if (body.statut && body.statut !== existing?.statut) {
      const actions: Record<string, string> = {
        valide: 'SOUS_ETAPE_VALIDEE', rejete: 'SOUS_ETAPE_REJETEE', en_cours: 'SOUS_ETAPE_DEMARREE', todo: 'SOUS_ETAPE_REINITIALISEE',
      }
      await logAudit(id, actor.id, actions[body.statut], `${STATUS_LABELS[etape]} — ${label}`)
    }

    if (body.responsableId && body.responsableId !== existing?.responsableId) {
      await notify([body.responsableId], {
        type: 'action_requise',
        titre: 'Nouvelle tâche attribuée',
        message: `${dossier.numero} — ${STATUS_LABELS[etape]} : ${label}`,
        dossierId: id,
        actionUrl: `/dossiers/${id}`,
      })
    }

    // Étape courante entièrement validée → prévenir le responsable du dossier
    if (body.statut === 'valide' && dossier.status === etape) {
      const completion = await stageCompletion(id, etape, dossier.site)
      if (completion.allDone && dossier.responsableId !== actor.id) {
        await notify([dossier.responsableId], {
          type: 'action_requise',
          titre: 'Étape prête à être clôturée',
          message: `${dossier.numero} — toutes les tâches « ${STATUS_LABELS[etape]} » sont validées. Vous pouvez passer à l'étape suivante.`,
          dossierId: id,
          actionUrl: `/dossiers/${id}`,
        })
      }
    }

    return reply.send(row)
  })

  // POST /api/dossiers/:id/sous-etapes/:etape/:cle/prendre — se positionner sur une tâche non attribuée
  fastify.post('/:id/sous-etapes/:etape/:cle/prendre', { preHandler: [authenticate] }, async (request, reply) => {
    const { id, etape, cle, dossier, existing } = await loadContext(request.params)
    const actor = request.user

    if (existing?.responsableId && existing.responsableId !== actor.id && !actor.superviseur) {
      return reply.code(409).send({ error: 'DEJA_ATTRIBUEE', message: 'Cette tâche est déjà attribuée à un autre compte.' })
    }
    if (!actor.superviseur) {
      const attribution = await loadAttribution()
      const profil = attribution[etape].sousEtapes[cle] ?? attribution[etape].owner
      if (profil !== actor.profil) {
        return reply.code(403).send({ error: 'FORBIDDEN', message: 'Cette tâche relève d\'un autre profil.' })
      }
    }
    if (!applicableSousEtapes(etape, dossier.site).some(s => s.cle === cle)) {
      return reply.code(422).send({ error: 'NON_APPLICABLE', message: 'Sous-étape non applicable à ce site.' })
    }

    const row = await prisma.sousEtapeDossier.upsert({
      where:  { dossierId_etape_cle: { dossierId: id, etape, cle } },
      create: { dossierId: id, etape, cle, responsableId: actor.id, statut: 'en_cours' },
      update: { responsableId: actor.id, statut: existing?.statut === 'todo' ? 'en_cours' : undefined },
      include: includeUsers,
    })
    await logAudit(id, actor.id, 'SOUS_ETAPE_PRISE_EN_CHARGE', `${STATUS_LABELS[etape]} — ${labelOf(etape, cle)}`)
    return reply.send(row)
  })

  // POST /api/dossiers/:id/sous-etapes/:etape/:cle/preuve — justificatif stocké en base
  fastify.post('/:id/sous-etapes/:etape/:cle/preuve', { preHandler: [authenticate] }, async (request, reply) => {
    const { id, etape, cle, existing } = await loadContext(request.params)
    const actor = request.user
    const isOwnStep = !!existing?.responsableId && existing.responsableId === actor.id

    if (!actor.superviseur && !isOwnStep) {
      return reply.code(403).send({
        error: 'FORBIDDEN',
        message: 'Vous ne pouvez joindre une preuve que pour vos propres sous-étapes.',
      })
    }

    const fileData = await request.file()
    if (!fileData) return reply.code(400).send({ error: 'NO_FILE', message: 'Aucun fichier fourni' })

    const contenu = await fileData.toBuffer()
    const hashContenu = createHash('sha256').update(contenu).digest('hex')
    const taille = contenu.length < 1_048_576
      ? `${Math.max(1, Math.round(contenu.length / 1024))} Ko`
      : `${(contenu.length / 1_048_576).toFixed(1)} Mo`

    const doc = await prisma.document.create({
      data: {
        dossierId: id, uploadePar: actor.id, nom: fileData.filename, type: fileData.mimetype,
        taille, contenu, hashContenu, etape, url: '',
      },
    })
    const url = `/api/dossiers/${id}/documents/${doc.id}/content`
    await prisma.document.update({ where: { id: doc.id }, data: { url } })

    const existingMeta = (existing?.metadata ?? {}) as Record<string, unknown>
    const metadata = { ...existingMeta, preuve_url: url, preuve_nom: fileData.filename, preuve_doc_id: doc.id }
    const updated = await prisma.sousEtapeDossier.upsert({
      where:  { dossierId_etape_cle: { dossierId: id, etape, cle } },
      create: { dossierId: id, etape, cle, metadata },
      update: { metadata },
      include: includeUsers,
    })

    await logAudit(id, actor.id, 'UPLOAD_PREUVE', `Preuve « ${fileData.filename} » — ${labelOf(etape, cle)}`)
    return reply.code(201).send(updated)
  })

  // GET /api/dossiers/:id/sous-etapes/check?etape=… — toutes les sous-étapes d'une étape sont-elles validées ?
  fastify.get('/:id/sous-etapes/check', { preHandler: [authenticate] }, async (request, reply) => {
    const { id }    = z.object({ id: z.string().uuid() }).parse(request.params)
    const { etape } = z.object({ etape: z.string() }).parse(request.query)
    if (!isStatus(etape)) return reply.code(400).send({ error: 'BAD_REQUEST', message: 'Étape inconnue' })

    const dossier = await prisma.dossier.findUnique({ where: { id }, select: { site: true } })
    if (!dossier) throw new NotFoundError('Dossier', id)
    return reply.send(await stageCompletion(id, etape, dossier.site))
  })
}

export default sousEtapesRoutes
