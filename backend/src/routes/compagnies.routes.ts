/**
 * Compagnies maritimes : liste ouverte, consultable par tous, gérée par la Direction (DG, Exploitation).
 */
import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../config/prisma'
import { authenticate } from '../middleware/authenticate'
import { requireSupervisor } from '../middleware/authorize'
import { logActivity } from '../utils/audit'
import { codeCompagnie, invalidateCompagniesCache, loadCompagnies, type Compagnie } from '../services/compagnies'

async function enregistrer(liste: Compagnie[], userId: string) {
  await prisma.parametre.upsert({
    where:  { cle: 'compagnies' },
    update: { valeur: liste as unknown as Prisma.InputJsonValue, updatedBy: userId },
    create: { cle: 'compagnies', valeur: liste as unknown as Prisma.InputJsonValue, updatedBy: userId, description: 'Compagnies maritimes' },
  })
  invalidateCompagniesCache()
}

const compagniesRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /api/compagnies — liste avec le nombre de dossiers de chacune
  fastify.get('/', { preHandler: [authenticate] }, async (_request, reply) => {
    const [liste, usage] = await Promise.all([
      loadCompagnies(),
      prisma.dossier.groupBy({ by: ['compagnie'], _count: true }),
    ])
    const nb = new Map(usage.map(u => [u.compagnie, u._count]))
    // Compagnies présentes sur des dossiers mais absentes de la liste (données anciennes) : affichées aussi
    const inconnues = usage.filter(u => !liste.some(c => c.code === u.compagnie))
      .map(u => ({ code: u.compagnie, nom: u.compagnie.replace(/_/g, ' '), actif: false }))
    return reply.send([...liste, ...inconnues].map(c => ({ ...c, dossiers: nb.get(c.code) ?? 0 })))
  })

  // POST /api/compagnies — ajouter une compagnie
  fastify.post('/', { preHandler: [authenticate, requireSupervisor] }, async (request, reply) => {
    const { nom } = z.object({ nom: z.string().trim().min(2).max(80) }).parse(request.body)
    const code = codeCompagnie(nom)
    if (code.length < 2) return reply.code(422).send({ error: 'NOM_INVALIDE', message: 'Nom de compagnie invalide' })
    const liste = await loadCompagnies()
    const existante = liste.find(c => c.code === code)
    if (existante?.actif) return reply.code(409).send({ error: 'COMPAGNIE_EXISTANTE', message: `La compagnie « ${existante.nom} » existe déjà.` })
    const nouvelle = existante ? liste.map(c => c.code === code ? { ...c, nom, actif: true } : c) : [...liste, { code, nom, actif: true }]
    await enregistrer(nouvelle, request.user.id)
    await logActivity(request.user.id, 'COMPAGNIE_AJOUTEE', 'compagnie', code, `Compagnie « ${nom} » ajoutée`)
    return reply.code(201).send({ code, nom, actif: true })
  })

  // PATCH /api/compagnies/:code — renommer, activer / désactiver
  fastify.patch('/:code', { preHandler: [authenticate, requireSupervisor] }, async (request, reply) => {
    const { code } = z.object({ code: z.string().min(2).max(80) }).parse(request.params)
    const body = z.object({ nom: z.string().trim().min(2).max(80).optional(), actif: z.boolean().optional() }).parse(request.body)
    const liste = await loadCompagnies()
    const cible = liste.find(c => c.code === code)
    if (!cible) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Compagnie introuvable' })
    const maj = { ...cible, ...body }
    await enregistrer(liste.map(c => c.code === code ? maj : c), request.user.id)
    await logActivity(request.user.id, 'COMPAGNIE_MODIFIEE', 'compagnie', code, `Compagnie « ${maj.nom} »${body.actif === false ? ' désactivée' : body.actif ? ' réactivée' : ' modifiée'}`)
    return reply.send(maj)
  })
}

export default compagniesRoutes
