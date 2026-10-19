/**
 * CRM — relation client : fiches clients, vision 360° (dossiers, factures, règlements,
 * échanges), relances planifiées et tableau de bord commercial.
 */
import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../config/prisma'
import { authenticate } from '../middleware/authenticate'
import { requireModule } from '../middleware/authorize'
import { NotFoundError } from '../utils/errors'
import { logActivity } from '../utils/audit'
import { cleClient, rattacherClient } from '../services/crm'
import { MODES_REGLEMENT } from '../services/enregistrements'

const STATUTS = ['prospect', 'actif', 'inactif'] as const
const SEGMENTS = ['standard', 'premium', 'strategique'] as const
const TYPES_INTERACTION = ['appel', 'email', 'reunion', 'visite', 'note', 'relance', 'reclamation'] as const

const optStr = (max: number) => z.string().trim().max(max).nullable().optional().transform(v => v || null)

const clientSchema = z.object({
  nom:                  z.string().trim().min(2).max(255),
  statut:               z.enum(STATUTS).optional(),
  segment:              z.enum(SEGMENTS).optional(),
  secteur:              optStr(120),
  niu:                  optStr(50),
  rccm:                 optStr(80),
  adresse:              optStr(1000),
  ville:                optStr(120),
  pays:                 optStr(80),
  telephone:            optStr(50),
  email:                z.string().trim().email().max(255).or(z.literal('')).nullable().optional().transform(v => v || null),
  siteWeb:              optStr(255),
  contactNom:           optStr(255),
  contactFonction:      optStr(255),
  contactTelephone:     optStr(50),
  contactEmail:         z.string().trim().email().max(255).or(z.literal('')).nullable().optional().transform(v => v || null),
  delaiPaiementJours:   z.number().int().min(0).max(365).nullable().optional(),
  plafondCredit:        z.number().nonnegative().nullable().optional(),
  modeReglementPrefere: z.enum(MODES_REGLEMENT).nullable().optional(),
  gestionnaireId:       z.string().uuid().nullable().optional(),
  tags:                 z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  notes:                optStr(5000),
})

const interactionSchema = z.object({
  type:                z.enum(TYPES_INTERACTION),
  sujet:               z.string().trim().min(2).max(255),
  contenu:             optStr(5000),
  dateInteraction:     z.string().datetime().optional(),
  prochaineAction:     optStr(255),
  dateProchaineAction: z.string().datetime().nullable().optional(),
  dossierId:           z.string().uuid().nullable().optional(),
})

const reglementSchema = z.object({
  clientId:      z.string().uuid(),
  dossierId:     z.string().uuid().nullable().optional(),
  mode:          z.enum(MODES_REGLEMENT),
  montant:       z.number().positive(),
  dateReglement: z.string().datetime().optional(),
  payeur:        optStr(255),
  reference:     optStr(100),
  banque:        optStr(120),
  dateEcheance:  z.string().datetime().nullable().optional(),
  observations:  optStr(2000),
})

const num = (v: Prisma.Decimal | number | null | undefined) => Number(v ?? 0)
const debutMois = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1)

/** Rattache aux fiches clients les dossiers qui ne le sont pas encore (dossiers antérieurs au CRM). */
async function synchroniser(userId: string) {
  const dossiers = await prisma.dossier.findMany({ where: { clientId: null }, select: { id: true, client: true }, take: 1000 })
  for (const d of dossiers) await rattacherClient(d.id, d.client, userId)
  return dossiers.length
}

const crmRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const preHandler = [authenticate, requireModule('crm')]

  async function nomsComptes(ids: (string | null | undefined)[]) {
    const uniques = [...new Set(ids.filter((x): x is string => !!x))]
    if (uniques.length === 0) return new Map<string, string>()
    const users = await prisma.user.findMany({ where: { id: { in: uniques } }, select: { id: true, nom: true } })
    return new Map(users.map(u => [u.id, u.nom]))
  }

  /** Indicateurs par client : dossiers, facturé, encaissé, solde, prochaine relance. */
  async function indicateurs(clientIds?: string[]) {
    const filtre = clientIds ? { in: clientIds } : { not: null }
    const [dossiers, enCours, factures, reglements, relances, derniers] = await Promise.all([
      prisma.dossier.groupBy({ by: ['clientId'], where: { clientId: filtre }, _count: true, _max: { dateCreation: true } }),
      prisma.dossier.groupBy({ by: ['clientId'], where: { clientId: filtre, status: { not: 'cloture' } }, _count: true }),
      prisma.facture.findMany({
        where: { type: { in: ['validee', 'reglee'] }, dossier: { clientId: filtre } },
        select: { montant: true, dossier: { select: { clientId: true } } },
      }),
      prisma.reglementClient.groupBy({ by: ['clientId'], where: { clientId: filtre }, _sum: { montant: true }, _max: { dateReglement: true } }),
      prisma.interactionClient.groupBy({ by: ['clientId'], where: { clientId: clientIds ? { in: clientIds } : undefined, faite: false, dateProchaineAction: { not: null } }, _min: { dateProchaineAction: true } }),
      prisma.interactionClient.groupBy({ by: ['clientId'], where: { clientId: clientIds ? { in: clientIds } : undefined }, _max: { dateInteraction: true } }),
    ])
    const out = new Map<string, {
      dossiers: number; dossiersEnCours: number; dernierDossier: Date | null; facture: number; encaisse: number
      solde: number; dernierReglement: Date | null; prochaineRelance: Date | null; dernierEchange: Date | null
    }>()
    const get = (id: string) => {
      if (!out.has(id)) out.set(id, { dossiers: 0, dossiersEnCours: 0, dernierDossier: null, facture: 0, encaisse: 0, solde: 0, dernierReglement: null, prochaineRelance: null, dernierEchange: null })
      return out.get(id)!
    }
    for (const d of dossiers) if (d.clientId) { const x = get(d.clientId); x.dossiers = d._count; x.dernierDossier = d._max?.dateCreation ?? null }
    for (const d of enCours) if (d.clientId) get(d.clientId).dossiersEnCours = d._count
    for (const f of factures) if (f.dossier.clientId) get(f.dossier.clientId).facture += num(f.montant)
    for (const r of reglements) if (r.clientId) { const x = get(r.clientId); x.encaisse = num(r._sum.montant); x.dernierReglement = r._max.dateReglement }
    for (const r of relances) get(r.clientId).prochaineRelance = r._min.dateProchaineAction
    for (const r of derniers) get(r.clientId).dernierEchange = r._max.dateInteraction
    for (const x of out.values()) x.solde = Math.max(0, x.facture - x.encaisse)
    return out
  }

  // GET /api/crm/synthese — tableau de bord commercial
  fastify.get('/synthese', { preHandler }, async (request, reply) => {
    await synchroniser(request.user.id)
    const maintenant = new Date()
    const il12Mois = new Date(maintenant.getFullYear(), maintenant.getMonth() - 11, 1)
    const [parStatut, parSegment, reglements12, modes, relancesRetard, relancesSemaine, nouveaux, indic, clients] = await Promise.all([
      prisma.client.groupBy({ by: ['statut'], _count: true }),
      prisma.client.groupBy({ by: ['segment'], _count: true }),
      prisma.reglementClient.findMany({ where: { dateReglement: { gte: il12Mois } }, select: { montant: true, dateReglement: true } }),
      prisma.reglementClient.groupBy({ by: ['mode'], _sum: { montant: true }, _count: true }),
      prisma.interactionClient.count({ where: { faite: false, dateProchaineAction: { lt: maintenant } } }),
      prisma.interactionClient.count({ where: { faite: false, dateProchaineAction: { gte: maintenant, lt: new Date(maintenant.getTime() + 7 * 86_400_000) } } }),
      prisma.client.count({ where: { createdAt: { gte: debutMois() } } }),
      indicateurs(),
      prisma.client.findMany({ select: { id: true, nom: true, segment: true, statut: true } }),
    ])

    const mois: { mois: string; montant: number }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1)
      mois.push({ mois: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, montant: 0 })
    }
    for (const r of reglements12) {
      const cle = `${r.dateReglement.getFullYear()}-${String(r.dateReglement.getMonth() + 1).padStart(2, '0')}`
      const m = mois.find(x => x.mois === cle)
      if (m) m.montant += num(r.montant)
    }
    const nomDe = new Map(clients.map(c => [c.id, c]))
    const lignes = [...indic.entries()].map(([id, x]) => ({ id, nom: nomDe.get(id)?.nom ?? '—', segment: nomDe.get(id)?.segment, ...x }))

    return reply.send({
      clients: {
        total: clients.length,
        parStatut: Object.fromEntries(parStatut.map(s => [s.statut, s._count])),
        parSegment: Object.fromEntries(parSegment.map(s => [s.segment, s._count])),
        nouveauxCeMois: nouveaux,
      },
      encaisse12Mois: mois.reduce((s, m) => s + m.montant, 0),
      encaisseCeMois: mois[mois.length - 1].montant,
      encours: lignes.reduce((s, l) => s + l.solde, 0),
      dossiersEnCours: lignes.reduce((s, l) => s + l.dossiersEnCours, 0),
      relances: { enRetard: relancesRetard, cetteSemaine: relancesSemaine },
      evolution: mois,
      modes: modes.map(m => ({ mode: m.mode, montant: num(m._sum.montant), nombre: m._count })),
      topClients: [...lignes].sort((a, b) => b.encaisse - a.encaisse || b.dossiers - a.dossiers).slice(0, 5),
      topEncours: [...lignes].filter(l => l.solde > 0).sort((a, b) => b.solde - a.solde).slice(0, 5),
    })
  })

  // GET /api/crm/clients
  fastify.get('/clients', { preHandler }, async (request, reply) => {
    const q = z.object({
      q:       z.string().optional(),
      statut:  z.enum(STATUTS).optional(),
      segment: z.enum(SEGMENTS).optional(),
    }).parse(request.query)
    const where: Prisma.ClientWhereInput = {}
    if (q.statut) where.statut = q.statut
    if (q.segment) where.segment = q.segment
    if (q.q?.trim()) {
      const t = q.q.trim()
      where.OR = [
        { nom: { contains: t, mode: 'insensitive' } }, { cleNom: { contains: cleClient(t) } },
        { niu: { contains: t, mode: 'insensitive' } }, { contactNom: { contains: t, mode: 'insensitive' } },
        { ville: { contains: t, mode: 'insensitive' } }, { secteur: { contains: t, mode: 'insensitive' } },
      ]
    }
    const clients = await prisma.client.findMany({ where, orderBy: { nom: 'asc' }, take: 500 })
    const indic = await indicateurs(clients.map(c => c.id))
    const noms = await nomsComptes(clients.map(c => c.gestionnaireId))
    const vide = { dossiers: 0, dossiersEnCours: 0, dernierDossier: null, facture: 0, encaisse: 0, solde: 0, dernierReglement: null, prochaineRelance: null, dernierEchange: null }
    return reply.send(clients.map(c => ({
      ...c, plafondCredit: c.plafondCredit === null ? null : num(c.plafondCredit),
      gestionnaire: c.gestionnaireId ? noms.get(c.gestionnaireId) ?? null : null,
      indicateurs: indic.get(c.id) ?? vide,
    })))
  })

  // POST /api/crm/clients
  fastify.post('/clients', { preHandler }, async (request, reply) => {
    const body = clientSchema.parse(request.body)
    const cle = cleClient(body.nom)
    const existant = await prisma.client.findUnique({ where: { cleNom: cle }, select: { id: true, nom: true } })
    if (existant) return reply.code(409).send({ error: 'CLIENT_EXISTANT', message: `Ce client existe déjà : ${existant.nom}`, id: existant.id })
    const client = await prisma.client.create({ data: { ...body, cleNom: cle, createdById: request.user.id } })
    // Rattacher les dossiers existants portant ce nom
    const dossiers = await prisma.dossier.findMany({ where: { clientId: null }, select: { id: true, client: true } })
    const ids = dossiers.filter(d => cleClient(d.client) === cle).map(d => d.id)
    if (ids.length) await prisma.dossier.updateMany({ where: { id: { in: ids } }, data: { clientId: client.id } })
    await logActivity(request.user.id, 'CLIENT_CREE', 'client', client.id, `Fiche client « ${client.nom} » créée`)
    return reply.code(201).send(client)
  })

  // GET /api/crm/clients/:id — vision 360°
  fastify.get('/clients/:id', { preHandler }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const client = await prisma.client.findUnique({ where: { id } })
    if (!client) throw new NotFoundError('Client', id)
    const [dossiers, reglements, interactions, factures, contacts, indic] = await Promise.all([
      prisma.dossier.findMany({
        where: { clientId: id }, orderBy: { dateCreation: 'desc' },
        select: {
          id: true, numero: true, status: true, compagnie: true, site: true, conteneur: true, marchandise: true,
          priorite: true, dateCreation: true, dateArrivee: true, dateLimiteSortie: true, montantHonoraires: true, montantTaxes: true,
          responsable: { select: { nom: true } },
        },
      }),
      prisma.reglementClient.findMany({ where: { clientId: id }, orderBy: { dateReglement: 'desc' }, include: { dossier: { select: { numero: true } } } }),
      prisma.interactionClient.findMany({ where: { clientId: id }, orderBy: { dateInteraction: 'desc' } }),
      prisma.facture.findMany({ where: { dossier: { clientId: id } }, orderBy: { dateFacture: 'desc' }, include: { dossier: { select: { numero: true } } } }),
      prisma.contact.findMany({
        where: { OR: [{ societe: { equals: client.nom, mode: 'insensitive' } }, { nom: { equals: client.nom, mode: 'insensitive' } }] },
        orderBy: { nom: 'asc' },
      }),
      indicateurs([id]),
    ])
    const noms = await nomsComptes([client.gestionnaireId, ...reglements.map(r => r.saisiParId), ...interactions.map(i => i.auteurId)])
    return reply.send({
      ...client,
      plafondCredit: client.plafondCredit === null ? null : num(client.plafondCredit),
      gestionnaire: client.gestionnaireId ? noms.get(client.gestionnaireId) ?? null : null,
      indicateurs: indic.get(id) ?? null,
      dossiers,
      reglements: reglements.map(r => ({ ...r, montant: num(r.montant), saisiPar: noms.get(r.saisiParId) ?? null })),
      interactions: interactions.map(i => ({ ...i, auteur: noms.get(i.auteurId) ?? null })),
      factures: factures.map(f => ({ id: f.id, numero: f.numero, type: f.type, montant: num(f.montant), dateFacture: f.dateFacture, datePaiement: f.datePaiement, dossier: f.dossier.numero, description: f.description })),
      contacts,
    })
  })

  // PATCH /api/crm/clients/:id
  fastify.patch('/clients/:id', { preHandler }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body = clientSchema.partial().parse(request.body)
    const existant = await prisma.client.findUnique({ where: { id } })
    if (!existant) throw new NotFoundError('Client', id)
    const data: Prisma.ClientUpdateInput = { ...body }
    if (body.nom && body.nom !== existant.nom) {
      const cle = cleClient(body.nom)
      const doublon = await prisma.client.findFirst({ where: { cleNom: cle, id: { not: id } }, select: { nom: true } })
      if (doublon) return reply.code(409).send({ error: 'CLIENT_EXISTANT', message: `Un autre client porte déjà ce nom : ${doublon.nom}` })
      data.cleNom = cle
    }
    const client = await prisma.client.update({ where: { id }, data })
    await logActivity(request.user.id, 'CLIENT_MODIFIE', 'client', id, `Fiche client « ${client.nom} » modifiée`)
    return reply.send(client)
  })

  // POST /api/crm/clients/:id/interactions
  fastify.post('/clients/:id/interactions', { preHandler }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body = interactionSchema.parse(request.body)
    if (!(await prisma.client.findUnique({ where: { id }, select: { id: true } }))) throw new NotFoundError('Client', id)
    const it = await prisma.interactionClient.create({
      data: {
        clientId: id, type: body.type, sujet: body.sujet, contenu: body.contenu, prochaineAction: body.prochaineAction,
        dateInteraction: body.dateInteraction ? new Date(body.dateInteraction) : new Date(),
        dateProchaineAction: body.dateProchaineAction ? new Date(body.dateProchaineAction) : null,
        dossierId: body.dossierId ?? null, auteurId: request.user.id,
      },
    })
    return reply.code(201).send({ ...it, auteur: request.user.nom })
  })

  // PATCH /api/crm/interactions/:id — marquer la prochaine action comme faite, reprogrammer…
  fastify.patch('/interactions/:id', { preHandler }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body = z.object({
      faite: z.boolean().optional(),
      prochaineAction: optStr(255),
      dateProchaineAction: z.string().datetime().nullable().optional(),
    }).parse(request.body)
    const existant = await prisma.interactionClient.findUnique({ where: { id } })
    if (!existant) throw new NotFoundError('Échange', id)
    return reply.send(await prisma.interactionClient.update({
      where: { id },
      data: {
        faite: body.faite,
        prochaineAction: body.prochaineAction,
        dateProchaineAction: body.dateProchaineAction === undefined ? undefined : body.dateProchaineAction ? new Date(body.dateProchaineAction) : null,
      },
    }))
  })

  // DELETE /api/crm/interactions/:id — auteur ou Direction
  fastify.delete('/interactions/:id', { preHandler }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const existant = await prisma.interactionClient.findUnique({ where: { id } })
    if (!existant) throw new NotFoundError('Échange', id)
    if (existant.auteurId !== request.user.id && !request.user.superviseur) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Seul l\'auteur (ou la Direction) peut supprimer cet échange.' })
    }
    await prisma.interactionClient.delete({ where: { id } })
    return reply.code(204).send()
  })

  // GET /api/crm/relances — prochaines actions à mener (en retard d'abord)
  fastify.get('/relances', { preHandler }, async (_request, reply) => {
    const rows = await prisma.interactionClient.findMany({
      where: { faite: false, dateProchaineAction: { not: null } },
      orderBy: { dateProchaineAction: 'asc' },
      take: 100,
      include: { client: { select: { id: true, nom: true, segment: true } } },
    })
    const noms = await nomsComptes(rows.map(r => r.auteurId))
    return reply.send(rows.map(r => ({ ...r, auteur: noms.get(r.auteurId) ?? null })))
  })

  // GET /api/crm/reglements
  fastify.get('/reglements', { preHandler }, async (request, reply) => {
    const q = z.object({ clientId: z.string().uuid().optional(), mode: z.enum(MODES_REGLEMENT).optional(), limit: z.coerce.number().min(1).max(500).default(200) }).parse(request.query)
    const rows = await prisma.reglementClient.findMany({
      where: { clientId: q.clientId, mode: q.mode },
      orderBy: { dateReglement: 'desc' },
      take: q.limit,
      include: { dossier: { select: { id: true, numero: true } }, client: { select: { id: true, nom: true } } },
    })
    const noms = await nomsComptes(rows.map(r => r.saisiParId))
    return reply.send(rows.map(r => ({ ...r, montant: num(r.montant), saisiPar: noms.get(r.saisiParId) ?? null })))
  })

  // POST /api/crm/reglements — règlement reçu hors workflow (acompte, solde…)
  fastify.post('/reglements', { preHandler }, async (request, reply) => {
    const body = reglementSchema.parse(request.body)
    const client = await prisma.client.findUnique({ where: { id: body.clientId } })
    if (!client) throw new NotFoundError('Client', body.clientId)
    if (body.dossierId) {
      const d = await prisma.dossier.findUnique({ where: { id: body.dossierId }, select: { clientId: true } })
      if (!d) throw new NotFoundError('Dossier', body.dossierId)
    }
    const r = await prisma.reglementClient.create({
      data: {
        clientId: client.id, clientNom: client.nom, dossierId: body.dossierId ?? null, mode: body.mode, montant: body.montant,
        dateReglement: body.dateReglement ? new Date(body.dateReglement) : new Date(),
        payeur: body.payeur, reference: body.reference, banque: body.banque, observations: body.observations,
        dateEcheance: body.dateEcheance ? new Date(body.dateEcheance) : null, saisiParId: request.user.id,
      },
    })
    await logActivity(request.user.id, 'REGLEMENT_CLIENT', 'client', client.id, `Règlement de ${body.montant.toLocaleString('fr-FR')} FCFA — ${client.nom}`)
    return reply.code(201).send({ ...r, montant: num(r.montant) })
  })

  // POST /api/crm/synchroniser — crée les fiches des clients présents dans les dossiers
  fastify.post('/synchroniser', { preHandler }, async (request, reply) => {
    const avant = await prisma.client.count()
    const dossiersRattaches = await synchroniser(request.user.id)
    return reply.send({ dossiersRattaches, clientsCrees: (await prisma.client.count()) - avant })
  })
}

export default crmRoutes
