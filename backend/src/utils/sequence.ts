import { Prisma } from '@prisma/client'

/**
 * Calcule le prochain numéro d'une séquence `${prefix}${n}` à partir du plus grand
 * numéro existant (et non d'un simple count, qui produit des doublons après suppression).
 */
export async function nextSequence(
  prefix: string,
  findLast: (prefix: string) => Promise<string | null | undefined>,
  pad = 4,
): Promise<string> {
  const last = await findLast(prefix)
  const n = last ? parseInt(last.slice(prefix.length), 10) || 0 : 0
  return `${prefix}${String(n + 1).padStart(pad, '0')}`
}

/** Réessaie une création si une contrainte d'unicité est violée (création concurrente). */
export async function withUniqueRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn()
    } catch (err) {
      const isUnique = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
      if (!isUnique || i >= attempts - 1) throw err
    }
  }
}
