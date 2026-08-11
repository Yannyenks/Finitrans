import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../config/prisma'
import { authenticate } from '../middleware/authenticate'
import { authorize } from '../middleware/authorize'
import { buildPagination, paginate } from '../utils/pagination'
import { NotFoundError } from '../utils/errors'
import { differenceInDays, subDays, format, eachDayOfInterval } from 'date-fns'

// ── Helpers ──────────────────────────────────────────────────

function enrichDI(di: { montant: unknown; soldeActuel: unknown; seuilAlerte1: number; seuilAlerte2: number }) {
  const montant     = Number(di.montant)
  const solde       = Number(di.soldeActuel)
  const utilise     = montant - solde
  const tauxRestant = montant > 0 ? (solde / montant) * 100 : 100
  return {
    montantNum:    montant,
    soldeNum:      solde,
    utiliseNum:    utilise,
    tauxRestant:   Math.round(tauxRestant * 10) / 10,
    tauxUtilise:   Math.round((utilise / montant) * 1000) / 10,
    alerte1:       tauxRestant <= di.seuilAlerte1 && tauxRestant > di.seuilAlerte2,
    alerte2:       tauxRestant <= di.seuilAlerte2,
    alerteNiveau:  tauxRestant <= di.seuilAlerte2 ? 'critical' : tauxRestant <= di.seuilAlerte1 ? 'warning' : 'ok',
  }
}

// ── Routes ───────────────────────────────────────────────────

const diRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const readAccess  = [authenticate, authorize('permFinancier', 'lecture')]
  const writeAccess = [authenticate, authorize('permFinancier', 'partiel')]
  const adminAccess = [authenticate, authorize('permFinancier', 'complet')]

  // ── GET /api/di — liste des DI ────────────────────────────

  fastify.get('/', { preHandler: readAccess }, async (request, reply) => {
    const q = z.object({
      page:      z.coerce.number().default(1),
      limit:     z.coerce.number().default(20),
      statut:    z.string().optional(),
      client:    z.string().optional(),
      compagnie: z.string().optional(),
      alerte:    z.coerce.boolean().optional(),
    }).parse(request.query)

    const where: Record<string, unknown> = {}
    if (q.statut)    where.statut    = q.statut
    if (q.compagnie) where.compagnie = q.compagnie
    if (q.client)    where.client    = { contains: q.client, mode: 'insensitive' }

    const { skip, take, page, limit } = buildPagination(q.page, q.limit)
    const [data, total] = await Promise.all([
      prisma.declarationImportation.findMany({
        where, skip, take,
        orderBy: { createdAt: 'desc' },
        include: {
          gestionnaire: { select: { nom: true } },
          _count: { select: { dossiers: true, mouvements: true } },
        },
      }),
      prisma.declarationImportation.count({ where }),
    ])

    const enriched = data.map(di => ({ ...di, ...enrichDI(di) }))
    const filtered = q.alerte !== undefined
      ? enriched.filter(d => q.alerte ? d.alerteNiveau !== 'ok' : true)
      : enriched

    return reply.send(paginate(filtered, total, page, limit))
  })

  // ── GET /api/di/stats/resume ──────────────────────────────

  fastify.get('/stats/resume', { preHandler: readAccess }, async (request, reply) => {
    const dis = await prisma.declarationImportation.findMany({
      where: { statut: 'actif' },
      select: { montant: true, soldeActuel: true, seuilAlerte1: true, seuilAlerte2: true, compagnie: true },
    })

    const totalMontant = dis.reduce((s, d) => s + Number(d.montant), 0)
    const totalSolde   = dis.reduce((s, d) => s + Number(d.soldeActuel), 0)
    const parCompagnie: Record<string, { montant: number; solde: number; count: number }> = {}

    dis.forEach(d => {
      const comp = d.compagnie ?? 'AUTRE'
      if (!parCompagnie[comp]) parCompagnie[comp] = { montant: 0, solde: 0, count: 0 }
      parCompagnie[comp].montant += Number(d.montant)
      parCompagnie[comp].solde   += Number(d.soldeActuel)
      parCompagnie[comp].count++
    })

    return reply.send({
      totalDI:           dis.length,
      totalMontant,
      totalSolde,
      totalUtilise:      totalMontant - totalSolde,
      tauxUtilisation:   totalMontant > 0 ? Math.round(((totalMontant - totalSolde) / totalMontant) * 100) : 0,
      diEnAlerte:        dis.filter(d => enrichDI(d).alerteNiveau !== 'ok').length,
      diCritiques:       dis.filter(d => enrichDI(d).alerteNiveau === 'critical').length,
      parCompagnie:      Object.entries(parCompagnie).map(([comp, v]) => ({ compagnie: comp, ...v,
        tauxUtilise: v.montant > 0 ? Math.round(((v.montant - v.solde) / v.montant) * 100) : 0,
      })),
    })
  })

  // ── GET /api/di/client/:client — vue consolidée par client ─

  fastify.get('/client/:client', { preHandler: readAccess }, async (request, reply) => {
    const { client } = z.object({ client: z.string().min(1) }).parse(request.params)

    const dis = await prisma.declarationImportation.findMany({
      where: { client: { contains: client, mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' },
      include: {
        gestionnaire: { select: { nom: true } },
        _count: { select: { dossiers: true } },
      },
    })

    if (dis.length === 0) throw new NotFoundError('Client DI', client)

    const actives  = dis.filter(d => d.statut === 'actif')
    const clotures = dis.filter(d => d.statut === 'cloture')

    const totalEnveloppe = actives.reduce((s, d) => s + Number(d.montant), 0)
    const totalSolde     = actives.reduce((s, d) => s + Number(d.soldeActuel), 0)
    const totalHistorique = clotures.reduce((s, d) => s + Number(d.montant), 0)

    return reply.send({
      client,
      dis: dis.map(d => ({ ...d, ...enrichDI(d) })),
      synthese: {
        totalDI:          dis.length,
        diActives:        actives.length,
        diClotures:       clotures.length,
        enveloppeTotale:  totalEnveloppe,
        soldeDisponible:  totalSolde,
        montantHistorique: totalHistorique,
        tauxUtilisationMoyen: totalEnveloppe > 0
          ? Math.round(((totalEnveloppe - totalSolde) / totalEnveloppe) * 100)
          : 0,
      },
    })
  })

  // ── GET /api/di/:id ────────────────────────────────────────

  fastify.get('/:id', { preHandler: readAccess }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)

    const di = await prisma.declarationImportation.findUnique({
      where: { id },
      include: {
        gestionnaire: { select: { id: true, nom: true, email: true, role: true } },
        mouvements: {
          orderBy: { createdAt: 'desc' },
          include: {
            auteur:  { select: { nom: true } },
            dossier: { select: { numero: true, client: true } },
          },
        },
        dossiers: {
          select: {
            id: true, numero: true, client: true, status: true, priorite: true,
            compagnie: true, montantTaxes: true, montantHonoraires: true,
            bonsLivraison: { where: { statut: 'valide' }, select: { montant: true } },
            paiementsDouane: { select: { montant: true, statut: true } },
          },
        },
      },
    })
    if (!di) throw new NotFoundError('DI', id)

    const metrics = enrichDI(di)

    // Consommation prévisionnelle (dossiers actifs liés)
    const dossiersActifs   = di.dossiers.filter(d => d.status !== 'cloture')
    const consoPrevisionnelle = dossiersActifs.reduce((s, d) => {
      const taxes = Number(d.montantTaxes ?? 0) + Number(d.montantHonoraires ?? 0)
      const dejaConsomme = d.bonsLivraison.reduce((a, b) => a + Number(b.montant), 0)
      return s + Math.max(0, taxes - dejaConsomme)
    }, 0)

    const soldePrevisionnel = metrics.soldeNum - consoPrevisionnelle

    return reply.send({
      ...di,
      ...metrics,
      consoPrevisionnelle,
      soldePrevisionnel,
      alertePrevisionnel: soldePrevisionnel < 0,
    })
  })

  // ── GET /api/di/:id/tableau-de-bord ───────────────────────

  fastify.get('/:id/tableau-de-bord', { preHandler: readAccess }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)

    const di = await prisma.declarationImportation.findUnique({
      where: { id },
      include: {
        gestionnaire: { select: { nom: true } },
        mouvements: {
          orderBy: { createdAt: 'asc' },
          include: { dossier: { select: { numero: true } } },
        },
        dossiers: {
          select: {
            id: true, numero: true, client: true, status: true, priorite: true,
            montantTaxes: true, montantHonoraires: true, montantRedevances: true,
            bonsLivraison: { where: { statut: 'valide' }, select: { montant: true, dateEmission: true } },
            paiementsDouane: { select: { montant: true, statut: true, type: true } },
          },
        },
      },
    })
    if (!di) throw new NotFoundError('DI', id)

    const metrics  = enrichDI(di)
    const now      = new Date()

    // ── Prévisions ──────────────────────────────────────────
    const mouvementsDebit = di.mouvements.filter(m => m.type === 'debit')
    const periodeJours    = mouvementsDebit.length > 0
      ? Math.max(1, differenceInDays(now, di.mouvements[0].createdAt))
      : 1
    const tauxConso    = metrics.utiliseNum / periodeJours
    const joursRestants = tauxConso > 0 ? Math.floor(metrics.soldeNum / tauxConso) : null
    const dateRupture   = joursRestants !== null
      ? new Date(now.getTime() + joursRestants * 86_400_000)
      : null

    // ── Prévision à 30/60/90 jours ─────────────────────────
    const previsions = [30, 60, 90].map(jours => ({
      jours,
      soldePrevu: Math.max(0, metrics.soldeNum - tauxConso * jours),
      atteintSeuil1: (metrics.soldeNum - tauxConso * jours) / metrics.montantNum * 100 <= di.seuilAlerte1,
      atteintSeuil2: (metrics.soldeNum - tauxConso * jours) / metrics.montantNum * 100 <= di.seuilAlerte2,
    }))

    // ── Ventilation par catégorie OHADA ─────────────────────
    const ventilationCategorie: Record<string, number> = {}
    di.mouvements
      .filter(m => m.type === 'debit')
      .forEach(m => {
        const cat = m.categorie ?? 'frais_divers'
        ventilationCategorie[cat] = (ventilationCategorie[cat] ?? 0) + Number(m.montant)
      })

    // ── Dossiers liés avec consommation ────────────────────
    const dossiersDetail = di.dossiers.map(d => {
      const budgetPrevisionnel = Number(d.montantTaxes ?? 0) + Number(d.montantHonoraires ?? 0) + Number(d.montantRedevances ?? 0)
      const dejaConsomme       = d.bonsLivraison.reduce((s, b) => s + Number(b.montant), 0)
      const resteAPayer        = Math.max(0, budgetPrevisionnel - dejaConsomme)
      return {
        id: d.id, numero: d.numero, client: d.client, status: d.status, priorite: d.priorite,
        budgetPrevisionnel, dejaConsomme, resteAPayer,
        tauxConso: budgetPrevisionnel > 0 ? Math.round((dejaConsomme / budgetPrevisionnel) * 100) : 0,
      }
    })

    const consoPrevisionnelle = dossiersDetail.reduce((s, d) => s + d.resteAPayer, 0)
    const soldePrevisionnel   = metrics.soldeNum - consoPrevisionnelle

    // ── Activité récente (7 derniers jours) ─────────────────
    const activiteRecente = di.mouvements
      .filter(m => differenceInDays(now, m.createdAt) <= 7)
      .slice(0, 10)

    return reply.send({
      di: { id: di.id, numero: di.numero, client: di.client, statut: di.statut, devise: di.devise },
      metrics,
      previsions: {
        tauxConsoJournalier: Math.round(tauxConso),
        joursRestants,
        dateRupture,
        consoPrevisionnelle: Math.round(consoPrevisionnelle),
        soldePrevisionnel:   Math.round(soldePrevisionnel),
        alertePrevisionnel:  soldePrevisionnel < 0,
        a30jours:            previsions[0],
        a60jours:            previsions[1],
        a90jours:            previsions[2],
      },
      ventilationCategorie: Object.entries(ventilationCategorie).map(([cat, montant]) => ({
        categorie: cat,
        montant,
        pourcentage: metrics.utiliseNum > 0 ? Math.round((montant / metrics.utiliseNum) * 100) : 0,
      })),
      dossiers:          dossiersDetail,
      activiteRecente,
      alerteConfig:      { seuil1: di.seuilAlerte1, seuil2: di.seuilAlerte2 },
    })
  })

  // ── GET /api/di/:id/evolution — courbe du solde ────────────

  fastify.get('/:id/evolution', { preHandler: readAccess }, async (request, reply) => {
    const { id }    = z.object({ id: z.string().uuid() }).parse(request.params)
    const { jours } = z.object({ jours: z.coerce.number().default(60) }).parse(request.query)

    const di = await prisma.declarationImportation.findUnique({
      where: { id },
      select: { montant: true, soldeActuel: true, createdAt: true },
    })
    if (!di) throw new NotFoundError('DI', id)

    const mouvements = await prisma.mouvementDI.findMany({
      where: { diId: id },
      orderBy: { createdAt: 'asc' },
      select: { type: true, montant: true, categorie: true, motif: true, createdAt: true },
    })

    const now     = new Date()
    const debut   = subDays(now, jours)

    // Reconstituer le solde jour par jour
    let solde  = Number(di.montant)
    const soldeParJour: Map<string, number> = new Map()

    mouvements.forEach(m => {
      solde += m.type === 'credit' ? Number(m.montant) : -Number(m.montant)
      const key = format(m.createdAt, 'yyyy-MM-dd')
      soldeParJour.set(key, solde)
    })

    // Remplir les jours sans mouvement avec le solde du dernier jour connu
    const jours2 = eachDayOfInterval({ start: debut, end: now })
    let dernierSolde = Number(di.montant)
    const evolution = jours2.map(date => {
      const key = format(date, 'yyyy-MM-dd')
      if (soldeParJour.has(key)) dernierSolde = soldeParJour.get(key)!
      return {
        date:   key,
        solde:  dernierSolde,
        debits: mouvements.filter(m => m.type === 'debit'  && format(m.createdAt, 'yyyy-MM-dd') === key)
                          .reduce((s, m) => s + Number(m.montant), 0),
        credits: mouvements.filter(m => m.type === 'credit' && format(m.createdAt, 'yyyy-MM-dd') === key)
                           .reduce((s, m) => s + Number(m.montant), 0),
      }
    })

    return reply.send({ evolution, mouvements })
  })

  // ── GET /api/di/:id/rapprochement — reconciliation paiements

  fastify.get('/:id/rapprochement', { preHandler: readAccess }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)

    const di = await prisma.declarationImportation.findUnique({
      where: { id },
      include: {
        dossiers: {
          select: {
            id: true, numero: true,
            paiementsDouane: { select: { id: true, montant: true, type: true, statut: true, reference: true, datePaiement: true } },
            paiementsCompagnie: { select: { id: true, montant: true, type: true, statut: true, reference: true, datePaiement: true } },
          },
        },
        mouvements: {
          where: { type: 'debit' },
          select: { id: true, montant: true, motif: true, categorie: true, createdAt: true, dossierId: true },
        },
      },
    })
    if (!di) throw new NotFoundError('DI', id)

    // Rapprocher mouvements DI ↔ paiements douane
    const rapproche: Array<{
      mouvementId: string; montant: number; motif: string;
      paiementId?: string; ecart: number; statut: string
    }> = []

    di.mouvements.forEach(mouv => {
      const dossier     = di.dossiers.find(d => d.id === mouv.dossierId)
      const paiements   = dossier?.paiementsDouane ?? []
      const paiementPaie = paiements.find(p =>
        p.statut === 'paye' && Math.abs(Number(p.montant) - Number(mouv.montant)) < 1,
      )
      rapproche.push({
        mouvementId: mouv.id,
        montant:     Number(mouv.montant),
        motif:       mouv.motif,
        paiementId:  paiementPaie?.id,
        ecart:       paiementPaie ? 0 : Number(mouv.montant),
        statut:      paiementPaie ? 'rapproche' : 'non_rapproche',
      })
    })

    const totalRapproche    = rapproche.filter(r => r.statut === 'rapproche').length
    const totalNonRapproche = rapproche.length - totalRapproche
    const montantNonRapproche = rapproche.filter(r => r.statut === 'non_rapproche')
                                         .reduce((s, r) => s + r.ecart, 0)

    return reply.send({
      rapprochements: rapproche,
      resume: { totalRapproche, totalNonRapproche, montantNonRapproche },
    })
  })

  // ── POST /api/di — créer une DI ───────────────────────────

  fastify.post('/', { preHandler: writeAccess }, async (request, reply) => {
    const body = z.object({
      numero:         z.string().min(3),
      client:         z.string().min(2),
      montant:        z.number().positive(),
      devise:         z.string().default('XAF'),
      compagnie:      z.enum(['MSC', 'COSCO', 'MAERSK', 'CMA_CGM']).optional(),
      dateEmission:   z.string().datetime(),
      dateExpiration: z.string().datetime().optional(),
      seuilAlerte1:   z.number().min(1).max(100).default(20),
      seuilAlerte2:   z.number().min(1).max(100).default(10),
      notes:          z.string().optional(),
    }).parse(request.body)

    const userId = (request.user as any).id

    const di = await prisma.declarationImportation.create({
      data: {
        ...body,
        soldeActuel:    body.montant,
        gestionnaireId: userId,
        dateEmission:   new Date(body.dateEmission),
        dateExpiration: body.dateExpiration ? new Date(body.dateExpiration) : undefined,
      },
    })

    await prisma.mouvementDI.create({
      data: {
        diId:      di.id,
        type:      'credit',
        categorie: 'ouverture',
        montant:   body.montant,
        motif:     'Ouverture DI',
        createdBy: userId,
      },
    })

    return reply.code(201).send({ ...di, ...enrichDI(di) })
  })

  // ── PATCH /api/di/:id ─────────────────────────────────────

  fastify.patch('/:id', { preHandler: writeAccess }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body   = z.object({
      statut:         z.enum(['actif', 'cloture', 'suspendu']).optional(),
      notes:          z.string().optional(),
      dateExpiration: z.string().datetime().optional(),
      seuilAlerte1:   z.number().min(1).max(100).optional(),
      seuilAlerte2:   z.number().min(1).max(100).optional(),
    }).parse(request.body)

    const existing = await prisma.declarationImportation.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('DI', id)

    const updated = await prisma.declarationImportation.update({
      where: { id },
      data: { ...body, dateExpiration: body.dateExpiration ? new Date(body.dateExpiration) : undefined },
    })
    return reply.send({ ...updated, ...enrichDI(updated) })
  })

  // ── PATCH /api/di/:id/alertes — reconfigurer les seuils ───

  fastify.patch('/:id/alertes', { preHandler: writeAccess }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body   = z.object({
      seuilAlerte1: z.number().min(1).max(99),
      seuilAlerte2: z.number().min(1).max(99),
    }).refine(b => b.seuilAlerte2 < b.seuilAlerte1, {
      message: 'Le seuil critique doit être inférieur au seuil d\'avertissement',
    }).parse(request.body)

    const existing = await prisma.declarationImportation.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('DI', id)

    const updated = await prisma.declarationImportation.update({ where: { id }, data: body })
    return reply.send({ ...updated, ...enrichDI(updated) })
  })

  // ── POST /api/di/:id/mouvements ───────────────────────────

  fastify.post('/:id/mouvements', { preHandler: writeAccess }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body   = z.object({
      type:      z.enum(['credit', 'debit']),
      categorie: z.enum(['droits_douane', 'tva', 'honoraires', 'redevances', 'penalites', 'frais_divers', 'remboursement', 'ouverture']).optional(),
      montant:   z.number().positive(),
      motif:     z.string().min(3),
      dossierId: z.string().uuid().optional(),
    }).parse(request.body)

    const di = await prisma.declarationImportation.findUnique({ where: { id } })
    if (!di) throw new NotFoundError('DI', id)

    const delta        = body.type === 'credit' ? body.montant : -body.montant
    const nouveauSolde = Number(di.soldeActuel) + delta

    if (nouveauSolde < 0) {
      return reply.code(422).send({
        error:       'SOLDE_INSUFFISANT',
        message:     'Le solde DI serait négatif après ce débit',
        soldeActuel: Number(di.soldeActuel),
        demandeDebit: body.montant,
        manque:       Math.abs(nouveauSolde),
      })
    }

    const [mouvement] = await prisma.$transaction([
      prisma.mouvementDI.create({
        data: {
          diId:      id,
          type:      body.type,
          categorie: body.categorie ?? (body.type === 'credit' ? 'remboursement' : 'frais_divers'),
          montant:   body.montant,
          motif:     body.motif,
          dossierId: body.dossierId,
          createdBy: (request.user as any).id,
        },
      }),
      prisma.declarationImportation.update({ where: { id }, data: { soldeActuel: nouveauSolde } }),
    ])

    // Alertes automatiques configurables
    const tauxRestant = (nouveauSolde / Number(di.montant)) * 100
    if (tauxRestant <= di.seuilAlerte2) {
      await prisma.alerte.create({
        data: {
          type: 'di_seuil', severity: 'critical',
          message: `🔴 DI ${di.numero} (${di.client}) : solde CRITIQUE — ${Math.round(tauxRestant)}% restant (seuil ${di.seuilAlerte2}%)`,
          dossierId: body.dossierId,
        },
      })
    } else if (tauxRestant <= di.seuilAlerte1) {
      await prisma.alerte.create({
        data: {
          type: 'di_seuil', severity: 'warning',
          message: `⚠️ DI ${di.numero} (${di.client}) : solde faible — ${Math.round(tauxRestant)}% restant (seuil ${di.seuilAlerte1}%)`,
          dossierId: body.dossierId,
        },
      })
    }

    const diMaj = await prisma.declarationImportation.findUnique({ where: { id } })!
    return reply.code(201).send({ mouvement, di: { ...diMaj, ...enrichDI(diMaj!) } })
  })

  // ── POST /api/di/:id/recharge — crédit exceptionnel ───────

  fastify.post('/:id/recharge', { preHandler: adminAccess }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body   = z.object({
      montant: z.number().positive(),
      motif:   z.string().min(5),
    }).parse(request.body)

    const di = await prisma.declarationImportation.findUnique({ where: { id } })
    if (!di) throw new NotFoundError('DI', id)

    const nouveauSolde = Number(di.soldeActuel) + body.montant

    await prisma.$transaction([
      prisma.mouvementDI.create({
        data: {
          diId:      id,
          type:      'credit',
          categorie: 'remboursement',
          montant:   body.montant,
          motif:     `Recharge : ${body.motif}`,
          createdBy: (request.user as any).id,
        },
      }),
      prisma.declarationImportation.update({ where: { id }, data: { soldeActuel: nouveauSolde } }),
    ])

    const diMaj = await prisma.declarationImportation.findUnique({ where: { id } })!
    return reply.send({ ...diMaj, ...enrichDI(diMaj!) })
  })

  // ── POST /api/di/:id/lier-dossier ─────────────────────────

  fastify.post('/:id/lier-dossier', { preHandler: writeAccess }, async (request, reply) => {
    const { id }      = z.object({ id: z.string().uuid() }).parse(request.params)
    const { dossierId } = z.object({ dossierId: z.string().uuid() }).parse(request.body)

    const [di, dossier] = await Promise.all([
      prisma.declarationImportation.findUnique({ where: { id } }),
      prisma.dossier.findUnique({ where: { id: dossierId } }),
    ])
    if (!di)      throw new NotFoundError('DI', id)
    if (!dossier) throw new NotFoundError('Dossier', dossierId)
    if (di.statut !== 'actif') {
      return reply.code(422).send({ error: 'DI_INACTIVE', message: 'Impossible de lier à une DI clôturée ou suspendue' })
    }

    await prisma.dossier.update({ where: { id: dossierId }, data: { diId: id } })
    return reply.send({ message: 'Dossier lié à la DI avec succès', diNumero: di.numero })
  })

  // ── POST /api/di/:id/cloner — cloner la DI ────────────────

  fastify.post('/:id/cloner', { preHandler: writeAccess }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body   = z.object({
      numero:   z.string().min(3),
      montant:  z.number().positive(),
      dateEmission: z.string().datetime(),
      dateExpiration: z.string().datetime().optional(),
    }).parse(request.body)

    const source = await prisma.declarationImportation.findUnique({ where: { id } })
    if (!source) throw new NotFoundError('DI', id)

    const userId = (request.user as any).id
    const clone  = await prisma.declarationImportation.create({
      data: {
        numero:         body.numero,
        client:         source.client,
        montant:        body.montant,
        soldeActuel:    body.montant,
        devise:         source.devise,
        compagnie:      source.compagnie,
        seuilAlerte1:   source.seuilAlerte1,
        seuilAlerte2:   source.seuilAlerte2,
        gestionnaireId: userId,
        dateEmission:   new Date(body.dateEmission),
        dateExpiration: body.dateExpiration ? new Date(body.dateExpiration) : undefined,
        notes:          `Cloné depuis DI ${source.numero}`,
      },
    })

    await prisma.mouvementDI.create({
      data: {
        diId: clone.id, type: 'credit', categorie: 'ouverture',
        montant: body.montant, motif: `Ouverture (cloné depuis ${source.numero})`, createdBy: userId,
      },
    })

    return reply.code(201).send({ ...clone, ...enrichDI(clone) })
  })

  // ── GET /api/di/:id/export-ohada — export comptable ───────

  fastify.get('/:id/export-ohada', { preHandler: readAccess }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)

    const di = await prisma.declarationImportation.findUnique({
      where: { id },
      include: {
        mouvements: {
          orderBy: { createdAt: 'asc' },
          include: {
            auteur:  { select: { nom: true } },
            dossier: { select: { numero: true, client: true } },
          },
        },
      },
    })
    if (!di) throw new NotFoundError('DI', id)

    // OHADA plan comptable simplifié
    const OHADA_COMPTES: Record<string, string> = {
      droits_douane: '444 — Droits et taxes à l\'importation',
      tva:           '445 — TVA déductible',
      honoraires:    '622 — Honoraires agréé en douane',
      redevances:    '624 — Redevances portuaires',
      penalites:     '671 — Pénalités et amendes',
      frais_divers:  '628 — Frais divers de transit',
      remboursement: '411 — Clients — Remboursements',
      ouverture:     '512 — Banque — Versement initial',
    }

    const lignes = di.mouvements.map((m, i) => ({
      ligne:       i + 1,
      date:        format(m.createdAt, 'dd/MM/yyyy'),
      compteOHADA: OHADA_COMPTES[m.categorie ?? 'frais_divers'],
      libelle:     m.motif,
      debit:       m.type === 'debit'  ? Number(m.montant).toFixed(2) : '',
      credit:      m.type === 'credit' ? Number(m.montant).toFixed(2) : '',
      dossier:     m.dossier?.numero ?? '',
      auteur:      (m as any).auteur?.nom ?? '',
    }))

    const totalDebits  = di.mouvements.filter(m => m.type === 'debit').reduce((s, m) => s + Number(m.montant), 0)
    const totalCredits = di.mouvements.filter(m => m.type === 'credit').reduce((s, m) => s + Number(m.montant), 0)

    return reply.send({
      di:          { numero: di.numero, client: di.client, devise: di.devise },
      lignes,
      totaux:      { totalDebits, totalCredits, solde: totalCredits - totalDebits },
      exportDate:  format(new Date(), 'dd/MM/yyyy HH:mm'),
    })
  })
}

export default diRoutes
