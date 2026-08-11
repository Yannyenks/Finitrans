import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../config/prisma'
import { authenticate } from '../middleware/authenticate'
import { authorize } from '../middleware/authorize'
import { NotFoundError } from '../utils/errors'
import { format, subDays } from 'date-fns'
import { fr } from 'date-fns/locale'

// ── Helpers de génération CSV/texte ──────────────────────────

function toCsv(rows: Record<string, unknown>[], sep = ';'): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const lines   = [
    headers.join(sep),
    ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(sep)),
  ]
  return lines.join('\r\n')
}

function formatMontant(v: unknown): string {
  const n = Number(v ?? 0)
  return n.toFixed(2).replace('.', ',')
}

// ── Gate-Pass "PDF" texte ─────────────────────────────────────

function buildGatePassText(gp: any): string {
  const d  = gp.dossier
  const em = gp.emetteur
  return [
    '═══════════════════════════════════════════════',
    '           FINITRANS BUDDY — GATE PASS          ',
    '═══════════════════════════════════════════════',
    `Numéro       : ${gp.numero}`,
    `Date émission: ${format(new Date(gp.dateEmission), 'dd/MM/yyyy HH:mm', { locale: fr })}`,
    `Statut       : ${gp.statut.toUpperCase()}`,
    '───────────────────────────────────────────────',
    'DOSSIER',
    `  Numéro     : ${d.numero}`,
    `  Client     : ${d.client}`,
    `  Conteneur  : ${gp.conteneur}`,
    `  Compagnie  : ${d.compagnie}`,
    '───────────────────────────────────────────────',
    'TRANSPORT',
    `  Chauffeur  : ${gp.chauffeur}`,
    `  Téléphone  : ${gp.telephone}`,
    `  Destination: ${gp.destination}`,
    '───────────────────────────────────────────────',
    `Émis par     : ${em.nom}`,
    '═══════════════════════════════════════════════',
  ].join('\n')
}

// ── Export OHADA ─────────────────────────────────────────────

function buildOhadaRow(d: any): Record<string, unknown> {
  return {
    'N° Dossier':    d.numero,
    'Client':        d.client,
    'Compagnie':     d.compagnie,
    'Statut':        d.status,
    'Date création': format(new Date(d.dateCreation), 'dd/MM/yyyy'),
    'Montant Taxes': formatMontant(d.montantTaxes),
    'Honoraires':    formatMontant(d.montantHonoraires),
    'Redevances':    formatMontant(d.montantRedevances),
    'Paiements Douane': formatMontant(d._sum_pd),
    'Paiements Compagnie': formatMontant(d._sum_pc),
    'Virements':     formatMontant(d._sum_v),
    'Site':          d.site,
  }
}

// ────────────────────────────────────────────────────────────

const exportsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const readFinance  = [authenticate, authorize('permFinancier', 'lecture')]
  const readRapports = [authenticate, authorize('permRapports', 'lecture')]

  // GET /api/exports/gate-pass/:id — gate-pass texte (simulé PDF)
  fastify.get('/gate-pass/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)

    const gp = await prisma.gatePass.findUnique({
      where: { id },
      include: {
        dossier:  { select: { numero: true, client: true, conteneur: true, compagnie: true, site: true } },
        emetteur: { select: { nom: true, role: true } },
      },
    })
    if (!gp) throw new NotFoundError('Gate Pass', id)

    const contenu = buildGatePassText(gp)

    reply
      .header('Content-Type', 'text/plain; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="gate-pass-${gp.numero}.txt"`)
    return reply.send(contenu)
  })

  // GET /api/exports/ohada — export comptable OHADA (CSV)
  fastify.get('/ohada', { preHandler: readFinance }, async (request, reply) => {
    const q = z.object({
      debut: z.string().optional(),
      fin:   z.string().optional(),
      site:  z.string().optional(),
    }).parse(request.query)

    const debut = q.debut ? new Date(q.debut) : subDays(new Date(), 90)
    const fin   = q.fin   ? new Date(q.fin)   : new Date()

    const dossiers = await prisma.dossier.findMany({
      where: {
        dateCreation: { gte: debut, lte: fin },
        ...(q.site ? { site: q.site as any } : {}),
      },
      orderBy: { dateCreation: 'asc' },
      include: {
        paiementsDouane:    { select: { montant: true } },
        paiementsCompagnie: { select: { montant: true } },
        virements:          { select: { montant: true, statut: true } },
      },
    })

    const rows = dossiers.map(d => {
      const sumPD = d.paiementsDouane.reduce((s, p) => s + Number(p.montant), 0)
      const sumPC = d.paiementsCompagnie.reduce((s, p) => s + Number(p.montant), 0)
      const sumV  = d.virements.filter(v => v.statut === 'effectue').reduce((s, v) => s + Number(v.montant), 0)
      return buildOhadaRow({ ...d, _sum_pd: sumPD, _sum_pc: sumPC, _sum_v: sumV })
    })

    const csv = toCsv(rows)

    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="ohada-${format(debut, 'yyyyMMdd')}-${format(fin, 'yyyyMMdd')}.csv"`)
    return reply.send('﻿' + csv) // BOM pour Excel
  })

  // GET /api/exports/rapport-dg — rapport synthèse DG (JSON → côté client génère PDF)
  fastify.get('/rapport-dg', { preHandler: readRapports }, async (request, reply) => {
    const now    = new Date()
    const debut  = subDays(now, 30)

    const [
      dossiers,
      alertes,
      dis,
      detentions,
      parSite,
      parCompagnie,
      virements,
    ] = await Promise.all([
      prisma.dossier.findMany({
        where: { dateCreation: { gte: debut } },
        select: {
          status: true, priorite: true, site: true, compagnie: true,
          montantTaxes: true, dateLimiteSortie: true,
        },
      }),
      prisma.alerte.count({ where: { lu: false } }),
      prisma.declarationImportation.findMany({
        where: { statut: 'actif' },
        select: { montant: true, soldeActuel: true },
      }),
      prisma.detention.findMany({
        where: { statut: 'en_cours' },
        select: { tarifJournalier: true, dateDebut: true },
      }),
      prisma.dossier.groupBy({ by: ['site'],      _count: true }),
      prisma.dossier.groupBy({ by: ['compagnie'], _count: true }),
      prisma.virement.aggregate({
        where: { statut: 'effectue' },
        _sum: { montant: true },
      }),
    ])

    const actifs   = dossiers.filter(d => d.status !== 'cloture')
    const enRetard = actifs.filter(d => d.dateLimiteSortie && d.dateLimiteSortie < now)

    const totalDI      = dis.reduce((s, d) => s + Number(d.montant), 0)
    const soldeDI      = dis.reduce((s, d) => s + Number(d.soldeActuel), 0)
    const diEnAlerte   = dis.filter(d => Number(d.soldeActuel) / Number(d.montant) <= 0.2).length

    const coutDetentions = detentions.reduce((s, d) => {
      const { differenceInDays } = require('date-fns')
      return s + differenceInDays(now, d.dateDebut) * Number(d.tarifJournalier)
    }, 0)

    return reply.send({
      genereAt:    now.toISOString(),
      periode:     { debut: debut.toISOString(), fin: now.toISOString() },
      dossiers: {
        total:      dossiers.length,
        actifs:     actifs.length,
        enRetard:   enRetard.length,
        tauxRetard: actifs.length > 0 ? Math.round((enRetard.length / actifs.length) * 100) : 0,
        parSite:    parSite.map(s => ({ site: s.site, count: s._count })),
        parCompagnie: parCompagnie.map(c => ({ compagnie: c.compagnie, count: c._count })),
      },
      finance: {
        totalVirements:  virements._sum.montant ?? 0,
        totalDI,
        soldeDI,
        tauxUtilisationDI: totalDI > 0 ? Math.round(((totalDI - soldeDI) / totalDI) * 100) : 0,
        diEnAlerte,
        coutDetentions,
      },
      alertes: { nonLues: alertes },
    })
  })

  // GET /api/exports/rapport-journalier-kribi — synthèse journalière Kribi
  fastify.get('/rapport-journalier-kribi', { preHandler: [authenticate] }, async (request, reply) => {
    const q = z.object({
      date: z.string().optional(),
      site: z.string().default('Kribi'),
    }).parse(request.query)

    const date  = q.date ? new Date(q.date) : new Date()
    const debut = new Date(date); debut.setHours(0, 0, 0, 0)
    const fin   = new Date(date); fin.setHours(23, 59, 59, 999)

    const [bons, gatePasses, compteRendus] = await Promise.all([
      prisma.bonKribi.findMany({
        where: { dateEmission: { gte: debut, lte: fin }, dossier: { site: q.site as any } },
        include: {
          dossier:     { select: { numero: true, client: true } },
          responsable: { select: { nom: true } },
        },
      }),
      prisma.gatePass.findMany({
        where: { dateEmission: { gte: debut, lte: fin }, dossier: { site: q.site as any } },
        include: {
          dossier:  { select: { numero: true, client: true, conteneur: true } },
          emetteur: { select: { nom: true } },
        },
      }),
      prisma.compteRenduKribi.findMany({
        where: { date: { gte: debut, lte: fin }, site: q.site as any },
        include: { auteur: { select: { nom: true } } },
      }),
    ])

    return reply.send({
      date:         format(date, 'dd/MM/yyyy'),
      site:         q.site,
      bons:         { total: bons.length, liste: bons },
      gatePasses:   { total: gatePasses.length, liste: gatePasses },
      compteRendus: { total: compteRendus.length, liste: compteRendus },
    })
  })

  // GET /api/exports/dossier/:id — fiche dossier complète
  fastify.get('/dossier/:id', { preHandler: [authenticate, authorize('permDossier', 'lecture')] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)

    const dossier = await prisma.dossier.findUnique({
      where: { id },
      include: {
        responsable:       { select: { nom: true, role: true, email: true } },
        di:                { select: { numero: true, montant: true, soldeActuel: true } },
        documents:         { select: { nom: true, type: true, etape: true, createdAt: true } },
        commentaires:      {
          orderBy: { createdAt: 'desc' },
          include: { auteur: { select: { nom: true } } },
        },
        factures:          true,
        paiementsDouane:   true,
        paiementsCompagnie: true,
        virements:         { include: { responsable: { select: { nom: true } } } },
        timings:           { orderBy: { dateDebut: 'asc' } },
        alertes:           { where: { lu: false } },
        detentions:        true,
        etatsCodeage:      { include: { soumisPar: { select: { nom: true } }, validePar: { select: { nom: true } } } },
        gatePasses:        true,
        bonsKribi:         true,
      },
    })
    if (!dossier) throw new NotFoundError('Dossier', id)

    return reply.send(dossier)
  })
}

export default exportsRoutes
