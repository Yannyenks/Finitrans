/**
 * Modules métier : codage, DI, finance, Kribi, SGS, sorties, logistique, messagerie,
 * alertes, reporting, exports — et matrice des droits par type de compte.
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { api, closeApp, expectStatus, upload, userIds, unique, USERS, type UserKey } from './helpers'

let ids: Record<UserKey, string>
let dossierId = ''
let dossierKribiId = ''

before(async () => {
  ids = await userIds()
  const r = await api('yasmine', 'POST', '/api/dossiers', {
    client: 'CLIENT MODULES', compagnie: 'COSCO', conteneur: 'COSU1111111', marchandise: 'Matériel',
    site: 'Douala', dateArrivee: new Date().toISOString(),
  })
  expectStatus(r, 201)
  dossierId = r.body.id
  const k = await api('yasmine', 'POST', '/api/dossiers', {
    client: 'CLIENT KRIBI MODULES', compagnie: 'MSC', conteneur: 'MSCU2222222', marchandise: 'Matériel',
    site: 'Kribi', dateArrivee: new Date().toISOString(),
  })
  dossierKribiId = k.body.id
})
after(closeApp)

describe('Codage & validation (Mme Odette)', () => {
  it('brouillon → soumission → validation ; le rejet exige un motif', async () => {
    const c = await api('odette', 'POST', '/api/codage', {
      dossierId, codeDouanier: '8471.30', designation: 'Ordinateurs portables', tauxDroits: 10, tauxTVA: 19.25, valeurCIF: 1_000_000,
    })
    expectStatus(c, 201)
    assert.equal(Number(c.body.montantDroits), 100_000)
    assert.equal(Number(c.body.montantTVA), 211_750)
    expectStatus(await api('odette', 'POST', `/api/codage/${c.body.id}/soumettre`), 200)
    expectStatus(await api('yaya', 'POST', `/api/codage/${c.body.id}/valider`, {}), 403, 'Yaya ne valide pas le codage')
    expectStatus(await api('odette', 'POST', `/api/codage/${c.body.id}/valider`, { commentaire: 'OK' }), 200)

    const c2 = await api('odette', 'POST', '/api/codage', { dossierId, codeDouanier: '3102.10', designation: 'Engrais', tauxDroits: 5, tauxTVA: 0, valeurCIF: 500_000 })
    await api('odette', 'POST', `/api/codage/${c2.body.id}/soumettre`)
    expectStatus(await api('odette', 'POST', `/api/codage/${c2.body.id}/rejeter`, { commentaire: 'no' }), 400)
    expectStatus(await api('soudi', 'POST', `/api/codage/${c2.body.id}/rejeter`, { commentaire: 'Classement tarifaire erroné' }), 200)
  })
})

describe('Déclarations d\'importation (DI)', () => {
  let diId = ''
  it('création, liaison, débit avec anti-doublon, justificatif et seuils', async () => {
    const numero = unique('DI-TEST')
    const c = await api('yasmine', 'POST', '/api/di', { numero, client: 'CLIENT MODULES', montant: 1_000_000, dateEmission: new Date().toISOString(), compagnie: 'COSCO' })
    expectStatus(c, 201)
    diId = c.body.id
    expectStatus(await api('yasmine', 'POST', `/api/di/${diId}/lier-dossier`, { dossierId }), 200)

    const deb = await api('yasmine', 'POST', `/api/di/${diId}/mouvements`, { type: 'debit', montant: 920_000, motif: 'Droits de douane', referenceFacture: 'FAC-X-1', dossierId, categorie: 'droits_douane' })
    expectStatus(deb, 201)
    assert.equal(deb.body.di.alerteNiveau, 'critical')
    const dbl = await api('yasmine', 'POST', `/api/di/${diId}/mouvements`, { type: 'debit', montant: 1_000, motif: 'Doublon', referenceFacture: 'fac-x-1' })
    expectStatus(dbl, 409, 'facture en double refusée')
    const trop = await api('yasmine', 'POST', `/api/di/${diId}/mouvements`, { type: 'debit', montant: 100_000, motif: 'Trop' })
    expectStatus(trop, 422, 'solde insuffisant')

    const f = await upload('yasmine', `/api/di/${diId}/factures`, { name: 'facture.pdf', type: 'application/pdf', content: '%PDF facture DI' }, { categorie: 'document_di', motif: 'Document DI' })
    expectStatus(f, 201, 'justificatif DI')
    const docs = await api('yasmine', 'GET', `/api/di/${diId}/documents`)
    assert.equal(docs.body.length, 1)
    const content = await api('honore', 'GET', docs.body[0].url)
    expectStatus(content, 200)

    const tdb = await api('honore', 'GET', `/api/di/${diId}/tableau-de-bord`)
    expectStatus(tdb, 200)
    expectStatus(await api('honore', 'GET', `/api/di/${diId}/export-ohada`), 200)
    expectStatus(await api('odette', 'GET', `/api/di/${diId}`), 403, 'Odette n\'a pas accès aux finances')
  })

  it('une DI consommée ne se supprime pas ; une DI vierge oui (permission complète)', async () => {
    expectStatus(await api('honore', 'DELETE', `/api/di/${diId}`), 422)
    const v = await api('yasmine', 'POST', '/api/di', { numero: unique('DI-VIDE'), client: 'CLIENT VIDE', montant: 10_000, dateEmission: new Date().toISOString() })
    expectStatus(await api('yasmine', 'DELETE', `/api/di/${v.body.id}`), 403, 'suppression réservée à la permission financière complète')
    expectStatus(await api('honore', 'DELETE', `/api/di/${v.body.id}`), 204)
  })
})

describe('Finance, sorties, logistique, Kribi', () => {
  it('le Service administratif enregistre un transfert de fonds (avec ou sans dossier)', async () => {
    const v = await api('yasmine', 'POST', '/api/finance/virements', {
      beneficiaire: 'DGD Douala', banque: 'SGC', montant: 250_000, type: 'droits_douane', motif: 'Droits COSCO',
      dossierId, dateVirement: new Date().toISOString(),
    })
    expectStatus(v, 201)
    assert.match(v.body.reference, /^VIR-\d{4}-\d{4}$/)
    const sans = await api('yasmine', 'POST', '/api/finance/virements', {
      beneficiaire: 'Fournisseur bureau', montant: 30_000, motif: 'Fournitures', dateVirement: new Date().toISOString(),
    })
    expectStatus(sans, 201)
    expectStatus(await api('honore', 'PATCH', `/api/finance/virements/${sans.body.id}`, { statut: 'effectue' }), 200)
    expectStatus(await api('odette', 'POST', '/api/finance/virements', { beneficiaire: 'X', montant: 1, motif: 'xx', dateVirement: new Date().toISOString() }), 403)
  })

  it('paiements douane / compagnie et pénalités (Gestion des sorties)', async () => {
    const pd = await api('yaya', 'POST', '/api/finance/paiements-douane', {
      dossierId, type: 'droits', montant: 400_000, datePaiement: new Date().toISOString(), statut: 'paye', reference: unique('PD'),
    })
    expectStatus(pd, 201)
    const pc = await api('wandala', 'POST', '/api/finance/paiements-compagnie', {
      dossierId, compagnie: 'COSCO', type: 'surestaries', montant: 120_000, datePaiement: new Date().toISOString(), statut: 'paye', reference: unique('PC'),
    })
    expectStatus(pc, 201)
    const pen = await api('wandala', 'POST', `/api/dossiers/${dossierId}/penalites`, { montant: 50_000, raison: 'Retard restitution conteneur', dateEcheance: new Date().toISOString() })
    expectStatus(pen, 201, 'pénalité (payload de la page Gestion Sorties)')
    expectStatus(await api('odette', 'POST', `/api/dossiers/${dossierId}/penalites`, { montant: 1, raison: 'xx' }), 403)
  })

  it('interchanges, détentions, véhicules', async () => {
    const ic = await api('wandala', 'POST', '/api/interchanges', { dossierId, conteneur: 'COSU1111111', compagnie: 'COSCO', dateLimite: new Date(Date.now() - 86_400_000).toISOString() })
    expectStatus(ic, 201)
    const retard = await api('wandala', 'GET', '/api/interchanges/en-retard')
    assert.ok(retard.body.some((i: any) => i.id === ic.body.id))
    expectStatus(await api('wandala', 'PATCH', `/api/interchanges/${ic.body.id}`, { statut: 'retourne', dateRetour: new Date().toISOString() }), 200)

    const det = await api('wandala', 'POST', '/api/detentions', { dossierId, conteneur: 'COSU1111111', compagnie: 'COSCO', dateDebut: new Date(Date.now() - 3 * 86_400_000).toISOString(), tarifJournalier: 25_000 })
    expectStatus(det, 201)
    const enCours = await api('soudi', 'GET', '/api/detentions/en-cours')
    assert.ok(enCours.body.detentions.some((d: any) => d.id === det.body.id && d.montantTotal >= 75_000))

    const v = await api('yaya', 'POST', '/api/vehicules', { dossierId, marque: 'Toyota', modele: 'Hilux', annee: 2024, numeroSerie: 'JTFST22P0000001', valeurCIF: 15_000_000 })
    expectStatus(v, 201)
    expectStatus(await api('yaya', 'PATCH', `/api/vehicules/${v.body.id}`, { statut: 'en_cours', immatriculation: 'LT 123 AB' }), 200)
    const list = await api('yaya', 'GET', '/api/vehicules?limit=50')
    assert.ok(list.body.data.some((x: any) => x.id === v.body.id))
  })

  it('Kribi : bons, gate pass numérotés sans collision, comptes-rendus', async () => {
    const b = await api('aliou', 'POST', '/api/kribi/bons', { dossierId: dossierKribiId, type: 'douane', numero: unique('BK'), description: 'Bon douane Kribi' })
    expectStatus(b, 201)
    const g1 = await api('aliou', 'POST', '/api/kribi/gate-passes', { dossierId: dossierKribiId, conteneur: 'MSCU2222222', chauffeur: 'Jean', telephone: '677000000', destination: 'Yaoundé' })
    const g2 = await api('aliou', 'POST', '/api/kribi/gate-passes', { dossierId: dossierKribiId, conteneur: 'MSCU2222222', chauffeur: 'Paul', telephone: '677000001', destination: 'Edéa' })
    expectStatus(g1, 201); expectStatus(g2, 201)
    assert.notEqual(g1.body.numero, g2.body.numero)
    const gp = await api('aliou', 'GET', `/api/exports/gate-pass/${g1.body.id}`)
    expectStatus(gp, 200)
    assert.match(gp.raw, /GATE PASS/)
    const cr = await api('aliou', 'POST', '/api/kribi/comptes-rendus', { date: new Date().toISOString(), contenu: 'Journée normale, 2 gate pass émis.' })
    expectStatus(cr, 201)
    const dash = await api('raphael', 'GET', '/api/dashboard/kribi')
    expectStatus(dash, 200)
  })

  it('SGS : soumission, mise à jour ADV, escalade', async () => {
    const s = await api('yasmine', 'POST', '/api/sgs', { dossierId, typeVerification: 'documentaire', dateDepot: new Date().toISOString() })
    expectStatus(s, 201)
    assert.match(s.body.reference, /^SGS-\d{4}-\d{4}$/)
    expectStatus(await api('yasmine', 'PATCH', `/api/sgs/${s.body.id}`, { statut: 'adv_emise', numeroADV: 'ADV-1' }), 200)
    expectStatus(await api('yasmine', 'POST', `/api/sgs/${s.body.id}/escalader`, { message: 'Retour tardif' }), 201)
  })
})

describe('Communication & pilotage', () => {
  it('messagerie : conversation, message, confidentialité', async () => {
    const c = await api('yaya', 'POST', '/api/messagerie/conversations', { titre: 'Coordination sortie', participantIds: [ids.wandala] })
    expectStatus(c, 201)
    expectStatus(await api('wandala', 'POST', `/api/messagerie/conversations/${c.body.id}/messages`, { contenu: 'Camion prêt ?' }), 201)
    const msgs = await api('yaya', 'GET', `/api/messagerie/conversations/${c.body.id}/messages`)
    assert.equal(msgs.body.data.length, 1)
    expectStatus(await api('odette', 'GET', `/api/messagerie/conversations/${c.body.id}/messages`), 403)
  })

  it('alertes et notifications', async () => {
    const a = await api('soudi', 'POST', '/api/alertes', { type: 'blocage', message: 'Blocage test douane', severity: 'warning', dossierId })
    expectStatus(a, 201)
    expectStatus(await api('odette', 'PATCH', `/api/alertes/${a.body.id}/lire`), 200)
    const b = await api('soudi', 'POST', '/api/notifications/broadcast', { profils: ['validation'], type: 'message', titre: 'Info', message: 'Réunion à 9h' })
    expectStatus(b, 201)
    const n = await api('odette', 'GET', '/api/notifications/count')
    assert.ok(n.body.nonLues >= 1)
    expectStatus(await api('odette', 'PATCH', '/api/notifications/tout-lire'), 200)
    expectStatus(await api('odette', 'POST', '/api/notifications/broadcast', { profils: ['dg'], type: 'message', titre: 'X', message: 'xxxxx' }), 403)
  })

  it('reporting : SLA par étape et performance (format attendu par l\'écran)', async () => {
    const sla = await api('soudi', 'GET', '/api/reporting/sla?periode=mois')
    expectStatus(sla, 200)
    assert.ok(Array.isArray(sla.body.etapes) && sla.body.etapes.length > 0)
    const perf = await api('delba', 'GET', '/api/reporting/performance?periode=trimestre')
    expectStatus(perf, 200)
    assert.ok(Array.isArray(perf.body.employes))
    assert.ok(perf.body.global.tachesTotal > 0)
  })

  it('exports : OHADA CSV, rapport DG, fiche dossier', async () => {
    const o = await api('honore', 'GET', '/api/exports/ohada')
    expectStatus(o, 200)
    assert.match(String(o.headers['content-type']), /text\/csv/)
    expectStatus(await api('delba', 'GET', '/api/exports/rapport-dg'), 200)
    expectStatus(await api('odette', 'GET', `/api/exports/dossier/${dossierId}`), 200)
    expectStatus(await api('odette', 'GET', '/api/exports/ohada'), 403)
  })
})

/** Endpoints de lecture à vérifier pour chaque compte : jamais d'erreur serveur. */
const LECTURES = [
  '/api/auth/me', '/api/dashboard/kpis', '/api/dashboard/charts', '/api/dashboard/recent', '/api/dashboard/kribi',
  '/api/dashboard/exploitation', '/api/dashboard/dg', '/api/dashboard/heatmap',
  '/api/dossiers?limit=20', '/api/employes', '/api/alertes', '/api/alertes/config', '/api/notifications', '/api/notifications/count',
  '/api/messagerie/conversations', '/api/messagerie/non-lus', '/api/employe/mon-espace', '/api/employe/mes-taches',
  '/api/employe/mes-dossiers', '/api/employe/equipe/performance', '/api/employe/heatmap', '/api/parametres', '/api/roles',
  '/api/roles/attribution', '/api/finance/stats', '/api/finance/virements', '/api/finance/paiements-douane',
  '/api/finance/paiements-compagnie', '/api/finance/factures', '/api/di', '/api/di/stats/resume', '/api/codage',
  '/api/codage/stats/resume', '/api/detentions', '/api/detentions/en-cours', '/api/detentions/stats/par-compagnie',
  '/api/interchanges', '/api/interchanges/en-retard', '/api/interchanges/stats/par-compagnie', '/api/vehicules',
  '/api/vehicules/stats/resume', '/api/kribi/bons', '/api/kribi/stats', '/api/kribi/gate-passes', '/api/kribi/comptes-rendus',
  '/api/sgs', '/api/sgs/en-attente', '/api/sgs/stats/resume', '/api/reporting/timing', '/api/reporting/performance',
  '/api/reporting/dossiers', '/api/reporting/financier', '/api/reporting/sla', '/api/exports/rapport-dg',
  '/api/exports/rapport-journalier-kribi', '/api/supervision/pipeline', '/api/supervision/charge',
  '/api/supervision/alertes-process', '/api/admin/entreprise', '/api/admin/activites', '/api/admin/synthese',
  '/api/rh/fiches', '/api/rh/conges', '/api/rh/mes-conges', '/api/rh/masse-salariale', '/api/compta/dashboard',
  '/api/compta/comptes', '/api/compta/journaux', '/api/compta/exercices', '/api/compta/ecritures', '/api/compta/balance',
  '/api/compta/resultat', '/api/compta/bilan', '/api/compta/tresorerie', '/api/compta/creances', '/api/compta/comptabilisation/apercu',
  '/api/di/mouvements', '/api/di/alertes-seuil', '/api/logistique/chauffeurs', '/api/logistique/camions',
  '/api/logistique/transports', '/api/logistique/resume', '/api/repertoire', '/api/repertoire?type=client&q=a',
  '/api/bibliotheque', '/api/bibliotheque?format=pdf&tri=taille&espace=dossiers', '/api/bibliotheque?favoris=1&categorie=preuve,compte_rendu',
]

