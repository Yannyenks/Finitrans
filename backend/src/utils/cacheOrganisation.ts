import { organisationDuContexte } from '../config/contexte'

/**
 * Cache mémoire court, cloisonné par organisation : la configuration d'une entreprise
 * n'est jamais servie à une autre. Hors contexte (scripts), une entrée commune « _ » est utilisée.
 */
export function cacheParOrganisation<T>(ttlMs: number) {
  const entrees = new Map<string, { at: number; value: T }>()
  return {
    async obtenir(charger: () => Promise<T>): Promise<T> {
      const cle = organisationDuContexte() ?? '_'
      const e = entrees.get(cle)
      if (e && Date.now() - e.at < ttlMs) return e.value
      const value = await charger()
      entrees.set(cle, { at: Date.now(), value })
      return value
    },
    /** Invalide l'organisation courante (après une modification de sa configuration). */
    invalider() {
      entrees.delete(organisationDuContexte() ?? '_')
    },
    /** Vide tout (tests, scripts). */
    vider() {
      entrees.clear()
    },
  }
}
