/**
 * Notifications « pour tout » : chaque action réussie sur la plateforme est notifiée.
 * - Action sur un dossier : toutes les personnes qui voient le dossier — intervenants (responsable,
 *   titulaires de ses tâches), Direction (DG, Exploitation) et profils qui suivent tous les dossiers
 *   (administration, comptabilité, gestion des sorties).
 * - Action hors dossier : Direction, et la personne directement concernée (rôle, congé, compte…).
 * L'auteur n'est jamais notifié ; au cours d'une même action, une personne déjà prévenue (notification
 * ciblée : tâche attribuée, passation…) ne reçoit pas de notification générale en plus.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { prisma } from '../config/prisma'
import { PROFILS_TOUS_DOSSIERS } from '../config/roles'

/** Personnes déjà notifiées pendant la requête en cours. */
const notifiesDansLaRequete = new AsyncLocalStorage<Set<string>>()

/** Crochet onRequest : ouvre le contexte de la requête (modèle de @fastify/request-context). */
export function ouvrirContexteNotifications(_request: FastifyRequest, _reply: FastifyReply, done: () => void) {
  notifiesDansLaRequete.run(new Set(), done)
}

/** Enregistre les destinataires d'une notification ciblée envoyée pendant la requête. */
export function marquerNotifies(ids: string[]) {
  const s = notifiesDansLaRequete.getStore()
  if (s) ids.forEach(id => s.add(id))
}

type Evenement = { libelle: string; cible?: 'params.userId' | 'params.id' | 'payload.userId' }

