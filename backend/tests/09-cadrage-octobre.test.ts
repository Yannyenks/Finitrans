/**
 * Cahier des modifications d'octobre : passage de relais au niveau des tâches, chronométrage
 * précis, SLA des tâches, paiement client, CRM, alertes Direction, nomenclature RVC / SI.
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { api, closeApp, expectStatus, placerEtape, preparerPassage, unique, upload, userIds, type UserKey } from './helpers'

let ids: Record<UserKey, string>
let dossierId = ''
const CLIENT = `CLIENT CADRAGE ${Date.now() % 100000}`
const nom = (uid: string) => Object.entries(ids).find(([, v]) => v === uid)?.[0] as UserKey

async function taches(etape?: string) {
  const r = await api('delba', 'GET', `/api/dossiers/${dossierId}/sous-etapes`)
  return (r.body as any[]).filter(t => !etape || t.etape === etape)
}

before(async () => {
  ids = await userIds()
  const r = await api('yasmine', 'POST', '/api/dossiers', {
    client: CLIENT, compagnie: 'MSC', conteneur: 'MSCU3333333', marchandise: 'Divers', site: 'Douala', dateArrivee: new Date().toISOString(),
  })
  expectStatus(r, 201)
  dossierId = r.body.id
})
after(closeApp)

describe('Chronométrage et SLA des tâches', () => {
  it('à la création, les tâches de réception démarrent avec une échéance issue du SLA', async () => {
    const t = await taches('reception')
    assert.ok(t.length >= 5)
    for (const x of t) {
      assert.ok(x.startedAt, `${x.cle} démarrée`)
      assert.ok(x.deadline, `${x.cle} a une échéance`)
      assert.ok(new Date(x.deadline) > new Date(x.startedAt))
    }
  })

  it('démarrage automatique : les tâches reçues sont « en cours » et la notification porte l\'échéance', async () => {
    const t = await taches('reception')
    assert.ok(t.filter(x => x.responsableId).every(x => x.statut === 'en_cours'), 'plus besoin de « Démarrer »')
    const n = await api('honore', 'GET', '/api/notifications?limit=20')
    const notif = n.body.data.find((x: any) => x.dossierId === dossierId && x.titre === 'Nouveau dossier à traiter')
    assert.ok(notif?.echeance, 'compte à rebours dès la réception')
    const sienne = t.find(x => nom(x.responsableId) === 'honore')
    assert.equal(new Date(notif.echeance).getTime(), new Date(sienne.deadline).getTime())
  })

  it('une tâche terminée garde son début et sa fin (à la seconde)', async () => {
    const bl = (await taches('reception')).find(x => x.cle === 'bl')
    const r = await api(nom(bl.responsableId), 'PUT', `/api/dossiers/${dossierId}/sous-etapes/reception/bl`, { statut: 'valide' })
    expectStatus(r, 200)
    assert.ok(r.body.startedAt && r.body.completedAt)
    assert.ok(new Date(r.body.completedAt).getTime() >= new Date(r.body.startedAt).getTime())
  })

  it('les SLA des tâches sont définis par la Direction et M. Soudi uniquement', async () => {
    expectStatus(await api('yasmine', 'PATCH', '/api/parametres/sla_sous_etapes', { valeur: { 'codage.declaration': 2 } }), 403)
    expectStatus(await api('soudi', 'PATCH', '/api/parametres/sla_sous_etapes', { valeur: { 'codage.declaration': 2.5 } }), 200)
    const l = await api('yasmine', 'GET', '/api/parametres/sla-sous-etapes')
    expectStatus(l, 200)
    assert.equal(l.body.find((x: any) => x.cle === 'codage.declaration').heures, 2.5)
    assert.ok(l.body.some((x: any) => x.label === 'Obtention du RVC'))
    // La sous-étape SGS de la réception a été retirée
    assert.ok(!l.body.some((x: any) => x.cle === 'reception.traitement_sgs'))
  })
})

describe('Passage de relais au niveau des tâches', () => {
  it('un intervenant de l\'étape confie une tâche à un collègue ; un compte extérieur ne peut pas', async () => {
    const pr = (await taches('reception')).find(x => x.cle === 'saisie_pr')
    assert.equal(nom(pr.responsableId), 'odette')
    // Mme Yasmine (intervenante de la réception) passe la saisie du PR à Mr Honoré
    const r = await api('yasmine', 'PUT', `/api/dossiers/${dossierId}/sous-etapes/reception/saisie_pr`, { responsableId: ids.honore })
    expectStatus(r, 200)
    assert.equal(r.body.responsableId, ids.honore)
    const notifs = await api('honore', 'GET', '/api/notifications?limit=20')
    assert.ok(notifs.body.data.some((n: any) => n.dossierId === dossierId && n.titre === 'Nouvelle tâche attribuée'))
    // Mr Yaya n'intervient pas à la réception
    expectStatus(await api('yaya', 'PUT', `/api/dossiers/${dossierId}/sous-etapes/reception/saisie_pr`, { responsableId: ids.yaya }), 403)
    // Le relais ne permet pas de terminer la tâche d'un autre
    expectStatus(await api('yasmine', 'PUT', `/api/dossiers/${dossierId}/sous-etapes/reception/saisie_pr`, { statut: 'valide' }), 403)
    // Retirer le titulaire est réservé à la Direction
    expectStatus(await api('yasmine', 'PUT', `/api/dossiers/${dossierId}/sous-etapes/reception/saisie_pr`, { responsableId: null }), 422)
  })

  it('paiement par le client : mode de règlement + client → règlement enregistré dans le CRM', async () => {
    const t = (await taches('reception')).find(x => x.cle === 'paiement_client')
    const ref = unique('CHQ')
    const r = await api(nom(t.responsableId), 'PUT', `/api/dossiers/${dossierId}/sous-etapes/reception/paiement_client`, {
      statut: 'valide',
      metadata: { reglement_client: CLIENT, reglement_mode: 'cheque', reglement_montant: '750 000', reglement_reference: ref, reglement_banque: 'Afriland', reglement_date: '2026-10-15' },
    })
    expectStatus(r, 200)
    assert.equal(r.body.metadata.enregistrement_type, 'reglement_client')
    const d = await api('delba', 'GET', `/api/dossiers/${dossierId}`)
    const fiche = await api('honore', 'GET', `/api/crm/clients/${d.body.clientId}`)
    expectStatus(fiche, 200)
    const regl = fiche.body.reglements.find((x: any) => x.reference === ref)
    assert.ok(regl, 'règlement visible dans la fiche client')
    assert.equal(regl.mode, 'cheque')
    assert.equal(regl.montant, 750000)
    assert.equal(fiche.body.indicateurs.encaisse, 750000)
  })

  it('passation : chaque tâche de l\'étape suivante peut être confiée à un compte précis, et son chronomètre démarre', async () => {
    for (const t of await taches('reception')) {
      if (t.statut !== 'valide') expectStatus(await api(nom(t.responsableId), 'PUT', `/api/dossiers/${dossierId}/sous-etapes/reception/${t.cle}`, { statut: 'valide' }), 200)
    }
    expectStatus(await upload('yasmine', `/api/dossiers/${dossierId}/upload`, { name: 'r.pdf', type: 'application/pdf', content: `%PDF ${Date.now()}` }, { etape: 'reception' }), 201)
    const avance = await api('yasmine', 'PATCH', `/api/dossiers/${dossierId}/status`, {
      status: 'soumission_sgs', responsableId: ids.soudi, taches: { pvc: ids.delba },
    })
    expectStatus(avance, 200)
    const sgs = await taches('soumission_sgs')
    assert.equal(nom(sgs.find(x => x.cle === 'pvc').responsableId), 'delba')
    assert.equal(nom(sgs.find(x => x.cle === 'ff_soumission').responsableId), 'soudi')
    assert.ok(sgs.every(x => x.startedAt && x.deadline))
    // Une tâche inconnue est refusée
    const bad = await api('soudi', 'PATCH', `/api/dossiers/${dossierId}/status`, { status: 'codage', taches: { inexistante: ids.odette } })
    expectStatus(bad, 422)
  })
})

describe('Alerte Direction Générale', () => {
  it('un blocage signalé par un titulaire est notifié au DG', async () => {
    const ff = (await taches('soumission_sgs')).find(x => x.cle === 'ff_soumission')
    expectStatus(await api('soudi', 'PUT', `/api/dossiers/${dossierId}/sous-etapes/soumission_sgs/ff_soumission`, { statut: 'en_cours' }), 200)
    expectStatus(await api(nom(ff.responsableId), 'PUT', `/api/dossiers/${dossierId}/sous-etapes/soumission_sgs/ff_soumission`, { statut: 'rejete' }), 200)
    const n = await api('delba', 'GET', '/api/notifications?limit=30')
    assert.ok(n.body.data.some((x: any) => x.dossierId === dossierId && x.type === 'alerte' && x.titre === 'Blocage signalé sur un dossier'))
  })
})

describe('CRM', () => {
  let clientId = ''

  it('accès réservé aux profils commerciaux / financiers et à la Direction', async () => {
    expectStatus(await api('yaya', 'GET', '/api/crm/synthese'), 403)
    const s = await api('honore', 'GET', '/api/crm/synthese')
    expectStatus(s, 200)
    assert.ok(s.body.clients.total >= 1)
    assert.equal(s.body.evolution.length, 12)
  })

  it('le dossier est rattaché automatiquement à la fiche de son client', async () => {
    const l = await api('yasmine', 'GET', `/api/crm/clients?q=${encodeURIComponent(CLIENT)}`)
    expectStatus(l, 200)
    const c = l.body.find((x: any) => x.nom === CLIENT)
    assert.ok(c)
    assert.ok(c.indicateurs.dossiers >= 1)
    clientId = c.id
  })

  it('création, doublon refusé, modification de la fiche', async () => {
    const nomClient = unique('SOCIETE BETA')
    const r = await api('yasmine', 'POST', '/api/crm/clients', { nom: nomClient, segment: 'premium', secteur: 'BTP', plafondCredit: 5_000_000 })
    expectStatus(r, 201)
    expectStatus(await api('yasmine', 'POST', '/api/crm/clients', { nom: nomClient.toLowerCase() }), 409)
    const m = await api('delba', 'PATCH', `/api/crm/clients/${r.body.id}`, { segment: 'strategique', contactNom: 'M. Beta' })
    expectStatus(m, 200)
    assert.equal(m.body.segment, 'strategique')
  })

  it('échanges, relances et règlements manuels', async () => {
    const demain = new Date(Date.now() + 86_400_000).toISOString()
    const it1 = await api('yasmine', 'POST', `/api/crm/clients/${clientId}/interactions`, {
      type: 'appel', sujet: 'Point arrivée conteneur', contenu: 'Client informé', prochaineAction: 'Relancer pour le solde', dateProchaineAction: demain,
    })
    expectStatus(it1, 201)
    const rel = await api('honore', 'GET', '/api/crm/relances')
    assert.ok(rel.body.some((x: any) => x.id === it1.body.id))
    expectStatus(await api('honore', 'PATCH', `/api/crm/interactions/${it1.body.id}`, { faite: true }), 200)
    const rel2 = await api('honore', 'GET', '/api/crm/relances')
    assert.ok(!rel2.body.some((x: any) => x.id === it1.body.id))
    // Seul l'auteur (ou la Direction) supprime un échange
    expectStatus(await api('honore', 'DELETE', `/api/crm/interactions/${it1.body.id}`), 403)

    const regl = await api('honore', 'POST', '/api/crm/reglements', { clientId, mode: 'traite', montant: 250000, reference: unique('TRT'), dateEcheance: demain })
    expectStatus(regl, 201)
    const fiche = await api('honore', 'GET', `/api/crm/clients/${clientId}`)
    assert.equal(fiche.body.indicateurs.encaisse, 1_000_000)
    assert.ok(fiche.body.interactions.length >= 1)
    assert.ok(fiche.body.dossiers.some((d: any) => d.id === dossierId))
  })
})

describe('Notifications pour chaque action et visibilité des sorties', () => {
  it('Mr Wandala (MSC/COSCO) voit aussi un dossier CMA CGM, sans en être titulaire', async () => {
    const r = await api('yasmine', 'POST', '/api/dossiers', {
      client: unique('CLIENT CMA'), compagnie: 'CMA_CGM', conteneur: 'CMAU1234567', marchandise: 'Divers', site: 'Douala', dateArrivee: new Date().toISOString(),
    })
    expectStatus(r, 201)
    const l = await api('wandala', 'GET', `/api/dossiers?limit=100&search=${encodeURIComponent(r.body.numero)}`)
    assert.ok(l.body.data.some((d: any) => d.id === r.body.id))
    // Les tâches « Bon compagnie » restent à Mr Rasoul (MAERSK/CMA)
    const t = await api('delba', 'GET', `/api/dossiers/${r.body.id}/sous-etapes`)
    assert.equal(nom(t.body.find((x: any) => x.cle === 'facturation_compagnie').responsableId), 'rasoul')
  })

  it('une action sur un dossier est notifiée aux intervenants et à la Direction, pas à son auteur', async () => {
    expectStatus(await api('yasmine', 'POST', `/api/dossiers/${dossierId}/commentaires`, { message: 'Point sur le dossier' }), 201)
    const pour = async (u: UserKey) => (await api(u, 'GET', '/api/notifications?limit=10')).body.data
      .some((n: any) => n.dossierId === dossierId && n.titre.endsWith('· Nouveau commentaire'))
    assert.ok(await pour('delba'), 'DG notifié')
    assert.ok(await pour('soudi'), 'Exploitation notifiée')
    assert.ok(await pour('wandala'), 'titulaire d\'une étape suivante notifié')
    assert.ok(!(await pour('yasmine')), 'l\'auteur n\'est pas notifié')
  })

  it('une action hors dossier est notifiée à la Direction', async () => {
    const c = await api('honore', 'POST', '/api/crm/clients', { nom: unique('CLIENT NOTIF') })
    expectStatus(c, 201)
    const n = await api('delba', 'GET', '/api/notifications?limit=10')
    const notif = n.body.data.find((x: any) => x.titre === 'Client créé' && x.message.includes(c.body.nom))
    assert.ok(notif)
    assert.equal(notif.actionUrl, `/crm/${c.body.id}`)
  })
})

describe('Compagnies maritimes : liste ouverte', () => {
  it('la Direction ajoute une compagnie ; un dossier peut l\'utiliser et ses tâches « Bon compagnie » sont attribuées', async () => {
    expectStatus(await api('yasmine', 'POST', '/api/compagnies', { nom: 'Hapag-Lloyd' }), 403)
    const a = await api('soudi', 'POST', '/api/compagnies', { nom: 'Hapag-Lloyd' })
    expectStatus(a, [201, 409])
    const liste = await api('yasmine', 'GET', '/api/compagnies')
    assert.ok(liste.body.some((c: any) => c.code === 'HAPAG_LLOYD' && c.nom === 'Hapag-Lloyd' && c.actif))

    const d = await api('yasmine', 'POST', '/api/dossiers', {
      client: unique('CLIENT HAPAG'), compagnie: 'HAPAG_LLOYD', conteneur: 'HLXU1234567', marchandise: 'Divers', site: 'Douala', dateArrivee: new Date().toISOString(),
    })
    expectStatus(d, 201)
    assert.equal(d.body.compagnie, 'HAPAG_LLOYD')
    const t = await api('delba', 'GET', `/api/dossiers/${d.body.id}/sous-etapes`)
    const bc = t.body.find((x: any) => x.cle === 'facturation_compagnie')
    assert.ok(['wandala', 'rasoul'].includes(nom(bc.responsableId)), 'attribuée à un responsable des sorties')

    const inconnue = await api('yasmine', 'POST', '/api/dossiers', {
      client: 'X', compagnie: 'COMPAGNIE FANTOME', conteneur: 'XXXU0000000', marchandise: 'Divers', site: 'Douala', dateArrivee: new Date().toISOString(),
    })
    expectStatus(inconnue, [400, 422])
  })
})

describe('Mr Wandala est notifié comme tout le monde', () => {
  it('il reçoit les notifications d\'un dossier MAERSK/CMA dont il n\'a aucune tâche', async () => {
    const r = await api('yasmine', 'POST', '/api/dossiers', {
      client: unique('CLIENT MAERSK'), compagnie: 'MAERSK', conteneur: 'MAEU1234567', marchandise: 'Divers', site: 'Douala', dateArrivee: new Date().toISOString(),
    })
    expectStatus(r, 201)
    const t = await api('delba', 'GET', `/api/dossiers/${r.body.id}/sous-etapes`)
    assert.ok(!t.body.some((x: any) => x.responsableId === ids.wandala), 'aucune tâche pour Mr Wandala')
    expectStatus(await api('honore', 'POST', `/api/dossiers/${r.body.id}/commentaires`, { message: 'Acompte reçu' }), 201)
    const n = await api('wandala', 'GET', '/api/notifications?limit=10')
    assert.ok(n.body.data.some((x: any) => x.dossierId === r.body.id && x.titre.endsWith('· Nouveau commentaire')))
  })
})

describe('Conteneurs, sous-étapes retirées et bon de compagnie sans montant', () => {
  it('le dossier enregistre le nombre et la taille des conteneurs ; Régulation et Validation des documents n\'existent plus', async () => {
    const r = await api('yasmine', 'POST', '/api/dossiers', {
      client: unique('CLIENT TC'), compagnie: 'MSC', conteneur: 'MSCU1111111, MSCU2222222, MSCU3333333', nombreConteneurs: 3, tailleConteneur: '40\' HC',
      marchandise: 'Divers', site: 'Douala', dateArrivee: new Date().toISOString(),
    })
    expectStatus(r, 201)
    assert.equal(r.body.nombreConteneurs, 3)
    assert.equal(r.body.tailleConteneur, '40\' HC')
    const t = (await api('delba', 'GET', `/api/dossiers/${r.body.id}/sous-etapes`)).body
    assert.ok(!t.some((x: any) => x.cle === 'regulation' || x.cle === 'validation_docs'))
    assert.ok(!t.some((x: any) => x.etape === 'validation'), 'l\'étape Validation n\'a plus de tâche')

    // Bon de la compagnie : numéro et date, aucun paiement créé
    const bon = await api('delba', 'PUT', `/api/dossiers/${r.body.id}/sous-etapes/bon_compagnie/facturation_compagnie`, {
      statut: 'valide', metadata: { bc_bon_numero: 'MSC-BON-001', bc_bon_date: '2026-10-20' },
    })
    expectStatus(bon, 200)
    assert.equal(bon.body.metadata.bc_bon_numero, 'MSC-BON-001')
    assert.equal(bon.body.metadata.enregistrement_type, undefined)
    const pc = await api('delba', 'GET', `/api/finance/paiements-compagnie?dossierId=${r.body.id}`)
    assert.equal(pc.body.data.length, 0)
  })
})

describe('Facture fournisseur (FF et soumission) débitée sur la DI', () => {
  it('le montant saisi est décrémenté du solde de la DI ; solde insuffisant refusé ; sans DI refusé', async () => {
    const d = await api('yasmine', 'POST', '/api/dossiers', {
      client: unique('CLIENT DI'), compagnie: 'MSC', conteneur: 'MSCU4545454', marchandise: 'Divers', site: 'Douala', dateArrivee: new Date().toISOString(),
    })
    const id = d.body.id
    await api('delba', 'GET', `/api/dossiers/${id}/sous-etapes`)
    // Sans DI liée : refus explicite
    const sansDi = await api('delba', 'PUT', `/api/dossiers/${id}/sous-etapes/soumission_sgs/ff_soumission`, {
      statut: 'valide', metadata: { ff_montant_facture: 100000, ff_reference_facture: unique('PI') },
    })
    expectStatus(sansDi, 422)
    assert.equal(sansDi.body.error, 'DI_REQUISE')

    const di = await api('yasmine', 'POST', '/api/di', { numero: unique('DI-FF'), client: 'CLIENT DI', montant: 1_000_000, dateEmission: new Date().toISOString() })
    expectStatus(await api('yasmine', 'POST', `/api/di/${di.body.id}/lier-dossier`, { dossierId: id }), 200)

    // Solde insuffisant : refus, la tâche reste ouverte
    const trop = await api('delba', 'PUT', `/api/dossiers/${id}/sous-etapes/soumission_sgs/ff_soumission`, {
      statut: 'valide', metadata: { ff_montant_facture: 5_000_000, ff_reference_facture: unique('PI') },
    })
    expectStatus(trop, 422)
    assert.equal(trop.body.error, 'SOLDE_DI_INSUFFISANT')

    const ok = await api('delba', 'PUT', `/api/dossiers/${id}/sous-etapes/soumission_sgs/ff_soumission`, {
      statut: 'valide', metadata: { ff_montant_facture: '250 000', ff_reference_facture: unique('PI') },
    })
    expectStatus(ok, 200)
    assert.equal(ok.body.metadata.enregistrement_type, 'debit_di')
    const apres = await api('yasmine', 'GET', `/api/di/${di.body.id}`)
    assert.equal(Number(apres.body.soldeActuel), 750_000)
  })

  it('montant saisi dans les informations de l\'étape (sans validation) : débité aussitôt ; correction = écart seulement', async () => {
    const d = await api('yasmine', 'POST', '/api/dossiers', {
      client: unique('CLIENT DI2'), compagnie: 'MSC', conteneur: 'MSCU4545455', marchandise: 'Divers', site: 'Douala', dateArrivee: new Date().toISOString(),
    })
    const id = d.body.id
    await api('delba', 'GET', `/api/dossiers/${id}/sous-etapes`)
    const di = await api('yasmine', 'POST', '/api/di', { numero: unique('DI-FF2'), client: 'CLIENT DI2', montant: 1_000_000, dateEmission: new Date().toISOString() })
    expectStatus(await api('yasmine', 'POST', `/api/di/${di.body.id}/lier-dossier`, { dossierId: id }), 200)
    const url = `/api/dossiers/${id}/sous-etapes/soumission_sgs/ff_soumission`
    const solde = async () => Number((await api('yasmine', 'GET', `/api/di/${di.body.id}`)).body.soldeActuel)

    const saisie = await api('soudi', 'PUT', url, { metadata: { ff_montant_facture: '300000', ff_reference_facture: unique('PI') } })
    expectStatus(saisie, 200)
    assert.equal(saisie.body.metadata.ff_montant_debite, 300_000)
    assert.equal(await solde(), 700_000)

    // Réenregistrer le même montant (ex. validation) ne débite pas deux fois ; un client ne peut pas falsifier le montant débité
    expectStatus(await api('soudi', 'PUT', url, { statut: 'valide', metadata: { ff_montant_facture: '300000', ff_montant_debite: 0 } }), 200)
    assert.equal(await solde(), 700_000)

    // Correction à la hausse puis à la baisse : seul l'écart est appliqué
    expectStatus(await api('soudi', 'PUT', url, { metadata: { ff_montant_facture: '450000' } }), 200)
    assert.equal(await solde(), 550_000)
    const baisse = await api('soudi', 'PUT', url, { metadata: { ff_montant_facture: '200000' } })
    expectStatus(baisse, 200)
    assert.equal(baisse.body.metadata.ff_montant_debite, 200_000)
    assert.equal(await solde(), 800_000)
  })
})

describe('Facturation client après la clôture (facture établie physiquement)', () => {
  it('la comptabilité saisit n°, date et montant de la facture papier ; aucun PDF généré ; compte rendu régénéré', async () => {
    const d = await api('yasmine', 'POST', '/api/dossiers', {
      client: unique('CLIENT FACTURE'), compagnie: 'MSC', conteneur: 'MSCU8888888', marchandise: 'Divers', site: 'Douala',
      dateArrivee: new Date().toISOString(), montantHonoraires: 500000,
    })
    const id = d.body.id
    await placerEtape(id, 'cloture')
    await preparerPassage(id, 'cloture')
    const ns = await api('delba', 'GET', `/api/dossiers/${id}/next-step`)
    assert.equal(ns.body.etapeSuivante, 'facturation', 'la facturation suit la clôture')
    expectStatus(await api('delba', 'PATCH', `/api/dossiers/${id}/status`, { status: 'facturation' }), 200)

    const t = (await api('delba', 'GET', `/api/dossiers/${id}/sous-etapes`)).body.filter((x: any) => x.etape === 'facturation')
    assert.deepEqual(t.map((x: any) => x.cle).sort(), ['facture_client', 'remise_facture'])
    assert.ok(t.every((x: any) => nom(x.responsableId) === 'honore'), 'facturation → comptabilité')

    const url = `/api/dossiers/${id}/sous-etapes/facturation/facture_client`
    const incomplete = await api('honore', 'PUT', url, { statut: 'valide', metadata: { fc_numero: 'F-1' } })
    expectStatus(incomplete, 422)
    assert.equal(incomplete.body.error, 'FACTURE_INCOMPLETE')

    const numero = unique('FP')
    const ok = await api('honore', 'PUT', url, { statut: 'valide', metadata: { fc_numero: numero, fc_montant: '1 796 250', fc_date: '2026-10-21' } })
    expectStatus(ok, 200)
    assert.equal(ok.body.metadata.enregistrement_type, 'facture_client')
    assert.equal(ok.body.metadata.facture_numero, numero.toUpperCase())

    const f = await api('honore', 'GET', `/api/dossiers/${id}/factures`)
    const fac = f.body.find((x: any) => x.numero === numero.toUpperCase())
    assert.equal(Number(fac.montant), 1_796_250)
    assert.equal(new Date(fac.dateFacture).toISOString().slice(0, 10), '2026-10-21')
    assert.equal(fac.lignes, null, 'facture papier : pas de lignes générées par la plateforme')

    const docs = await api('delba', 'GET', `/api/bibliotheque?dossier=${id}`)
    assert.ok(JSON.stringify(docs.body).includes('Compte-rendu-'), 'compte rendu archivé avec la facturation')
  })
})

describe('Validation obligatoire d\'une étape avant la suivante', () => {
  it('même la Direction ne peut pas avancer tant que les tâches de l\'étape ne sont pas validées ; le retour arrière reste possible', async () => {
    const d = await api('yasmine', 'POST', '/api/dossiers', {
      client: unique('CLIENT ETAPE'), compagnie: 'MSC', conteneur: 'MSCU7777777', marchandise: 'Divers', site: 'Douala', dateArrivee: new Date().toISOString(),
    })
    const id = d.body.id
    await api('delba', 'GET', `/api/dossiers/${id}/sous-etapes`)
    for (const who of ['delba', 'soudi'] as const) {
      const r = await api(who, 'PATCH', `/api/dossiers/${id}/status`, { status: 'soumission_sgs' })
      expectStatus(r, 422)
      assert.equal(r.body.error, 'SOUS_ETAPES_INCOMPLETES')
    }
    const saut = await api('delba', 'PATCH', `/api/dossiers/${id}/status`, { status: 'paiement' })
    expectStatus(saut, 422)
    assert.equal(saut.body.error, 'ETAPE_INVALIDE')

    await placerEtape(id, 'codage')
    expectStatus(await api('delba', 'PATCH', `/api/dossiers/${id}/status`, { status: 'soumission_sgs' }), 200)
  })
})

describe('Opérations Douala avant Kribi', () => {
  it('un dossier de Kribi passe par Opérations Douala puis Opérations Kribi', async () => {
    const d = await api('yasmine', 'POST', '/api/dossiers', {
      client: unique('CLIENT KRIBI'), compagnie: 'MSC', conteneur: 'MSCU6666666', marchandise: 'Divers', site: 'Kribi', dateArrivee: new Date().toISOString(),
    })
    const detail = await api('delba', 'GET', `/api/dossiers/${d.body.id}`)
    const p: string[] = detail.body.parcoursEtapes
    assert.ok(p.includes('operations_douala') && p.includes('operations_kribi'))
    assert.ok(p.indexOf('operations_douala') < p.indexOf('operations_kribi'), 'Douala avant Kribi')
    const t = (await api('delba', 'GET', `/api/dossiers/${d.body.id}/sous-etapes`)).body
    assert.deepEqual(t.filter((x: any) => x.etape === 'operations_douala').map((x: any) => x.cle).sort(), ['bad_terminal', 'facturation_terminal'])
  })
})
