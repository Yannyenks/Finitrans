/**
 * Fichiers volumineux : Vercel limite chaque requête ET chaque réponse à 4,5 Mo.
 * - Envoi : le navigateur découpe le fichier en morceaux (POST /api/televersements/:id/morceaux/:index),
 *   puis appelle la route métier avec le champ `televersementId` à la place du fichier.
 * - Lecture : les routes de contenu acceptent l'en-tête Range (réponse 206 par plages).
 */
import type { FastifyReply, FastifyRequest } from 'fastify'
import { prisma } from '../config/prisma'
import { env } from '../config/env'
import { AppError } from '../utils/errors'

type Champs = Record<string, { value?: string } | undefined>

export interface FichierRecu {
  filename: string
  mimetype: string
  fields:   Champs
  toBuffer: () => Promise<Buffer>
}

/**
 * Lit un envoi multipart : fichier joint directement, ou fichier envoyé en morceaux
 * (champ `televersementId`). Même forme que `request.file()` de @fastify/multipart.
 */
export async function recevoirFichier(request: FastifyRequest): Promise<FichierRecu | undefined> {
  const fields: Champs = {}
  let fichier: { filename: string; mimetype: string; contenu: Buffer } | null = null

  for await (const part of request.parts()) {
    if (part.type === 'file') {
      const contenu = await part.toBuffer()
      if (!fichier) fichier = { filename: part.filename, mimetype: part.mimetype, contenu }
    } else {
      fields[part.fieldname] = { value: String(part.value ?? '') }
    }
  }

  if (fichier) {
    const f = fichier
    return { filename: f.filename, mimetype: f.mimetype, fields, toBuffer: async () => f.contenu }
  }

  const televersementId = fields.televersementId?.value
  if (!televersementId) return undefined
  const assemble = await assembler(televersementId, request.user.id)
  return { filename: assemble.nom, mimetype: assemble.type, fields, toBuffer: async () => assemble.contenu }
}

async function assembler(televersementId: string, userId: string) {
  const morceaux = await prisma.televersementMorceau.findMany({
    where: { televersementId, userId },
    orderBy: { index: 'asc' },
  })
  if (morceaux.length === 0) throw new AppError(400, 'TELEVERSEMENT_INTROUVABLE', 'Fichier introuvable — renvoyez-le.')
  const total = morceaux[0].total
  if (morceaux.length !== total || morceaux.some((m, i) => m.index !== i)) {
    throw new AppError(400, 'TELEVERSEMENT_INCOMPLET', 'Envoi du fichier incomplet — renvoyez-le.')
  }
  const contenu = Buffer.concat(morceaux.map(m => Buffer.from(m.contenu)))
  await prisma.televersementMorceau.deleteMany({
    where: { OR: [{ televersementId }, { createdAt: { lt: new Date(Date.now() - 24 * 3600_000) } }] },
  })
  if (contenu.length > env.MAX_FILE_SIZE_MB * 1_000_000) {
    throw new AppError(413, 'FILE_TOO_LARGE', `Fichier trop volumineux (max ${env.MAX_FILE_SIZE_MB} Mo)`)
  }
  return { nom: morceaux[0].nom, type: morceaux[0].type, contenu }
}

/** Enregistre un morceau de fichier (≤ 3 Mo côté navigateur). */
export async function enregistrerMorceau(
  request: FastifyRequest,
  params: { id: string; index: number; total: number; nom: string; type: string },
) {
  const data = await request.file()
  if (!data) throw new AppError(400, 'NO_FILE', 'Aucun fichier fourni')
  const contenu = await data.toBuffer()
  if (params.total * 3_200_000 > env.MAX_FILE_SIZE_MB * 1_000_000 + 3_200_000) {
    throw new AppError(413, 'FILE_TOO_LARGE', `Fichier trop volumineux (max ${env.MAX_FILE_SIZE_MB} Mo)`)
  }
  await prisma.televersementMorceau.upsert({
    where:  { televersementId_index: { televersementId: params.id, index: params.index } },
    create: { televersementId: params.id, index: params.index, total: params.total, userId: request.user.id, nom: params.nom, type: params.type, contenu },
    update: { contenu, total: params.total },
  })
}

/** Envoie un contenu binaire en respectant l'en-tête Range (lecture par plages des gros fichiers). */
export function envoyerContenu(
  request: FastifyRequest,
  reply: FastifyReply,
  contenu: Buffer | Uint8Array,
  entetes: Record<string, string>,
) {
  const buf = Buffer.isBuffer(contenu) ? contenu : Buffer.from(contenu)
  for (const [k, v] of Object.entries(entetes)) reply.header(k, v)
  reply.header('Accept-Ranges', 'bytes')

  const plage = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? '')
  if (plage && (plage[1] || plage[2])) {
    let debut = plage[1] ? parseInt(plage[1], 10) : Math.max(0, buf.length - parseInt(plage[2], 10))
    let fin   = plage[1] && plage[2] ? parseInt(plage[2], 10) : buf.length - 1
    fin = Math.min(fin, buf.length - 1)
    if (debut > fin || debut >= buf.length) {
      return reply.code(416).header('Content-Range', `bytes */${buf.length}`).send()
    }
    debut = Math.max(0, debut)
    const morceau = buf.subarray(debut, fin + 1)
    return reply.code(206)
      .header('Content-Range', `bytes ${debut}-${fin}/${buf.length}`)
      .header('Content-Length', morceau.length)
      .send(morceau)
  }
  return reply.header('Content-Length', buf.length).send(buf)
}
