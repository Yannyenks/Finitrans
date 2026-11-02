import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { createHash } from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../config/prisma'
import { authenticate } from '../middleware/authenticate'
import { logAudit } from '../utils/audit'
import { NotFoundError } from '../utils/errors'
import { recevoirFichier } from '../services/televersement'
import { appliquerFactureFournisseur, verifierFactureFournisseur } from '../services/di'
import { archiverCompteRendu } from '../services/compteRendu'
import { finaliserDossier } from '../services/finalisation'
import { enregistrerDepuisSousEtape, memoriserEnregistrement } from '../services/enregistrements'
import {
  SOUS_ETAPES_CONFIG, STATUS_LABELS, applicableSousEtapes, initSousEtapes,
  demarrerEtape, echeanceSla, isStatus, motifHorsOrdre, loadAttribution, notifierDirection, notify, stageCompletion,
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
    const dossier = await prisma.dossier.findUnique({ where: { id }, select: { id: true, status: true } })
    if (!dossier) throw new NotFoundError('Dossier', id)

    // Crée et attribue automatiquement les sous-étapes manquantes ; celles de l'étape en cours démarrent
    if (((await initSousEtapes(id)) ?? 0) > 0 && dossier.status !== 'cloture') await demarrerEtape(id, dossier.status)

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

    // Passage de relais : le responsable du dossier, le titulaire de la tâche, ou un intervenant
    // qui a terminé sa propre tâche dans la même étape peut désigner qui fait une tâche non terminée.
    const seulementAssignation = body.responsableId !== undefined
      && body.statut === undefined && body.metadata === undefined
    let peutAssigner = actor.superviseur || isOwnStep || dossier.responsableId === actor.id
    if (!peutAssigner && seulementAssignation) {
      peutAssigner = (await prisma.sousEtapeDossier.count({ where: { dossierId: id, etape, responsableId: actor.id, statut: 'valide' } })) > 0
    }

    // Superviseurs (DG / Exploitation) : contrôle total. Sinon : ses propres sous-étapes (ou une assignation autorisée).
    if (!actor.superviseur && !isOwnStep && !(seulementAssignation && peutAssigner)) {
      return reply.code(403).send({
        error: 'FORBIDDEN',
        message: 'Vous ne pouvez modifier que les sous-étapes qui vous sont attribuées.',
      })
    }
    if (body.responsableId !== undefined && !peutAssigner) {
      return reply.code(403).send({
        error: 'FORBIDDEN',
        message: 'Seuls la Direction, le responsable du dossier et les intervenants de l\'étape peuvent assigner cette tâche.',
      })
    }
    if (body.responsableId !== undefined && !actor.superviseur && existing?.statut === 'valide') {
      return reply.code(422).send({ error: 'TACHE_TERMINEE', message: 'Cette tâche est déjà terminée.' })
    }
    if (body.responsableId === null && !actor.superviseur) {
      return reply.code(422).send({ error: 'RESPONSABLE_REQUIS', message: 'Choisissez la personne qui prend la tâche.' })
    }
    if (body.responsableId) {
      const target = await prisma.user.findUnique({ where: { id: body.responsableId }, select: { actif: true } })
      if (!target?.actif) return reply.code(422).send({ error: 'INVALID_USER', message: 'Responsable introuvable ou inactif' })
    }

    // Ordre du parcours : pas de mise en cours ni de validation avant que la tâche précédente soit validée
    if (body.statut === 'en_cours' || body.statut === 'valide') {
      const motif = await motifHorsOrdre(dossier, etape, cle)
      if (motif) return reply.code(422).send({ error: 'ORDRE_NON_RESPECTE', message: motif })
    }
    const estSuivante = dossier.status === etape && !(await motifHorsOrdre(dossier, etape, cle))

    const data: Record<string, unknown> = {}
    if (body.statut        !== undefined) data.statut        = body.statut
    if (body.responsableId !== undefined) data.responsableId = body.responsableId
    if (body.deadline      !== undefined) data.deadline      = body.deadline ? new Date(body.deadline) : null
    if (body.notes         !== undefined) data.notes         = body.notes
    if (body.metadata      !== undefined) {
      // Champs calculés par le serveur (débit DI, enregistrement métier) : jamais fournis par le client
      for (const k of ['ff_montant_debite', 'ff_solde_di_apres', 'enregistrement_type', 'enregistrement_id']) delete body.metadata[k]
      // Fusion : préserve preuve_url et les autres champs déjà saisis
      const existingMeta = (existing?.metadata ?? {}) as Record<string, unknown>
      data.metadata = { ...existingMeta, ...body.metadata } as Prisma.InputJsonValue
    }
    const maintenant = new Date()
    if (body.statut === 'valide') {
      data.completedAt   = maintenant
      data.completedById = actor.id
      // Tâche terminée sans démarrage explicite : le chronomètre part de l'entrée dans l'étape
      if (!existing?.startedAt) {
        const timing = await prisma.dossierTiming.findFirst({ where: { dossierId: id, etape }, orderBy: { dateDebut: 'desc' }, select: { dateDebut: true } })
        data.startedAt = timing && timing.dateDebut <= maintenant ? timing.dateDebut : (existing?.createdAt ?? maintenant)
      }
    }
    if (body.statut === 'todo' || body.statut === 'en_cours') {
      data.completedAt   = null
      data.completedById = null
    }
    if (body.statut === 'en_cours' && !existing?.startedAt) data.startedAt = maintenant

    // Tâche confiée alors que c'est son tour : elle démarre automatiquement (compte à rebours jusqu'à l'échéance)
    if (body.responsableId && body.statut === undefined && estSuivante && (existing?.statut ?? 'todo') === 'todo') {
      data.statut = 'en_cours'
      if (!existing?.startedAt) data.startedAt = maintenant
      if (!existing?.deadline && body.deadline === undefined) data.deadline = await echeanceSla(etape, cle, maintenant)
    }

    // Facture fournisseur (FF et soumission) : le montant saisi est déduit de la DI dès son enregistrement
    // (avec ou sans validation de la tâche) — contrôle préalable : DI liée, solde suffisant, facture non dupliquée
    if (cle === 'ff_soumission' && (body.metadata !== undefined || body.statut === 'valide')) {
      await verifierFactureFournisseur(dossier.diId, { ...((existing?.metadata ?? {}) as Record<string, unknown>), ...(body.metadata ?? {}) })
    }

    // Facture client établie physiquement : n° et montant requis avant de terminer la tâche
    if (body.statut === 'valide' && cle === 'facture_client' && !(existing?.metadata as Record<string, unknown> | null)?.enregistrement_id) {
      const meta = { ...((existing?.metadata ?? {}) as Record<string, unknown>), ...(body.metadata ?? {}) }
      const montant = Number(String(meta.fc_montant ?? '').replace(/\s/g, '').replace(',', '.'))
      if (!String(meta.fc_numero ?? '').trim() || !(montant > 0)) {
        return reply.code(422).send({ error: 'FACTURE_INCOMPLETE', message: 'Indiquez le n° et le montant TTC de la facture établie physiquement.' })
      }
    }

    let row = await prisma.sousEtapeDossier.upsert({
      where:  { dossierId_etape_cle: { dossierId: id, etape, cle } },
      create: { dossierId: id, etape, cle, ...data },
      update: data,
      include: includeUsers,
    })

    // Tâche terminée → création automatique de l'enregistrement métier (paiement, gate pass…)
    if (body.statut === 'valide') {
      const meta = (row.metadata ?? {}) as Record<string, unknown>
      const ajout = await enregistrerDepuisSousEtape(id, etape, cle, meta, actor.id)
      if (ajout) {
        await memoriserEnregistrement(row.id, meta, ajout)
        row = { ...row, metadata: { ...meta, ...ajout } as typeof row.metadata }
        // Facture émise : le compte rendu du parcours archivé est régénéré avec la facturation
        if (ajout.enregistrement_type === 'facture_client') {
          await archiverCompteRendu(id, actor.id, { nom: actor.nom }).catch(err => request.log.error({ err }, 'Compte rendu non régénéré'))
        }
      }
    }

    // Facture fournisseur : débit (ou ajustement de l'écart) sur la DI du dossier
    if (cle === 'ff_soumission') {
      const ajoutDI = await appliquerFactureFournisseur(row.id, actor.id)
      if (ajoutDI) row = { ...row, metadata: { ...((row.metadata ?? {}) as Record<string, unknown>), ...ajoutDI } as typeof row.metadata }
    }

    // Tâche validée sur l'étape en cours : la tâche suivante démarre maintenant, son titulaire est prévenu
    if (body.statut === 'valide' && dossier.status === etape) {
      const suivante = await demarrerEtape(id, etape, new Date())
      if (suivante?.responsableId && suivante.responsableId !== actor.id) {
        await notify([suivante.responsableId], {
          type: 'action_requise',
          titre: 'À vous : votre tâche démarre',
          message: `${dossier.numero} — ${STATUS_LABELS[etape]} : « ${labelOf(etape, suivante.cle)} » (la tâche précédente vient d'être validée)`,
          dossierId: id, actionUrl: `/dossiers/${id}`, echeance: suivante.deadline,
        })
      }
    }

    const label = labelOf(etape, cle)
    if (body.statut && body.statut !== existing?.statut) {
      const actions: Record<string, string> = {
        valide: 'SOUS_ETAPE_VALIDEE', rejete: 'SOUS_ETAPE_REJETEE', en_cours: 'SOUS_ETAPE_DEMARREE', todo: 'SOUS_ETAPE_REINITIALISEE',
      }
      await logAudit(id, actor.id, actions[body.statut], `${STATUS_LABELS[etape]} — ${label}`)
    }

    if (body.statut === 'rejete' && existing?.statut !== 'rejete') {
      await notifierDirection({
        titre: 'Blocage signalé sur un dossier',
        message: `${dossier.numero} (${dossier.client}) — ${STATUS_LABELS[etape]} : « ${label} » signalée bloquée par ${actor.nom}.`,
        dossierId: id, actionUrl: `/dossiers/${id}`,
      }, actor.id)
    }

    if (body.responsableId && body.responsableId !== existing?.responsableId) {
      await notify([body.responsableId], {
        type: 'action_requise',
        titre: 'Nouvelle tâche attribuée',
        message: `${dossier.numero} — ${STATUS_LABELS[etape]} : ${label}`,
        dossierId: id,
        actionUrl: `/dossiers/${id}`,
        echeance: estSuivante ? row.deadline : null,
      })
    }

    // Facturation client entièrement remplie → le dossier est finalisé automatiquement
    if (body.statut === 'valide' && etape === 'facturation' && dossier.status === 'facturation') {
      await finaliserDossier(id, actor, { silencieux: true })
    }

    // Étape courante entièrement validée → prévenir le responsable du dossier
    if (body.statut === 'valide' && dossier.status === etape && etape !== 'facturation') {
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

    const sonTour = dossier.status === etape && !(await motifHorsOrdre(dossier, etape, cle))
    const row = await prisma.sousEtapeDossier.upsert({
      where:  { dossierId_etape_cle: { dossierId: id, etape, cle } },
      create: { dossierId: id, etape, cle, responsableId: actor.id, ...(sonTour ? { statut: 'en_cours' as const, startedAt: new Date(), deadline: await echeanceSla(etape, cle) } : {}) },
      update: {
        responsableId: actor.id,
        statut: sonTour && existing?.statut === 'todo' ? 'en_cours' : undefined,
        startedAt: !sonTour || existing?.startedAt ? undefined : new Date(),
        deadline: !sonTour || existing?.deadline ? undefined : await echeanceSla(etape, cle),
      },
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

    const fileData = await recevoirFichier(request)
    if (!fileData) return reply.code(400).send({ error: 'NO_FILE', message: 'Aucun fichier fourni' })

    const contenu = await fileData.toBuffer()
    const hashContenu = createHash('sha256').update(contenu).digest('hex')
    const taille = contenu.length < 1_048_576
      ? `${Math.max(1, Math.round(contenu.length / 1024))} Ko`
      : `${(contenu.length / 1_048_576).toFixed(1)} Mo`

    const doc = await prisma.document.create({
      data: {
        dossierId: id, uploadePar: actor.id, nom: fileData.filename, type: fileData.mimetype,
        taille, tailleOctets: contenu.length, contenu, hashContenu, etape, url: '', categorie: 'preuve',
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
