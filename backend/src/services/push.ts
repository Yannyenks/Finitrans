/**
 * Notifications Web Push (notifications natives du système, même plateforme fermée).
 *
 * - Clés VAPID : variables d'environnement VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY si présentes,
 *   sinon générées une fois et conservées en base (paramètre « vapid »).
 * - Chaque notification enregistrée en base déclenche un envoi Push aux navigateurs abonnés
 *   de son destinataire (crochet Prisma installé au démarrage).
 * - Priorité calculée : critique (alerte, retard, blocage…), haute (action à mener, message), normale.
 */
import webpush from 'web-push'
import type { PrismaClient, Prisma } from '@prisma/client'
import { prisma } from '../config/prisma'
import { auteurCourant } from './evenements'

let vapid: { publicKey: string; privateKey: string } | null = null

export async function clesVapid() {
  if (vapid) return vapid
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    vapid = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY }
  } else {
    const row = await prisma.parametre.findUnique({ where: { cle: 'vapid' } })
    const v = row?.valeur as { publicKey?: string; privateKey?: string } | null
    if (v?.publicKey && v.privateKey) vapid = { publicKey: v.publicKey, privateKey: v.privateKey }
    else {
      const k = webpush.generateVAPIDKeys()
      await prisma.parametre.upsert({
        where: { cle: 'vapid' }, update: {},
        create: { cle: 'vapid', valeur: { publicKey: k.publicKey, privateKey: k.privateKey }, description: 'Clés VAPID des notifications Push (ne pas modifier)' },
      })
      // En cas de création concurrente, la valeur en base fait foi
      const final = (await prisma.parametre.findUnique({ where: { cle: 'vapid' } }))?.valeur as { publicKey: string; privateKey: string }
      vapid = final
    }
  }
  webpush.setVapidDetails('mailto:contact@finitrans.cm', vapid.publicKey, vapid.privateKey)
  return vapid
}

export type Priorite = 'critique' | 'haute' | 'normale'

/** Priorité d'une notification d'après son type et son intitulé. */
export function prioriteDe(n: { type?: string; titre?: string; priorite?: string | null }): Priorite {
  if (n.priorite === 'critique' || n.priorite === 'haute' || n.priorite === 'normale') return n.priorite
  if (n.type === 'alerte' || /retard|échec|echec|blocage|bloqu|imprévu|critique|⚠️|🔴/i.test(n.titre ?? '')) return 'critique'
  if (n.type === 'action_requise' || n.type === 'message') return 'haute'
  return 'normale'
}

type NotifPush = { id?: string; userId: string; titre: string; message: string; actionUrl?: string | null; dossierId?: string | null; priorite: string; relance?: number }

/** Envoie les notifications Push (attente bornée : la réponse HTTP n'est pas retardée au-delà de ~3,5 s). */
export async function envoyerPush(notifs: NotifPush[]) {
  if (notifs.length === 0) return
  const userIds = [...new Set(notifs.map(n => n.userId))]
  const abonnements = await prisma.pushAbonnement.findMany({ where: { userId: { in: userIds } } })
  if (abonnements.length === 0) return
  await clesVapid()
  const envois = notifs.flatMap(n => abonnements.filter(a => a.userId === n.userId).map(async a => {
    const url = n.actionUrl || (n.dossierId ? `/dossiers/${n.dossierId}` : '/notifications')
    const payload = JSON.stringify({
      id: n.id, titre: n.titre, message: n.message, url, priorite: n.priorite, relance: n.relance ?? 0,
      tag: n.id ? `ft-${n.id}` : undefined,
    })
    try {
      await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, payload, {
        TTL: 24 * 3600, urgency: n.priorite === 'critique' ? 'high' : n.priorite === 'haute' ? 'high' : 'normal',
      })
      await prisma.pushAbonnement.update({ where: { id: a.id }, data: { dernierEnvoi: new Date() } }).catch(() => null)
    } catch (err: any) {
      // Abonnement expiré ou révoqué par le navigateur : on le retire
      if (err?.statusCode === 404 || err?.statusCode === 410) await prisma.pushAbonnement.delete({ where: { id: a.id } }).catch(() => null)
    }
  }))
  await Promise.race([Promise.allSettled(envois), new Promise(r => setTimeout(r, 3500))])
}

/**
 * Crochet Prisma : toute notification créée reçoit sa priorité et l'auteur de l'action,
 * puis part en Push vers les navigateurs abonnés du destinataire.
 */
export function installerPushNotifications(client: PrismaClient) {
  client.$use(async (params, next) => {
    if (params.model !== 'Notification' || (params.action !== 'create' && params.action !== 'createMany')) return next(params)
    const completer = (d: Prisma.NotificationUncheckedCreateInput) => ({
      ...d, priorite: prioriteDe(d), origineNom: d.origineNom ?? auteurCourant() ?? null,
    })
    if (params.action === 'create') {
      params.args.data = completer(params.args.data)
      const cree = await next(params)
      await envoyerPush([cree]).catch(() => null)
      return cree
    }
    const donnees = (Array.isArray(params.args.data) ? params.args.data : [params.args.data]).map(completer)
    // createManyAndReturn : les identifiants servent d'étiquette (pas de doublon avec l'affichage dans l'application)
    const crees = await client.notification.createManyAndReturn({ data: donnees, skipDuplicates: params.args.skipDuplicates })
    await envoyerPush(crees).catch(() => null)
    return { count: crees.length }
  })
}
