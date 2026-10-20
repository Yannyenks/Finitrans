/**
 * Référentiel des compagnies maritimes : liste ouverte, gérée par la Direction
 * (paramètre « compagnies »). Le code est la valeur enregistrée sur les dossiers.
 */
import { z } from 'zod'
import { prisma } from '../config/prisma'

export interface Compagnie { code: string; nom: string; actif: boolean }

/** Compagnies historiques de la plateforme (codes déjà présents sur les dossiers). */
export const COMPAGNIES_DEFAUT: Compagnie[] = [
  { code: 'MSC', nom: 'MSC', actif: true },
  { code: 'COSCO', nom: 'COSCO', actif: true },
  { code: 'MAERSK', nom: 'MAERSK', actif: true },
  { code: 'CMA_CGM', nom: 'CMA CGM', actif: true },
]

/** Code d'une compagnie : majuscules sans accents, séparateur « _ » (ex. « Hapag-Lloyd » → HAPAG_LLOYD). */
export function codeCompagnie(nom: string): string {
  return nom.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40)
}

/** Valeur de compagnie acceptée par l'API (le contrôle d'existence se fait avec `compagnieConnue`). */
export const zCompagnie = z.string().trim().min(2).max(80).transform(v => codeCompagnie(v) || v)

let cache: { at: number; liste: Compagnie[] } | null = null

export async function loadCompagnies(): Promise<Compagnie[]> {
  if (cache && Date.now() - cache.at < 30_000) return cache.liste
  const row = await prisma.parametre.findUnique({ where: { cle: 'compagnies' } })
  const enregistrees = Array.isArray(row?.valeur) ? (row!.valeur as unknown as Compagnie[]) : null
  const liste = enregistrees?.length ? enregistrees : COMPAGNIES_DEFAUT
  cache = { at: Date.now(), liste }
  return liste
}

export function invalidateCompagniesCache() { cache = null }

export async function compagnieConnue(code: string, actifSeulement = true): Promise<boolean> {
  return (await loadCompagnies()).some(c => c.code === code && (!actifSeulement || c.actif))
}

export async function nomCompagnie(code: string): Promise<string> {
  return (await loadCompagnies()).find(c => c.code === code)?.nom ?? code.replace(/_/g, ' ')
}
