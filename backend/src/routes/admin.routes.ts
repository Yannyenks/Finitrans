/**
 * Administration de l'entreprise (module « administration » — Directeur Général).
 * Fiche société, journal d'activité global, synthèse de pilotage.
 */
import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { subDays, startOfMonth } from 'date-fns'
import { prisma } from '../config/prisma'
import { authenticate } from '../middleware/authenticate'
import { requireModule } from '../middleware/authorize'
import { logActivity } from '../utils/audit'

export const ENTREPRISE_DEFAUT = {
  raisonSociale: 'FINITRANS',
  sigle: 'FINITRANS',
  formeJuridique: 'SARL',
  capital: 0,
  rccm: '',
  niu: '',
  agrementCommissionnaire: '',
  adresse: 'Douala, Cameroun',
  telephone: '',
  email: '',
  siteWeb: '',
  banquePrincipale: '',
  rib: '',
  devise: 'XAF',
  tauxTVA: 19.25,
  debutExercice: '01-01',
  sites: ['Douala', 'Kribi'],
}

const entrepriseSchema = z.object({
  raisonSociale:           z.string().min(2).max(255),
  sigle:                   z.string().max(50).optional(),
  formeJuridique:          z.string().max(50).optional(),
  capital:                 z.number().nonnegative().optional(),
  rccm:                    z.string().max(100).optional(),
  niu:                     z.string().max(100).optional(),
  agrementCommissionnaire: z.string().max(100).optional(),
  adresse:                 z.string().max(500).optional(),
  telephone:               z.string().max(100).optional(),
  email:                   z.string().email().or(z.literal('')).optional(),
  siteWeb:                 z.string().max(255).optional(),
  banquePrincipale:        z.string().max(255).optional(),
  rib:                     z.string().max(100).optional(),
  devise:                  z.string().max(10).optional(),
  tauxTVA:                 z.number().min(0).max(100).optional(),
  debutExercice:           z.string().regex(/^\d{2}-\d{2}$/).optional(),
  sites:                   z.array(z.string()).optional(),
})

export async function getEntreprise() {
  const row = await prisma.parametre.findUnique({ where: { cle: 'entreprise' } })
  return { ...ENTREPRISE_DEFAUT, ...((row?.valeur ?? {}) as Record<string, unknown>) }
}

const adminRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const pre = [authenticate, requireModule('administration')]

  // GET /api/admin/entreprise — lisible par tous (en-têtes de documents)
  fastify.get('/entreprise', { preHandler: [authenticate] }, async (_request, reply) => {
    return reply.send(await getEntreprise())
  })

  // PUT /api/admin/entreprise
  fastify.put('/entreprise', { preHandler: pre }, async (request, reply) => {
    const body = entrepriseSchema.parse(request.body)
    const valeur = { ...(await getEntreprise()), ...body }
    await prisma.parametre.upsert({
      where:  { cle: 'entreprise' },
      update: { valeur: valeur as Prisma.InputJsonValue, updatedBy: request.user.id },
      create: { cle: 'entreprise', valeur: valeur as Prisma.InputJsonValue, updatedBy: request.user.id, description: 'Fiche entreprise' },
    })
    await logActivity(request.user.id, 'ENTREPRISE_MODIFIEE', 'entreprise', null, body.raisonSociale)
    return reply.send(valeur)
  })

  // GET /api/admin/activites — journal unifié (actions globales + actions sur dossiers)
  fastify.get('/activites', { preHandler: pre }, async (request, reply) => {
    const q = z.object({
      userId: z.string().uuid().optional(),
      action: z.string().optional(),
      from:   z.string().datetime().optional(),
      to:     z.string().datetime().optional(),
      limit:  z.coerce.number().min(1).max(500).default(150),
    }).parse(request.query)

    const createdAt = q.from || q.to ? { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } : undefined
    const [globales, dossiers] = await Promise.all([
      prisma.activityLog.findMany({
        where: {
          ...(q.userId ? { userId: q.userId } : {}),
          ...(q.action ? { action: { contains: q.action, mode: 'insensitive' } } : {}),
          ...(createdAt ? { createdAt } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: q.limit,
        include: { user: { select: { nom: true, profil: true } } },
      }),
      prisma.auditEntry.findMany({
        where: {
          ...(q.userId ? { auteurId: q.userId } : {}),
          ...(q.action ? { action: { contains: q.action, mode: 'insensitive' } } : {}),
          ...(createdAt ? { createdAt } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: q.limit,
        include: { auteur: { select: { nom: true, profil: true } }, dossier: { select: { id: true, numero: true } } },
      }),
    ])

    const items = [
      ...globales.map(a => ({
        id: a.id, date: a.createdAt, action: a.action, entite: a.entite, details: a.details,
        utilisateur: a.user?.nom ?? 'Système', profil: a.user?.profil ?? null, dossier: null as null | { id: string; numero: string },
      })),
      ...dossiers.map(a => ({
        id: a.id, date: a.createdAt, action: a.action, entite: 'dossier', details: a.details,
        utilisateur: a.auteur.nom, profil: a.auteur.profil, dossier: a.dossier,
      })),
    ].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, q.limit)

    return reply.send(items)
  })

  // GET /api/admin/synthese — tableau de pilotage de l'entreprise
  fastify.get('/synthese', { preHandler: pre }, async (_request, reply) => {
    const now = new Date()
    const debutMois = startOfMonth(now)
    const [
      users, fiches, congesEnCours, congesEnAttente, dossiersActifs, dossiersClotures30j,
      facturesMois, encaissementsMois, paiementsAttente, ecrituresBrouillon, connexions7j,
    ] = await Promise.all([
      prisma.user.findMany({ select: { profil: true, site: true, actif: true } }),
      prisma.ficheRH.findMany({ where: { user: { actif: true } }, select: { salaireBase: true, primes: true } }),
      prisma.conge.count({ where: { statut: 'approuve', dateDebut: { lte: now }, dateFin: { gte: now } } }),
      prisma.conge.count({ where: { statut: 'demande' } }),
      prisma.dossier.count({ where: { status: { not: 'cloture' }, finaliseLe: null } }),
      prisma.dossier.count({ where: { status: 'cloture', updatedAt: { gte: subDays(now, 30) } } }),
      prisma.facture.aggregate({ where: { dateFacture: { gte: debutMois }, type: { in: ['validee', 'reglee'] } }, _sum: { montant: true }, _count: true }),
      prisma.facture.aggregate({ where: { datePaiement: { gte: debutMois }, type: 'reglee' }, _sum: { montant: true } }),
      prisma.paiementDouane.aggregate({ where: { statut: { in: ['en_attente', 'en_retard'] } }, _sum: { montant: true }, _count: true }),
      prisma.ecritureComptable.count({ where: { statut: 'brouillon' } }),
      prisma.activityLog.count({ where: { action: 'CONNEXION', createdAt: { gte: subDays(now, 7) } } }),
    ])

    const actifs = users.filter(u => u.actif)
    const parProfil: Record<string, number> = {}
    const parSite: Record<string, number> = {}
    actifs.forEach(u => {
      parProfil[u.profil] = (parProfil[u.profil] ?? 0) + 1
      parSite[u.site] = (parSite[u.site] ?? 0) + 1
    })
    const masseSalariale = fiches.reduce((s, f) => s + Number(f.salaireBase) + Number(f.primes), 0)

    return reply.send({
      effectifs: { actifs: actifs.length, inactifs: users.length - actifs.length, parProfil, parSite, fichesRH: fiches.length },
      rh: { masseSalarialeMensuelle: masseSalariale, congesEnCours, congesEnAttente },
      activite: { dossiersActifs, dossiersClotures30j, connexions7j },
      finance: {
        facturationMois: Number(facturesMois._sum.montant ?? 0),
        facturesMois: facturesMois._count,
        encaissementsMois: Number(encaissementsMois._sum.montant ?? 0),
        paiementsDouaneEnAttente: Number(paiementsAttente._sum.montant ?? 0),
        nbPaiementsDouaneEnAttente: paiementsAttente._count,
        ecrituresBrouillon,
      },
    })
  })
}

export default adminRoutes
