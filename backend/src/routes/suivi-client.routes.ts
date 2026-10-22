/**
 * Suivi client : lien secret partagé avec le client pour suivre l'avancement de son dossier
 * (page publique sans compte), et actualités publiées par l'équipe à son intention.
 */
import { randomBytes } from 'crypto'
import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../config/prisma'
import { authenticate } from '../middleware/authenticate'
import { PROFILS_TOUS_DOSSIERS } from '../config/roles'
import { logAudit } from '../utils/audit'
import { AppError, NotFoundError } from '../utils/errors'
import { AuthUser } from '../types'
import { STATUS_LABELS, stagesForSite } from '../services/workflow'
import { getEntreprise } from './admin.routes'
import { nomCompagnie } from '../services/compagnies'

export const ILLUSTRATIONS = ['info', 'navire', 'port', 'douane', 'document', 'paiement', 'camion', 'valide', 'attention'] as const

/** Ce que vit le client à chaque étape (libellés clairs, sans jargon interne). */
const ETAPES_CLIENT: Record<string, { titre: string; texte: string; illustration: string }> = {
  reception:        { titre: 'Dossier reçu',                 texte: 'Nous avons reçu vos documents et ouvert votre dossier.',                         illustration: 'document' },
  soumission_sgs:   { titre: 'Inspection SGS',               texte: 'Les documents sont soumis pour l’inspection et l’obtention du RVC.',             illustration: 'douane' },
  codage:           { titre: 'Déclaration en douane',        texte: 'Classement tarifaire et préparation de la déclaration.',                         illustration: 'document' },
  validation:       { titre: 'Validation douanière',         texte: 'La douane examine et valide la déclaration.',                                    illustration: 'douane' },
  paiement:         { titre: 'Droits et taxes',              texte: 'Règlement des droits et taxes de douane.',                                       illustration: 'paiement' },
  bon_compagnie:    { titre: 'Bon de la compagnie',          texte: 'Obtention du bon de la compagnie maritime et du bon à délivrer.',                illustration: 'navire' },
  operations_douala:{ titre: 'Opérations au port de Douala', texte: 'Formalités au terminal portuaire.',                                              illustration: 'port' },
  operations_kribi: { titre: 'Opérations au port de Kribi',  texte: 'Formalités au terminal, bon de livraison et ticket de sortie.',                  illustration: 'port' },
  cloture:          { titre: 'Marchandise libérée',          texte: 'Les opérations sont terminées : votre marchandise est libérée.',                 illustration: 'camion' },
  facturation:      { titre: 'Facturation',                  texte: 'Établissement et remise de votre facture.',                                      illustration: 'valide' },
}

async function peutGerer(user: AuthUser, dossier: { id: string; responsableId: string }) {
  if (user.superviseur || PROFILS_TOUS_DOSSIERS.includes(user.profil) || dossier.responsableId === user.id) return true
  return (await prisma.sousEtapeDossier.count({ where: { dossierId: dossier.id, responsableId: user.id } })) > 0
}

const nouveauJeton = () => randomBytes(24).toString('base64url')

const suiviClientRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const charger = async (id: string, user: AuthUser) => {
    const d = await prisma.dossier.findUnique({ where: { id }, select: { id: true, numero: true, responsableId: true, suiviToken: true } })
    if (!d) throw new NotFoundError('Dossier', id)
    if (!(await peutGerer(user, d))) throw new AppError(403, 'FORBIDDEN', 'Vous n\'intervenez pas sur ce dossier.')
    return d
  }

  // GET /api/dossiers/:id/suivi-client — état du lien et actualités publiées
  fastify.get('/:id/suivi-client', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const d = await charger(id, request.user)
    const actualites = await prisma.actualiteClient.findMany({ where: { dossierId: id }, orderBy: { createdAt: 'desc' } })
    return reply.send({ token: d.suiviToken, actualites })
  })

  // POST /api/dossiers/:id/suivi-client — créer (ou renouveler) le lien de suivi
  fastify.post('/:id/suivi-client', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const { renouveler } = z.object({ renouveler: z.boolean().optional() }).parse(request.body ?? {})
    const d = await charger(id, request.user)
    if (d.suiviToken && !renouveler) return reply.send({ token: d.suiviToken })
    const token = nouveauJeton()
    await prisma.dossier.update({ where: { id }, data: { suiviToken: token } })
    await logAudit(id, request.user.id, 'SUIVI_CLIENT', d.suiviToken ? 'Lien de suivi client renouvelé (l\'ancien lien ne fonctionne plus)' : 'Lien de suivi client créé')
    return reply.send({ token })
  })

  // DELETE /api/dossiers/:id/suivi-client — désactiver le lien
  fastify.delete('/:id/suivi-client', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    await charger(id, request.user)
    await prisma.dossier.update({ where: { id }, data: { suiviToken: null } })
    await logAudit(id, request.user.id, 'SUIVI_CLIENT', 'Lien de suivi client désactivé')
    return reply.code(204).send()
  })

  // POST /api/dossiers/:id/suivi-client/actualites — message pour le client
  fastify.post('/:id/suivi-client/actualites', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body = z.object({
      message: z.string().trim().min(2).max(1500),
      illustration: z.enum(ILLUSTRATIONS).default('info'),
    }).parse(request.body)
    await charger(id, request.user)
    const a = await prisma.actualiteClient.create({ data: { dossierId: id, message: body.message, illustration: body.illustration, auteurNom: request.user.nom } })
    await logAudit(id, request.user.id, 'SUIVI_CLIENT', `Actualité publiée pour le client : « ${body.message.slice(0, 80)} »`)
    return reply.code(201).send(a)
  })

  // DELETE /api/dossiers/:id/suivi-client/actualites/:aid
  fastify.delete('/:id/suivi-client/actualites/:aid', { preHandler: [authenticate] }, async (request, reply) => {
    const { id, aid } = z.object({ id: z.string().uuid(), aid: z.string().uuid() }).parse(request.params)
    await charger(id, request.user)
    await prisma.actualiteClient.deleteMany({ where: { id: aid, dossierId: id } })
    return reply.code(204).send()
  })
}