/** Libellé de chaque action (méthode + route). Une route absente de la liste n'est pas notifiée. */
export const EVENEMENTS: Record<string, Evenement> = {
  // Dossiers et workflow
  'POST /api/dossiers': { libelle: 'Dossier créé' },
  'PATCH /api/dossiers/:id': { libelle: 'Dossier modifié' },
  'DELETE /api/dossiers/:id': { libelle: 'Dossier supprimé' },
  'PATCH /api/dossiers/:id/status': { libelle: 'Changement d\'étape' },
  'PUT /api/dossiers/:id/sous-etapes/:etape/:cle': { libelle: 'Tâche mise à jour' },
  'POST /api/dossiers/:id/sous-etapes/:etape/:cle/prendre': { libelle: 'Tâche prise en charge' },
  'POST /api/dossiers/:id/sous-etapes/:etape/:cle/preuve': { libelle: 'Preuve jointe' },
  'PUT /api/dossiers/:id/affectations/:etape': { libelle: 'Étape confiée' },
  'DELETE /api/dossiers/:id/affectations/:etape': { libelle: 'Désignation d\'étape retirée' },
  'POST /api/dossiers/:id/upload': { libelle: 'Document ajouté' },
  'DELETE /api/dossiers/:id/documents/:docId': { libelle: 'Document supprimé' },
  'POST /api/dossiers/:id/commentaires': { libelle: 'Nouveau commentaire' },
  'POST /api/dossiers/:id/factures': { libelle: 'Facture créée' },
  'POST /api/dossiers/:id/virements': { libelle: 'Virement enregistré' },
  'POST /api/dossiers/:id/bons-livraison': { libelle: 'Bon de livraison enregistré' },
  'POST /api/dossiers/:id/gate-passes': { libelle: 'Gate pass émis' },
  'POST /api/dossiers/:id/penalites': { libelle: 'Pénalité enregistrée' },
  'POST /api/supervision/reattribuer': { libelle: 'Tâches transférées' },
  // Codage
  'POST /api/codage': { libelle: 'Position tarifaire ajoutée' },
  'PATCH /api/codage/:id': { libelle: 'Position tarifaire modifiée' },
  'DELETE /api/codage/:id': { libelle: 'Position tarifaire supprimée' },
  'POST /api/codage/:id/soumettre': { libelle: 'Position tarifaire soumise' },
  'POST /api/codage/:id/valider': { libelle: 'Position tarifaire validée' },
  'POST /api/codage/:id/rejeter': { libelle: 'Position tarifaire rejetée' },
  // SGS, Kribi, sorties, logistique
  'POST /api/sgs': { libelle: 'Soumission SGS enregistrée' },
  'PATCH /api/sgs/:id': { libelle: 'Soumission SGS mise à jour' },
  'POST /api/sgs/:id/escalader': { libelle: 'Soumission SGS escaladée' },
  'POST /api/kribi/bons': { libelle: 'Bon Kribi enregistré' },
  'PATCH /api/kribi/bons/:id': { libelle: 'Bon Kribi mis à jour' },
  'POST /api/kribi/comptes-rendus': { libelle: 'Compte rendu Kribi' },
  'POST /api/kribi/gate-passes': { libelle: 'Gate pass Kribi émis' },
  'POST /api/detentions': { libelle: 'Détention enregistrée' },
  'PATCH /api/detentions/:id': { libelle: 'Détention mise à jour' },
  'POST /api/interchanges': { libelle: 'Interchange enregistré' },
  'PATCH /api/interchanges/:id': { libelle: 'Interchange mis à jour' },
  'POST /api/vehicules': { libelle: 'Véhicule enregistré' },
  'PATCH /api/vehicules/:id': { libelle: 'Véhicule mis à jour' },
  'POST /api/logistique/transports': { libelle: 'Transport planifié' },
  'PATCH /api/logistique/transports/:id': { libelle: 'Transport mis à jour' },
  'POST /api/logistique/chauffeurs': { libelle: 'Chauffeur ajouté' },
  'PATCH /api/logistique/chauffeurs/:id': { libelle: 'Chauffeur mis à jour' },
  'POST /api/logistique/camions': { libelle: 'Camion ajouté' },
  'PATCH /api/logistique/camions/:id': { libelle: 'Camion mis à jour' },
  // DI
  'POST /api/di': { libelle: 'DI créée' },
  'PATCH /api/di/:id': { libelle: 'DI modifiée' },
  'DELETE /api/di/:id': { libelle: 'DI supprimée' },
  'PATCH /api/di/:id/alertes': { libelle: 'Seuils DI modifiés' },
  'POST /api/di/:id/mouvements': { libelle: 'Mouvement DI' },
  'POST /api/di/:id/recharge': { libelle: 'DI rechargée' },
  'POST /api/di/:id/lier-dossier': { libelle: 'DI liée à un dossier' },
  'POST /api/di/:id/cloner': { libelle: 'DI dupliquée' },
  'POST /api/di/:id/factures': { libelle: 'Justificatif DI joint' },
  // Finance et comptabilité
  'POST /api/finance/paiements-douane': { libelle: 'Paiement douane enregistré' },
  'PATCH /api/finance/paiements-douane/:id': { libelle: 'Paiement douane mis à jour' },
  'POST /api/finance/paiements-compagnie': { libelle: 'Paiement compagnie enregistré' },
  'PATCH /api/finance/paiements-compagnie/:id': { libelle: 'Paiement compagnie mis à jour' },
  'POST /api/finance/virements': { libelle: 'Virement enregistré' },
  'PATCH /api/finance/virements/:id': { libelle: 'Virement mis à jour' },
  'PATCH /api/finance/factures/:id': { libelle: 'Facture mise à jour' },
  'POST /api/compta/ecritures': { libelle: 'Écriture comptable créée' },
  'PUT /api/compta/ecritures/:id': { libelle: 'Écriture comptable modifiée' },
  'DELETE /api/compta/ecritures/:id': { libelle: 'Écriture comptable supprimée' },
  'POST /api/compta/ecritures/:id/valider': { libelle: 'Écriture comptable validée' },
  'POST /api/compta/ecritures/valider-lot': { libelle: 'Écritures validées' },
  'POST /api/compta/ecritures/:id/contrepasser': { libelle: 'Écriture contrepassée' },
  'POST /api/compta/comptes': { libelle: 'Compte comptable créé' },
  'PATCH /api/compta/comptes/:id': { libelle: 'Compte comptable modifié' },
  'POST /api/compta/exercices/:id/cloturer': { libelle: 'Exercice clôturé' },
  'POST /api/compta/exercices/:id/rouvrir': { libelle: 'Exercice rouvert' },
  'POST /api/compta/paie/generer': { libelle: 'Paie générée' },
  'POST /api/compta/comptabilisation/generer': { libelle: 'Comptabilisation générée' },
  // CRM
  'POST /api/crm/clients': { libelle: 'Client créé' },
  'PATCH /api/crm/clients/:id': { libelle: 'Fiche client modifiée' },
  'POST /api/crm/clients/:id/interactions': { libelle: 'Échange client enregistré' },
  'PATCH /api/crm/interactions/:id': { libelle: 'Relance client mise à jour' },
  'DELETE /api/crm/interactions/:id': { libelle: 'Échange client supprimé' },
  'POST /api/crm/reglements': { libelle: 'Règlement client enregistré' },
  // Documents, contacts
  'POST /api/bibliotheque': { libelle: 'Document ajouté à la bibliothèque' },
  'PATCH /api/bibliotheque/:id': { libelle: 'Document de la bibliothèque modifié' },
  'DELETE /api/bibliotheque/:id': { libelle: 'Document de la bibliothèque supprimé' },
  'POST /api/repertoire': { libelle: 'Contact ajouté au répertoire' },
  'PATCH /api/repertoire/:id': { libelle: 'Contact modifié' },
  'DELETE /api/repertoire/:id': { libelle: 'Contact supprimé' },
  // RH, comptes, rôles, paramètres
  'POST /api/rh/conges': { libelle: 'Demande de congé' },
  'PATCH /api/rh/conges/:id/decision': { libelle: 'Décision sur un congé', cible: 'payload.userId' },
  'PATCH /api/rh/conges/:id/annuler': { libelle: 'Congé annulé' },
  'PUT /api/rh/fiches/:userId': { libelle: 'Fiche RH modifiée', cible: 'params.userId' },
  'POST /api/employes': { libelle: 'Compte créé' },
  'PATCH /api/employes/:id': { libelle: 'Compte modifié', cible: 'params.id' },
  'DELETE /api/employes/:id': { libelle: 'Compte désactivé', cible: 'params.id' },
  'POST /api/employes/:id/reactiver': { libelle: 'Compte réactivé', cible: 'params.id' },
  'PATCH /api/employes/:id/reset-password': { libelle: 'Mot de passe réinitialisé', cible: 'params.id' },
  'POST /api/roles/attribuer/:userId': { libelle: 'Rôle attribué', cible: 'params.userId' },
  'PUT /api/roles/:profil': { libelle: 'Rôle modifié' },
  'POST /api/roles/:profil/reinitialiser': { libelle: 'Rôle réinitialisé' },
  'POST /api/roles/:profil/synchroniser': { libelle: 'Rôle synchronisé' },
  'PUT /api/roles/attribution': { libelle: 'Attribution des étapes modifiée' },
  'DELETE /api/roles/attribution': { libelle: 'Attribution des étapes réinitialisée' },
  'PATCH /api/parametres': { libelle: 'Paramètres modifiés' },
  'PATCH /api/parametres/:cle': { libelle: 'Paramètre modifié' },
  'PATCH /api/alertes/config/:id': { libelle: 'Seuil d\'alerte modifié' },
  'POST /api/alertes': { libelle: 'Alerte créée' },
  'PUT /api/admin/entreprise': { libelle: 'Informations de l\'entreprise modifiées' },
  'POST /api/compagnies': { libelle: 'Compagnie maritime ajoutée' },
  'PATCH /api/compagnies/:code': { libelle: 'Compagnie maritime modifiée' },
}

