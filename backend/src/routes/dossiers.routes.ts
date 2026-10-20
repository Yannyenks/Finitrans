import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { createHash } from 'crypto'
import { DossierStatus, Prisma } from '@prisma/client'
import { prisma } from '../config/prisma'
import { authenticate } from '../middleware/authenticate'
import { authorize } from '../middleware/authorize'
import { buildPagination, paginate } from '../utils/pagination'
import { logAudit } from '../utils/audit'
import { NotFoundError } from '../utils/errors'
import { nextSequence, withUniqueRetry } from '../utils/sequence'
import { AuthUser } from '../types'
import { envoyerContenu, recevoirFichier } from '../services/televersement'
import { archiverCompteRendu, genererCompteRendu } from '../services/compteRendu'
import {
  STATUS_ORDER, STATUS_LABELS, applicableSousEtapes, assignStage, demarrerEtape, initSousEtapes, loadAttribution,
  nextStage, notifierDirection, notifierTitulaires, notify, resolveAssignee, stageCompletion, stageOwner, stagesForSite,
} from '../services/workflow'
import { rattacherClient } from '../services/crm'
import { compagnieConnue, zCompagnie } from '../services/compagnies'
import { PROFILS_TOUS_DOSSIERS } from '../config/roles'

const createDossierSchema = z.object({
  client:            z.string().min(2),
  compagnie:         zCompagnie,
  conteneur:         z.string().min(3),
  nombreConteneurs:  z.number().int().min(1).max(500).optional(),
  tailleConteneur:   z.string().trim().max(30).optional(),
  marchandise:       z.string().min(2),
  site:              z.enum(['Douala', 'Kribi']),
  responsableId:     z.string().uuid().optional(),
  dateArrivee:       z.string().datetime(),
  montantTaxes:      z.number().nonnegative().optional(),
  montantHonoraires: z.number().nonnegative().optional(),
  montantRedevances: z.number().nonnegative().optional(),
  dateLimiteSortie:  z.string().datetime().optional(),
  priorite:          z.enum(['haute', 'moyenne', 'basse']).default('moyenne'),
  numeroDI:          z.string().optional(),
  montantDI:         z.number().nonnegative().optional(),
  fournisseur:       z.string().optional(),
  numeroBL:          z.string().optional(),
  numDeclaration:    z.string().optional(),
  regimeDouanier:    z.string().optional(),
  prSaisie:          z.boolean().optional(),
  notes:             z.string().optional(),
})

const updateDossierSchema = createDossierSchema.partial().extend({
  priorite: z.enum(['haute', 'moyenne', 'basse']).optional(),
})

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

/** Profils qui voient l'ensemble des dossiers (enregistrement, finance) en plus des superviseurs. */
const VOIT_TOUS_LES_DOSSIERS: string[] = PROFILS_TOUS_DOSSIERS

/** Le compte est-il impliqué dans le dossier (responsable ou titulaire d'une sous-étape) ? */
async function isInvolved(actor: AuthUser, dossier: { id: string; responsableId: string }, etape?: DossierStatus) {
  if (dossier.responsableId === actor.id) return true
  const count = await prisma.sousEtapeDossier.count({
    where: { dossierId: dossier.id, responsableId: actor.id, ...(etape ? { etape } : {}) },
  })
  return count > 0
}

const dossiersRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const preHandler = [authenticate, authorize('permDossier', 'lecture')]

  // GET /api/dossiers
  fastify.get('/', { preHandler }, async (request, reply) => {
    const q = listQuerySchema.parse(request.query)
    const { skip, take, page, limit } = buildPagination(q.page, q.limit)
    const actor = request.user
    const canSeeAll = actor.superviseur || VOIT_TOUS_LES_DOSSIERS.includes(actor.profil)

    const and: Prisma.DossierWhereInput[] = []
    const where: Prisma.DossierWhereInput = { AND: and }
    if (q.status) {
      // Plusieurs étapes possibles : ?status=paiement,bon_compagnie
      const statuts = q.status.split(',').map(x => x.trim()).filter((x): x is DossierStatus => STATUS_ORDER.includes(x as DossierStatus))
      if (statuts.length === 0) return reply.code(400).send({ error: 'BAD_REQUEST', message: `Étape inconnue : ${q.status}` })
      and.push({ status: { in: statuts } })
    }
    if (q.site && ['Douala', 'Kribi'].includes(q.site)) and.push({ site: q.site as 'Douala' | 'Kribi' })
    if (q.compagnie) {
      const compagnies = q.compagnie.split(',').map(c => c.trim()).filter(c => c.length >= 2)
      if (compagnies.length) and.push({ compagnie: { in: compagnies } })
    }
    if (q.priorite && ['haute', 'moyenne', 'basse'].includes(q.priorite)) and.push({ priorite: q.priorite as 'haute' | 'moyenne' | 'basse' })
    if (q.responsable) and.push({ responsableId: q.responsable })
    if (q.search) {
      and.push({ OR: [
        { client:    { contains: q.search, mode: 'insensitive' } },
        { numero:    { contains: q.search, mode: 'insensitive' } },
        { conteneur: { contains: q.search, mode: 'insensitive' } },
        { numeroBL:  { contains: q.search, mode: 'insensitive' } },
      ] })
    }
    if (q.retardOnly) {
      and.push({ dateLimiteSortie: { lt: new Date() }, status: { not: 'cloture' } })
    }

    // Les autres comptes ne voient que les dossiers où ils interviennent
    if (!canSeeAll) {
      and.push({ OR: [
        { responsableId: actor.id },
        { sousEtapes: { some: { responsableId: actor.id } } },
      ] })
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

  // POST /api/dossiers — enregistrement + attribution automatique des tâches
  fastify.post('/', { preHandler: [authenticate, authorize('permDossier', 'partiel')] }, async (request, reply) => {
    const body = createDossierSchema.parse(request.body)
    if (body.compagnie && !(await compagnieConnue(body.compagnie))) {
      return reply.code(422).send({ error: 'COMPAGNIE_INCONNUE', message: `Compagnie « ${body.compagnie} » inconnue : la Direction peut l'ajouter dans Paramètres > Compagnies maritimes.` })
    }
    const user = request.user

    let responsableId = body.responsableId
    if (responsableId) {
      const resp = await prisma.user.findUnique({ where: { id: responsableId }, select: { actif: true } })
      if (!resp?.actif) return reply.code(422).send({ error: 'INVALID_USER', message: 'Responsable introuvable ou inactif' })
    } else {
      const attribution = await loadAttribution()
      responsableId = (await resolveAssignee(attribution.reception.owner, body)) ?? user.id
    }

    const year = new Date().getFullYear()
    const dossier = await withUniqueRetry(async () => {
      const numero = await nextSequence(`DOS-${year}-`, async prefix =>
        (await prisma.dossier.findFirst({ where: { numero: { startsWith: prefix } }, orderBy: { numero: 'desc' }, select: { numero: true } }))?.numero)
      return prisma.dossier.create({
        data: {
          ...body,
          responsableId: responsableId!,
          numero,
          dateArrivee: new Date(body.dateArrivee),
          dateLimiteSortie: body.dateLimiteSortie ? new Date(body.dateLimiteSortie) : undefined,
        },
        include: { responsable: { select: { id: true, nom: true, role: true } } },
      })
    })

    // Démarrer le timing de la première étape
    await prisma.dossierTiming.create({
      data: { dossierId: dossier.id, etape: 'reception', dateDebut: new Date(), dureePrevueJours: 1, responsableId },
    })

    await initSousEtapes(dossier.id)
    await demarrerEtape(dossier.id, 'reception')
    await rattacherClient(dossier.id, dossier.client, user.id)

    // Chaque titulaire est prévenu avec l'échéance de sa tâche : le compte à rebours démarre aussitôt
    await notifierTitulaires(dossier.id, 'reception', {
      titre: 'Nouveau dossier à traiter',
      message: `${dossier.numero} — ${dossier.client} : des tâches de réception vous sont attribuées`,
    }, { sauf: user.id, aussi: [responsableId] })
    await logAudit(dossier.id, user.id, 'CREATION_DOSSIER', `Dossier ${dossier.numero} créé`)

    return reply.code(201).send(dossier)
  })

  // GET /api/dossiers/:id
  fastify.get('/:id', { preHandler }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)

    const dossier = await prisma.dossier.findUnique({
      where: { id },
      include: {
        responsable: { select: { id: true, nom: true, role: true, email: true } },
        timings: { orderBy: { dateDebut: 'asc' }, include: { responsable: { select: { id: true, nom: true, role: true } } } },
      },
    })
    if (!dossier) throw new NotFoundError('Dossier', id)
    return reply.send({ ...dossier, parcoursEtapes: stagesForSite(dossier.site) })
  })

  // GET /api/dossiers/:id/next-step — prochaine étape, responsable pressenti, droits de l'utilisateur
  fastify.get('/:id/next-step', { preHandler }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const actor = request.user
    const dossier = await prisma.dossier.findUnique({ where: { id } })
    if (!dossier) throw new NotFoundError('Dossier', id)

    const suivante   = nextStage(dossier.status, dossier.site)
    const completion = await stageCompletion(id, dossier.status, dossier.site)
    const involved   = await isInvolved(actor, dossier, dossier.status)
    const preuves    = await prisma.document.count({ where: { dossierId: id, etape: dossier.status } })

    let suggere: { id: string; nom: string; role: string } | null = null
    if (suivante) {
      const uid = await stageOwner(dossier, suivante)
      if (uid) suggere = await prisma.user.findUnique({ where: { id: uid }, select: { id: true, nom: true, role: true } })
    }

    const raisons: string[] = []
    if (!suivante) raisons.push('Dossier à la dernière étape')
    if (!actor.superviseur) {
      if (!involved) raisons.push('Vous n\'êtes pas responsable de cette étape')
      if (!completion.allDone) raisons.push(`Tâches non validées : ${completion.manquantes.join(', ')}`)
      if (preuves === 0) raisons.push('Aucun document de preuve pour l\'étape en cours')
    }

    return reply.send({
      etapeCourante: dossier.status,
      etapeSuivante: suivante,
      parcours: stagesForSite(dossier.site),
      completion,
      preuves,
      responsableSuggere: suggere,
      peutAvancer: !!suivante && (actor.superviseur || raisons.length === 0),
      raisons,
    })
  })

  // ─── Affectation des étapes du parcours ───────────────────
  // Les responsables (Direction, responsable du dossier, intervenants) désignent à l'avance
  // qui traitera chaque étape : la personne reçoit les tâches ouvertes de l'étape.

  fastify.get('/:id/affectations', { preHandler }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const actor = request.user
    const dossier = await prisma.dossier.findUnique({ where: { id } })
    if (!dossier) throw new NotFoundError('Dossier', id)

    const parcours = stagesForSite(dossier.site)
    const courant = parcours.indexOf(dossier.status)
    const [affectations, taches] = await Promise.all([
      prisma.affectationEtape.findMany({
        where: { dossierId: id },
        include: { responsable: { select: { id: true, nom: true, role: true } }, assignePar: { select: { nom: true } } },
      }),
      prisma.sousEtapeDossier.findMany({
        where: { dossierId: id },
        select: { etape: true, statut: true, responsableId: true, responsable: { select: { id: true, nom: true } } },
      }),
    ])
    const implique = actor.superviseur || await isInvolved(actor, dossier)

    return reply.send(parcours.map((etape, i) => {
      const t = taches.filter(x => x.etape === etape)
      const titulaires = new Map<string, { id: string; nom: string; taches: number }>()
      t.forEach(x => {
        if (!x.responsable) return
        const cur = titulaires.get(x.responsable.id) ?? { ...x.responsable, taches: 0 }
        cur.taches++
        titulaires.set(x.responsable.id, cur)
      })
      const a = affectations.find(x => x.etape === etape)
      return {
        etape, label: STATUS_LABELS[etape], position: i,
        terminee: dossier.status === 'cloture' || i < courant,
        courante: i === courant,
        affectation: a ? { responsable: a.responsable, assignePar: a.assignePar.nom, note: a.note, updatedAt: a.updatedAt } : null,
        titulaires: [...titulaires.values()],
        tachesOuvertes: t.filter(x => x.statut !== 'valide').length,
        modifiable: implique && dossier.status !== 'cloture' && i >= courant,
      }
    }))
  })

  fastify.put('/:id/affectations/:etape', { preHandler }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid(), etape: z.enum(STATUS_ORDER as [DossierStatus, ...DossierStatus[]]) }).parse(request.params)
    const body = z.object({ responsableId: z.string().uuid(), note: z.string().max(1000).optional() }).parse(request.body)
    const actor = request.user
    const dossier = await prisma.dossier.findUnique({ where: { id: params.id } })
    if (!dossier) throw new NotFoundError('Dossier', params.id)

    const parcours = stagesForSite(dossier.site)
    const position = parcours.indexOf(params.etape)
    if (position < 0) return reply.code(422).send({ error: 'ETAPE_INVALIDE', message: `L'étape « ${STATUS_LABELS[params.etape]} » ne fait pas partie du parcours de ce dossier.` })
    if (dossier.status === 'cloture' || position < parcours.indexOf(dossier.status)) {
      return reply.code(422).send({ error: 'ETAPE_TERMINEE', message: 'Cette étape est déjà terminée.' })
    }
    if (!actor.superviseur && !(await isInvolved(actor, dossier))) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Seuls les responsables intervenant sur ce dossier (ou la Direction) peuvent assigner ses étapes.' })
    }
    const cible = await prisma.user.findUnique({ where: { id: body.responsableId }, select: { id: true, nom: true, actif: true } })
    if (!cible?.actif) return reply.code(422).send({ error: 'INVALID_USER', message: 'Responsable introuvable ou inactif' })

    await initSousEtapes(dossier.id)
    const affectation = await prisma.affectationEtape.upsert({
      where: { dossierId_etape: { dossierId: dossier.id, etape: params.etape } },
      update: { responsableId: cible.id, assigneParId: actor.id, note: body.note?.trim() || null },
      create: { dossierId: dossier.id, etape: params.etape, responsableId: cible.id, assigneParId: actor.id, note: body.note?.trim() || null },
      include: { responsable: { select: { id: true, nom: true, role: true } } },
    })
    const { count } = await prisma.sousEtapeDossier.updateMany({
      where: { dossierId: dossier.id, etape: params.etape, statut: { not: 'valide' } },
      data: { responsableId: cible.id },
    })
    // Étape en cours : la personne désignée devient aussi responsable du dossier et ses tâches démarrent
    if (params.etape === dossier.status) {
      await prisma.dossier.update({ where: { id: dossier.id }, data: { responsableId: cible.id } })
      await prisma.dossierTiming.updateMany({ where: { dossierId: dossier.id, etape: params.etape, dateFin: null }, data: { responsableId: cible.id } })
      await demarrerEtape(dossier.id, params.etape)
    }
    const prochaine = await prisma.sousEtapeDossier.findFirst({
      where: { dossierId: dossier.id, etape: params.etape, responsableId: cible.id, statut: { not: 'valide' }, deadline: { not: null } },
      orderBy: { deadline: 'asc' }, select: { deadline: true },
    })

    if (cible.id !== actor.id) {
      await notify([cible.id], {
        type: 'action_requise',
        titre: `Étape « ${STATUS_LABELS[params.etape]} » vous est confiée`,
        message: `${actor.nom} vous confie l'étape « ${STATUS_LABELS[params.etape]} » du dossier ${dossier.numero} (${dossier.client})${body.note?.trim() ? ` : ${body.note.trim()}` : ''}.`,
        dossierId: dossier.id,
        actionUrl: `/dossiers/${dossier.id}`,
        echeance: params.etape === dossier.status ? prochaine?.deadline ?? null : null,
      })
    }
    await logAudit(dossier.id, actor.id, 'AFFECTATION_ETAPE', `Étape « ${STATUS_LABELS[params.etape]} » confiée à ${cible.nom} (${count} tâche(s))`,
      { etape: params.etape, responsableId: cible.id })
    return reply.send({ ...affectation, tachesAttribuees: count })
  })

  fastify.delete('/:id/affectations/:etape', { preHandler }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid(), etape: z.enum(STATUS_ORDER as [DossierStatus, ...DossierStatus[]]) }).parse(request.params)
    const actor = request.user
    const dossier = await prisma.dossier.findUnique({ where: { id: params.id } })
    if (!dossier) throw new NotFoundError('Dossier', params.id)
    if (!actor.superviseur && !(await isInvolved(actor, dossier))) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Action réservée aux responsables du dossier.' })
    }
    await prisma.affectationEtape.deleteMany({ where: { dossierId: dossier.id, etape: params.etape } })
    await logAudit(dossier.id, actor.id, 'AFFECTATION_ETAPE', `Désignation retirée pour l'étape « ${STATUS_LABELS[params.etape]} »`)
    return reply.code(204).send()
  })

  // ─── Compte rendu d'évolution (PDF) ───────────────────────

  fastify.get('/:id/compte-rendu', { preHandler }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const { telecharger } = z.object({ telecharger: z.coerce.boolean().optional() }).parse(request.query)
    const cr = await genererCompteRendu(id, { nom: request.user.nom })
    if (!cr) throw new NotFoundError('Dossier', id)
    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `${telecharger ? 'attachment' : 'inline'}; filename="${cr.nomFichier}"`)
      .header('Content-Length', cr.buffer.length)
      .header('Cache-Control', 'no-store')
    return reply.send(cr.buffer)
  })

  // PATCH /api/dossiers/:id
  fastify.patch('/:id', { preHandler: [authenticate, authorize('permDossier', 'partiel')] }, async (request, reply) => {
    const { id }  = z.object({ id: z.string().uuid() }).parse(request.params)
    const body    = updateDossierSchema.parse(request.body)
    if (body.compagnie && !(await compagnieConnue(body.compagnie))) {
      return reply.code(422).send({ error: 'COMPAGNIE_INCONNUE', message: `Compagnie « ${body.compagnie} » inconnue : la Direction peut l'ajouter dans Paramètres > Compagnies maritimes.` })
    }
    const user    = request.user

    const existing = await prisma.dossier.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('Dossier', id)

    if (!user.superviseur) {
      const canEdit = user.profil === 'administration' || await isInvolved(user, existing)
      if (!canEdit) return reply.code(403).send({ error: 'FORBIDDEN', message: 'Vous n\'intervenez pas sur ce dossier.' })
      if (body.responsableId && body.responsableId !== existing.responsableId) {
        return reply.code(403).send({ error: 'FORBIDDEN', message: 'Seuls le DG et l\'Exploitation peuvent changer le responsable.' })
      }
    }

    const updated = await prisma.dossier.update({
      where: { id },
      data: {
        ...body,
        dateArrivee: body.dateArrivee ? new Date(body.dateArrivee) : undefined,
        dateLimiteSortie: body.dateLimiteSortie ? new Date(body.dateLimiteSortie) : undefined,
      },
      include: { responsable: { select: { id: true, nom: true, role: true } } },
    })

    if (body.client && body.client !== existing.client) await rattacherClient(id, body.client, user.id)
    await logAudit(id, user.id, 'MODIFICATION_DOSSIER', 'Dossier modifié', body as Record<string, unknown>)
    return reply.send(updated)
  })

  // DELETE /api/dossiers/:id
  fastify.delete('/:id', { preHandler: [authenticate, authorize('permDossier', 'complet')] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const existing = await prisma.dossier.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('Dossier', id)

    await prisma.$transaction([
      prisma.conversation.updateMany({ where: { dossierId: id }, data: { dossierId: null } }),
      prisma.mouvementDI.updateMany({ where: { dossierId: id }, data: { dossierId: null } }),
      prisma.dossier.delete({ where: { id } }),
    ])
    return reply.code(204).send()
  })

  // PATCH /api/dossiers/:id/status — Terminer l'étape et passer à la suivante (+ passation)
  fastify.patch('/:id/status', { preHandler }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body   = z.object({
      status:        z.enum(STATUS_ORDER as [DossierStatus, ...DossierStatus[]]),
      responsableId: z.string().uuid().optional(),
      note:          z.string().optional(),
      /** Répartition choisie des tâches de la nouvelle étape : clé de sous-étape → compte */
      taches:        z.record(z.string(), z.string().uuid()).optional(),
    }).parse(request.body)
    const user = request.user

    const dossier = await prisma.dossier.findUnique({ where: { id } })
    if (!dossier) throw new NotFoundError('Dossier', id)
    if (body.status === dossier.status) {
      return reply.code(422).send({ error: 'MEME_ETAPE', message: 'Le dossier est déjà à cette étape.' })
    }

    // Les comptes non superviseurs terminent eux-mêmes leur étape, dans l'ordre du parcours
    if (!user.superviseur) {
      if (!(await isInvolved(user, dossier, dossier.status))) {
        return reply.code(403).send({ error: 'FORBIDDEN', message: 'Seul le responsable de l\'étape en cours (ou la Direction) peut la terminer.' })
      }
      const suivante = nextStage(dossier.status, dossier.site)
      if (body.status !== suivante) {
        return reply.code(422).send({
          error: 'ETAPE_INVALIDE',
          message: `L'étape suivante du parcours est « ${suivante ? STATUS_LABELS[suivante] : '—'} ».`,
        })
      }
      const completion = await stageCompletion(id, dossier.status, dossier.site)
      if (!completion.allDone) {
        return reply.code(422).send({
          error: 'SOUS_ETAPES_INCOMPLETES',
          message: `Tâches à valider avant de continuer : ${completion.manquantes.join(', ')}`,
        })
      }
      const preuves = await prisma.document.count({ where: { dossierId: id, etape: dossier.status } })
      if (preuves === 0) {
        return reply.code(422).send({
          error: 'PREUVE_REQUISE',
          message: `Joignez au moins un document de preuve pour l'étape « ${STATUS_LABELS[dossier.status]} ».`,
        })
      }
    }

    if (body.responsableId) {
      const resp = await prisma.user.findUnique({ where: { id: body.responsableId }, select: { actif: true } })
      if (!resp?.actif) return reply.code(422).send({ error: 'INVALID_USER', message: 'Responsable introuvable ou inactif' })
    }
    const repartition = Object.entries(body.taches ?? {})
    if (repartition.length > 0) {
      const cles = new Set(applicableSousEtapes(body.status, dossier.site).map(s => s.cle))
      const inconnue = repartition.find(([cle]) => !cles.has(cle))
      if (inconnue) return reply.code(422).send({ error: 'SOUS_ETAPE_INVALIDE', message: `Tâche inconnue pour l'étape « ${STATUS_LABELS[body.status]} » : ${inconnue[0]}` })
      const ids = [...new Set(repartition.map(([, uid]) => uid))]
      const actifs = await prisma.user.count({ where: { id: { in: ids }, actif: true } })
      if (actifs !== ids.length) return reply.code(422).send({ error: 'INVALID_USER', message: 'Un des comptes choisis est introuvable ou inactif' })
    }

    // Créer les sous-étapes manquantes et attribuer celles de la nouvelle étape
    await initSousEtapes(id)
    const ownerAuto = await assignStage(dossier, body.status)
    const nouveauResponsable = body.responsableId ?? ownerAuto ?? dossier.responsableId

    // Passation choisie par la personne qui termine l'étape : la personne désignée
    // reçoit aussi les tâches non terminées de l'étape suivante
    if (body.responsableId) {
      await prisma.sousEtapeDossier.updateMany({
        where: { dossierId: id, etape: body.status, statut: { not: 'valide' } },
        data: { responsableId: body.responsableId },
      })
    }
    // Répartition tâche par tâche (prioritaire sur la passation globale)
    for (const [cle, uid] of repartition) {
      await prisma.sousEtapeDossier.updateMany({
        where: { dossierId: id, etape: body.status, cle, statut: { not: 'valide' } },
        data: { responsableId: uid },
      })
    }
    // Retour à une étape antérieure : les tâches non terminées des étapes suivantes repartent de zéro
    // (leur compte à rebours redémarrera quand le dossier y reviendra)
    const parcoursDossier = stagesForSite(dossier.site)
    const retour = parcoursDossier.indexOf(body.status) < parcoursDossier.indexOf(dossier.status)
    if (retour) {
      await prisma.sousEtapeDossier.updateMany({
        where: { dossierId: id, etape: { in: parcoursDossier.slice(parcoursDossier.indexOf(body.status) + 1) }, statut: { not: 'valide' } },
        data: { statut: 'todo', startedAt: null, deadline: null },
      })
    }
    // Le chronomètre des tâches de la nouvelle étape démarre maintenant (échéances selon le SLA)
    await demarrerEtape(id, body.status)

    // Clôturer le timing actuel en enregistrant le responsable qui a traité l'étape
    await prisma.dossierTiming.updateMany({
      where: { dossierId: id, etape: dossier.status, dateFin: null },
      data: { dateFin: new Date(), responsableId: dossier.responsableId },
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
        responsableId: nouveauResponsable,
      },
    })

    const updated = await prisma.dossier.update({
      where: { id },
      data: { status: body.status, responsableId: nouveauResponsable },
      include: { responsable: { select: { id: true, nom: true, role: true } } },
    })

    // Note de passation → commentaire
    if (body.note?.trim()) {
      await prisma.commentaire.create({
        data: {
          dossierId: id,
          auteurId:  user.id,
          message:   `📋 Passation (${STATUS_LABELS[dossier.status]} → ${STATUS_LABELS[body.status]}) : ${body.note.trim()}`,
        },
      })
    }

    // Prévenir le nouveau responsable et les titulaires des tâches de la nouvelle étape
    await notifierTitulaires(id, body.status, {
      titre: `Dossier ${updated.numero} : ${STATUS_LABELS[body.status]}`,
      message: `Le dossier ${updated.numero} (${updated.client}) est passé à l'étape « ${STATUS_LABELS[body.status]} ». Des tâches vous attendent.`,
    }, { sauf: user.id, aussi: [nouveauResponsable] })

    await logAudit(id, user.id, 'CHANGEMENT_STATUT',
      nouveauResponsable !== dossier.responsableId
        ? `${STATUS_LABELS[dossier.status]} → ${STATUS_LABELS[body.status]} (nouveau responsable assigné)`
        : `${STATUS_LABELS[dossier.status]} → ${STATUS_LABELS[body.status]}`)

    // Clôture : le compte rendu complet est généré et archivé dans la bibliothèque
    if (body.status === 'cloture') {
      try {
        const cr = await archiverCompteRendu(id, user.id, { nom: user.nom })
        if (cr) await logAudit(id, user.id, 'COMPTE_RENDU_ARCHIVE', `Compte rendu de clôture archivé (${cr.nom})`)
        await notifierDirection({
          titre: `Dossier ${updated.numero} clôturé`,
          message: `${updated.client} — dossier clôturé par ${user.nom}. Le compte rendu est disponible dans la bibliothèque.`,
          dossierId: id, actionUrl: `/dossiers/${id}`,
        }, user.id)
      } catch (err) {
        request.log.error({ err }, 'Compte rendu de clôture non généré')
      }
    }

    return reply.send(updated)
  })

  // ─── Upload document (multipart) — stocké en base de données ─

  fastify.post('/:id/upload', { preHandler }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const user = request.user

    const existing = await prisma.dossier.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('Dossier', id)

    // Écriture : permission dossier partielle, ou compte intervenant sur le dossier
    const canWrite = ['partiel', 'complet'].includes(user.permDossier) || await isInvolved(user, existing)
    if (!canWrite) return reply.code(403).send({ error: 'FORBIDDEN', message: 'Permissions insuffisantes' })

    const data = await recevoirFichier(request)
    if (!data) return reply.code(400).send({ error: 'NO_FILE', message: 'Aucun fichier fourni' })

    const { filename, mimetype } = data
    const etapeRaw = (data.fields as any)?.etape?.value
    const etape: DossierStatus = STATUS_ORDER.includes(etapeRaw as DossierStatus)
      ? (etapeRaw as DossierStatus)
      : existing.status

    const contenu = await data.toBuffer()
    const sizeBytes = contenu.length
    const taille = sizeBytes < 1_048_576
      ? `${Math.max(1, Math.round(sizeBytes / 1024))} Ko`
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
        dossierId: id, uploadePar: user.id, nom: filename, type: mimetype,
        taille, tailleOctets: sizeBytes, contenu, hashContenu, url: '', etape, categorie: 'preuve',
      },
    })

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

    return envoyerContenu(request, reply, doc.contenu, {
      'Content-Type': doc.type,
      'Content-Disposition': `inline; filename="${encodeURIComponent(doc.nom)}"`,
    })
  })

  // ─── Documents ────────────────────────────────────────────

  fastify.get('/:id/documents', { preHandler }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const docs = await prisma.document.findMany({
      where: { dossierId: id },
      select: {
        id: true, dossierId: true, nom: true, type: true, taille: true, url: true,
        etape: true, uploadePar: true, createdAt: true, uploader: { select: { nom: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return reply.send(docs)
  })

  fastify.delete('/:id/documents/:docId', { preHandler: [authenticate, authorize('permDossier', 'partiel')] }, async (request, reply) => {
    const { id, docId } = z.object({ id: z.string().uuid(), docId: z.string().uuid() }).parse(request.params)
    const doc = await prisma.document.findFirst({ where: { id: docId, dossierId: id } })
    if (!doc) throw new NotFoundError('Document', docId)
    if (!request.user.superviseur && doc.uploadePar !== request.user.id) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Seul l\'auteur du document (ou la Direction) peut le supprimer.' })
    }
    await prisma.document.delete({ where: { id: docId } })
    await logAudit(id, request.user.id, 'SUPPRESSION_DOCUMENT', `"${doc.nom}" supprimé`)
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

  fastify.post('/:id/commentaires', { preHandler }, async (request, reply) => {
    const { id }  = z.object({ id: z.string().uuid() }).parse(request.params)
    const body    = commentSchema.parse(request.body)
    const user    = request.user

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
      numero: z.string().min(1), type: z.enum(['proforma', 'validee', 'reglee']),
      montant: z.number().positive(), compagnie: z.string(),
      dateFacture: z.string().datetime(), description: z.string(),
      montantTVA: z.number().nonnegative().optional(),
      montantDebours: z.number().nonnegative().optional(),
    }).parse(request.body)

    const dossier = await prisma.dossier.findUnique({ where: { id }, select: { id: true } })
    if (!dossier) throw new NotFoundError('Dossier', id)
    if ((body.montantTVA ?? 0) + (body.montantDebours ?? 0) > body.montant) {
      return reply.code(422).send({ error: 'VENTILATION_INVALIDE', message: 'TVA + débours ne peuvent dépasser le montant total' })
    }

    const facture = await prisma.facture.create({
      data: {
        dossierId: id, ...body, dateFacture: new Date(body.dateFacture),
        datePaiement: body.type === 'reglee' ? new Date() : undefined,
      },
    })
    await logAudit(id, request.user.id, 'CREATION_FACTURE', `Facture ${body.numero}`)
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
      data: { dossierId: id, effectuePar: request.user.id, ...body, dateVirement: new Date(body.dateVirement) },
    })
    await logAudit(id, request.user.id, 'VIREMENT', `Virement ${body.reference} — ${body.montant} FCFA`)
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
      data: { dossierId: id, effectuePar: request.user.id, ...body, dateEmission: new Date(body.dateEmission) },
    })
    await logAudit(id, request.user.id, 'BON_LIVRAISON', `BL ${body.numero} créé`)
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
      data: { dossierId: id, emetteurId: request.user.id, ...body, dateEmission: new Date(body.dateEmission) },
    })
    await logAudit(id, request.user.id, 'GATE_PASS', `Gate Pass ${body.numero} émis`)
    return reply.code(201).send(gp)
  })

  // ─── Pénalités (surestaries / pénalités de retard) ───────

  fastify.post('/:id/penalites', { preHandler: [authenticate, authorize('permFinancier', 'partiel')] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const parsed = z.object({
      montant:      z.number().positive(),
      motif:        z.string().min(2).optional(),
      raison:       z.string().min(2).optional(),
      type:         z.enum(['douane', 'compagnie']).default('compagnie'),
      reference:    z.string().optional(),
      date:         z.string().datetime().optional(),
      dateEcheance: z.string().datetime().optional(),
    }).refine(b => b.motif || b.raison, { message: 'Motif requis', path: ['raison'] }).parse(request.body)
    const body = { ...parsed, motif: (parsed.motif ?? parsed.raison)! }

    const dossier = await prisma.dossier.findUnique({ where: { id } })
    if (!dossier) throw new NotFoundError('Dossier', id)

    const date = body.date ? new Date(body.date) : body.dateEcheance ? new Date(body.dateEcheance) : new Date()
    const reference = body.reference?.trim() || `PEN-${dossier.numero}-${Date.now().toString(36).toUpperCase()}`
    const paiement = body.type === 'douane'
      ? await prisma.paiementDouane.create({
          data: { dossierId: id, type: 'penalite', montant: body.montant, datePaiement: date, reference, statut: 'en_attente' },
        })
      : await prisma.paiementCompagnie.create({
          data: { dossierId: id, compagnie: dossier.compagnie, type: 'surestaries', montant: body.montant, datePaiement: date, reference, statut: 'en_attente' },
        })

    await logAudit(id, request.user.id, 'PENALITE', `${body.motif} — ${body.montant.toLocaleString('fr-FR')} FCFA`)
    await prisma.alerte.create({
      data: {
        type: 'charge', severity: 'warning', dossierId: id,
        message: `Pénalité ${dossier.numero} : ${body.motif} — ${body.montant.toLocaleString('fr-FR')} FCFA`,
      },
    })
    return reply.code(201).send(paiement)
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
        timings:            { orderBy: { dateDebut: 'asc' }, include: { responsable: { select: { id: true, nom: true, role: true } } } },
        documents:          { select: { nom: true, type: true, taille: true, etape: true, createdAt: true, uploader: { select: { nom: true } } } },
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
        responsable: (t as any).responsable?.nom ?? null,
      })
      if (t.dateFin) {
        const duree = differenceInDays(t.dateFin, t.dateDebut)
        push(t.dateFin, 'ETAPE_FIN', {
          etape: t.etape,
          dureeReelleJours: duree,
          enRetard: duree > t.dureePrevueJours,
          responsable: (t as any).responsable?.nom ?? null,
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

    const totalPaiementsDouane    = sumPaye(dossier.paiementsDouane as any)
    const totalPaiementsCompagnie = sumPaye(dossier.paiementsCompagnie as any)
    const finance = {
      totalPaiementsDouane,
      totalPaiementsCompagnie,
      totalVirements:          sumPaye(dossier.virements as any),
      totalBL: dossier.bonsLivraison.filter(b => b.statut === 'valide').reduce((s, b) => s + Number(b.montant), 0),
      montantTaxes:      dossier.montantTaxes ? Number(dossier.montantTaxes) : 0,
      montantHonoraires: dossier.montantHonoraires ? Number(dossier.montantHonoraires) : 0,
      montantRedevances: dossier.montantRedevances ? Number(dossier.montantRedevances) : 0,
      totalCharges:      totalPaiementsDouane + totalPaiementsCompagnie,
    }

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
        responsable:      (t as any).responsable ?? null,
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
