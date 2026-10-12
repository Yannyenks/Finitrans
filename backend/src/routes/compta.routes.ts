/**
 * Comptabilité avancée SYSCOHADA — module « comptabilite_avancee »
 * (Directeur Général, Comptable). Saisie : permission financière partielle ;
 * validation, paie et clôture : permission financière complète.
 */
import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { endOfYear, startOfMonth, startOfYear } from 'date-fns'
import { prisma } from '../config/prisma'
import { authenticate } from '../middleware/authenticate'
import { authorize, requireDG, requireModule } from '../middleware/authorize'
import { logActivity } from '../utils/audit'
import { NotFoundError } from '../utils/errors'
import { buildPagination, paginate } from '../utils/pagination'
import {
  SOURCES, balance, bilan, comptabiliser, compteDeResultat, creancesClients, creerEcriture,
  ecritureInclude, ensureReferentiel, exercicePourDate, genererPaie, grandLivre, operationsAComptabiliser,
  toCsv, tresorerie, verifierEquilibre,
} from '../services/compta'

const ligneSchema = z.object({
  compte:  z.string().min(3),
  libelle: z.string().max(255).optional(),
  debit:   z.number().nonnegative().optional(),
  credit:  z.number().nonnegative().optional(),
  tiers:   z.string().max(255).optional(),
})

const ecritureSchema = z.object({
  journal:   z.string().min(2).max(10),
  date:      z.string().datetime(),
  libelle:   z.string().min(2).max(255),
  piece:     z.string().max(100).optional(),
  dossierId: z.string().uuid().optional(),
  lignes:    z.array(ligneSchema).min(2),
})

const periodeSchema = z.object({
  from:    z.string().datetime().optional(),
  to:      z.string().datetime().optional(),
  validees: z.enum(['true', 'false']).optional(),
})
const parsePeriode = (q: unknown) => {
  const p = periodeSchema.parse(q)
  return {
    from: p.from ? new Date(p.from) : undefined,
    to: p.to ? new Date(p.to) : undefined,
    statut: p.validees === 'true' ? 'validee' as const : undefined,
  }
}

const comptaRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Le référentiel (plan comptable SYSCOHADA, journaux) est créé au premier accès autorisé
  const referentiel = async () => { await ensureReferentiel() }
  const lecture   = [authenticate, requireModule('comptabilite_avancee'), referentiel]
  const saisie    = [...lecture, authorize('permFinancier', 'partiel')]
  const direction = [...lecture, authorize('permFinancier', 'complet')]

  // ── Tableau de bord ─────────────────────────────────────────────────────

  fastify.get('/dashboard', { preHandler: lecture }, async (_request, reply) => {
    const now = new Date()
    const [resAnnee, resMois, treso, creances, brouillons, aComptabiliser, exercices] = await Promise.all([
      compteDeResultat({ from: startOfYear(now), to: endOfYear(now) }),
      compteDeResultat({ from: startOfMonth(now), to: now }),
      tresorerie(now.getFullYear()),
      creancesClients(),
      prisma.ecritureComptable.count({ where: { statut: 'brouillon' } }),
      operationsAComptabiliser(),
      prisma.exerciceComptable.findMany({ orderBy: { dateDebut: 'desc' }, take: 5 }),
    ])
    return reply.send({
      annee: { chiffreAffaires: resAnnee.totalProduits, charges: resAnnee.totalCharges, resultat: resAnnee.resultat },
      mois:  { chiffreAffaires: resMois.totalProduits, charges: resMois.totalCharges, resultat: resMois.resultat },
      tresorerie: { solde: treso.soldeTotal, comptes: treso.comptes, mois: treso.mois },
      creances: { total: creances.total, tranches: creances.tranches },
      brouillons,
      aComptabiliser: Object.fromEntries(Object.entries(aComptabiliser).map(([k, v]) => [k, v.length])),
      exercices,
    })
  })

  // ── Plan comptable ──────────────────────────────────────────────────────

  fastify.get('/comptes', { preHandler: lecture }, async (request, reply) => {
    const q = z.object({ classe: z.coerce.number().int().min(1).max(9).optional(), q: z.string().optional() }).parse(request.query)
    return reply.send(await prisma.compteComptable.findMany({
      where: {
        ...(q.classe ? { classe: q.classe } : {}),
        ...(q.q ? { OR: [{ numero: { startsWith: q.q } }, { libelle: { contains: q.q, mode: 'insensitive' } }] } : {}),
      },
      orderBy: { numero: 'asc' },
    }))
  })

  fastify.post('/comptes', { preHandler: direction }, async (request, reply) => {
    const body = z.object({
      numero:  z.string().regex(/^[1-9]\d{2,9}$/, 'Numéro SYSCOHADA : chiffres, la classe en premier'),
      libelle: z.string().min(2).max(255),
      type:    z.enum(['actif', 'passif', 'charge', 'produit', 'mixte']),
    }).parse(request.body)
    const compte = await prisma.compteComptable.create({
      data: { ...body, classe: Number(body.numero[0]) },
    })
    await logActivity(request.user.id, 'COMPTE_COMPTABLE_CREE', 'compta', compte.id, `${compte.numero} ${compte.libelle}`)
    return reply.code(201).send(compte)
  })

  fastify.patch('/comptes/:id', { preHandler: direction }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body = z.object({ libelle: z.string().min(2).max(255).optional(), actif: z.boolean().optional() }).parse(request.body)
    return reply.send(await prisma.compteComptable.update({ where: { id }, data: body }))
  })

  // ── Journaux & exercices ────────────────────────────────────────────────

  fastify.get('/journaux', { preHandler: lecture }, async (_request, reply) => {
    const journaux = await prisma.journalComptable.findMany({
      orderBy: { code: 'asc' },
      include: { _count: { select: { ecritures: true } } },
    })
    return reply.send(journaux)
  })

  fastify.get('/exercices', { preHandler: lecture }, async (_request, reply) => {
    return reply.send(await prisma.exerciceComptable.findMany({
      orderBy: { dateDebut: 'desc' },
      include: { _count: { select: { ecritures: true } } },
    }))
  })

  fastify.post('/exercices/:id/cloturer', { preHandler: direction }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const ex = await prisma.exerciceComptable.findUnique({ where: { id } })
    if (!ex) throw new NotFoundError('Exercice', id)
    if (ex.statut === 'cloture') return reply.code(422).send({ error: 'DEJA_CLOTURE', message: 'Exercice déjà clôturé' })
    const brouillons = await prisma.ecritureComptable.count({ where: { exerciceId: id, statut: 'brouillon' } })
    if (brouillons > 0) {
      return reply.code(422).send({ error: 'BROUILLONS', message: `${brouillons} écriture(s) en brouillon à valider ou supprimer avant la clôture` })
    }
    const res = await compteDeResultat({ from: ex.dateDebut, to: ex.dateFin })
    const updated = await prisma.exerciceComptable.update({
      where: { id },
      data: { statut: 'cloture', resultat: res.resultat, clotureAt: new Date(), clotureParId: request.user.id },
    })
    await logActivity(request.user.id, 'EXERCICE_CLOTURE', 'compta', id, `${ex.code} — résultat ${res.resultat}`)
    return reply.send(updated)
  })

  fastify.post('/exercices/:id/rouvrir', { preHandler: [...direction, requireDG] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const updated = await prisma.exerciceComptable.update({
      where: { id }, data: { statut: 'ouvert', clotureAt: null, clotureParId: null },
    })
    await logActivity(request.user.id, 'EXERCICE_ROUVERT', 'compta', id, updated.code)
    return reply.send(updated)
  })

  // ── Écritures ───────────────────────────────────────────────────────────

  fastify.get('/ecritures', { preHandler: lecture }, async (request, reply) => {
    const q = z.object({
      page: z.coerce.number().default(1),
      limit: z.coerce.number().default(50),
      journal: z.string().optional(),
      statut: z.enum(['brouillon', 'validee']).optional(),
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      q: z.string().optional(),
      compte: z.string().optional(),
    }).parse(request.query)

    const where: Prisma.EcritureComptableWhereInput = {
      ...(q.journal ? { journal: { code: q.journal } } : {}),
      ...(q.statut ? { statut: q.statut } : {}),
      ...(q.from || q.to ? { date: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}),
      ...(q.q ? { OR: [
        { libelle: { contains: q.q, mode: 'insensitive' } },
        { numero: { contains: q.q, mode: 'insensitive' } },
        { piece: { contains: q.q, mode: 'insensitive' } },
      ] } : {}),
      ...(q.compte ? { lignes: { some: { compte: { numero: { startsWith: q.compte } } } } } : {}),
    }
    const { skip, take, page, limit } = buildPagination(q.page, q.limit)
    const [data, total] = await Promise.all([
      prisma.ecritureComptable.findMany({ where, skip, take, orderBy: [{ date: 'desc' }, { numero: 'desc' }], include: ecritureInclude }),
      prisma.ecritureComptable.count({ where }),
    ])
    return reply.send(paginate(data.map(e => ({
      ...e,
      totalDebit: e.lignes.reduce((s, l) => s + Number(l.debit), 0),
      totalCredit: e.lignes.reduce((s, l) => s + Number(l.credit), 0),
    })), total, page, limit))
  })

  fastify.get('/ecritures/:id', { preHandler: lecture }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const e = await prisma.ecritureComptable.findUnique({ where: { id }, include: ecritureInclude })
    if (!e) throw new NotFoundError('Écriture', id)
    return reply.send(e)
  })

  fastify.post('/ecritures', { preHandler: saisie }, async (request, reply) => {
    const body = ecritureSchema.parse(request.body)
    const e = await creerEcriture({ ...body, date: new Date(body.date) }, request.user.id)
    await logActivity(request.user.id, 'ECRITURE_CREEE', 'compta', e.id, `${e.numero} ${e.libelle}`)
    return reply.code(201).send(e)
  })

  fastify.put('/ecritures/:id', { preHandler: saisie }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body = ecritureSchema.parse(request.body)
    const existing = await prisma.ecritureComptable.findUnique({ where: { id }, include: { journal: true } })
    if (!existing) throw new NotFoundError('Écriture', id)
    if (existing.statut !== 'brouillon') {
      return reply.code(422).send({ error: 'ECRITURE_VALIDEE', message: 'Une écriture validée ne peut plus être modifiée : contre-passez-la' })
    }
    if (body.journal !== existing.journal.code) {
      return reply.code(422).send({ error: 'JOURNAL', message: 'Le journal d\'une écriture ne peut pas être changé' })
    }
    const { actives } = verifierEquilibre(body.lignes)
    const date = new Date(body.date)
    const exercice = await exercicePourDate(date)
    if (exercice.id !== existing.exerciceId) {
      return reply.code(422).send({ error: 'EXERCICE', message: 'La date doit rester dans le même exercice' })
    }
    const comptes = await prisma.compteComptable.findMany({ where: { numero: { in: actives.map(l => l.compte) }, actif: true } })
    const parNumero = new Map(comptes.map(c => [c.numero, c.id]))
    const inconnus = actives.filter(l => !parNumero.has(l.compte)).map(l => l.compte)
    if (inconnus.length) return reply.code(422).send({ error: 'COMPTE_INCONNU', message: `Compte(s) inconnu(s) : ${inconnus.join(', ')}` })

    const updated = await prisma.$transaction(async tx => {
      await tx.ligneEcriture.deleteMany({ where: { ecritureId: id } })
      return tx.ecritureComptable.update({
        where: { id },
        data: {
          date, libelle: body.libelle, piece: body.piece, dossierId: body.dossierId ?? null,
          lignes: { create: actives.map((l, i) => ({
            compteId: parNumero.get(l.compte)!, libelle: l.libelle ?? body.libelle,
            debit: l.debit ?? 0, credit: l.credit ?? 0, tiers: l.tiers, ordre: i,
          })) },
        },
        include: ecritureInclude,
      })
    })
    return reply.send(updated)
  })

  fastify.delete('/ecritures/:id', { preHandler: saisie }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const e = await prisma.ecritureComptable.findUnique({ where: { id } })
    if (!e) throw new NotFoundError('Écriture', id)
    if (e.statut !== 'brouillon') {
      return reply.code(422).send({ error: 'ECRITURE_VALIDEE', message: 'Une écriture validée ne peut pas être supprimée : contre-passez-la' })
    }
    await prisma.ecritureComptable.delete({ where: { id } })
    await logActivity(request.user.id, 'ECRITURE_SUPPRIMEE', 'compta', id, e.numero)
    return reply.code(204).send()
  })

  fastify.post('/ecritures/:id/valider', { preHandler: direction }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const e = await prisma.ecritureComptable.findUnique({ where: { id }, include: { exercice: true } })
    if (!e) throw new NotFoundError('Écriture', id)
    if (e.statut === 'validee') return reply.code(422).send({ error: 'DEJA_VALIDEE', message: 'Écriture déjà validée' })
    if (e.exercice.statut === 'cloture') return reply.code(422).send({ error: 'EXERCICE_CLOTURE', message: 'Exercice clôturé' })
    const updated = await prisma.ecritureComptable.update({
      where: { id },
      data: { statut: 'validee', valideeParId: request.user.id, valideeAt: new Date() },
      include: ecritureInclude,
    })
    return reply.send(updated)
  })

  // Valider en lot toutes les écritures brouillon (éventuellement d'un journal)
  fastify.post('/ecritures/valider-lot', { preHandler: direction }, async (request, reply) => {
    const body = z.object({ ids: z.array(z.string().uuid()).optional(), journal: z.string().optional() }).parse(request.body ?? {})
    const res = await prisma.ecritureComptable.updateMany({
      where: {
        statut: 'brouillon',
        exercice: { statut: 'ouvert' },
        ...(body.ids ? { id: { in: body.ids } } : {}),
        ...(body.journal ? { journal: { code: body.journal } } : {}),
      },
      data: { statut: 'validee', valideeParId: request.user.id, valideeAt: new Date() },
    })
    await logActivity(request.user.id, 'ECRITURES_VALIDEES', 'compta', null, `${res.count} écriture(s)`)
    return reply.send({ validees: res.count })
  })

  fastify.post('/ecritures/:id/contrepasser', { preHandler: direction }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body = z.object({ date: z.string().datetime().optional(), motif: z.string().max(200).optional() }).parse(request.body ?? {})
    const e = await prisma.ecritureComptable.findUnique({ where: { id }, include: { journal: true, lignes: { include: { compte: true } } } })
    if (!e) throw new NotFoundError('Écriture', id)
    if (e.statut !== 'validee') return reply.code(422).send({ error: 'NON_VALIDEE', message: 'Seule une écriture validée se contre-passe (un brouillon se modifie ou se supprime)' })
    const deja = await prisma.ecritureComptable.findFirst({ where: { contrepasseeDeId: id } })
    if (deja) return reply.code(409).send({ error: 'DEJA_CONTREPASSEE', message: `Déjà contre-passée par ${deja.numero}` })

    const inverse = await creerEcriture({
      journal: e.journal.code,
      date: body.date ? new Date(body.date) : new Date(),
      libelle: `Contre-passation ${e.numero}${body.motif ? ` — ${body.motif}` : ''}`.slice(0, 255),
      piece: e.piece ?? undefined,
      dossierId: e.dossierId ?? undefined,
      contrepasseeDeId: e.id,
      statut: 'validee',
      lignes: e.lignes.map(l => ({
        compte: l.compte.numero, libelle: l.libelle ?? undefined, tiers: l.tiers ?? undefined,
        debit: Number(l.credit), credit: Number(l.debit),
      })),
    }, request.user.id)
    await logActivity(request.user.id, 'ECRITURE_CONTREPASSEE', 'compta', id, `${e.numero} → ${inverse.numero}`)
    return reply.code(201).send(inverse)
  })

  // ── Comptabilisation automatique ───────────────────────────────────────

  fastify.get('/comptabilisation/apercu', { preHandler: lecture }, async (_request, reply) => {
    const ops = await operationsAComptabiliser()
    return reply.send(Object.fromEntries(Object.entries(ops).map(([k, v]) => [k, {
      nombre: v.length, montant: v.reduce((s, o) => s + o.montant, 0), operations: v.slice(0, 50),
    }])))
  })

  fastify.post('/comptabilisation/generer', { preHandler: saisie }, async (request, reply) => {
    const body = z.object({ sources: z.array(z.enum(SOURCES)).min(1).default([...SOURCES]) }).parse(request.body ?? {})
    const res = await comptabiliser(body.sources, request.user.id)
    await logActivity(request.user.id, 'COMPTABILISATION_AUTO', 'compta', null, `${res.creees.length} écriture(s) générée(s)`)
    return reply.send(res)
  })

  fastify.post('/paie/generer', { preHandler: direction }, async (request, reply) => {
    const { mois } = z.object({ mois: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Format AAAA-MM') }).parse(request.body)
    const e = await genererPaie(mois, request.user.id)
    await logActivity(request.user.id, 'PAIE_COMPTABILISEE', 'compta', e.id, `${mois} — ${e.numero}`)
    return reply.code(201).send(e)
  })

  // ── États financiers ────────────────────────────────────────────────────

  fastify.get('/balance', { preHandler: lecture }, async (request, reply) => {
    return reply.send(await balance(parsePeriode(request.query)))
  })

  fastify.get('/grand-livre/:compte', { preHandler: lecture }, async (request, reply) => {
    const { compte } = z.object({ compte: z.string() }).parse(request.params)
    return reply.send(await grandLivre(compte, parsePeriode(request.query)))
  })

  fastify.get('/resultat', { preHandler: lecture }, async (request, reply) => {
    const p = parsePeriode(request.query)
    const now = new Date()
    return reply.send(await compteDeResultat({ from: p.from ?? startOfYear(now), to: p.to ?? now, statut: p.statut }))
  })

  fastify.get('/bilan', { preHandler: lecture }, async (request, reply) => {
    const p = parsePeriode(request.query)
    return reply.send(await bilan(p.to ?? new Date(), p.statut))
  })

  fastify.get('/tresorerie', { preHandler: lecture }, async (request, reply) => {
    const { annee } = z.object({ annee: z.coerce.number().int().min(2000).max(2100).default(new Date().getFullYear()) }).parse(request.query)
    return reply.send(await tresorerie(annee))
  })

  fastify.get('/creances', { preHandler: lecture }, async (_request, reply) => {
    return reply.send(await creancesClients())
  })

  // ── Exports CSV (Excel) ─────────────────────────────────────────────────

  fastify.get('/export/:type', { preHandler: lecture }, async (request, reply) => {
    const { type } = z.object({ type: z.enum(['ecritures', 'balance', 'grand-livre']) }).parse(request.params)
    const p = parsePeriode(request.query)
    let rows: Record<string, unknown>[] = []

    if (type === 'balance') {
      const b = await balance(p)
      rows = b.lignes.map(l => ({
        Compte: l.numero, Libellé: l.libelle, Classe: l.classe, Débit: l.debit, Crédit: l.credit,
        'Solde débiteur': l.soldeDebiteur, 'Solde créditeur': l.soldeCrediteur,
      }))
    } else if (type === 'grand-livre') {
      const { compte } = z.object({ compte: z.string() }).parse(request.query)
      const gl = await grandLivre(compte, p)
      rows = gl.mouvements.map(m => ({
        Date: m.date, Journal: m.journal, 'N° écriture': m.numero, Pièce: m.piece ?? '', Libellé: m.libelle,
        Tiers: m.tiers ?? '', Débit: m.debit, Crédit: m.credit, Solde: m.solde,
      }))
    } else {
      const ecritures = await prisma.ecritureComptable.findMany({
        where: p.from || p.to || p.statut ? {
          ...(p.from || p.to ? { date: { ...(p.from ? { gte: p.from } : {}), ...(p.to ? { lte: p.to } : {}) } } : {}),
          ...(p.statut ? { statut: p.statut } : {}),
        } : undefined,
        orderBy: [{ date: 'asc' }, { numero: 'asc' }],
        include: ecritureInclude,
      })
      rows = ecritures.flatMap(e => e.lignes.map(l => ({
        JournalCode: e.journal.code, EcritureNum: e.numero, EcritureDate: e.date, CompteNum: l.compte.numero,
        CompteLib: l.compte.libelle, PieceRef: e.piece ?? '', EcritureLib: l.libelle ?? e.libelle, Tiers: l.tiers ?? '',
        Debit: Number(l.debit), Credit: Number(l.credit), Statut: e.statut, ValidDate: e.valideeAt ?? '',
      })))
    }

    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${type}-${new Date().toISOString().slice(0, 10)}.csv"`)
    return reply.send('﻿' + toCsv(rows))
  })
}

export default comptaRoutes
