/**
 * Relances des notifications non traitées et alertes de retard.
 *
 * - Retard : toute tâche dont l'échéance est dépassée déclenche (une seule fois) une alerte critique
 *   pour son titulaire et le responsable du dossier.
 * - Relances progressives : une notification critique ou haute, ni lue ni prise en compte, est relancée
 *   en Push après N minutes, puis 2N, 4N… jusqu'au nombre maximal (paramètre « relances_notifications »).
 *
 * Exécution : à chaque consultation des notifications (au plus une fois toutes les 5 minutes pour toute
 * la plateforme, verrou en base) et par le cron quotidien de secours.
 */
import { prisma } from '../config/prisma'
import { envoyerPush } from './push'
import { SOUS_ETAPES_CONFIG, STATUS_LABELS } from './workflow'

export const RELANCES_DEFAUT = { actif: true, critiqueMinutes: 30, hauteMinutes: 120, maxRelances: 5 }
export type ConfigRelances = typeof RELANCES_DEFAUT

export async function configRelances(): Promise<ConfigRelances> {
  const row = await prisma.parametre.findUnique({ where: { cle: 'relances_notifications' } })
  return { ...RELANCES_DEFAUT, ...((row?.valeur ?? {}) as Partial<ConfigRelances>) }
}

const libelleTache = (etape: string, cle: string) =>
  (SOUS_ETAPES_CONFIG as Record<string, { cle: string; label: string }[]>)[etape]?.find(s => s.cle === cle)?.label ?? cle

function duree(ms: number) {
  const h = Math.floor(ms / 3_600_000), m = Math.round((ms % 3_600_000) / 60_000)
  return h >= 24 ? `${Math.floor(h / 24)} j ${h % 24} h` : h ? `${h} h ${m} min` : `${m} min`
}

/** Alertes de retard (une par tâche en retard) */
export async function signalerRetards(maintenant = new Date()) {
  const taches = await prisma.sousEtapeDossier.findMany({
    where: {
      statut: { not: 'valide' }, deadline: { lt: maintenant }, retardSignaleLe: null, responsableId: { not: null },
      dossier: { finaliseLe: null, status: { not: 'cloture' } },
    },
    include: { dossier: { select: { id: true, numero: true, client: true, status: true, responsableId: true } } },
    take: 200,
  })
  let n = 0
  for (const t of taches) {
    if (t.dossier.status !== t.etape) continue // tâche d'une étape qui n'est plus en cours
    const marque = await prisma.sousEtapeDossier.updateMany({ where: { id: t.id, retardSignaleLe: null }, data: { retardSignaleLe: maintenant } })
    if (marque.count === 0) continue // déjà signalé par une exécution concurrente
    const destinataires = [...new Set([t.responsableId!, t.dossier.responsableId])]
    await prisma.notification.createMany({
      data: destinataires.map(userId => ({
        userId, type: 'alerte' as const, priorite: 'critique',
        titre: `⏱ Retard : ${libelleTache(t.etape, t.cle)}`,
        message: `${t.dossier.numero} (${t.dossier.client}) — ${STATUS_LABELS[t.etape as keyof typeof STATUS_LABELS] ?? t.etape} : échéance dépassée de ${duree(maintenant.getTime() - t.deadline!.getTime())}.`,
        dossierId: t.dossier.id, actionUrl: `/dossiers/${t.dossier.id}`, origineNom: 'Contrôle des délais',
      })),
    })
    n++
  }
  return n
}

/** Relances progressives des notifications prioritaires non traitées */
export async function relancerNotifications(maintenant = new Date()) {
  const cfg = await configRelances()
  if (!cfg.actif) return 0
  const candidates = await prisma.notification.findMany({
    where: { priorite: { in: ['critique', 'haute'] }, lu: false, acquitteLe: null, relances: { lt: cfg.maxRelances } },
    orderBy: { createdAt: 'asc' }, take: 300,
  })
  const aRelancer = candidates.filter(n => {
    const base = (n.priorite === 'critique' ? cfg.critiqueMinutes : cfg.hauteMinutes) * 60_000
    const depuis = (n.derniereRelance ?? n.createdAt).getTime()
    return maintenant.getTime() - depuis >= base * 2 ** n.relances
  })
  for (const n of aRelancer) {
    const maj = await prisma.notification.updateMany({
      where: { id: n.id, relances: n.relances }, data: { relances: { increment: 1 }, derniereRelance: maintenant },
    })
    if (maj.count === 0) continue
    await envoyerPush([{ ...n, titre: `🔁 Rappel ${n.relances + 1} — ${n.titre}`, relance: n.relances + 1 }]).catch(() => null)
  }
  return aRelancer.length
}

/** Verrou global : une seule exécution toutes les 5 minutes pour toute la plateforme. */
export async function lancerRelancesSiNecessaire(force = false) {
  const maintenant = new Date()
  if (!force) {
    await prisma.parametre.upsert({
      where: { cle: 'relances_passage' }, update: {},
      create: { cle: 'relances_passage', valeur: { le: new Date(0).toISOString() }, description: 'Dernier passage des relances' },
    })
    const pris = await prisma.$executeRawUnsafe(
      `UPDATE parametres SET valeur = jsonb_build_object('le', $1::text) WHERE cle = 'relances_passage' AND (valeur->>'le')::timestamptz < $2::timestamptz`,
      maintenant.toISOString(), new Date(maintenant.getTime() - 5 * 60_000).toISOString(),
    )
    if (pris === 0) return null
  }
  const retards = await signalerRetards(maintenant)
  const relances = await relancerNotifications(maintenant)
  return { retards, relances }
}
