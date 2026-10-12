import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../config/prisma'
import { authenticate } from '../middleware/authenticate'
import { authorize } from '../middleware/authorize'
import { differenceInHours, differenceInDays } from 'date-fns'

/** Convertit une période d'affichage (semaine / mois / trimestre / année) en nombre de jours. */
function periodeEnJours(periode?: string): number | null {
  if (!periode) return null
  const map: Record<string, number> = { semaine: 7, week: 7, '7': 7, mois: 30, month: 30, '30': 30, trimestre: 90, quarter: 90, '90': 90, annee: 365, year: 365, '365': 365 }
  return map[periode] ?? 30
}

const reportingRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const readAccess = [authenticate, authorize('permRapports', 'non')]  // tous les connectés

  // GET /api/reporting/timing — analyse des délais par étape
  fastify.get('/timing', { preHandler: [authenticate] }, async (request, reply) => {
    const q = z.object({
      site:      z.string().optional(),
      compagnie: z.string().optional(),
      from:      z.string().datetime().optional(),
      to:        z.string().datetime().optional(),
    }).parse(request.query)

    const dossierWhere: Record<string, unknown> = {}
    if (q.site)      dossierWhere.site      = q.site
    if (q.compagnie) dossierWhere.compagnie = q.compagnie
    if (q.from || q.to) {
      dossierWhere.dateCreation = {}
      if (q.from) (dossierWhere.dateCreation as any).gte = new Date(q.from)
      if (q.to)   (dossierWhere.dateCreation as any).lte = new Date(q.to)
    }

    const timings = await prisma.dossierTiming.findMany({
      where: { dossier: dossierWhere },
      include: { dossier: { select: { numero: true, client: true, site: true, compagnie: true } } },
      orderBy: { dateDebut: 'desc' },
    })

    // Calcul de la durée effective par étape
    const statsParEtape: Record<string, { totalHeures: number; count: number; depasses: number }> = {}
    timings.forEach(t => {
      if (!statsParEtape[t.etape]) statsParEtape[t.etape] = { totalHeures: 0, count: 0, depasses: 0 }
      const fin = t.dateFin ?? new Date()
      const heures = differenceInHours(fin, t.dateDebut)
      statsParEtape[t.etape].totalHeures += heures
      statsParEtape[t.etape].count++
      if (heures > t.dureePrevueJours * 24) statsParEtape[t.etape].depasses++
    })

    const analyse = Object.entries(statsParEtape).map(([etape, s]) => ({
      etape,
      dureeMoyenneHeures: s.count > 0 ? Math.round(s.totalHeures / s.count) : 0,
      totalDossiers:      s.count,
      tauxDepassement:    s.count > 0 ? Math.round((s.depasses / s.count) * 100) : 0,
    }))

    return reply.send({ analyse, detail: timings })
  })

  // GET /api/reporting/sla — temps moyen réel par étape (heures) vs SLA, sur une période
  fastify.get('/sla', { preHandler: [authenticate] }, async (request, reply) => {
    const q = z.object({ periode: z.string().optional() }).parse(request.query)
    const jours = periodeEnJours(q.periode) ?? 30
    const depuis = new Date(Date.now() - jours * 86_400_000)

    const timings = await prisma.dossierTiming.findMany({
      where: { dateDebut: { gte: depuis } },
      select: { etape: true, dateDebut: true, dateFin: true, dureePrevueJours: true },
    })
    const now = new Date()
    const parEtape: Record<string, { heures: number; count: number; depasses: number; enCours: number }> = {}
    for (const t of timings) {
      const s = (parEtape[t.etape] ??= { heures: 0, count: 0, depasses: 0, enCours: 0 })
      const h = differenceInHours(t.dateFin ?? now, t.dateDebut)
      s.heures += h
      s.count++
      if (!t.dateFin) s.enCours++
      if (h > t.dureePrevueJours * 24) s.depasses++
    }
    return reply.send({
      periodeJours: jours,
      etapes: Object.entries(parEtape).map(([etape, s]) => ({
        etape,
        tempsMoyen:      s.count ? Math.round(s.heures / s.count) : 0,
        count:           s.count,
        enCours:         s.enCours,
        tauxDepassement: s.count ? Math.round((s.depasses / s.count) * 100) : 0,
      })),
    })
  })

  // GET /api/reporting/performance — performance par employé
  fastify.get('/performance', { preHandler: [authenticate] }, async (request, reply) => {
    const q = z.object({
      site:    z.string().optional(),
      from:    z.string().datetime().optional(),
      to:      z.string().datetime().optional(),
      periode: z.string().optional(),
    }).parse(request.query)

    const periodeJours = periodeEnJours(q.periode)
    const depuisTaches = periodeJours ? new Date(Date.now() - periodeJours * 86_400_000) : undefined

    const dossierWhere: Record<string, unknown> = {}
    if (q.from || q.to) {
      dossierWhere.dateCreation = {}
      if (q.from) (dossierWhere.dateCreation as any).gte = new Date(q.from)
      if (q.to)   (dossierWhere.dateCreation as any).lte = new Date(q.to)
    }

    const employes = await prisma.user.findMany({
      where: { actif: true, ...(q.site ? { site: q.site as any } : {}) },
      include: {
        dossiersResponsable: {
          where: dossierWhere,
          select: { id: true, status: true, dateLimiteSortie: true, dateCreation: true, updatedAt: true },
        },
        // Sous-étapes assignées à cet employé
        sousEtapesResponsable: {
          where: depuisTaches ? { OR: [{ createdAt: { gte: depuisTaches } }, { completedAt: { gte: depuisTaches } }] } : undefined,
          select: {
            id: true, etape: true, cle: true, statut: true,
            deadline: true, completedAt: true, createdAt: true,
          },
        },
      },
      orderBy: { nom: 'asc' },
    })

    const now = new Date()
    const rapport = employes.map(e => {
      // ── Métriques dossiers ────────────────────────────────────────────────
      const total    = e.dossiersResponsable.length
      const actifs   = e.dossiersResponsable.filter(d => d.status !== 'cloture')
      const clotures = e.dossiersResponsable.filter(d => d.status === 'cloture')
      const enRetardDossiers = actifs.filter(d => d.dateLimiteSortie && d.dateLimiteSortie < now)

      const delaiMoyen = clotures.length > 0
        ? Math.round(clotures.reduce((acc, d) => acc + differenceInDays(d.updatedAt, d.dateCreation), 0) / clotures.length)
        : 0

      // ── Métriques sous-étapes (tâches) ───────────────────────────────────
      const taches         = e.sousEtapesResponsable
      const tachesTotal    = taches.length
      const tachesValidees = taches.filter(t => t.statut === 'valide').length
      const tachesEnCours  = taches.filter(t => t.statut === 'en_cours').length
      const tachesEnRetard = taches.filter(t =>
        t.statut !== 'valide' && t.deadline && t.deadline < now
      ).length
      // Dans les délais = validées avant ou à la deadline
      const tachesEnTemps  = taches.filter(t =>
        t.statut === 'valide' && t.completedAt &&
        (!t.deadline || t.completedAt <= t.deadline)
      ).length

      // Temps moyen de traitement en heures (de créatedAt à completedAt)
      const completed = taches.filter(t => t.statut === 'valide' && t.completedAt)
      const tempsMoyen = completed.length > 0
        ? Math.round(
            completed.reduce((acc, t) =>
              acc + differenceInHours(t.completedAt!, t.createdAt), 0
            ) / completed.length
          )
        : 0

      return {
        id: e.id, nom: e.nom, role: e.role, site: e.site, profil: e.profil,
        // Dossiers
        dossiersTotal:     total,
        dossiersActifs:    actifs.length,
        dossiersClotures:  clotures.length,
        enRetard:          enRetardDossiers.length,
        rendement:         total > 0 ? Math.round((clotures.length / total) * 100) : 0,
        tauxRetard:        actifs.length > 0 ? Math.round((enRetardDossiers.length / actifs.length) * 100) : 0,
        delaiMoyenJours:   delaiMoyen,
        // Sous-étapes / tâches
        tachesTotal,
        tachesValidees,
        tachesEnCours,
        tachesEnRetard,
        tachesEnTemps,
        tempsMoyen,
        tauxReussiteTaches: tachesTotal > 0 ? Math.round((tachesEnTemps / tachesTotal) * 100) : 0,
      }
    })

    const sum = (k: 'tachesTotal' | 'tachesValidees' | 'tachesEnCours' | 'tachesEnRetard' | 'tachesEnTemps') =>
      rapport.reduce((acc, r) => acc + r[k], 0)
    return reply.send({
      employes: rapport,
      global: {
        tachesTotal:    sum('tachesTotal'),
        tachesValidees: sum('tachesValidees'),
        tachesEnCours:  sum('tachesEnCours'),
        tachesEnRetard: sum('tachesEnRetard'),
        tachesEnTemps:  sum('tachesEnTemps'),
        employesActifs: rapport.length,
      },
    })
  })

  // GET /api/reporting/dossiers — rapport complet des dossiers
  fastify.get('/dossiers', { preHandler: [authenticate] }, async (request, reply) => {
    const q = z.object({
      site:      z.string().optional(),
      status:    z.string().optional(),
      compagnie: z.string().optional(),
      from:      z.string().datetime().optional(),
      to:        z.string().datetime().optional(),
    }).parse(request.query)

    const where: Record<string, unknown> = {}
    if (q.site)      where.site      = q.site
    if (q.status)    where.status    = q.status
    if (q.compagnie) where.compagnie = q.compagnie
    if (q.from || q.to) {
      where.dateCreation = {}
      if (q.from) (where.dateCreation as any).gte = new Date(q.from)
      if (q.to)   (where.dateCreation as any).lte = new Date(q.to)
    }

    const [dossiers, stats] = await Promise.all([
      prisma.dossier.findMany({
        where,
        include: { responsable: { select: { nom: true, role: true } } },
        orderBy: { dateCreation: 'desc' },
      }),
      prisma.dossier.aggregate({
        where,
        _count: { _all: true },
        _sum: { montantTaxes: true, montantHonoraires: true, montantRedevances: true, montantDI: true },
      }),
    ])

    return reply.send({
      dossiers,
      statistiques: {
        total:              stats._count._all,
        totalTaxes:         stats._sum.montantTaxes ?? 0,
        totalHonoraires:    stats._sum.montantHonoraires ?? 0,
        totalRedevances:    stats._sum.montantRedevances ?? 0,
        totalDI:            stats._sum.montantDI ?? 0,
      },
    })
  })

  // GET /api/reporting/financier — rapport financier
  fastify.get('/financier', { preHandler: [authenticate, authorize('permFinancier', 'lecture')] }, async (request, reply) => {
    const q = z.object({
      from: z.string().datetime().optional(),
      to:   z.string().datetime().optional(),
    }).parse(request.query)

    const dateFilter: Record<string, unknown> = {}
    if (q.from) dateFilter.gte = new Date(q.from)
    if (q.to)   dateFilter.lte = new Date(q.to)

    const paiementWhere = Object.keys(dateFilter).length > 0 ? { datePaiement: dateFilter } : {}

    const [pDouane, pCompagnie, virements, factures] = await Promise.all([
      prisma.paiementDouane.groupBy({
        by: ['type', 'statut'],
        _sum: { montant: true },
        _count: true,
        where: paiementWhere,
      }),
      prisma.paiementCompagnie.groupBy({
        by: ['compagnie', 'type', 'statut'],
        _sum: { montant: true },
        _count: true,
        where: paiementWhere,
      }),
      prisma.virement.aggregate({ _sum: { montant: true }, _count: true, where: { statut: 'effectue', ...(Object.keys(dateFilter).length > 0 ? { dateVirement: dateFilter } : {}) } }),
      prisma.facture.groupBy({
        by: ['type'],
        _sum: { montant: true },
        _count: true,
      }),
    ])

    return reply.send({
      paiementsDouane:    pDouane,
      paiementsCompagnie: pCompagnie,
      virements: {
        total:   virements._count,
        montant: virements._sum.montant ?? 0,
      },
      factures,
    })
  })
}

export default reportingRoutes