describe('Matrice des droits — aucun compte ne provoque d\'erreur serveur', () => {
  it('toutes les lectures répondent 2xx ou 403, jamais 5xx', async () => {
    const erreurs: string[] = []
    for (const who of Object.keys(USERS) as UserKey[]) {
      for (const url of LECTURES) {
        const r = await api(who, 'GET', url)
        if (r.status >= 500 || ![200, 403].includes(r.status)) erreurs.push(`${who} ${url} → ${r.status} ${r.raw.slice(0, 160)}`)
      }
    }
    assert.deepEqual(erreurs, [])
  })

  it('accès attendus par type de compte', async () => {
    const attendu: [UserKey, string, number][] = [
      ['delba', '/api/admin/synthese', 200], ['soudi', '/api/admin/synthese', 403],
      ['delba', '/api/compta/balance', 200], ['honore', '/api/compta/balance', 200],
      ['soudi', '/api/compta/balance', 403], ['yasmine', '/api/compta/balance', 403],
      ['delba', '/api/supervision/pipeline', 200], ['soudi', '/api/supervision/pipeline', 200],
      ['odette', '/api/supervision/pipeline', 403], ['honore', '/api/supervision/charge', 403],
      ['honore', '/api/finance/stats', 200], ['odette', '/api/finance/stats', 403],
      ['yasmine', '/api/rh/fiches', 200], ['yaya', '/api/rh/fiches', 403],
      ['delba', '/api/rh/masse-salariale', 200], ['yasmine', '/api/rh/masse-salariale', 403],
      ['odette', '/api/codage', 200], ['soudi', '/api/dashboard/dg', 200], ['yaya', '/api/dashboard/dg', 403],
    ]
    const ecarts: string[] = []
    for (const [who, url, status] of attendu) {
      const r = await api(who, 'GET', url)
      if (r.status !== status) ecarts.push(`${who} ${url} attendu ${status} reçu ${r.status}`)
    }
    assert.deepEqual(ecarts, [])
  })
})