/** Page publique du client (sans compte) : uniquement des informations destinées au client. */
export const suiviPublicRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get('/suivi/:token', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { token } = z.object({ token: z.string().min(20).max(64) }).parse(request.params)
    const d = await prisma.dossier.findUnique({
      where: { suiviToken: token },
      include: {
        timings: { orderBy: { dateDebut: 'asc' }, select: { etape: true, dateDebut: true, dateFin: true } },
        actualitesClient: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    })
    if (!d) return reply.code(404).send({ error: 'LIEN_INVALIDE', message: 'Ce lien de suivi n\'est plus valide. Contactez FINITRANS pour en obtenir un nouveau.' })

    const parcoursSite = stagesForSite(d.site)
    const parcours = parcoursSite.filter((e, i) => e !== 'operations_douala' || i >= parcoursSite.indexOf(d.status) || d.timings.some(t => t.etape === e))
    const iCourant = parcours.indexOf(d.status)
    const termine = d.status === 'facturation' || d.status === 'cloture'
    const etapes = parcours.map((e, i) => {
      const t = [...d.timings].reverse().find(x => x.etape === e)
      const etat = i < iCourant || (termine && i <= iCourant && e === 'cloture') ? 'fait' : i === iCourant ? 'courant' : 'avenir'
      return { etape: e, ...ETAPES_CLIENT[e] ?? { titre: STATUS_LABELS[e], texte: '', illustration: 'info' }, etat, debut: t?.dateDebut ?? null, fin: t?.dateFin ?? null }
    })
    const progression = termine ? 100 : Math.round((Math.max(0, iCourant) / Math.max(1, parcours.length - 1)) * 100)
    const entreprise = await getEntreprise() as Record<string, unknown>
    const conteneurs = Array.isArray(d.conteneurs) && d.conteneurs.length
      ? (d.conteneurs as { numero?: string; taille?: string }[]).map(c => ({ numero: String(c.numero ?? ''), taille: String(c.taille ?? '') }))
      : d.conteneur.split(/[,;\s]+/).filter(Boolean).map(numero => ({ numero, taille: d.tailleConteneur ?? '' }))

    reply.header('Cache-Control', 'no-store')
    return reply.send({
      numero: d.numero, client: d.client, marchandise: d.marchandise, site: d.site,
      compagnie: await nomCompagnie(d.compagnie), numeroBL: d.numeroBL, dateArrivee: d.dateArrivee,
      conteneurs, resumeConteneurs: d.tailleConteneur,
      statut: d.status, etapeCourante: ETAPES_CLIENT[d.status]?.titre ?? STATUS_LABELS[d.status], termine, progression,
      etapes,
      actualites: d.actualitesClient.map(a => ({ id: a.id, message: a.message, illustration: a.illustration, auteur: a.auteurNom, date: a.createdAt })),
      entreprise: {
        nom: entreprise.raisonSociale ?? 'FINITRANS', telephone: entreprise.telephone || null, email: entreprise.email || null,
        adresse: entreprise.adresse || null, siteWeb: entreprise.siteWeb || null,
      },
      misAJour: d.updatedAt,
    })
  })
}

export default suiviClientRoutes
