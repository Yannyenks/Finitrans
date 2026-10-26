/**
 * Sauvegardes de la base : export complet (toutes les tables, JSON compressé gzip) conservé en base,
 * déclenché chaque semaine par le cron Vercel et à la demande par la Direction.
 * Les 8 dernières sauvegardes réussies sont gardées (2 mois). Tout échec est signalé à la Direction.
 */
import { gzipSync, gunzipSync } from 'zlib'
import { prisma } from '../config/prisma'
import { notifierDirection } from './workflow'

/** Tables non sauvegardées : sessions, morceaux de téléversement temporaires, sauvegardes elles-mêmes. */
const EXCLUES = new Set(['_prisma_migrations', 'refresh_tokens', 'televersements_morceaux', 'sauvegardes'])
export const A_CONSERVER = 8

async function tablesASauvegarder(): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ t: string }[]>(`select tablename as t from pg_tables where schemaname = 'public' order by tablename`)
  return rows.map(r => r.t).filter(t => !EXCLUES.has(t))
}

export async function creerSauvegarde(declencheur: 'hebdomadaire' | 'manuelle', auteur: string) {
  const debut = Date.now()
  try {
    const tables = await tablesASauvegarder()
    const donnees: Record<string, unknown[]> = {}
    const lignes: Record<string, number> = {}
    for (const t of tables) {
      // JSON produit par PostgreSQL (les fichiers binaires sont exportés en hexadécimal)
      const r = await prisma.$queryRawUnsafe<{ j: unknown[] | null }[]>(`select coalesce(json_agg(x), '[]'::json) as j from "${t}" x`)
      donnees[t] = r[0]?.j ?? []
      lignes[t] = donnees[t].length
    }
    const brut = Buffer.from(JSON.stringify({ format: 'finitrans-sauvegarde-v1', creeLe: new Date().toISOString(), tables: donnees }))
    const contenu = gzipSync(brut, { level: 9 })
    const s = await prisma.sauvegarde.create({
      data: { declencheur, statut: 'ok', auteur, tailleOctets: contenu.length, lignes, contenu, dureeMs: Date.now() - debut },
      select: { id: true, createdAt: true, tailleOctets: true, lignes: true },
    })
    // Rotation : seules les dernières sauvegardes réussies sont conservées
    const anciennes = await prisma.sauvegarde.findMany({ where: { statut: 'ok' }, orderBy: { createdAt: 'desc' }, skip: A_CONSERVER, select: { id: true } })
    if (anciennes.length) await prisma.sauvegarde.deleteMany({ where: { id: { in: anciennes.map(a => a.id) } } })
    const total = Object.values(lignes).reduce((a, b) => a + b, 0)
    await notifierDirection({
      titre: `Sauvegarde ${declencheur} effectuée`,
      message: `${total.toLocaleString('fr-FR')} enregistrements sauvegardés (${Math.max(1, Math.round(contenu.length / 1024)).toLocaleString('fr-FR')} Ko).`,
      actionUrl: '/administration?onglet=sauvegardes',
    })
    return s
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await prisma.sauvegarde.create({ data: { declencheur, statut: 'echec', auteur, message: message.slice(0, 2000), dureeMs: Date.now() - debut } }).catch(() => null)
    // Problème signalé : alerte critique + notification de la Direction
    await prisma.alerte.create({ data: { type: 'systeme', severity: 'critical', message: `🔴 Échec de la sauvegarde ${declencheur} : ${message.slice(0, 300)}` } }).catch(() => null)
    await notifierDirection({
      titre: `⚠️ Échec de la sauvegarde ${declencheur}`,
      message: `La sauvegarde n'a pas pu être réalisée : ${message.slice(0, 300)}. Relancez-la depuis Administration → Sauvegardes.`,
      actionUrl: '/administration?onglet=sauvegardes',
    }).catch(() => null)
    throw err
  }
}

/** Contenu décompressé d'une sauvegarde (restauration). */
export function lireSauvegarde(contenu: Buffer): { format: string; creeLe: string; tables: Record<string, unknown[]> } {
  return JSON.parse(gunzipSync(contenu).toString('utf8'))
}
