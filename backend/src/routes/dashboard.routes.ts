import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../config/prisma'
import { authenticate } from '../middleware/authenticate'
import { authorize } from '../middleware/authorize'
import { subDays, startOfMonth, format, differenceInDays } from 'date-fns'

const dashboardRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {

  // GET /api/dashboard/kpis — indicateurs clés globaux
  fastify.get('/kpis', { preHandler: [authenticate] }, async (request, reply) => {
    const now    = new Date()
    const debut30 = subDays(now, 30)

    const [
      totalDossiers,
      dossiersActifs,
      dossiersClotures30j,
      dossiersEnRetard,
      alertesNonLues,
      dossiersHautePriorite,
      totalMontantTaxes,
      virementsPendants,
      detentionsActives,
      diEnAlerte,
    ] = await Promise.all([
      prisma.dossier.count(),
      prisma.dossier.count({ where: { status: { not: 'cloture' } } }),
      prisma.dossier.count({ where: { status: 'cloture', updatedAt: { gte: debut30 } } }),
      prisma.dossier.count({ where: { status: { not: 'cloture' }, dateLimiteSortie: { lt: now } } }),
      prisma.alerte.count({ where: { lu: false } }),
      prisma.dossier.count({ where: { status: { not: 'cloture' }, priorite: 'haute' } }),
      prisma.dossier.aggregate({ _sum: { montantTaxes: true } }),
      prisma.virement.count({ where: { statut: 'en_attente' } }),
      prisma.detention.count({ where: { statut: 'en_cours' } }),
      prisma.declarationImportation.count({
        where: {
          statut: 'actif',
          soldeActuel: { lte: prisma.declarationImportation.fields.montant as any },
        },
      }).catch(() => 0),
    ])

    // Calcul DI en alerte séparé (≤20%)
    const dis = await prisma.declarationImportation.findMany({
      where: { statut: 'actif' },
      select: { montant: true, soldeActuel: true },
    })
    const diAlerte = dis.filter(d => Number(d.soldeActuel) / Number(d.montant) <= 0.2).length

    return reply.send({
      totalDossiers,
      dossiersActifs,
      dossiersClotures30j,
      dossiersEnRetard,
      alertesNonLues,
      dossiersHautePriorite,
      totalMontantTaxes: totalMontantTaxes._sum.montantTaxes ?? 0,
      virementsPendants,
      detentionsActives,
      diEnAlerte: diAlerte,
    })
  })

  // GET /api/dashboard/dg — vue stratégique DG (M. DELBA)
  fastify.get('/dg', { preHandler: [authenticate, authorize('permRapports', 'lecture')] }, async (request, reply) => {
    const now    = new Date()
    const debut30 = subDays(now, 30)

    const [
      kpiDossiers,
      parSite,
      parCompagnie,
      topEmployes,
      alertesCritiques,
      virements30j,
      detentions,
      dis,
    ] = await Promise.all([
      // KPIs dossiers
      Promise.all([
        prisma.dossier.count(),
        prisma.dossier.count({ where: { status: { not: 'cloture' } } }),
        prisma.dossier.count({ where: { status: 'cloture', updatedAt: { gte: debut30 } } }),
        prisma.dossier.count({ where: { status: { not: 'cloture' }, dateLimiteSortie: { lt: now } } }),
      ]),
      // Répartition site
      prisma.dossier.groupBy({
        by: ['site', 'status'],
        _count: true,
      }),
      // Répartition compagnie
      prisma.dossier.groupBy({ by: ['compagnie'], _count: true }),
      // Performance employés
      prisma.user.findMany({
        where: { actif: true },
        select: {
          id: true, nom: true, role: true, profil: true, site: true,
          dossiersResponsable: {
            select: { status: true, dateLimiteSortie: true, updatedAt: true },
          },
        },
      }),
      // Alertes critiques
      prisma.alerte.findMany({
        where: { lu: false, severity: 'critical' },
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { dossier: { select: { numero: true, client: true } } },
      }),
      // Virements récents
      prisma.virement.aggregate({
        where: { createdAt: { gte: debut30 } },
        _sum: { montant: true },
        _count: true,
      }),
      // Détentions actives
      prisma.detention.findMany({
        where: { statut: 'en_cours' },
        select: { tarifJournalier: true, dateDebut: true, compagnie: true },
      }),
      // DI actives
      prisma.declarationImportation.findMany({
        where: { statut: 'actif' },
        select: { numero: true, client: true, montant: true, soldeActuel: true },
      }),
    ])

    const [total, actifs, clotures30j, enRetard] = kpiDossiers

    // Performance équipe
    const performanceEquipe = topEmployes.map(emp => {
      const a = emp.dossiersResponsable.filter(d => d.status !== 'cloture')
      const r = a.filter(d => d.dateLimiteSortie && d.dateLimiteSortie < now)
      const c = emp.dossiersResponsable.filter(d => d.status === 'cloture' && d.updatedAt >= debut30)
      return {
        id: emp.id, nom: emp.nom, role: emp.role, profil: emp.profil, site: emp.site,
        actifs: a.length, enRetard: r.length, clotures30j: c.length,
        tauxRetard: a.length > 0 ? Math.round((r.length / a.length) * 100) : 0,
      }
    })

    // Coût détentions
    const coutDetentions = detentions.reduce((s, d) => {
      return s + differenceInDays(now, d.dateDebut) * Number(d.tarifJournalier)
    }, 0)

    // DI enrichies
    const disEnrichies = dis.map(d => ({
      ...d,
      tauxRestant: Number(d.montant) > 0
        ? Math.round((Number(d.soldeActuel) / Number(d.montant)) * 100)
        : 100,
    }))

    return reply.send({
      kpis: { total, actifs, clotures30j, enRetard },
      parSite: parSite.map(s => ({ site: s.site, status: s.status, count: s._count })),
      parCompagnie: parCompagnie.map(c => ({ compagnie: c.compagnie, count: c._count })),
      performanceEquipe,
      alertesCritiques,
      finance: {
        virements30j: { total: virements30j._count, montant: virements30j._sum.montant ?? 0 },
        coutDetentions,
        detentionsActives: detentions.length,
        dis: disEnrichies,
        diEnAlerte: disEnrichies.filter(d => d.tauxRestant <= 20).length,
      },
    })
  })

  // GET /api/dashboard/exploitation — vue opérationnelle M. SOUDI
  fastify.get('/exploitation', { preHandler: [authenticate] }, async (request, reply) => {
    const now = new Date()

    const [pipeline, alertesActives, retards, activiteRecente] = await Promise.all([
      // Pipeline par étape
      prisma.dossier.groupBy({
        by: ['status'],
        where: { status: { not: 'cloture' } },
        _count: true,
      }),
      // Alertes actives
      prisma.alerte.findMany({
        where: { lu: false },
        orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
        take: 15,
        include: { dossier: { select: { numero: true, client: true } } },
      }),
      // Dossiers en retard avec détail
      prisma.dossier.findMany({
        where: { status: { not: 'cloture' }, dateLimiteSortie: { lt: now } },
        orderBy: { dateLimiteSortie: 'asc' },
        take: 20,
        include: {
          responsable: { select: { nom: true } },
          detentions:  { where: { statut: 'en_cours' }, select: { joursDetention: true, montantTotal: true } },
        },
      }),
      // Activité récente
      prisma.auditEntry.findMany({
        take: 15,
        orderBy: { createdAt: 'desc' },
        include: {
          auteur:  { select: { nom: true } },
          dossier: { select: { numero: true } },
        },
      }),
    ])

    // Dossiers actifs par responsable
    const parResponsable = await prisma.user.findMany({
      where: { actif: true, dossiersResponsable: { some: { status: { not: 'cloture' } } } },
      select: {
        nom: true, role: true,
        dossiersResponsable: {
          where: { status: { not: 'cloture' } },
          select: { status: true, priorite: true, dateLimiteSortie: true },
        },
      },
    })

    return reply.send({
      pipeline: pipeline.map(p => ({ etape: p.status, count: p._count })),
      alertesActives,
      dossiersEnRetard: retards.map(d => ({
        ...d,
        joursRetard: d.dateLimiteSortie ? differenceInDays(now, d.dateLimiteSortie) : 0,
      })),
      parResponsable: parResponsable.map(r => ({
        nom: r.nom, role: r.role,
        actifs:   r.dossiersResponsable.length,
        urgents:  r.dossiersResponsable.filter(d => d.priorite === 'haute').length,
        enRetard: r.dossiersResponsable.filter(d => d.dateLimiteSortie && d.dateLimiteSortie < now).length,
      })),
      activiteRecente,
    })
  })

  // GET /api/dashboard/charts — données pour les graphiques
  fastify.get('/charts', { preHandler: [authenticate] }, async (request, reply) => {
    const now      = new Date()
    const debut30  = subDays(now, 30)

    const parStatut = await prisma.dossier.groupBy({ by: ['status'], _count: true })
    const parSite   = await prisma.dossier.groupBy({
      by: ['site'], _count: true, _sum: { montantTaxes: true },
    })
    const parCompagnie = await prisma.dossier.groupBy({ by: ['compagnie'], _count: true })

    const dossiersRecents = await prisma.dossier.findMany({
      where: { dateCreation: { gte: debut30 } },
      select: { dateCreation: true, status: true },
      orderBy: { dateCreation: 'asc' },
    })

    const parJour: Record<string, { crees: number; clotures: number }> = {}
    dossiersRecents.forEach(d => {
      const key = format(d.dateCreation, 'yyyy-MM-dd')
      if (!parJour[key]) parJour[key] = { crees: 0, clotures: 0 }
      parJour[key].crees++
      if (d.status === 'cloture') parJour[key].clotures++
    })

    const performanceEmployes = await prisma.user.findMany({
      where: { actif: true },
      select: {
        id: true, nom: true,
        dossiersResponsable: {
          select: { status: true, dateLimiteSortie: true },
        },
      },
      take: 8,
    })

    const tauxRetardParEmploye = performanceEmployes.map(u => {
      const actifs   = u.dossiersResponsable.filter(d => d.status !== 'cloture')
      const enRetard = actifs.filter(d => d.dateLimiteSortie && d.dateLimiteSortie < now)
      return {
        nom: u.nom,
        actifs:     actifs.length,
        enRetard:   enRetard.length,
        tauxRetard: actifs.length > 0 ? Math.round((enRetard.length / actifs.length) * 100) : 0,
      }
    })

    return reply.send({
      parStatut:   parStatut.map(s => ({ status: s.status, count: s._count })),
      parSite:     parSite.map(s => ({ site: s.site, count: s._count, totalTaxes: s._sum.montantTaxes ?? 0 })),
      parCompagnie: parCompagnie.map(c => ({ compagnie: c.compagnie, count: c._count })),
      evolution:   Object.entries(parJour).map(([date, v]) => ({ date, ...v })),
      tauxRetardParEmploye,
    })
  })

  // GET /api/dashboard/heatmap — grille étape × employé
  fastify.get('/heatmap', { preHandler: [authenticate, authorize('permRapports', 'lecture')] }, async (_request, reply) => {
    const etapes = ['reception', 'codage', 'validation', 'paiement', 'bon_compagnie', 'operations_kribi']

    const employes = await prisma.user.findMany({
      where: { actif: true },
      select: {
        id: true, nom: true, site: true,
        dossiersResponsable: {
          where: { status: { not: 'cloture' } },
          select: { status: true, priorite: true },
        },
      },
    })

    const now = new Date()
    const heatmap = employes.map(emp => {
      const row: Record<string, unknown> = { id: emp.id, nom: emp.nom, site: emp.site }
      etapes.forEach(etape => {
        row[etape] = emp.dossiersResponsable.filter(d => d.status === etape).length
      })
      row.total  = emp.dossiersResponsable.length
      row.urgents = emp.dossiersResponsable.filter(d => d.priorite === 'haute').length
      return row
    })

    return reply.send({ etapes, heatmap })
  })

  // GET /api/dashboard/recent — activité récente
  fastify.get('/recent', { preHandler: [authenticate] }, async (request, reply) => {
    const [dossiers, alertes, messages] = await Promise.all([
      prisma.dossier.findMany({
        take: 5,
        orderBy: { updatedAt: 'desc' },
        include: { responsable: { select: { nom: true } } },
      }),
      prisma.alerte.findMany({
        where: { lu: false },
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { dossier: { select: { numero: true } } },
      }),
      prisma.auditEntry.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          auteur:  { select: { nom: true } },
          dossier: { select: { numero: true } },
        },
      }),
    ])

    return reply.send({ dossiers, alertes, activiteRecente: messages })
  })

  // GET /api/dashboard/kribi — tableau de bord Kribi
  fastify.get('/kribi', { preHandler: [authenticate] }, async (request, reply) => {
    const now   = new Date()
    const debut = new Date(now); debut.setHours(0, 0, 0, 0)

    const [dossiersKribi, bonsJour, gatePassJour, interchangesRetard, compteRenduHier] = await Promise.all([
      prisma.dossier.findMany({
        where: { site: 'Kribi', status: { not: 'cloture' } },
        orderBy: [{ priorite: 'asc' }, { dateLimiteSortie: 'asc' }],
        include: { responsable: { select: { nom: true } } },
      }),
      prisma.bonKribi.count({ where: { dateEmission: { gte: debut } } }),
      prisma.gatePass.count({ where: { dateEmission: { gte: debut }, dossier: { site: 'Kribi' } } }),
      prisma.interchange.findMany({
        where: { statut: 'emis', dateLimite: { lt: now } },
        include: { dossier: { select: { numero: true, client: true } } },
      }),
      prisma.compteRenduKribi.findFirst({
        where: { site: 'Kribi', date: { gte: subDays(now, 1) } },
        orderBy: { date: 'desc' },
        include: { auteur: { select: { nom: true } } },
      }),
    ])

    return reply.send({
      dossiersActifs:    dossiersKribi.length,
      dossiersEnRetard:  dossiersKribi.filter(d => d.dateLimiteSortie && d.dateLimiteSortie < now).length,
      bonsJour,
      gatePassJour,
      interchangesRetard: interchangesRetard.map(ic => ({
        ...ic,
        joursRetard: differenceInDays(now, ic.dateLimite),
      })),
      dossiers:      dossiersKribi,
      compteRenduHier,
    })
  })
}

export default dashboardRoutes
