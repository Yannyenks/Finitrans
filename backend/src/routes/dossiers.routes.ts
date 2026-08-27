import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { createHash } from 'crypto'
import { prisma } from '../config/prisma'
import { authenticate } from '../middleware/authenticate'
import { authorize } from '../middleware/authorize'
import { buildPagination, paginate } from '../utils/pagination'
import { logAudit } from '../utils/audit'
import { NotFoundError } from '../utils/errors'
import { DossierStatus } from '@prisma/client'
import { env } from '../config/env'

const STATUS_ORDER: DossierStatus[] = [
  'reception', 'soumission_sgs', 'codage', 'validation',
  'paiement', 'bon_compagnie', 'operations_kribi', 'cloture',
]

const createDossierSchema = z.object({
  client:            z.string().min(2),
  compagnie:         z.enum(['MSC', 'COSCO', 'MAERSK', 'CMA_CGM']),
  conteneur:         z.string().min(3),
  marchandise:       z.string().min(2),
  site:              z.enum(['Douala', 'Kribi']),
  responsableId:     z.string().uuid(),
  dateArrivee:       z.string().datetime(),
  montantTaxes:      z.number().positive().optional(),
  montantHonoraires: z.number().positive().optional(),
  montantRedevances: z.number().positive().optional(),
  dateLimiteSortie:  z.string().datetime().optional(),
  priorite:          z.enum(['haute', 'moyenne', 'basse']).default('moyenne'),
  numeroDI:          z.string().optional(),
  montantDI:         z.number().positive().optional(),
  fournisseur:       z.string().optional(),
  notes:             z.string().optional(),
})

const updateDossierSchema = createDossierSchema.partial()

const listQuerySchema = z.object({
  page:        z.coerce.number().default(1),
  limit:       z.coerce.number().default(20),
  status:      z.string().optional(),
  site:        z.string().optional(),
  compagnie:   z.string().optional(),
  priorite:    z.string().optional(),
  responsable: z.string().optional(),
  search:      z.string().optional(),
  retardOnly:  z.coerce.boolean().optional(),
})

const commentSchema = z.object({ message: z.string().min(1) })

const dossiersRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const preHandler = [authenticate, authorize('permDossier', 'lecture')]

  // GET /api/dossiers
  fastify.get('/', { preHandler }, async (request, reply) => {
    const q = listQuerySchema.parse(request.query)
    const { skip, take, page, limit } = buildPagination(q.page, q.limit)
    const actor = request.user as any
    const canSeeAll = actor.profil === 'dg' || actor.profil === 'exploitation' || actor.profil === 'comptabilite' || actor.profil === 'admin'

    const where: Record<string, unknown> = {}
    if (q.status)      where.status      = q.status
    if (q.site)        where.site        = q.site
    if (q.compagnie)   where.compagnie   = q.compagnie
    if (q.priorite)    where.priorite    = q.priorite
    if (q.responsable) where.responsableId = q.responsable
    if (q.search) {
      where.OR = [
        { client: { contains: q.search, mode: 'insensitive' } },
        { numero: { contains: q.search, mode: 'insensitive' } },
        { conteneur: { contains: q.search, mode: 'insensitive' } },
      ]
    }
    if (q.retardOnly) {
      where.dateLimiteSortie = { lt: new Date() }
      where.status = { not: 'cloture' }
    }

    // Responsables only see dossiers assigned to them (as main responsable or sous-étape responsable)
    if (!canSeeAll && !q.responsable) {
      const assignedSousEtapes = await prisma.sousEtapeDossier.findMany({
        where: { responsableId: actor.id },
        select: { dossierId: true },
        distinct: ['dossierId'],
      })
      const assignedIds = assignedSousEtapes.map((s: { dossierId: string }) => s.dossierId)
      where.OR = [
        { responsableId: actor.id },
        { id: { in: assignedIds } },
      ]
    }

    const [data, total] = await Promise.all([
      prisma.dossier.findMany({
        where,
        skip,
        take,
        orderBy: { dateCreation: 'desc' },
        include: { responsable: { select: { id: true, nom: true, role: true } } },
      }),
      prisma.dossier.count({ where }),
    ])

    return reply.send(paginate(data, total, page, limit))
  })

  // POST /api/dossiers
  fastify.post('/', { preHandler: [authenticate, authorize('permDossier', 'partiel')] }, async (request, reply) => {
    const body = createDossierSchema.parse(request.body)
    const user = request.user as any

    // Générer le numéro automatiquement
    const year  = new Date().getFullYear()
    const count = await prisma.dossier.count()
    const numero = `DOS-${year}-${String(count + 1).padStart(4, '0')}`

    const dossier = await prisma.dossier.create({
      data: { ...body, numero, dateArrivee: new Date(body.dateArrivee), dateLimiteSortie: body.dateLimiteSortie ? new Date(body.dateLimiteSortie) : undefined },
      include: { responsable: { select: { id: true, nom: true, role: true } } },
    })

    // Démarrer le timing de la première étape
    await prisma.dossierTiming.create({
      data: { dossierId: dossier.id, etape: 'reception', dateDebut: new Date(), dureePrevueJours: 1 },
    })

    await logAudit(dossier.id, user.id, 'CREATION_DOSSIER', `Dossier ${numero} créé`)
    return reply.code(201).send(dossier)
  })

  // GET /api/dossiers/:id
  fastify.get('/:id', { preHandler }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)

    const dossier = await prisma.dossier.findUnique({
      where: { id },
      include: {
        responsable: { select: { id: true, nom: true, role: true, email: true } },
        timings: { orderBy: { dateDebut: 'asc' } },
      },
    })
    if (!dossier) throw new NotFoundError('Dossier', id)
    return reply.send(dossier)
  })

  // PATCH /api/dossiers/:id
  fastify.patch('/:id', { preHandler: [authenticate, authorize('permDossier', 'partiel')] }, async (request, reply) => {
    const { id }  = z.object({ id: z.string().uuid() }).parse(request.params)
    const body    = updateDossierSchema.parse(request.body)
    const user    = request.user as any

    const existing = await prisma.dossier.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('Dossier', id)

    const updated = await prisma.dossier.update({
      where: { id },
      data: {
        ...body,
        dateArrivee: body.dateArrivee ? new Date(body.dateArrivee) : undefined,
        dateLimiteSortie: body.dateLimiteSortie ? new Date(body.dateLimiteSortie) : undefined,
      },
      include: { responsable: { select: { id: true, nom: true, role: true } } },
    })

    await logAudit(id, user.id, 'MODIFICATION_DOSSIER', 'Dossier modifié', body as Record<string, unknown>)
    return reply.send(updated)
  })

  // DELETE /api/dossiers/:id
  fastify.delete('/:id', { preHandler: [authenticate, authorize('permDossier', 'complet')] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const existing = await prisma.dossier.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('Dossier', id)

    await prisma.dossier.delete({ where: { id } })
    return reply.code(204).send()
  })

  // PATCH /api/dossiers/:id/status — Avancer l'étape (+ passation responsable optionnelle)
  fastify.patch('/:id/status', { preHandler: [authenticate, authorize('permDossier', 'partiel')] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body   = z.object({
      status:        z.enum(STATUS_ORDER as [DossierStatus, ...DossierStatus[]]),
      responsableId: z.string().uuid().optional(),
      note:          z.string().optional(),
    }).parse(request.body)
    const user = request.user as any

    const dossier = await prisma.dossier.findUnique({ where: { id } })
    if (!dossier) throw new NotFoundError('Dossier', id)

    // Clôturer le timing actuel
    await prisma.dossierTiming.updateMany({
      where: { dossierId: id, etape: dossier.status, dateFin: null },
      data: { dateFin: new Date() },
    })

    // Démarrer le timing de la nouvelle étape
    const slaParam = await prisma.parametre.findUnique({ where: { cle: 'sla_jours' } })
    const sla = (slaParam?.valeur as Record<string, number>) ?? {}
    await prisma.dossierTiming.create({
      data: {
        dossierId: id,
        etape: body.status,
        dateDebut: new Date(),
        dureePrevueJours: sla[body.status] ?? 2,
      },
    })

    const updateData: any = { status: body.status }
    if (body.responsableId) updateData.responsableId = body.responsableId

    const updated = await prisma.dossier.update({
      where: { id },
      data: updateData,
      include: { responsable: { select: { id: true, nom: true, role: true } } },
    })

    // Note de passation → commentaire
    if (body.note?.trim()) {
      await prisma.commentaire.create({
        data: {
          dossierId: id,
          auteurId:  user.id,
          message:   `📋 Passation (${dossier.status} → ${body.status}) : ${body.note.trim()}`,
        },
      })
    }

    await logAudit(id, user.id, 'CHANGEMENT_STATUT',
      body.responsableId
        ? `${dossier.status} → ${body.status} (nouveau responsable assigné)`
        : `${dossier.status} → ${body.status}`)
    return reply.send(updated)
  })

  // ─── Upload document (multipart) — stocké en base de données ─

  fastify.post('/:id/upload', { preHandler: [authenticate, authorize('permDossier', 'partiel')] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const user = request.user as any

    const existing = await prisma.dossier.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('Dossier', id)

    const data = await request.file()
    if (!data) return reply.code(400).send({ error: 'NO_FILE', message: 'Aucun fichier fourni' })

    const { filename, mimetype, file: fileStream } = data
    const etapeRaw = (data.fields as any)?.etape?.value
    const etape: DossierStatus = STATUS_ORDER.includes(etapeRaw as DossierStatus)
      ? (etapeRaw as DossierStatus)
      : existing.status

    // Lire le fichier en mémoire pour le stocker en base
    const chunks: Buffer[] = []
    for await (const chunk of fileStream) chunks.push(chunk as Buffer)
    const contenu = Buffer.concat(chunks)
    const sizeBytes = contenu.length
    const taille = sizeBytes < 1_048_576
      ? `${Math.round(sizeBytes / 1024)} Ko`
      : `${(sizeBytes / 1_048_576).toFixed(1)} Mo`

    // Calcul empreinte SHA-256 — détection doublon sur le dossier
    const hashContenu = createHash('sha256').update(contenu).digest('hex')
    const doublon = await prisma.document.findFirst({
      where: { dossierId: id, hashContenu },
      select: { nom: true, createdAt: true },
    })
    if (doublon) {
      return reply.code(409).send({
        error: 'DOCUMENT_DUPLIQUE',
        message: `Ce fichier a déjà été uploadé pour ce dossier (${doublon.nom} — ${new Date(doublon.createdAt).toLocaleDateString('fr-FR')}).`,
      })
    }

    const doc = await prisma.document.create({
      data: {
        dossierId: id,
        uploadePar: user.id,
        nom: filename,
        type: mimetype,
        taille,
        contenu,
        hashContenu,
        url: `/api/dossiers/${id}/documents/__ID__/content`,
        etape,
      },
      include: { uploader: { select: { nom: true } } },
    })

    // Mettre à jour l'URL avec l'ID réel du document
    const updated = await prisma.document.update({
      where: { id: doc.id },
      data: { url: `/api/dossiers/${id}/documents/${doc.id}/content` },
      include: { uploader: { select: { nom: true } } },
    })

    await logAudit(id, user.id, 'UPLOAD_DOCUMENT', `"${filename}" uploadé (${taille})`)
    return reply.code(201).send({ ...updated, contenu: undefined })
  })

  // ─── Téléchargement d'un document stocké en base ───────────

  fastify.get('/:id/documents/:docId/content', { preHandler }, async (request, reply) => {
    const { id, docId } = z.object({ id: z.string().uuid(), docId: z.string().uuid() }).parse(request.params)

    const doc = await prisma.document.findFirst({
      where: { id: docId, dossierId: id },
      select: { nom: true, type: true, contenu: true },
    })
    if (!doc) throw new NotFoundError('Document', docId)
    if (!doc.contenu) return reply.code(404).send({ error: 'NO_CONTENT', message: 'Contenu non disponible' })

    reply
      .header('Content-Type', doc.type)
      .header('Content-Disposition', `inline; filename="${encodeURIComponent(doc.nom)}"`)
      .header('Content-Length', doc.contenu.length)
      .send(doc.contenu)
  })

  // ─── Documents ────────────────────────────────────────────

  fastify.get('/:id/documents', { preHandler }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const docs = await prisma.document.findMany({
      where: { dossierId: id },
      include: { uploader: { select: { nom: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return reply.send(docs)
  })

  fastify.post('/:id/documents', { preHandler: [authenticate, authorize('permDossier', 'partiel')] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body = z.object({
      nom: z.string(), type: z.string(), taille: z.string(), url: z.string(), etape: z.string(),
    }).parse(request.body)
    const user = request.user as any

    const existing = await prisma.dossier.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('Dossier', id)

    const doc = await prisma.document.create({
      data: { dossierId: id, uploadePar: user.id, ...body, etape: body.etape as DossierStatus },
    })
    await logAudit(id, user.id, 'UPLOAD_DOCUMENT', `Document ${body.nom} ajouté`)
    return reply.code(201).send(doc)
  })

  fastify.delete('/:id/documents/:docId', { preHandler: [authenticate, authorize('permDossier', 'partiel')] }, async (request, reply) => {
    const { id, docId } = z.object({ id: z.string().uuid(), docId: z.string().uuid() }).parse(request.params)
    const doc = await prisma.document.findFirst({ where: { id: docId, dossierId: id } })
    if (!doc) throw new NotFoundError('Document', docId)
    await prisma.document.delete({ where: { id: docId } })
    return reply.code(204).send()
  })

  // ─── Commentaires ─────────────────────────────────────────

  fastify.get('/:id/commentaires', { preHandler }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const comments = await prisma.commentaire.findMany({
      where: { dossierId: id },
      include: { auteur: { select: { id: true, nom: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return reply.send(comments)
  })

  fastify.post('/:id/commentaires', { preHandler: [authenticate, authorize('permDossier', 'lecture')] }, async (request, reply) => {
    const { id }  = z.object({ id: z.string().uuid() }).parse(request.params)
    const body    = commentSchema.parse(request.body)
    const user    = request.user as any

    const existing = await prisma.dossier.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('Dossier', id)

    const comment = await prisma.commentaire.create({
      data: { dossierId: id, auteurId: user.id, message: body.message },
      include: { auteur: { select: { id: true, nom: true, avatarUrl: true } } },
    })
    return reply.code(201).send(comment)
  })

  // ─── Audit ────────────────────────────────────────────────

  fastify.get('/:id/audit', { preHandler }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const entries = await prisma.auditEntry.findMany({
      where: { dossierId: id },
      include: { auteur: { select: { id: true, nom: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return reply.send(entries)
  })

  // ─── Factures ─────────────────────────────────────────────

  fastify.get('/:id/factures', { preHandler: [authenticate, authorize('permFinancier', 'lecture')] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    return reply.send(await prisma.facture.findMany({ where: { dossierId: id }, orderBy: { dateFacture: 'desc' } }))
  })

  fastify.post('/:id/factures', { preHandler: [authenticate, authorize('permFinancier', 'partiel')] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body = z.object({
      numero: z.string(), type: z.enum(['proforma', 'validee', 'reglee']),
      montant: z.number().positive(), compagnie: z.string(),
      dateFacture: z.string().datetime(), description: z.string(),
    }).parse(request.body)

    const facture = await prisma.facture.create({
      data: { dossierId: id, ...body, dateFacture: new Date(body.dateFacture) },
    })
    await logAudit(id, (request.user as any).id, 'CREATION_FACTURE', `Facture ${body.numero}`)
    return reply.code(201).send(facture)
  })

  // ─── Virements ────────────────────────────────────────────

  fastify.get('/:id/virements', { preHandler: [authenticate, authorize('permFinancier', 'lecture')] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    return reply.send(
      await prisma.virement.findMany({
        where: { dossierId: id },
        include: { responsable: { select: { nom: true } } },
        orderBy: { dateVirement: 'desc' },
      }),
    )
  })

  fastify.post('/:id/virements', { preHandler: [authenticate, authorize('permFinancier', 'partiel')] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body = z.object({
      montant: z.number().positive(), source: z.string(), destination: z.string(),
      dateVirement: z.string().datetime(), reference: z.string(),
    }).parse(request.body)

    const virement = await prisma.virement.create({
      data: { dossierId: id, effectuePar: (request.user as any).id, ...body, dateVirement: new Date(body.dateVirement) },
    })
    await logAudit(id, (request.user as any).id, 'VIREMENT', `Virement ${body.reference} — ${body.montant} FCFA`)
    return reply.code(201).send(virement)
  })

  // ─── Bons de livraison ────────────────────────────────────

  fastify.get('/:id/bons-livraison', { preHandler }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    return reply.send(await prisma.bonLivraison.findMany({ where: { dossierId: id }, orderBy: { dateEmission: 'desc' } }))
  })

  fastify.post('/:id/bons-livraison', { preHandler: [authenticate, authorize('permDossier', 'partiel')] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body = z.object({
      numero: z.string(), description: z.string(), montant: z.number().positive(), dateEmission: z.string().datetime(),
    }).parse(request.body)

    const bl = await prisma.bonLivraison.create({
      data: { dossierId: id, effectuePar: (request.user as any).id, ...body, dateEmission: new Date(body.dateEmission) },
    })
    await logAudit(id, (request.user as any).id, 'BON_LIVRAISON', `BL ${body.numero} créé`)
    return reply.code(201).send(bl)
  })

  // ─── Gate Passes ──────────────────────────────────────────

  fastify.get('/:id/gate-passes', { preHandler }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    return reply.send(
      await prisma.gatePass.findMany({
        where: { dossierId: id },
        include: { emetteur: { select: { nom: true } } },
        orderBy: { dateEmission: 'desc' },
      }),
    )
  })

  fastify.post('/:id/gate-passes', { preHandler: [authenticate, authorize('permDossier', 'partiel')] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body = z.object({
      numero: z.string(), conteneur: z.string(), chauffeur: z.string(),
      telephone: z.string(), destination: z.string(), dateEmission: z.string().datetime(),
    }).parse(request.body)

    const gp = await prisma.gatePass.create({
      data: { dossierId: id, emetteurId: (request.user as any).id, ...body, dateEmission: new Date(body.dateEmission) },
    })
    await logAudit(id, (request.user as any).id, 'GATE_PASS', `Gate Pass ${body.numero} émis`)
    return reply.code(201).send(gp)
  })

  // ─── Timings ──────────────────────────────────────────────

  fastify.get('/:id/timings', { preHandler }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    return reply.send(
      await prisma.dossierTiming.findMany({ where: { dossierId: id }, orderBy: { dateDebut: 'asc' } }),
    )
  })

  // ─── Parcours complet du dossier (timeline unifiée) ───────

  fastify.get('/:id/parcours', { preHandler }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)

    const dossier = await prisma.dossier.findUnique({
      where: { id },
      include: {
        responsable:        { select: { id: true, nom: true, role: true, avatarUrl: true } },
        di:                 { select: { numero: true, montant: true, soldeActuel: true, statut: true } },
        timings:            { orderBy: { dateDebut: 'asc' } },
        documents:          { include: { uploader: { select: { nom: true } } } },
        commentaires:       { include: { auteur: { select: { id: true, nom: true, avatarUrl: true } } } },
        auditEntries:       { include: { auteur: { select: { nom: true } } } },
        paiementsDouane:    true,
        paiementsCompagnie: true,
        virements:          { include: { responsable: { select: { nom: true } } } },
        factures:           true,
        alertes:            true,
        bonsKribi:          { include: { responsable: { select: { nom: true } } } },
        gatePasses:         { include: { emetteur: { select: { nom: true } } } },
        bonsLivraison:      { include: { responsable: { select: { nom: true } } } },
        etatsCodeage:       { include: { soumisPar: { select: { nom: true } }, validePar: { select: { nom: true } } } },
        detentions:         true,
        interchanges:       { include: { responsable: { select: { nom: true } } } },
        soumissionsSGS:     { include: { soumisPar: { select: { nom: true } } } },
      },
    })
    if (!dossier) throw new NotFoundError('Dossier', id)

    const { differenceInDays } = await import('date-fns')
    const now = new Date()

    type TimelineEvent = { date: Date; type: string; [k: string]: unknown }
    const events: TimelineEvent[] = []

    const push = (date: Date | string, type: string, data: Record<string, unknown>) =>
      events.push({ date: new Date(date), type, ...data })

    // ── Étapes SLA ────────────────────────────────────────
    dossier.timings.forEach(t => {
      push(t.dateDebut, 'ETAPE_DEBUT', {
        etape: t.etape, dureePrevueJours: t.dureePrevueJours,
      })
      if (t.dateFin) {
        const duree = differenceInDays(t.dateFin, t.dateDebut)
        push(t.dateFin, 'ETAPE_FIN', {
          etape: t.etape,
          dureeReelleJours: duree,
          enRetard: duree > t.dureePrevueJours,
        })
      }
    })

    // ── Documents ─────────────────────────────────────────
    dossier.documents.forEach(d =>
      push(d.createdAt, 'DOCUMENT', {
        nom: d.nom, typeDoc: d.type, taille: d.taille,
        etape: d.etape, uploadePar: (d as any).uploader?.nom,
      }),
    )

    // ── Commentaires ──────────────────────────────────────
    dossier.commentaires.forEach(c =>
      push(c.createdAt, 'COMMENTAIRE', {
        message: c.message,
        auteur: (c as any).auteur?.nom,
        auteurId: (c as any).auteur?.id,
        avatarUrl: (c as any).auteur?.avatarUrl,
      }),
    )

    // ── Paiements douane ──────────────────────────────────
    dossier.paiementsDouane.forEach(p =>
      push(p.datePaiement, 'PAIEMENT_DOUANE', {
        montant: p.montant, typePaiement: p.type,
        statut: p.statut, reference: p.reference,
      }),
    )

    // ── Paiements compagnie ───────────────────────────────
    dossier.paiementsCompagnie.forEach(p =>
      push(p.datePaiement, 'PAIEMENT_COMPAGNIE', {
        montant: p.montant, compagnie: p.compagnie,
        typePaiement: p.type, statut: p.statut, reference: p.reference,
      }),
    )

    // ── Virements ─────────────────────────────────────────
    dossier.virements.forEach(v =>
      push(v.dateVirement, 'VIREMENT', {
        montant: v.montant, statut: v.statut,
        source: v.source, destination: v.destination,
        reference: v.reference, effectuePar: (v as any).responsable?.nom,
      }),
    )

    // ── Factures ──────────────────────────────────────────
    dossier.factures.forEach(f =>
      push(f.dateFacture, 'FACTURE', {
        montant: f.montant, typeFacture: f.type,
        numero: f.numero, compagnie: f.compagnie,
      }),
    )

    // ── Alertes ───────────────────────────────────────────
    dossier.alertes.forEach(a =>
      push(a.createdAt, 'ALERTE', {
        typeAlerte: a.type, severity: a.severity,
        message: a.message, lu: a.lu,
      }),
    )

    // ── Bons de livraison ─────────────────────────────────
    dossier.bonsLivraison.forEach(b =>
      push(b.dateEmission, 'BON_LIVRAISON', {
        numero: b.numero, montant: b.montant, statut: b.statut,
        responsable: (b as any).responsable?.nom,
      }),
    )

    // ── Bons Kribi ────────────────────────────────────────
    dossier.bonsKribi.forEach(b =>
      push(b.dateEmission, 'BON_KRIBI', {
        typeBon: b.type, numero: b.numero,
        montant: b.montant, statut: b.statut,
        responsable: (b as any).responsable?.nom,
      }),
    )

    // ── Gate passes ───────────────────────────────────────
    dossier.gatePasses.forEach(g =>
      push(g.dateEmission, 'GATE_PASS', {
        numero: g.numero, conteneur: g.conteneur,
        chauffeur: g.chauffeur, destination: g.destination,
        statut: g.statut, emetteur: (g as any).emetteur?.nom,
      }),
    )

    // ── États de codage ───────────────────────────────────
    dossier.etatsCodeage.forEach(ec => {
      push(ec.createdAt, 'ETAT_CODAGE_CREE', {
        codeDouanier: ec.codeDouanier, designation: ec.designation,
        montantDroits: ec.montantDroits, montantTVA: ec.montantTVA,
      })
      if (ec.soumisAt) push(ec.soumisAt, 'ETAT_CODAGE_SOUMIS', {
        codeDouanier: ec.codeDouanier, soumisPar: (ec as any).soumisPar?.nom,
      })
      if (ec.valideAt) push(ec.valideAt, ec.statut === 'valide' ? 'ETAT_CODAGE_VALIDE' : 'ETAT_CODAGE_REJETE', {
        codeDouanier: ec.codeDouanier,
        validePar: (ec as any).validePar?.nom,
        commentaire: ec.commentaireValidation,
      })
    })

    // ── Détentions ────────────────────────────────────────
    dossier.detentions.forEach(d => {
      push(d.dateDebut, 'DETENTION_DEBUT', {
        compagnie: d.compagnie, conteneur: d.conteneur,
        tarifJournalier: d.tarifJournalier,
      })
      if (d.dateFin) push(d.dateFin, 'DETENTION_FIN', {
        joursDetention: d.joursDetention,
        montantTotal: d.montantTotal, statut: d.statut,
      })
    })

    // ── Interchanges ──────────────────────────────────────
    dossier.interchanges.forEach(ic => {
      push(ic.dateEmission, 'INTERCHANGE_EMIS', {
        conteneur: ic.conteneur, compagnie: ic.compagnie,
        dateLimite: ic.dateLimite, statut: ic.statut,
        responsable: (ic as any).responsable?.nom,
      })
      if (ic.dateRetour) push(ic.dateRetour, 'INTERCHANGE_RETOURNE', {
        conteneur: ic.conteneur, statut: ic.statut,
      })
    })

    // ── Soumissions SGS ───────────────────────────────────
    dossier.soumissionsSGS.forEach(s => {
      push(s.dateDepot, 'SGS_DEPOT', {
        reference: s.reference, typeVerification: s.typeVerification,
        statut: s.statut, soumisPar: (s as any).soumisPar?.nom,
        datePrevueRetour: s.datePrevueRetour,
      })
      if (s.dateRetour) push(s.dateRetour, 'SGS_RESULTAT', {
        reference: s.reference, resultat: s.resultat,
        numeroADV: s.numeroADV, statut: s.statut,
      })
    })

    // Trier par date croissante
    events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    // ── Résumé financier ──────────────────────────────────
    const sumPaye = (arr: { statut: string; montant: unknown }[]) =>
      arr.filter(p => p.statut === 'paye' || p.statut === 'effectue')
         .reduce((s, p) => s + Number(p.montant), 0)

    const finance = {
      totalPaiementsDouane:    sumPaye(dossier.paiementsDouane as any),
      totalPaiementsCompagnie: sumPaye(dossier.paiementsCompagnie as any),
      totalVirements:          sumPaye(dossier.virements as any),
      totalBL: dossier.bonsLivraison.filter(b => b.statut === 'valide').reduce((s, b) => s + Number(b.montant), 0),
      montantTaxes:      dossier.montantTaxes ? Number(dossier.montantTaxes) : 0,
      montantHonoraires: dossier.montantHonoraires ? Number(dossier.montantHonoraires) : 0,
      montantRedevances: dossier.montantRedevances ? Number(dossier.montantRedevances) : 0,
    }
    finance.totalCharges = finance.totalPaiementsDouane + finance.totalPaiementsCompagnie as any

    // ── Résumé SLA ────────────────────────────────────────
    const sla = dossier.timings.map(t => {
      const fin  = t.dateFin ?? (dossier.status === t.etape ? now : null)
      const duree = fin ? differenceInDays(fin, t.dateDebut) : null
      return {
        etape:            t.etape,
        dateDebut:        t.dateDebut,
        dateFin:          t.dateFin,
        dureePrevueJours: t.dureePrevueJours,
        dureeReelleJours: duree,
        enRetard:         duree !== null ? duree > t.dureePrevueJours : false,
        enCours:          !t.dateFin && dossier.status === t.etape,
      }
    })

    // ── Statistiques ──────────────────────────────────────
    const stats = {
      documentsCount:        dossier.documents.length,
      commentairesCount:     dossier.commentaires.length,
      alertesNonLues:        dossier.alertes.filter(a => !a.lu).length,
      detentionsActives:     dossier.detentions.filter(d => d.statut === 'en_cours').length,
      interchangesEnRetard:  dossier.interchanges.filter(ic => ic.statut === 'emis' && ic.dateLimite < now).length,
      sgsEnAttente:          dossier.soumissionsSGS.filter(s => !['adv_emise', 'rejete'].includes(s.statut)).length,
      etapesCodageEnAttente: dossier.etatsCodeage.filter(ec => ec.statut === 'soumis').length,
      totalEvenements:       events.length,
    }

    return reply.send({
      dossier: {
        id: dossier.id, numero: dossier.numero, client: dossier.client,
        compagnie: dossier.compagnie, conteneur: dossier.conteneur,
        marchandise: dossier.marchandise, site: dossier.site,
        status: dossier.status, priorite: dossier.priorite,
        dateCreation: dossier.dateCreation, dateArrivee: dossier.dateArrivee,
        dateLimiteSortie: dossier.dateLimiteSortie, notes: dossier.notes,
        responsable: dossier.responsable,
        di: dossier.di,
        enRetard: dossier.dateLimiteSortie ? dossier.dateLimiteSortie < now : false,
      },
      timeline: events,
      sla,
      finance,
      stats,
    })
  })
}

export default dossiersRoutes