const objet = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? v as Record<string, unknown> : {})
const texte = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** Notifie les intervenants d'un dossier et la Direction (utilisé par l'historique et par le crochet global). */
export async function notifierDossier(dossierId: string, auteurId: string, libelle: string, details?: string | null) {
  const dossier = await prisma.dossier.findUnique({ where: { id: dossierId }, select: { numero: true, client: true, responsableId: true } })
  if (!dossier) return false
  const [titulaires, direction, auteur] = await Promise.all([
    prisma.sousEtapeDossier.findMany({ where: { dossierId, responsableId: { not: null } }, select: { responsableId: true }, distinct: ['responsableId'] }),
    prisma.user.findMany({ where: { profil: { in: ['dg', 'exploitation', ...PROFILS_TOUS_DOSSIERS] }, actif: true }, select: { id: true } }),
    prisma.user.findUnique({ where: { id: auteurId }, select: { nom: true } }),
  ])
  const candidats = [...new Set([dossier.responsableId, ...titulaires.map(t => t.responsableId!), ...direction.map(u => u.id)])]
    .filter(id => id && id !== auteurId)
  const destinataires = await filtrer(candidats)
  if (destinataires.length === 0) return true
  await prisma.notification.createMany({
    data: destinataires.map(userId => ({
      userId, type: 'dossier' as const, dossierId, actionUrl: `/dossiers/${dossierId}`,
      titre: `${dossier.numero} · ${libelle}`,
      message: `${auteur?.nom ?? 'Un utilisateur'} — ${details ?? libelle} (${dossier.client})`,
    })),
  })
  return true
}

/** Comptes actifs, sans ceux déjà notifiés pendant cette action ; les retenus sont marqués. */
async function filtrer(candidats: string[]) {
  const deja = notifiesDansLaRequete.getStore()
  const restants = candidats.filter(id => !deja?.has(id))
  if (restants.length === 0) return []
  const actifs = await prisma.user.findMany({ where: { id: { in: restants }, actif: true }, select: { id: true } })
  const ids = actifs.map(u => u.id)
  marquerNotifies(ids)
  return ids
}

