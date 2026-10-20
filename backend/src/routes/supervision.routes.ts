/**
 * Supervision des process (DG + Responsable Exploitation) :
 * vision consolidée de qui fait quoi, des blocages et des retards, et réattribution.
 */
import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { differenceInHours } from 'date-fns'
import { prisma } from '../config/prisma'
import { authenticate } from '../middleware/authenticate'
import { requireSupervisor } from '../middleware/authorize'
import { logActivity, logAudit } from '../utils/audit'
import { DossierStatus } from '@prisma/client'
import { SOUS_ETAPES_CONFIG, STATUS_LABELS, applicableSousEtapes, demarrerEtape, notify } from '../services/workflow'

const labelOf = (etape: string, cle: string) =>
  SOUS_ETAPES_CONFIG[etape as keyof typeof SOUS_ETAPES_CONFIG]?.find(s => s.cle === cle)?.label ?? cle

const supervisionRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const pre = [authenticate, requireSupervisor]

  // GET /api/supervision/pipeline — tous les dossiers actifs avec avancement de l'étape en cours
  fastify.get('/pipeline', { preHandler: pre }, async (_request, reply) => {
    const now = new Date()
    const dossiers = await prisma.dossier.findMany({
      where: { status: { not: 'cloture' } },
      orderBy: [{ priorite: 'asc' }, { dateCreation: 'asc' }],
      include: {
        responsable: { select: { id: true, nom: true, profil: true } },
        sousEtapes: {
          include: { responsable: { select: { id: true, nom: true } } },
        },
        timings: { where: { dateFin: null }, orderBy: { dateDebut: 'desc' }, take: 1 },
      },
    })

    const rows = dossiers.map(d => {
      const requises = applicableSousEtapes(d.status, d.site)
      const courantes = d.sousEtapes.filter(s => s.etape === d.status && requises.some(r => r.cle === s.cle))
      const timing = d.timings[0]
      const heuresEtape = timing ? differenceInHours(now, timing.dateDebut) : null
      const slaHeures = timing ? timing.dureePrevueJours * 24 : null
      return {
        id: d.id, numero: d.numero, client: d.client, compagnie: d.compagnie, site: d.site,
        status: d.status, statusLabel: STATUS_LABELS[d.status], priorite: d.priorite,
        responsable: d.responsable,
        dateLimiteSortie: d.dateLimiteSortie,
        enRetardSortie: !!d.dateLimiteSortie && d.dateLimiteSortie < now,
        etape: {
          total: requises.length,
          validees: courantes.filter(s => s.statut === 'valide').length,
          nonAttribuees: requises.length - courantes.filter(s => s.responsableId).length,
          enRetard: courantes.filter(s => s.statut !== 'valide' && s.deadline && s.deadline < now).length,
          heuresEcoulees: heuresEtape,
          slaHeures,
          depasseSLA: heuresEtape !== null && slaHeures !== null && heuresEtape > slaHeures,
          taches: requises.map(r => {
            const s = courantes.find(c => c.cle === r.cle)
            return {
              cle: r.cle, label: r.label, statut: s?.statut ?? 'todo',
              responsable: s?.responsable ?? null, deadline: s?.deadline ?? null,
            }
          }),
        },
      }
    })

    const parEtape: Record<string, number> = {}
    rows.forEach(r => { parEtape[r.status] = (parEtape[r.status] ?? 0) + 1 })

    return reply.send({
      dossiers: rows,
      resume: {
        actifs: rows.length,
        bloques: rows.filter(r => r.etape.nonAttribuees > 0).length,
        depassementSLA: rows.filter(r => r.etape.depasseSLA).length,
        enRetardSortie: rows.filter(r => r.enRetardSortie).length,
        pretsAAvancer: rows.filter(r => r.etape.total > 0 && r.etape.validees === r.etape.total).length,
        parEtape,
      },
    })
  })

  // GET /api/supervision/charge — charge de travail par compte
  fastify.get('/charge', { preHandler: pre }, async (_request, reply) => {
    const now = new Date()
    const depuis = new Date(Date.now() - 30 * 86_400_000)
    const users = await prisma.user.findMany({
      where: { actif: true },
      orderBy: { nom: 'asc' },
      select: {
        id: true, nom: true, role: true, profil: true, site: true, compagniesAssignees: true,
        sousEtapesResponsable: {
          where: { dossier: { status: { not: 'cloture' } } },
          select: { statut: true, deadline: true, etape: true, dossier: { select: { status: true } } },
        },
        sousEtapesValidees: { where: { completedAt: { gte: depuis } }, select: { id: true } },
        conges: { where: { statut: 'approuve', dateDebut: { lte: now }, dateFin: { gte: now } }, select: { dateFin: true } },
      },
    })
    return reply.send(users.map(u => {
      const ouvertes = u.sousEtapesResponsable.filter(t => t.statut !== 'valide')
      return {
        id: u.id, nom: u.nom, role: u.role, profil: u.profil, site: u.site, compagnies: u.compagniesAssignees,
        tachesOuvertes: ouvertes.length,
        tachesActionnables: ouvertes.filter(t => t.dossier.status === t.etape).length,
        tachesEnRetard: ouvertes.filter(t => t.deadline && t.deadline < now).length,
        validees30j: u.sousEtapesValidees.length,
        enConge: u.conges.length > 0,
        retourConge: u.conges[0]?.dateFin ?? null,
      }
    }))
  })

  // GET /api/supervision/alertes-process — tâches non attribuées / en retard sur les étapes en cours
  fastify.get('/alertes-process', { preHandler: pre }, async (_request, reply) => {
    const now = new Date()
    const taches = await prisma.sousEtapeDossier.findMany({
      where: {
        statut: { not: 'valide' },
        dossier: { status: { not: 'cloture' } },
        OR: [{ responsableId: null }, { deadline: { lt: now } }, { statut: 'rejete' }],
      },
      include: {
        dossier: { select: { id: true, numero: true, client: true, status: true, site: true } },
        responsable: { select: { id: true, nom: true } },
      },
      take: 200,
    })
    return reply.send(taches
      .filter(t => t.dossier.status === t.etape)
      .map(t => ({
        id: t.id, etape: t.etape, cle: t.cle, label: labelOf(t.etape, t.cle), statut: t.statut,
        deadline: t.deadline, responsable: t.responsable, dossier: t.dossier,
        motif: !t.responsableId ? 'non_attribuee' : t.statut === 'rejete' ? 'rejetee' : 'en_retard',
      })))
  })

  // POST /api/supervision/reattribuer — transférer les tâches ouvertes d'un compte à un autre (absence, congé…)
  fastify.post('/reattribuer', { preHandler: pre }, async (request, reply) => {
    const body = z.object({
      deUserId:   z.string().uuid(),
      versUserId: z.string().uuid(),
      dossierId:  z.string().uuid().optional(),
      inclureResponsabiliteDossiers: z.boolean().default(false),
    }).parse(request.body)

    if (body.deUserId === body.versUserId) {
      return reply.code(422).send({ error: 'MEME_COMPTE', message: 'Choisissez deux comptes différents' })
    }
    const [de, vers] = await Promise.all([
      prisma.user.findUnique({ where: { id: body.deUserId }, select: { nom: true } }),
      prisma.user.findUnique({ where: { id: body.versUserId }, select: { nom: true, actif: true } }),
    ])
    if (!de || !vers?.actif) return reply.code(422).send({ error: 'INVALID_USER', message: 'Compte introuvable ou inactif' })

    const where = {
      responsableId: body.deUserId,
      statut: { in: ['todo', 'en_cours', 'rejete'] as ('todo' | 'en_cours' | 'rejete')[] },
      dossier: { status: { not: 'cloture' as const } },
      ...(body.dossierId ? { dossierId: body.dossierId } : {}),
    }
    const concernees = await prisma.sousEtapeDossier.findMany({ where, select: { dossierId: true, etape: true, deadline: true, dossier: { select: { status: true } } } })
    const res = await prisma.sousEtapeDossier.updateMany({ where, data: { responsableId: body.versUserId } })
    // Les tâches des étapes en cours démarrent aussitôt chez le nouveau titulaire
    const enCours = new Set(concernees.filter(c => c.dossier.status === c.etape).map(c => `${c.dossierId}|${c.etape}`))
    for (const cle of enCours) {
      const [dossierId, etape] = cle.split('|')
      await demarrerEtape(dossierId, etape as DossierStatus)
    }
    const echeances = concernees.filter(c => c.dossier.status === c.etape && c.deadline).map(c => c.deadline!.getTime())

    let dossiers = 0
    if (body.inclureResponsabiliteDossiers) {
      const r = await prisma.dossier.updateMany({
        where: { responsableId: body.deUserId, status: { not: 'cloture' }, ...(body.dossierId ? { id: body.dossierId } : {}) },
        data: { responsableId: body.versUserId },
      })
      dossiers = r.count
    }

    for (const dossierId of new Set(concernees.map(c => c.dossierId))) {
      await logAudit(dossierId, request.user.id, 'REATTRIBUTION', `Tâches de ${de.nom} transférées à ${vers.nom}`)
    }
    await logActivity(request.user.id, 'REATTRIBUTION_TACHES', 'user', body.deUserId,
      `${res.count} tâche(s) de ${de.nom} → ${vers.nom}`)
    if (res.count > 0) {
      await notify([body.versUserId], {
        type: 'action_requise',
        titre: 'Tâches qui vous sont transférées',
        message: `${res.count} tâche(s) de ${de.nom} vous ont été attribuées.`,
        actionUrl: '/mon-espace',
        echeance: echeances.length ? new Date(Math.min(...echeances)) : null,
      })
    }
    return reply.send({ tachesTransferees: res.count, dossiersTransferes: dossiers })
  })
}

export default supervisionRoutes
