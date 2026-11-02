/**
 * Contexte de la requête en cours : organisation de l'utilisateur authentifié.
 *
 * Toute requête HTTP ouvre un contexte (crochet onRequest). `authenticate` y inscrit l'organisation ;
 * l'extension Prisma (config/prisma.ts) filtre et remplit alors automatiquement `organisationId`.
 *
 * Hors requête HTTP (scripts, seed, cron, tests qui appellent Prisma directement), aucun contexte :
 * les requêtes portent sur toute la base. Les traitements de plateforme qui doivent explicitement
 * ignorer l'isolation pendant une requête passent par `sansIsolation()`.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import type { FastifyReply, FastifyRequest } from 'fastify'

interface Contexte {
  organisationId?: string
  /** Traitement de plateforme explicite : pas de filtre d'organisation */
  systeme?: boolean
}

const stockage = new AsyncLocalStorage<Contexte>()

/** Crochet onRequest : ouvre un contexte vide pour la requête. */
export function ouvrirContexte(_request: FastifyRequest, _reply: FastifyReply, done: () => void) {
  stockage.run({}, done)
}

/** Inscrit l'organisation de la requête (après authentification ou résolution d'un lien public). */
export function definirOrganisation(organisationId: string) {
  const ctx = stockage.getStore()
  if (ctx) ctx.organisationId = organisationId
}

/** Organisation à appliquer aux requêtes Prisma ; undefined = pas de filtre. */
export function organisationDuContexte(): string | undefined {
  const ctx = stockage.getStore()
  if (!ctx || ctx.systeme) return undefined
  return ctx.organisationId
}

/** Organisation courante, obligatoire (lève si la requête n'est pas rattachée à une organisation). */
export function organisationCourante(): string {
  const id = organisationDuContexte()
  if (!id) throw new Error('Aucune organisation dans le contexte de la requête')
  return id
}

/** Exécute un traitement de plateforme sans isolation (réservé aux routes de la plateforme). */
export function sansIsolation<T>(fn: () => Promise<T>): Promise<T> {
  return stockage.run({ systeme: true }, fn)
}

/** Exécute un traitement dans le périmètre d'une organisation donnée (inscription, scripts). */
export function dansOrganisation<T>(organisationId: string, fn: () => Promise<T>): Promise<T> {
  return stockage.run({ organisationId }, fn)
}
