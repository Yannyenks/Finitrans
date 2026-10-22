/**
 * Cahier des modifications d'octobre : passage de relais au niveau des tâches, chronométrage
 * précis, SLA des tâches, paiement client, CRM, alertes Direction, nomenclature RVC / SI.
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { api, aSonTour, closeApp, dansLOrdre, expectStatus, placerEtape, preparerPassage, unique, upload, userIds, type UserKey } from './helpers'

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
  it('à la création, seule la première tâche (BL) démarre ; les suivantes attendent leur tour sans chronomètre', async () => {
    const t = await dansLOrdre('reception', await taches('reception'))
    assert.ok(t.length >= 5)
    assert.equal(t[0].cle, 'bl')
    assert.equal(t[0].statut, 'en_cours', 'plus besoin de « Démarrer »')
    assert.ok(t[0].startedAt && t[0].deadline && new Date(t[0].deadline) > new Date(t[0].startedAt))
    for (const x of t.slice(1)) {
      assert.equal(x.statut, 'todo', `${x.cle} attend la tâche précédente`)
      assert.equal(x.deadline, null, `${x.cle} : pas de compte à rebours avant son tour`)
    }
    // M. Honoré (paiement client, 4e tâche) est prévenu, sans compte à rebours tant que ce n'est pas son tour
    const n = await api('honore', 'GET', '/api/notifications?limit=20')
    const notif = n.body.data.find((x: any) => x.dossierId === dossierId && x.titre === 'Nouveau dossier à traiter')
    assert.ok(notif, 'titulaire prévenu')
    assert.equal(notif.echeance, null)
  })

  it('on ne peut pas terminer une tâche avant la précédente', async () => {
    const pr = (await taches('reception')).find(x => x.cle === 'saisie_pr')
    const r = await api(nom(pr.responsableId), 'PUT', `/api/dossiers/${dossierId}/sous-etapes/reception/saisie_pr`, { statut: 'valide' })
    expectStatus(r, 422)
    assert.equal(r.body.error, 'ORDRE_NON_RESPECTE')
    const tot = await api('odette', 'PUT', `/api/dossiers/${dossierId}/sous-etapes/codage/declaration`, { statut: 'en_cours' })
    expectStatus(tot, 422, 'étape pas encore atteinte')
  })

  it('une tâche terminée garde son début et sa fin ; la suivante démarre à ce moment-là', async () => {
    const bl = (await taches('reception')).find(x => x.cle === 'bl')
    const r = await api(nom(bl.responsableId), 'PUT', `/api/dossiers/${dossierId}/sous-etapes/reception/bl`, { statut: 'valide' })
    expectStatus(r, 200)
    assert.ok(r.body.startedAt && r.body.completedAt)
    assert.ok(new Date(r.body.completedAt).getTime() >= new Date(r.body.startedAt).getTime())
    const fp = (await taches('reception')).find(x => x.cle === 'facture_proforma')
    assert.equal(fp.statut, 'en_cours')
    assert.ok(new Date(fp.startedAt).getTime() >= new Date(r.body.completedAt).getTime() - 1000, 'le chronomètre part de la fin de la tâche précédente')
    assert.ok(fp.deadline)
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
    await aSonTour(dossierId, 'reception', 'paiement_client')
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
    for (const t of await dansLOrdre('reception', await taches('reception'))) {
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
    // Seule la première tâche de l'étape tourne ; l'obtention du RVC attend la soumission
    assert.ok(sgs.find(x => x.cle === 'ff_soumission').deadline)
    assert.equal(sgs.find(x => x.cle === 'pvc').deadline, null)
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
    await aSonTour(r.body.id, 'bon_compagnie', 'facturation_compagnie')
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
    await aSonTour(id, 'soumission_sgs', 'ff_soumission')
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
    await aSonTour(id, 'soumission_sgs', 'ff_soumission')
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

describe('Bon compagnie (Douala) ; étape Opérations Douala retirée', () => {
  it('Kribi : Bon compagnie (Douala) puis Opérations Kribi ; Douala : Bon compagnie (Douala) puis Clôture', async () => {
    const k = await api('yasmine', 'POST', '/api/dossiers', {
      client: unique('CLIENT KRIBI'), compagnie: 'MSC', conteneur: 'MSCU6666666', marchandise: 'Divers', site: 'Kribi', dateArrivee: new Date().toISOString(),
    })
    const p: string[] = (await api('delba', 'GET', `/api/dossiers/${k.body.id}`)).body.parcoursEtapes
    assert.ok(!p.includes('operations_douala'))
    assert.equal(p[p.indexOf('bon_compagnie') + 1], 'operations_kribi')
    const t = (await api('delba', 'GET', `/api/dossiers/${k.body.id}/sous-etapes`)).body
    assert.ok(!t.some((x: any) => x.etape === 'operations_douala'))
    const ns = await api('delba', 'GET', `/api/dossiers/${k.body.id}/next-step`)
    expectStatus(ns, 200)
    const d = await api('yasmine', 'POST', '/api/dossiers', {
      client: unique('CLIENT DOUALA'), compagnie: 'MSC', conteneur: 'MSCU6666667', marchandise: 'Divers', site: 'Douala', dateArrivee: new Date().toISOString(),
    })
    const pd: string[] = (await api('delba', 'GET', `/api/dossiers/${d.body.id}`)).body.parcoursEtapes
    assert.equal(pd[pd.indexOf('bon_compagnie') + 1], 'cloture')
  })

  it('un dossier resté sur l\'étape retirée reprend à l\'étape suivante (et non à la réception)', async () => {
    const { nextStage } = await import('../src/services/workflow')
    assert.equal(nextStage('operations_douala', 'Kribi'), 'operations_kribi')
    assert.equal(nextStage('operations_douala', 'Douala'), 'cloture')
  })
})

describe('Conteneurs de tailles différentes', () => {
  it('chaque conteneur a sa taille ; le dossier en garde la synthèse', async () => {
    const r = await api('yasmine', 'POST', '/api/dossiers', {
      client: unique('CLIENT MULTI TC'), compagnie: 'MSC', marchandise: 'Divers', site: 'Douala', dateArrivee: new Date().toISOString(),
      conteneurs: [{ numero: 'mscu1000001', taille: "40' HC" }, { numero: 'MSCU1000002', taille: "20' Dry" }, { numero: 'MSCU1000003', taille: "40' HC" }],
    })
    expectStatus(r, 201)
    assert.equal(r.body.nombreConteneurs, 3)
    assert.equal(r.body.conteneur, 'MSCU1000001, MSCU1000002, MSCU1000003')
    assert.equal(r.body.tailleConteneur, "2 × 40' HC · 1 × 20' Dry")
    assert.equal(r.body.conteneurs[1].taille, "20' Dry")
    const m = await api('yasmine', 'PATCH', `/api/dossiers/${r.body.id}`, { conteneurs: [{ numero: 'MSCU1000001', taille: "45' HC" }] })
    expectStatus(m, 200)
    assert.equal(m.body.nombreConteneurs, 1)
    assert.equal(m.body.tailleConteneur, "1 × 45' HC")
    expectStatus(await api('yasmine', 'POST', '/api/dossiers', {
      client: unique('CLIENT SANS TC'), compagnie: 'MSC', marchandise: 'Divers', site: 'Douala', dateArrivee: new Date().toISOString(),
    }), 422)
  })
})

describe('Logistique : TC vide retourné', () => {
  it('le retour à vide exige une justification, conservée sur le transport', async () => {
    const t = await api('delba', 'POST', '/api/logistique/transports', {
      conteneur: 'MSCU4040404', destination: 'Kribi', dateEnlevement: new Date().toISOString(),
    })
    expectStatus(t, 201)
    expectStatus(await api('delba', 'PATCH', `/api/logistique/transports/${t.body.id}`, { statut: 'livre' }), 200)
    const sans = await api('delba', 'PATCH', `/api/logistique/transports/${t.body.id}`, { statut: 'retour_vide' })
    expectStatus(sans, 422)
    assert.equal(sans.body.error, 'JUSTIFICATION_REQUISE')
    const ok = await api('delba', 'PATCH', `/api/logistique/transports/${t.body.id}`, { statut: 'retour_vide', justificationRetourVide: 'Marchandise dépotée chez le client' })
    expectStatus(ok, 200)
    assert.equal(ok.body.justificationRetourVide, 'Marchandise dépotée chez le client')
    assert.ok(ok.body.dateRetourVide)
  })
})

describe('Devises : taux de change', () => {
  it('les taux sont définis par la Direction', async () => {
    expectStatus(await api('honore', 'PATCH', '/api/parametres/taux_change', { valeur: { USD: 600, EUR: 655.957 } }), 403)
    expectStatus(await api('delba', 'PATCH', '/api/parametres/taux_change', { valeur: { USD: 600, EUR: 655.957 } }), 200)
    const p = await api('yaya', 'GET', '/api/parametres')
    assert.equal(p.body.taux_change.USD, 600)
  })
})

describe('Suppression définitive d\'un compte', () => {
  it('les dossiers en cours passent au successeur, l\'historique est conservé, le compte disparaît', async () => {
    const email = `${unique('suppr').toLowerCase()}@finitrans.cm`
    const cree = await api('delba', 'POST', '/api/employes', { email, password: 'finitrans2025', nom: 'Mme TEMPORAIRE', site: 'Douala', profil: 'administration' })
    expectStatus(cree, 201)
    const id = cree.body.id
    const d = await api(email as UserKey, 'POST', '/api/dossiers', {
      client: unique('CLIENT SUPPR'), compagnie: 'MSC', conteneur: 'MSCU5555555', marchandise: 'Divers', site: 'Douala', dateArrivee: new Date().toISOString(),
    })
    expectStatus(d, 201)
    const { prisma } = await import('../src/config/prisma')
    await prisma.dossier.update({ where: { id: d.body.id }, data: { responsableId: id } })

    expectStatus(await api('yasmine', 'POST', `/api/employes/${id}/supprimer`, { successeurId: ids.yasmine }), 403)
    expectStatus(await api('delba', 'POST', `/api/employes/${ids.delba}/supprimer`, {}), 400)

    const r = await api('delba', 'POST', `/api/employes/${id}/supprimer`, { successeurId: ids.yasmine })
    expectStatus(r, 200)
    assert.ok(r.body.transmis >= 1)

    expectStatus(await api('delba', 'GET', `/api/employes/${id}`), 404)
    assert.equal((await prisma.dossier.findUnique({ where: { id: d.body.id } }))!.responsableId, ids.yasmine, 'dossier en cours repris par le successeur')
    const audit = await api('delba', 'GET', `/api/dossiers/${d.body.id}/audit`)
    assert.ok(JSON.stringify(audit.body).includes('[Mme TEMPORAIRE]'), 'historique conservé avec le nom du compte supprimé')
    const liste = await api('delba', 'GET', '/api/employes?limit=200')
    assert.ok(!liste.body.data.some((e: any) => e.id === id || e.email.includes('archive')), 'ni le compte supprimé ni le compte d\'archive ne sont listés')
    const login = await api(null, 'POST', '/api/auth/login', { email, password: 'finitrans2025' })
    assert.equal(login.status, 401)
  })
})

describe('Suivi client par lien partagé', () => {
  it('lien secret, page publique sans compte, messages au client, désactivation', async () => {
    const d = await api('yasmine', 'POST', '/api/dossiers', {
      client: unique('CLIENT SUIVI'), compagnie: 'MSC', marchandise: 'Pièces', site: 'Kribi', dateArrivee: new Date().toISOString(),
      conteneurs: [{ numero: 'MSCU2020202', taille: "20' Dry" }],
    })
    const id = d.body.id
    expectStatus(await api('raphael', 'POST', `/api/dossiers/${id}/suivi-client`, {}), 403)
    const l = await api('yasmine', 'POST', `/api/dossiers/${id}/suivi-client`, {})
    expectStatus(l, 200)
    const token = l.body.token
    assert.ok(token.length >= 30)
    expectStatus(await api('yasmine', 'POST', `/api/dossiers/${id}/suivi-client/actualites`, { message: 'Votre conteneur est arrivé au port.', illustration: 'navire' }), 201)

    const p = await api(null, 'GET', `/api/public/suivi/${token}`)
    expectStatus(p, 200)
    assert.equal(p.body.numero, d.body.numero)
    assert.equal(p.body.etapes[0].etat, 'courant')
    assert.equal(p.body.conteneurs[0].taille, "20' Dry")
    assert.equal(p.body.actualites[0].illustration, 'navire')
    assert.equal(p.body.montantTaxes, undefined, 'aucune donnée interne exposée')
    assert.equal(p.body.responsableId, undefined)

    expectStatus(await api('yasmine', 'DELETE', `/api/dossiers/${id}/suivi-client`), 204)
    expectStatus(await api(null, 'GET', `/api/public/suivi/${token}`), 404)
  })
})

describe('Gate pass : heure de sortie', () => {
  it('la date et l\'heure de sortie sont enregistrées sur le ticket', async () => {
    const k = await api('yasmine', 'POST', '/api/dossiers', {
      client: unique('CLIENT GP HEURE'), compagnie: 'MSC', conteneur: 'MSCU3030303', marchandise: 'Divers', site: 'Kribi', dateArrivee: new Date().toISOString(),
    })
    const t = (await api('delba', 'GET', `/api/dossiers/${k.body.id}/sous-etapes`)).body.find((x: any) => x.cle === 'gate_pass')
    await aSonTour(k.body.id, 'operations_kribi', 'gate_pass')
    const r = await api('delba', 'PUT', `/api/dossiers/${k.body.id}/sous-etapes/operations_kribi/gate_pass`, {
      statut: 'valide', metadata: { immatriculation: 'LT 111 AA', gp_chauffeur: 'NJOYA Paul', gp_telephone: '677000111', gp_destination: 'Douala', gp_date_sortie: '2026-10-22', gp_heure_sortie: '14:30' },
    })
    expectStatus(r, 200)
    assert.ok(t)
    const gps = await api('delba', 'GET', `/api/dossiers/${k.body.id}/gate-passes`)
    assert.equal(new Date(gps.body[0].dateSortie).toISOString(), '2026-10-22T13:30:00.000Z', '14 h 30 heure du Cameroun')
  })
})
