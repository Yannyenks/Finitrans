/**
 * Ressources humaines : fiches employés, congés (demande → décision), masse salariale.
 * Chaque compte gère ses propres demandes de congé ; la Direction décide.
 */
import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { differenceInCalendarDays, eachDayOfInterval, startOfYear, endOfYear } from 'date-fns'
import { prisma } from '../config/prisma'
import { authenticate } from '../middleware/authenticate'
import { requireModule, requireSupervisor } from '../middleware/authorize'
import { logActivity } from '../utils/audit'
import { NotFoundError } from '../utils/errors'
import { notify } from '../services/workflow'

/** Jours ouvrables (hors dimanches) entre deux dates incluses. */
function joursOuvres(debut: Date, fin: Date): number {
  if (fin < debut) return 0
  return eachDayOfInterval({ start: debut, end: fin }).filter(d => d.getDay() !== 0).length
}

async function soldeConges(userId: string, annee = new Date().getFullYear()) {
  const fiche = await prisma.ficheRH.findUnique({ where: { userId }, select: { joursCongesAn: true } })
  const droits = fiche?.joursCongesAn ?? 18
  const pris = await prisma.conge.aggregate({
    where: {
      userId, type: 'annuel', statut: { in: ['approuve', 'demande'] },
      dateDebut: { gte: startOfYear(new Date(annee, 0, 1)), lte: endOfYear(new Date(annee, 0, 1)) },
    },
    _sum: { jours: true },
  })
  const utilises = pris._sum.jours ?? 0
  return { droits, utilises, restant: droits - utilises }
}

const ficheSchema = z.object({
  matricule:      z.string().max(50).nullable().optional(),
  poste:          z.string().max(255).nullable().optional(),
  departement:    z.string().max(100).nullable().optional(),
  typeContrat:    z.enum(['CDI', 'CDD', 'stage', 'consultant', 'interim']).optional(),
  dateEmbauche:   z.string().datetime().nullable().optional(),
  dateFinContrat: z.string().datetime().nullable().optional(),
  salaireBase:    z.number().nonnegative().optional(),
  primes:         z.number().nonnegative().optional(),
  numeroCNPS:     z.string().max(50).nullable().optional(),
  banque:         z.string().max(100).nullable().optional(),
  rib:            z.string().max(100).nullable().optional(),
  adresse:        z.string().nullable().optional(),
  contactUrgence: z.string().max(255).nullable().optional(),
  joursCongesAn:  z.number().int().min(0).max(60).optional(),
  notes:          z.string().nullable().optional(),
})

const rhRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const gestionRH = [authenticate, requireModule('administration', 'employes')]

  // GET /api/rh/fiches — tous les employés avec leur fiche RH
  fastify.get('/fiches', { preHandler: gestionRH }, async (request, reply) => {
    const voirSalaires = request.user.modules.includes('administration')
    const users = await prisma.user.findMany({
      orderBy: [{ actif: 'desc' }, { nom: 'asc' }],
      select: {
        id: true, nom: true, email: true, role: true, profil: true, site: true, actif: true, telephone: true,
        ficheRH: true,
      },
    })
    return reply.send(users.map(u => ({
      ...u,
      ficheRH: u.ficheRH && !voirSalaires
        ? { ...u.ficheRH, salaireBase: null, primes: null, rib: null, banque: null }
        : u.ficheRH,
    })))
  })

  // PUT /api/rh/fiches/:userId — créer / mettre à jour une fiche RH (Direction)
  fastify.put('/fiches/:userId', { preHandler: [authenticate, requireModule('administration')] }, async (request, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params)
    const body = ficheSchema.parse(request.body)
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { nom: true } })
    if (!user) throw new NotFoundError('Employé', userId)

    const data = {
      ...body,
      dateEmbauche:   body.dateEmbauche === undefined ? undefined : body.dateEmbauche ? new Date(body.dateEmbauche) : null,
      dateFinContrat: body.dateFinContrat === undefined ? undefined : body.dateFinContrat ? new Date(body.dateFinContrat) : null,
    }
    const fiche = await prisma.ficheRH.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    })
    await logActivity(request.user.id, 'FICHE_RH_MODIFIEE', 'user', userId, user.nom)
    return reply.send(fiche)
  })

  // GET /api/rh/masse-salariale
  fastify.get('/masse-salariale', { preHandler: [authenticate, requireModule('administration')] }, async (_request, reply) => {
    const fiches = await prisma.ficheRH.findMany({
      where: { user: { actif: true } },
      include: { user: { select: { nom: true, profil: true, site: true } } },
    })
    const lignes = fiches.map(f => ({
      userId: f.userId, nom: f.user.nom, profil: f.user.profil, site: f.user.site, typeContrat: f.typeContrat,
      salaireBase: Number(f.salaireBase), primes: Number(f.primes),
      brut: Number(f.salaireBase) + Number(f.primes),
    }))
    const parSite: Record<string, number> = {}
    lignes.forEach(l => { parSite[l.site] = (parSite[l.site] ?? 0) + l.brut })
    return reply.send({
      lignes,
      totalMensuel: lignes.reduce((s, l) => s + l.brut, 0),
      totalAnnuel:  lignes.reduce((s, l) => s + l.brut, 0) * 12,
      parSite,
      effectif: lignes.length,
    })
  })

  // ── Congés ─────────────────────────────────────────────────────────────

  // GET /api/rh/conges — superviseurs : tous ; autres : les siens
  fastify.get('/conges', { preHandler: [authenticate] }, async (request, reply) => {
    const q = z.object({
      statut: z.enum(['demande', 'approuve', 'refuse', 'annule']).optional(),
      userId: z.string().uuid().optional(),
    }).parse(request.query)
    const voirTous = request.user.superviseur || request.user.modules.includes('administration')
    const conges = await prisma.conge.findMany({
      where: {
        ...(q.statut ? { statut: q.statut } : {}),
        ...(voirTous ? (q.userId ? { userId: q.userId } : {}) : { userId: request.user.id }),
      },
      orderBy: { dateDebut: 'desc' },
      include: {
        user: { select: { id: true, nom: true, role: true, site: true } },
        decidePar: { select: { nom: true } },
      },
      take: 300,
    })
    return reply.send(conges)
  })

  // GET /api/rh/mes-conges — mes demandes + solde
  fastify.get('/mes-conges', { preHandler: [authenticate] }, async (request, reply) => {
    const { annee } = z.object({ annee: z.coerce.number().int().min(2000).max(2100).default(new Date().getFullYear()) }).parse(request.query)
    const [conges, solde] = await Promise.all([
      prisma.conge.findMany({
        where: { userId: request.user.id },
        orderBy: { dateDebut: 'desc' },
        include: { decidePar: { select: { nom: true } } },
      }),
      soldeConges(request.user.id, annee),
    ])
    return reply.send({ conges, solde: { ...solde, annee } })
  })

  // POST /api/rh/conges — demander un congé (tout compte, pour lui-même)
  fastify.post('/conges', { preHandler: [authenticate] }, async (request, reply) => {
    const body = z.object({
      type:      z.enum(['annuel', 'maladie', 'maternite', 'paternite', 'sans_solde', 'exceptionnel']).default('annuel'),
      dateDebut: z.string().datetime(),
      dateFin:   z.string().datetime(),
      motif:     z.string().max(1000).optional(),
    }).parse(request.body)

    const debut = new Date(body.dateDebut)
    const fin   = new Date(body.dateFin)
    if (fin < debut) return reply.code(422).send({ error: 'DATES_INVALIDES', message: 'La date de fin doit suivre la date de début' })
    if (differenceInCalendarDays(fin, debut) > 120) {
      return reply.code(422).send({ error: 'DUREE', message: 'Durée maximale : 120 jours' })
    }
    const jours = joursOuvres(debut, fin)
    if (jours === 0) return reply.code(422).send({ error: 'DUREE', message: 'Aucun jour ouvré dans la période' })

    const chevauchement = await prisma.conge.findFirst({
      where: { userId: request.user.id, statut: { in: ['demande', 'approuve'] }, dateDebut: { lte: fin }, dateFin: { gte: debut } },
    })
    if (chevauchement) return reply.code(409).send({ error: 'CHEVAUCHEMENT', message: 'Une demande existe déjà sur cette période' })

    if (body.type === 'annuel') {
      const solde = await soldeConges(request.user.id, debut.getFullYear())
      if (jours > solde.restant) {
        return reply.code(422).send({ error: 'SOLDE_INSUFFISANT', message: `Solde insuffisant : ${solde.restant} jour(s) restant(s), ${jours} demandé(s)` })
      }
    }

    const conge = await prisma.conge.create({
      data: { userId: request.user.id, type: body.type, dateDebut: debut, dateFin: fin, jours, motif: body.motif },
    })
    const decideurs = await prisma.user.findMany({ where: { profil: { in: ['dg', 'exploitation'] }, actif: true }, select: { id: true } })
    await notify(decideurs.map(d => d.id), {
      type: 'action_requise',
      titre: 'Demande de congé',
      message: `${request.user.nom} demande ${jours} jour(s) de congé (${body.type}).`,
      actionUrl: '/supervision?onglet=conges',
    })
    return reply.code(201).send(conge)
  })

  // PATCH /api/rh/conges/:id/decision — approuver / refuser (Direction / Exploitation)
  fastify.patch('/conges/:id/decision', { preHandler: [authenticate, requireSupervisor] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body = z.object({
      decision:    z.enum(['approuve', 'refuse']),
      commentaire: z.string().max(1000).optional(),
    }).parse(request.body)

    const conge = await prisma.conge.findUnique({ where: { id }, include: { user: { select: { nom: true } } } })
    if (!conge) throw new NotFoundError('Congé', id)
    if (conge.statut !== 'demande') return reply.code(422).send({ error: 'DEJA_TRAITE', message: 'Cette demande a déjà été traitée' })
    if (conge.userId === request.user.id && request.user.profil !== 'dg') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Vous ne pouvez pas décider de votre propre congé' })
    }

    const updated = await prisma.conge.update({
      where: { id },
      data: { statut: body.decision, decideParId: request.user.id, decideAt: new Date(), commentaireDecision: body.commentaire },
    })
    await notify([conge.userId], {
      type: 'message',
      titre: body.decision === 'approuve' ? 'Congé approuvé' : 'Congé refusé',
      message: `Votre demande de ${conge.jours} jour(s) a été ${body.decision === 'approuve' ? 'approuvée' : 'refusée'}${body.commentaire ? ` : ${body.commentaire}` : ''}.`,
      actionUrl: '/mon-espace?onglet=conges',
    })
    await logActivity(request.user.id, body.decision === 'approuve' ? 'CONGE_APPROUVE' : 'CONGE_REFUSE', 'conge', id, conge.user.nom)
    return reply.send(updated)
  })

  // PATCH /api/rh/conges/:id/annuler — annuler sa propre demande non traitée
  fastify.patch('/conges/:id/annuler', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const conge = await prisma.conge.findUnique({ where: { id } })
    if (!conge) throw new NotFoundError('Congé', id)
    if (conge.userId !== request.user.id && !request.user.superviseur) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Demande d\'un autre employé' })
    }
    if (conge.statut === 'annule' || conge.statut === 'refuse') {
      return reply.code(422).send({ error: 'DEJA_TRAITE', message: 'Demande déjà close' })
    }
    if (conge.statut === 'approuve' && !request.user.superviseur && conge.dateDebut <= new Date()) {
      return reply.code(422).send({ error: 'DEJA_COMMENCE', message: 'Congé déjà commencé : contactez la Direction' })
    }
    return reply.send(await prisma.conge.update({ where: { id }, data: { statut: 'annule' } }))
  })
}

export default rhRoutes