async function notifierHorsDossier(auteurId: string, libelle: string, details: string | null, cible: string | null, url: string | null) {
  const [direction, auteur] = await Promise.all([
    prisma.user.findMany({ where: { profil: { in: ['dg', 'exploitation'] }, actif: true }, select: { id: true } }),
    prisma.user.findUnique({ where: { id: auteurId }, select: { nom: true } }),
  ])
  const candidats = [...new Set([...direction.map(u => u.id), ...(cible ? [cible] : [])])].filter(id => id !== auteurId)
  const destinataires = await filtrer(candidats)
  if (destinataires.length === 0) return
  await prisma.notification.createMany({
    data: destinataires.map(userId => ({
      userId, type: 'dossier' as const, actionUrl: url,
      titre: libelle,
      message: `${auteur?.nom ?? 'Un utilisateur'} — ${details ? `${libelle} : ${details}` : libelle}`,
    })),
  })
}

/** Page de l'application à ouvrir depuis la notification. */
function pageDe(route: string, payload: Record<string, unknown>, params: Record<string, unknown>): string | null {
  if (route.startsWith('/api/crm/clients')) { const id = params.id ?? payload.id; return id ? `/crm/${id}` : '/crm' }
  if (route.startsWith('/api/crm')) return payload.clientId ? `/crm/${payload.clientId}` : '/crm'
  const pages: [string, string][] = [
    ['/api/codage', '/codage'], ['/api/di', '/di'], ['/api/finance', '/finance'], ['/api/compta', '/comptabilite-avancee'],
    ['/api/bibliotheque', '/bibliotheque'], ['/api/repertoire', '/repertoire'], ['/api/kribi', '/kribi'],
    ['/api/logistique', '/logistique'], ['/api/vehicules', '/logistique'], ['/api/detentions', '/sorties'],
    ['/api/interchanges', '/sorties'], ['/api/sgs', '/dossiers'], ['/api/rh', '/employes'], ['/api/employes', '/employes'],
    ['/api/roles', '/employes'], ['/api/parametres', '/parametres'], ['/api/alertes', '/alertes'], ['/api/admin', '/administration'],
    ['/api/supervision', '/supervision'], ['/api/compagnies', '/parametres'],
  ]
  return pages.find(([p]) => route.startsWith(p))?.[1] ?? null
}

/**
 * Crochet Fastify (onSend) : après chaque action réussie, notifie les personnes concernées.
 * Ne bloque jamais la réponse en cas d'erreur.
 */
export async function crochetNotifications(request: FastifyRequest, reply: FastifyReply, payload: unknown) {
  try {
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method) || reply.statusCode >= 400) return payload
    const auteurId = (request.user as { id?: string } | undefined)?.id
    const route = request.routeOptions?.url
    if (!auteurId || !route) return payload
    const ev = EVENEMENTS[`${request.method} ${route}`]
    if (!ev) return payload

    let corps: Record<string, unknown> = {}
    if (typeof payload === 'string' && payload.startsWith('{')) { try { corps = JSON.parse(payload) } catch { /* réponse non JSON */ } }
    const params = objet(request.params)
    const body = objet(request.body)
    const details = texte(corps.numero) ?? texte(corps.nom) ?? texte(corps.reference) ?? texte(corps.libelle) ?? texte(body.numero) ?? texte(body.nom) ?? null

    // Rattachement au dossier : route /api/dossiers/:id, ou dossierId de la requête / de la réponse
    let dossierId = texte(route.startsWith('/api/dossiers/:id') ? params.id : null) ?? texte(corps.dossierId) ?? texte(body.dossierId)
    if (!dossierId && request.method === 'POST' && route === '/api/dossiers') dossierId = texte(corps.id)
    if (!dossierId && route.startsWith('/api/codage/:id')) {
      dossierId = (await prisma.etatCodage.findUnique({ where: { id: String(params.id) }, select: { dossierId: true } }))?.dossierId ?? null
    }
    const suppressionDossier = request.method === 'DELETE' && route === '/api/dossiers/:id'
    if (dossierId && !suppressionDossier) {
      if (await notifierDossier(dossierId, auteurId, ev.libelle, details)) return payload
    }

    const cible = ev.cible === 'params.userId' ? texte(params.userId)
      : ev.cible === 'params.id' ? texte(params.id)
      : ev.cible === 'payload.userId' ? texte(corps.userId) : null
    await notifierHorsDossier(auteurId, ev.libelle, details, cible, pageDe(route, corps, params))
  } catch {
    /* une notification ne doit jamais faire échouer l'action */
  }
  return payload
}
