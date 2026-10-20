/**
 * Bibliothèque documentaire : tous les documents de l'entreprise au même endroit —
 * pièces et preuves des dossiers, comptes rendus de clôture, documents internes
 * (contrats, procédures, modèles, RH…). Recherche, filtres, favoris, aperçu, téléchargement.
 */
import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { createHash } from 'crypto'
import { DossierStatus, Prisma } from '@prisma/client'
import { prisma } from '../config/prisma'
import { authenticate } from '../middleware/authenticate'
import { logAudit, logActivity } from '../utils/audit'
import { NotFoundError } from '../utils/errors'
import { envoyerContenu, recevoirFichier } from '../services/televersement'
import { STATUS_ORDER } from '../services/workflow'
import { AuthUser } from '../types'

export const CATEGORIES = ['preuve', 'compte_rendu', 'contrat', 'procedure', 'modele', 'rh', 'juridique', 'administratif', 'finance', 'autre'] as const
const FORMATS = ['pdf', 'image', 'tableur', 'texte', 'autre'] as const
// Gestion des sorties : suit tous les dossiers, quelle que soit la compagnie (les tâches restent attribuées par compagnie)
const VOIT_TOUS_LES_DOSSIERS = ['comptabilite', 'administration', 'gestion_sorties']

const formatWhere: Record<(typeof FORMATS)[number], Prisma.DocumentWhereInput> = {
  pdf:     { type: { contains: 'pdf', mode: 'insensitive' } },
  image:   { type: { startsWith: 'image/' } },
  tableur: { OR: ['sheet', 'excel', 'csv'].map(k => ({ type: { contains: k, mode: 'insensitive' as const } })) },
  texte:   { OR: ['word', 'opendocument.text', 'text/plain', 'rtf'].map(k => ({ type: { contains: k, mode: 'insensitive' as const } })) },
  autre:   {},
}
formatWhere.autre = { NOT: [formatWhere.pdf, formatWhere.image, formatWhere.tableur, formatWhere.texte] }

/** Ce que le compte a le droit de voir. */
function visibles(actor: AuthUser): Prisma.DocumentWhereInput {
  const and: Prisma.DocumentWhereInput[] = []
  if (!(actor.superviseur || actor.profil === 'administration')) {
    and.push({ OR: [{ confidentiel: false }, { uploadePar: actor.id }] })
  }
  if (!(actor.superviseur || VOIT_TOUS_LES_DOSSIERS.includes(actor.profil))) {
    and.push({ OR: [
      { dossierId: null },
      { uploadePar: actor.id },
      { dossier: { OR: [{ responsableId: actor.id }, { sousEtapes: { some: { responsableId: actor.id } } }] } },
    ] })
  }
  return { AND: and }
}

const peutGerer = (actor: AuthUser, doc: { uploadePar: string }) =>
  actor.superviseur || actor.profil === 'administration' || doc.uploadePar === actor.id

const SELECTION = {
  id: true, nom: true, type: true, taille: true, tailleOctets: true, categorie: true, etape: true, description: true,
  tags: true, confidentiel: true, createdAt: true, updatedAt: true, uploadePar: true, dossierId: true,
  dossier:  { select: { id: true, numero: true, client: true, compagnie: true, site: true, status: true } },
  uploader: { select: { id: true, nom: true } },
} satisfies Prisma.DocumentSelect

const octetsLisibles = (n: number) => (n < 1_048_576 ? `${Math.max(1, Math.round(n / 1024))} Ko` : `${(n / 1_048_576).toFixed(1)} Mo`)

const bibliothequeRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const preHandler = [authenticate]

  // GET /api/bibliotheque — recherche et facettes
  fastify.get('/', { preHandler }, async (request, reply) => {
    const q = z.object({
      q:         z.string().trim().max(200).optional(),
      categorie: z.string().optional(),
      format:    z.enum(FORMATS).optional(),
      espace:    z.enum(['dossiers', 'entreprise']).optional(),
      etape:     z.enum(STATUS_ORDER as [DossierStatus, ...DossierStatus[]]).optional(),
      dossierId: z.string().uuid().optional(),
      auteur:    z.string().uuid().optional(),
      favoris:   z.enum(['0', '1']).optional(),
      depuis:    z.string().datetime().optional(),
      tri:       z.enum(['recent', 'ancien', 'nom', 'taille']).default('recent'),
      page:      z.coerce.number().int().min(1).default(1),
      limit:     z.coerce.number().int().min(1).max(200).default(60),
    }).parse(request.query)
    const actor = request.user
    const base = visibles(actor)

    const and: Prisma.DocumentWhereInput[] = [base]
    if (q.q) {
      const mots = q.q.split(/\s+/).filter(Boolean).slice(0, 6)
      for (const m of mots) and.push({ OR: [
        { nom: { contains: m, mode: 'insensitive' } },
        { description: { contains: m, mode: 'insensitive' } },
        { tags: { has: m.toLowerCase() } },
        { dossier: { OR: [
          { numero: { contains: m, mode: 'insensitive' } }, { client: { contains: m, mode: 'insensitive' } },
          { conteneur: { contains: m, mode: 'insensitive' } }, { numeroBL: { contains: m, mode: 'insensitive' } },
        ] } },
        { uploader: { nom: { contains: m, mode: 'insensitive' } } },
      ] })
    }
    if (q.categorie) {
      const cats = q.categorie.split(',').filter(c => (CATEGORIES as readonly string[]).includes(c))
      if (cats.length) and.push({ categorie: { in: cats } })
    }
    if (q.format) and.push(formatWhere[q.format])
    if (q.espace === 'dossiers') and.push({ dossierId: { not: null } })
    if (q.espace === 'entreprise') and.push({ dossierId: null })
    if (q.etape) and.push({ etape: q.etape })
    if (q.dossierId) and.push({ dossierId: q.dossierId })
    if (q.auteur) and.push({ uploadePar: q.auteur })
    if (q.favoris === '1') and.push({ favoris: { some: { userId: actor.id } } })
    if (q.depuis) and.push({ createdAt: { gte: new Date(q.depuis) } })
    const where: Prisma.DocumentWhereInput = { AND: and }

    const orderBy: Prisma.DocumentOrderByWithRelationInput[] =
      q.tri === 'ancien' ? [{ createdAt: 'asc' }]
      : q.tri === 'nom' ? [{ nom: 'asc' }]
      : q.tri === 'taille' ? [{ tailleOctets: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }]
      : [{ createdAt: 'desc' }]

    const debutMois = new Date(); debutMois.setDate(1); debutMois.setHours(0, 0, 0, 0)
    const [documents, total, parCategorie, volume, ceMois, mesFavoris, favorisIds] = await Promise.all([
      prisma.document.findMany({ where, orderBy, skip: (q.page - 1) * q.limit, take: q.limit, select: SELECTION }),
      prisma.document.count({ where }),
      prisma.document.groupBy({ by: ['categorie'], where: base, _count: true }),
      prisma.document.aggregate({ where: base, _sum: { tailleOctets: true }, _count: true }),
      prisma.document.count({ where: { AND: [base, { createdAt: { gte: debutMois } }] } }),
      prisma.documentFavori.count({ where: { userId: actor.id, document: base } }),
      prisma.documentFavori.findMany({ where: { userId: actor.id }, select: { documentId: true } }),
    ])
    const fav = new Set(favorisIds.map(f => f.documentId))

    return reply.send({
      data: documents.map(d => ({
        ...d, url: `/api/bibliotheque/${d.id}/contenu`, favori: fav.has(d.id), modifiable: peutGerer(actor, d),
      })),
      total, page: q.page, limit: q.limit, pages: Math.max(1, Math.ceil(total / q.limit)),
      facettes: {
        total: volume._count,
        octets: volume._sum.tailleOctets ?? 0,
        volume: octetsLisibles(volume._sum.tailleOctets ?? 0),
        ceMois,
        favoris: mesFavoris,
        parCategorie: Object.fromEntries(parCategorie.map(c => [c.categorie, c._count])),
      },
    })
  })

  // GET /api/bibliotheque/:id — fiche du document
  fastify.get('/:id', { preHandler }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const actor = request.user
    const doc = await prisma.document.findFirst({ where: { AND: [{ id }, visibles(actor)] }, select: { ...SELECTION, hashContenu: true } })
    if (!doc) throw new NotFoundError('Document', id)
    const favori = await prisma.documentFavori.findUnique({ where: { userId_documentId: { userId: actor.id, documentId: id } } })
    return reply.send({ ...doc, url: `/api/bibliotheque/${doc.id}/contenu`, favori: !!favori, modifiable: peutGerer(actor, doc) })
  })

  // GET /api/bibliotheque/:id/contenu — aperçu (inline) ou téléchargement (?telecharger=1)
  fastify.get('/:id/contenu', { preHandler }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const { telecharger } = z.object({ telecharger: z.enum(['0', '1']).optional() }).parse(request.query)
    const doc = await prisma.document.findFirst({ where: { AND: [{ id }, visibles(request.user)] }, select: { nom: true, type: true, contenu: true } })
    if (!doc) throw new NotFoundError('Document', id)
    if (!doc.contenu) return reply.code(404).send({ error: 'NO_CONTENT', message: 'Contenu non disponible' })
    return envoyerContenu(request, reply, doc.contenu, {
      'Content-Type': doc.type || 'application/octet-stream',
      'Content-Disposition': `${telecharger === '1' ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(doc.nom)}`,
      'Cache-Control': 'private, max-age=300',
    })
  })

  // POST /api/bibliotheque — dépôt (multipart : fichier + categorie, description, tags, dossierId, etape, confidentiel)
  fastify.post('/', { preHandler }, async (request, reply) => {
    const actor = request.user
    const fichier = await recevoirFichier(request)
    if (!fichier) return reply.code(400).send({ error: 'NO_FILE', message: 'Aucun fichier fourni' })
    const champ = (k: string) => {
      const v = (fichier.fields as Record<string, any>)[k]
      return typeof v?.value === 'string' ? v.value : undefined
    }
    const meta = z.object({
      categorie:    z.enum(CATEGORIES).default('autre'),
      description:  z.string().max(2000).optional(),
      tags:         z.string().max(500).optional(),
      dossierId:    z.string().uuid().optional(),
      etape:        z.enum(STATUS_ORDER as [DossierStatus, ...DossierStatus[]]).optional(),
      confidentiel: z.enum(['true', 'false']).optional(),
      nom:          z.string().trim().min(1).max(255).optional(),
    }).parse({
      categorie: champ('categorie') || undefined, description: champ('description') || undefined, tags: champ('tags') || undefined,
      dossierId: champ('dossierId') || undefined, etape: champ('etape') || undefined, confidentiel: champ('confidentiel') || undefined,
      nom: champ('nom') || undefined,
    })
    if (meta.categorie === 'compte_rendu' && !actor.superviseur) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Les comptes rendus de clôture sont générés automatiquement.' })
    }

    let etape: DossierStatus | null = null
    if (meta.dossierId) {
      const dossier = await prisma.dossier.findUnique({ where: { id: meta.dossierId } })
      if (!dossier) throw new NotFoundError('Dossier', meta.dossierId)
      const implique = actor.superviseur || ['partiel', 'complet'].includes(actor.permDossier) || dossier.responsableId === actor.id
        || (await prisma.sousEtapeDossier.count({ where: { dossierId: dossier.id, responsableId: actor.id } })) > 0
      if (!implique) return reply.code(403).send({ error: 'FORBIDDEN', message: 'Vous n\'intervenez pas sur ce dossier.' })
      etape = meta.etape ?? dossier.status
    }

    const contenu = await fichier.toBuffer()
    const hashContenu = createHash('sha256').update(contenu).digest('hex')
    const doublon = await prisma.document.findFirst({ where: { hashContenu, dossierId: meta.dossierId ?? null }, select: { nom: true, createdAt: true } })
    if (doublon) {
      return reply.code(409).send({
        error: 'DOCUMENT_DUPLIQUE',
        message: `Ce fichier est déjà dans la bibliothèque (${doublon.nom} — ${new Date(doublon.createdAt).toLocaleDateString('fr-FR')}).`,
      })
    }

    const tags = [...new Set((meta.tags ?? '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12)
    const doc = await prisma.document.create({
      data: {
        dossierId: meta.dossierId ?? null, nom: meta.nom ?? fichier.filename, type: fichier.mimetype || 'application/octet-stream',
        taille: octetsLisibles(contenu.length), tailleOctets: contenu.length, contenu, hashContenu, url: '', uploadePar: actor.id,
        etape, categorie: meta.dossierId && !champ('categorie') ? 'preuve' : meta.categorie, description: meta.description, tags,
        confidentiel: meta.confidentiel === 'true',
      },
    })
    const cree = await prisma.document.update({ where: { id: doc.id }, data: { url: `/api/bibliotheque/${doc.id}/contenu` }, select: SELECTION })
    if (meta.dossierId) await logAudit(meta.dossierId, actor.id, 'UPLOAD_DOCUMENT', `"${cree.nom}" ajouté depuis la bibliothèque (${cree.taille})`)
    else await logActivity(actor.id, 'DOCUMENT_AJOUTE', 'document', cree.id, cree.nom)
    return reply.code(201).send({ ...cree, url: `/api/bibliotheque/${cree.id}/contenu`, favori: false, modifiable: true })
  })

  // PATCH /api/bibliotheque/:id — métadonnées
  fastify.patch('/:id', { preHandler }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body = z.object({
      nom:          z.string().trim().min(1).max(255).optional(),
      categorie:    z.enum(CATEGORIES).optional(),
      description:  z.string().max(2000).nullable().optional(),
      tags:         z.array(z.string().trim().toLowerCase().min(1).max(40)).max(12).optional(),
      confidentiel: z.boolean().optional(),
    }).parse(request.body)
    const actor = request.user
    const doc = await prisma.document.findFirst({ where: { AND: [{ id }, visibles(actor)] }, select: { uploadePar: true, categorie: true } })
    if (!doc) throw new NotFoundError('Document', id)
    if (!peutGerer(actor, doc)) return reply.code(403).send({ error: 'FORBIDDEN', message: 'Seul l\'auteur du document (ou la Direction) peut le modifier.' })
    if ((body.categorie === 'compte_rendu') !== (doc.categorie === 'compte_rendu') && body.categorie !== undefined) {
      return reply.code(422).send({ error: 'CATEGORIE', message: 'La catégorie « compte rendu de clôture » est réservée aux comptes rendus générés.' })
    }
    const maj = await prisma.document.update({ where: { id }, data: { ...body, tags: body.tags ? [...new Set(body.tags)] : undefined }, select: SELECTION })
    return reply.send({ ...maj, url: `/api/bibliotheque/${maj.id}/contenu`, modifiable: true })
  })

  // POST /api/bibliotheque/:id/favori — ajoute / retire des favoris
  fastify.post('/:id/favori', { preHandler }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const actor = request.user
    if (!(await prisma.document.findFirst({ where: { AND: [{ id }, visibles(actor)] }, select: { id: true } }))) throw new NotFoundError('Document', id)
    const cle = { userId_documentId: { userId: actor.id, documentId: id } }
    if (await prisma.documentFavori.findUnique({ where: cle })) {
      await prisma.documentFavori.delete({ where: cle })
      return reply.send({ favori: false })
    }
    await prisma.documentFavori.create({ data: { userId: actor.id, documentId: id } })
    return reply.send({ favori: true })
  })

  // DELETE /api/bibliotheque/:id
  fastify.delete('/:id', { preHandler }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const actor = request.user
    const doc = await prisma.document.findFirst({ where: { AND: [{ id }, visibles(actor)] }, select: { uploadePar: true, nom: true, dossierId: true, categorie: true } })
    if (!doc) throw new NotFoundError('Document', id)
    if (doc.categorie === 'compte_rendu' ? !actor.superviseur : !(actor.superviseur || doc.uploadePar === actor.id)) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Seul l\'auteur du document (ou la Direction) peut le supprimer.' })
    }
    await prisma.document.delete({ where: { id } })
    if (doc.dossierId) await logAudit(doc.dossierId, actor.id, 'SUPPRESSION_DOCUMENT', `"${doc.nom}" supprimé depuis la bibliothèque`)
    else await logActivity(actor.id, 'DOCUMENT_SUPPRIME', 'document', id, doc.nom)
    return reply.code(204).send()
  })
}

export default bibliothequeRoutes
