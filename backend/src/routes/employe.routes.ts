import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../config/prisma'
import { authenticate } from '../middleware/authenticate'
import { authorize } from '../middleware/authorize'
import { NotFoundError } from '../utils/errors'
import { subDays, differenceInDays, startOfMonth, endOfMonth } from 'date-fns'
import { SOUS_ETAPES_CONFIG, loadAttribution, nextStage, stageCompletion } from '../services/workflow'

const employeRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {

  // GET /api/employe/mon-espace — espace personnel de l'employé connecté
  fastify.get('/mon-espace', { preHandler: [authenticate] }, async (request, reply) => {
    const userId = (request.user as any).id
    const now    = new Date()
    const debut30 = subDays(now, 30)

    const [user, mesDossiers, mesActions, mesNotifs] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true, nom: true, role: true, profil: true, site: true,
          email: true, telephone: true, compagniesAssignees: true,
        },
      }),
      prisma.dossier.findMany({
        where: { responsableId: userId },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        select: {
          id: true, numero: true, client: true, status: true,
          priorite: true, dateLimiteSortie: true, compagnie: true,
          updatedAt: true,
        },
      }),
      prisma.auditEntry.findMany({
        where: { auteurId: userId, createdAt: { gte: debut30 } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { dossier: { select: { numero: true, client: true } } },
      }),
      prisma.notification.findMany({
        where: { userId, lu: false },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ])

    if (!user) throw new NotFoundError('Employé', userId)

    // KPIs personnels
    const actifs      = mesDossiers.filter(d => d.status !== 'cloture')
    const enRetard    = actifs.filter(d => d.dateLimiteSortie && d.dateLimiteSortie < now)
    const urgents     = actifs.filter(d => d.priorite === 'haute')
    const cloturesMois = await prisma.dossier.count({
      where: {
        responsableId: userId,
        status: 'cloture',
        updatedAt: { gte: startOfMonth(now), lte: endOfMonth(now) },
      },
    })

    return reply.send({
      user,
      kpis: {
        totalActifs:    actifs.length,
        enRetard:       enRetard.length,
        urgents:        urgents.length,
        cloturesMois,
        notificationsNonLues: mesNotifs.length,
      },
      mesDossiers,
      mesActionsRecentes: mesActions,
      notifications: mesNotifs,
    })
  })

  // GET /api/employe/mes-taches — tout ce que le compte doit faire lui-même
  fastify.get('/mes-taches', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user
    const now  = new Date()
    const attribution = await loadAttribution()

    const [mesTaches, mesDossiers] = await Promise.all([
      prisma.sousEtapeDossier.findMany({
        where: { responsableId: user.id, statut: { not: 'valide' }, dossier: { status: { not: 'cloture' } } },
        include: {
          dossier: { select: { id: true, numero: true, client: true, status: true, site: true, compagnie: true, priorite: true, dateLimiteSortie: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.dossier.findMany({
        where: { responsableId: user.id, status: { not: 'cloture' } },
        select: { id: true, numero: true, client: true, status: true, site: true, compagnie: true, priorite: true },
      }),
    ])

    // Tâches non attribuées relevant de mon profil sur l'étape en cours d'un dossier
    const cles = Object.entries(attribution).flatMap(([etape, cfg]) =>
      SOUS_ETAPES_CONFIG[etape as keyof typeof SOUS_ETAPES_CONFIG]
        .filter(se => (cfg.sousEtapes[se.cle] ?? cfg.owner) === user.profil)
        .map(se => ({ etape, cle: se.cle })))
    const aPrendre = cles.length === 0 ? [] : await prisma.sousEtapeDossier.findMany({
      where: {
        responsableId: null,
        statut: { not: 'valide' },
        OR: cles.map(c => ({ etape: c.etape, cle: c.cle })),
        ...(['gestion_sorties', 'terrain_kribi'].includes(user.profil) && user.compagniesAssignees.length > 0
          ? { dossier: { compagnie: { in: user.compagniesAssignees as ('MSC' | 'COSCO' | 'MAERSK' | 'CMA_CGM')[] } } }
          : {}),
      },
      include: { dossier: { select: { id: true, numero: true, client: true, status: true, site: true, compagnie: true, priorite: true } } },
      take: 50,
    })

    const label = (etape: string, cle: string) =>
      SOUS_ETAPES_CONFIG[etape as keyof typeof SOUS_ETAPES_CONFIG]?.find(s => s.cle === cle)?.label ?? cle
    const toTask = (t: (typeof mesTaches)[number] | (typeof aPrendre)[number]) => ({
      id: t.id, etape: t.etape, cle: t.cle, label: label(t.etape, t.cle), statut: t.statut,
      deadline: t.deadline, startedAt: t.startedAt, notes: t.notes, dossier: t.dossier,
      actionnable: t.dossier.status === t.etape,
      enRetard: !!t.deadline && t.deadline < now,
    })

    // Étapes dont je suis responsable et qui sont prêtes à être clôturées
    const pretesAAvancer = []
    for (const d of mesDossiers) {
      const c = await stageCompletion(d.id, d.status, d.site)
      if (c.allDone) pretesAAvancer.push({ ...d, etapeSuivante: nextStage(d.status, d.site) })
    }

    const taches = mesTaches.map(toTask)
    return reply.send({
      taches,
      aPrendre: aPrendre.filter(t => t.dossier.status === t.etape).map(toTask),
      pretesAAvancer,
      resume: {
        total:       taches.length,
        actionnables: taches.filter(t => t.actionnable).length,
        enRetard:    taches.filter(t => t.enRetard).length,
        aPrendre:    aPrendre.length,
        pretesAAvancer: pretesAAvancer.length,
      },
    })
  })

  // GET /api/employe/mes-dossiers — dossiers filtrés par rôle/compagnie
  fastify.get('/mes-dossiers', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user as any
    const q = z.object({
      statut:   z.string().optional(),
      priorite: z.string().optional(),
    }).parse(request.query)

    const where: Record<string, unknown> = {}

    // Filtre selon le profil
    if (['gestion_sorties', 'terrain_kribi'].includes(user.profil) && user.compagniesAssignees?.length > 0) {
      where.compagnie = { in: user.compagniesAssignees }
    } else if (!['dg', 'exploitation', 'administration', 'comptabilite'].includes(user.profil)) {
      where.OR = [
        { responsableId: user.id },
        { sousEtapes: { some: { responsableId: user.id } } },
      ]
    }

    if (user.site !== 'Douala') where.site = user.site
    if (q.statut)               where.status = q.statut
    if (q.priorite)             where.priorite = q.priorite

    const dossiers = await prisma.dossier.findMany({
      where,
      orderBy: [{ priorite: 'asc' }, { dateLimiteSortie: 'asc' }],
      include: {
        responsable: { select: { nom: true } },
        _count: { select: { documents: true, commentaires: true } },
      },
    })

    const now = new Date()
    return reply.send(dossiers.map(d => ({
      ...d,
      enRetard: d.dateLimiteSortie ? d.dateLimiteSortie < now : false,
      joursRestants: d.dateLimiteSortie ? differenceInDays(d.dateLimiteSortie, now) : null,
    })))
  })

  // GET /api/employe/:id/performance — KPIs de performance d'un employé
  fastify.get('/:id/performance', { preHandler: [authenticate, authorize('permRapports', 'lecture')] }, async (request, reply) => {
    const { id }  = z.object({ id: z.string().uuid() }).parse(request.params)
    const q = z.object({
      periode: z.coerce.number().default(30),
    }).parse(request.query)

    const now    = new Date()
    const depuis = subDays(now, q.periode)

    const [user, dossiers, timings, audit] = await Promise.all([
      prisma.user.findUnique({
        where: { id },
        select: { id: true, nom: true, role: true, profil: true, site: true },
      }),
      prisma.dossier.findMany({
        where: { responsableId: id },
        select: {
          id: true, status: true, priorite: true,
          dateLimiteSortie: true, dateCreation: true, updatedAt: true,
        },
      }),
      prisma.dossierTiming.findMany({
        where: { dossier: { responsableId: id }, dateDebut: { gte: depuis } },
        select: { etape: true, dateDebut: true, dateFin: true, dureePrevueJours: true },
      }),
      prisma.auditEntry.count({
        where: { auteurId: id, createdAt: { gte: depuis } },
      }),
    ])

    if (!user) throw new NotFoundError('Employé', id)

    const totalDossiers    = dossiers.length
    const actifs           = dossiers.filter(d => d.status !== 'cloture')
    const clotures         = dossiers.filter(d => d.status === 'cloture')
    const enRetard         = actifs.filter(d => d.dateLimiteSortie && d.dateLimiteSortie < now)
    const tauxRetard       = actifs.length > 0 ? Math.round((enRetard.length / actifs.length) * 100) : 0
    const cloturesPeriode  = clotures.filter(d => d.updatedAt >= depuis)

    // Temps moyen par étape
    const tempsMoyenParEtape: Record<string, number[]> = {}
    timings.forEach(t => {
      if (t.dateFin) {
        const jours = differenceInDays(t.dateFin, t.dateDebut)
        if (!tempsMoyenParEtape[t.etape]) tempsMoyenParEtape[t.etape] = []
        tempsMoyenParEtape[t.etape].push(jours)
      }
    })

    const performanceParEtape = Object.entries(tempsMoyenParEtape).map(([etape, vals]) => ({
      etape,
      tempsMoyen:  Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
      count:       vals.length,
    }))

    return reply.send({
      user,
      periode: q.periode,
      kpis: {
        totalDossiers,
        dossiersActifs:    actifs.length,
        dossiersClotures:  clotures.length,
        cloturesPeriode:   cloturesPeriode.length,
        enRetard:          enRetard.length,
        tauxRetard,
        actionsRealisees:  audit,
      },
      performanceParEtape,
      tendance: cloturesPeriode.map(d => ({
        date:   d.updatedAt,
        numero: d.id,
      })),
    })
  })

  // GET /api/employe/equipe/performance — performance de toute l'équipe (DG/Exploitation)
  fastify.get('/equipe/performance', { preHandler: [authenticate, authorize('permRapports', 'lecture')] }, async (request, reply) => {
    const q = z.object({ periode: z.coerce.number().default(30) }).parse(request.query)
    const now    = new Date()
    const depuis = subDays(now, q.periode)

    const employes = await prisma.user.findMany({
      where: { actif: true },
      select: {
        id: true, nom: true, role: true, profil: true, site: true,
        dossiersResponsable: {
          select: { status: true, dateLimiteSortie: true, updatedAt: true, priorite: true },
        },
      },
    })

    return reply.send(employes.map(emp => {
      const actifs          = emp.dossiersResponsable.filter(d => d.status !== 'cloture')
      const enRetard        = actifs.filter(d => d.dateLimiteSortie && d.dateLimiteSortie < now)
      const cloturesPeriode = emp.dossiersResponsable.filter(d => d.status === 'cloture' && d.updatedAt >= depuis)
      const tauxRetard      = actifs.length > 0 ? Math.round((enRetard.length / actifs.length) * 100) : 0

      return {
        id: emp.id, nom: emp.nom, role: emp.role, profil: emp.profil, site: emp.site,
        dossiersActifs:   actifs.length,
        enRetard:         enRetard.length,
        cloturesPeriode:  cloturesPeriode.length,
        tauxRetard,
        score: Math.max(0, 100 - tauxRetard * 2 + cloturesPeriode.length * 5),
      }
    }))
  })

  // GET /api/employe/heatmap — grille étape x employé pour le dashboard DG
  fastify.get('/heatmap', { preHandler: [authenticate, authorize('permRapports', 'lecture')] }, async (_request, reply) => {
    const etapes = ['reception', 'codage', 'validation', 'paiement', 'bon_compagnie', 'operations_kribi']

    const employes = await prisma.user.findMany({
      where: { actif: true },
      select: {
        id: true, nom: true,
        dossiersResponsable: {
          where: { status: { not: 'cloture' } },
          select: { status: true, priorite: true },
        },
      },
    })

    const heatmap = employes.map(emp => {
      const row: Record<string, number> = { id: emp.id as any, nom: emp.nom as any }
      etapes.forEach(etape => {
        row[etape] = emp.dossiersResponsable.filter(d => d.status === etape).length
      })
      return row
    })

    return reply.send({ etapes, heatmap })
  })
}

export default employeRoutes
