/**
 * Cahier des modifications d'octobre : passage de relais au niveau des tâches, chronométrage
 * précis, SLA des tâches, paiement client, CRM, alertes Direction, nomenclature RVC / SI.
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { api, aSonTour, closeApp, dansLOrdre, demarrer, expectStatus, placerEtape, preparerPassage, unique, upload, userIds, type UserKey } from './helpers'

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
    assert.ok(!l.body.some((x: any) => x.cle.startsWith('soumission_sgs.')), 'étape Soumission SGS retirée')
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
      status: 'codage', responsableId: ids.odette, taches: { declaration: ids.delba },
    })
    expectStatus(avance, 200)
    // Pas de chronomètre avant le démarrage de l'étape
    assert.ok((await taches('codage')).every(x => !x.deadline), 'étape en attente de démarrage')
    expectStatus(await api('odette', 'PUT', `/api/dossiers/${dossierId}/sous-etapes/codage/etat_codage`, { statut: 'valide' }), 422)
    await demarrer(dossierId, 'odette')
    const cod = await taches('codage')
    assert.equal(nom(cod.find(x => x.cle === 'declaration').responsableId), 'delba')
    assert.equal(nom(cod.find(x => x.cle === 'etat_codage').responsableId), 'odette')
    // Seule la première tâche de l'étape tourne ; la déclaration attend l'état de codage
    assert.ok(cod.find(x => x.cle === 'etat_codage').deadline)
    assert.equal(cod.find(x => x.cle === 'declaration').deadline, null)
    // Une tâche inconnue est refusée
    const bad = await api('odette', 'PATCH', `/api/dossiers/${dossierId}/status`, { status: 'paiement', taches: { inexistante: ids.odette } })
    expectStatus(bad, 422)
  })
})

describe('Alerte Direction Générale', () => {
  it('un blocage signalé par un titulaire est notifié au DG', async () => {
    const ec = (await taches('codage')).find(x => x.cle === 'etat_codage')
    expectStatus(await api(nom(ec.responsableId), 'PUT', `/api/dossiers/${dossierId}/sous-etapes/codage/etat_codage`, { statut: 'rejete' }), 200)
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
    assert.ok(!t.some((x: any) => x.etape === 'validation'), 'étape Validation retirée')
    assert.deepEqual(t.filter((x: any) => x.etape === 'codage').map((x: any) => x.cle).sort(), ['declaration', 'etat_codage', 'liquidation'], 'liquidation à la fin du Codage')

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

describe('DI obligatoire : la facture fournisseur est débitée à la création du dossier', () => {
  const base = () => ({ client: unique('CLIENT DI'), compagnie: 'MSC', conteneur: 'MSCU4545454', marchandise: 'Divers', site: 'Douala', dateArrivee: new Date().toISOString() })

  it('sans DI ou sans montant : refusé ; DI existante : débit sur ce qui reste ; solde insuffisant : refusé', async () => {
    const sansDi = await api('yasmine', 'POST', '/api/dossiers', { ...base(), _brut: true })
    expectStatus(sansDi, 422)
    assert.equal(sansDi.body.error, 'DI_REQUISE')
    const di = await api('yasmine', 'POST', '/api/di', { numero: unique('DI-OBL'), client: 'CLIENT DI', montant: 1_000_000, dateEmission: new Date().toISOString() })
    const sansMontant = await api('yasmine', 'POST', '/api/dossiers', { ...base(), _brut: true, diId: di.body.id })
    expectStatus(sansMontant, 422)
    assert.equal(sansMontant.body.error, 'MONTANT_REQUIS')

    // 1er dossier : 600 000 débités ; 2e dossier sur la même DI : débite le reste (400 000)
    const d1 = await api('yasmine', 'POST', '/api/dossiers', { ...base(), diId: di.body.id, montantFacture: 600_000, referenceFacture: unique('PI') })
    expectStatus(d1, 201)
    assert.equal(d1.body.diId, di.body.id)
    assert.equal(Number((await api('yasmine', 'GET', `/api/di/${di.body.id}`)).body.soldeActuel), 400_000)
    const trop = await api('yasmine', 'POST', '/api/dossiers', { ...base(), diId: di.body.id, montantFacture: 500_000 })
    expectStatus(trop, 422)
    assert.equal(trop.body.error, 'SOLDE_DI_INSUFFISANT')
    const d2 = await api('yasmine', 'POST', '/api/dossiers', { ...base(), diId: di.body.id, montantFacture: 400_000 })
    expectStatus(d2, 201)
    const apres = await api('yasmine', 'GET', `/api/di/${di.body.id}`)
    assert.equal(Number(apres.body.soldeActuel), 0)
    assert.equal(apres.body.dossiers.length, 2)
    const mvts = apres.body.mouvements.filter((m: any) => m.type === 'debit')
    assert.deepEqual(mvts.map((m: any) => m.dossier?.numero).sort(), [d1.body.numero, d2.body.numero].sort(), 'chaque débit porte son dossier')
  })

  it('nouvelle DI ouverte avec le dossier ; un dossier ne débite que sa propre DI', async () => {
    const numero = unique('DI-NEW')
    const d = await api('yasmine', 'POST', '/api/dossiers', { ...base(), nouvelleDI: { numero, montant: 2_000_000 }, montantFacture: 750_000 })
    expectStatus(d, 201)
    const di = (await api('yasmine', 'GET', '/api/di?limit=100')).body.data.find((x: any) => x.numero === numero)
    assert.equal(Number(di.soldeActuel), 1_250_000)
    assert.equal(d.body.diId, di.id)
    const autre = await api('honore', 'POST', '/api/di', { numero: unique('DI-AUTRE'), client: 'CLIENT AUTRE', montant: 1_000_000, dateEmission: new Date().toISOString() })
    const mauvaise = await api('honore', 'POST', `/api/di/${autre.body.id}/mouvements`, { type: 'debit', montant: 1000, motif: 'Essai débit croisé', dossierId: d.body.id })
    expectStatus(mauvaise, 422)
    assert.equal(mauvaise.body.error, 'MAUVAISE_DI')
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
    await demarrer(id)

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

    // Remise de la facture : dernière tâche → le dossier est finalisé automatiquement
    const pasFini = await api('delba', 'GET', `/api/dossiers/${id}`)
    assert.equal(pasFini.body.finaliseLe, null)
    expectStatus(await api('honore', 'POST', `/api/dossiers/${id}/finaliser`, {}), 422)
    expectStatus(await api('honore', 'PUT', `/api/dossiers/${id}/sous-etapes/facturation/remise_facture`, { statut: 'valide' }), 200)
    const fini = await api('delba', 'GET', `/api/dossiers/${id}`)
    assert.ok(fini.body.finaliseLe, 'dossier finalisé une fois la facturation remplie')
    const actifs = await api('honore', 'GET', '/api/employe/mes-taches')
    assert.ok(!actifs.body.taches.some((t: any) => t.dossier.id === id), 'plus de tâche ouverte sur un dossier terminé')
    const n = await api('delba', 'GET', '/api/notifications?limit=30')
    assert.ok(n.body.data.some((x: any) => x.dossierId === id && x.titre === 'Dossier finalisé'))
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
      const r = await api(who, 'PATCH', `/api/dossiers/${id}/status`, { status: 'codage' })
      expectStatus(r, 422)
      assert.equal(r.body.error, 'SOUS_ETAPES_INCOMPLETES')
    }
    const saut = await api('delba', 'PATCH', `/api/dossiers/${id}/status`, { status: 'paiement' })
    expectStatus(saut, 422)
    assert.equal(saut.body.error, 'ETAPE_INVALIDE')

    await placerEtape(id, 'paiement')
    expectStatus(await api('delba', 'PATCH', `/api/dossiers/${id}/status`, { status: 'codage' }), 200)
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

describe('Deux phases : pré-dédouanement et dédouanement', () => {
  it('chaque étape démarre par un bouton, avec un motif en cas d\'imprévu communiqué au client', async () => {
    const d = await api('yasmine', 'POST', '/api/dossiers', {
      client: unique('CLIENT PHASES'), compagnie: 'MSC', conteneur: 'MSCU5050505', marchandise: 'Divers', site: 'Douala', dateArrivee: new Date().toISOString(),
    })
    const id = d.body.id
    let f = await api('delba', 'GET', `/api/dossiers/${id}`)
    assert.deepEqual(f.body.phases.map((p: any) => [p.cle, p.etat]), [['pre_dedouanement', 'en_cours'], ['dedouanement', 'a_venir']])

    // Fin du pré-dédouanement : passage au codage → la phase Dédouanement attend son démarrage
    await preparerPassage(id, 'reception')
    expectStatus(await api('delba', 'PATCH', `/api/dossiers/${id}/status`, { status: 'codage' }), 200)
    f = await api('delba', 'GET', `/api/dossiers/${id}`)
    assert.deepEqual(f.body.phases.map((p: any) => p.etat), ['terminee', 'en_attente'])
    const ns = await api('delba', 'GET', `/api/dossiers/${id}/next-step`)
    assert.equal(ns.body.peutDemarrer, true)
    expectStatus(await api('delba', 'POST', `/api/dossiers/${id}/demarrer`, { motif: 'autre' }), 422, 'commentaire requis pour « autre »')
    expectStatus(await api('raphael', 'POST', `/api/dossiers/${id}/demarrer`, {}), 403)

    const dem = await api('delba', 'POST', `/api/dossiers/${id}/demarrer`, { motif: 'administration', commentaire: 'Serveur ASYCUDA lent ce matin' })
    expectStatus(dem, 200)
    f = await api('delba', 'GET', `/api/dossiers/${id}`)
    assert.deepEqual(f.body.phases.map((p: any) => p.etat), ['terminee', 'en_cours'])
    assert.equal(f.body.imprevus[0].motif, 'administration')
    const t = (await api('delba', 'GET', `/api/dossiers/${id}/sous-etapes`)).body.find((x: any) => x.etape === 'codage' && x.cle === 'etat_codage')
    assert.ok(t.deadline, 'le chronomètre de la première tâche démarre')
    expectStatus(await api('delba', 'POST', `/api/dossiers/${id}/demarrer`, {}), 422, 'déjà démarrée')

    // Imprévu en cours d'étape, communiqué au client
    expectStatus(await api('odette', 'POST', `/api/dossiers/${id}/imprevus`, { motif: 'documents_client', commentaire: 'Facture commerciale signée manquante' }), 201)
    const lien = await api('yasmine', 'POST', `/api/dossiers/${id}/suivi-client`, {})
    const p = await api(null, 'GET', `/api/public/suivi/${lien.body.token}`)
    assert.deepEqual(p.body.phases.map((x: any) => x.cle), ['pre_dedouanement', 'dedouanement'])
    const messages = p.body.actualites.map((a: any) => a.message).join(' | ')
    assert.match(messages, /documents complémentaires/)
    assert.match(messages, /phase de DÉDOUANEMENT/)
    const n = await api('delba', 'GET', '/api/notifications?limit=30')
    assert.ok(n.body.data.some((x: any) => x.dossierId === id && x.titre === 'Imprévu signalé sur un dossier'))
  })
})

describe('Sauvegardes hebdomadaires', () => {
  it('sauvegarde manuelle (Direction), cron protégé, téléchargement, échecs signalés', async () => {
    expectStatus(await api('yasmine', 'POST', '/api/sauvegardes', {}), 403)
    const s = await api('delba', 'POST', '/api/sauvegardes', {})
    expectStatus(s, 201)
    assert.ok(s.body.tailleOctets > 0)
    assert.ok(s.body.lignes.users > 0 && s.body.lignes.dossiers > 0)
    assert.equal(s.body.lignes.refresh_tokens, undefined, 'les sessions ne sont pas sauvegardées')
    const l = await api('soudi', 'GET', '/api/sauvegardes')
    expectStatus(l, 200)
    assert.equal(l.body.sauvegardes[0].id, s.body.id)
    assert.equal(l.body.sauvegardes[0].contenu, undefined, 'la liste ne transporte pas les fichiers')
    const f = await api('delba', 'GET', `/api/sauvegardes/${s.body.id}/fichier`)
    expectStatus(f, 200)
    assert.match(String(f.headers['content-type']), /gzip/)
    expectStatus(await api(null, 'GET', '/api/sauvegardes/cron'), 401)
    const n = await api('delba', 'GET', '/api/notifications?limit=20')
    assert.ok(n.body.data.some((x: any) => x.titre === 'Sauvegarde manuelle effectuée'))
  })
})

describe('Liquidation de la déclaration (douane)', () => {
  it('fin du Codage : responsable la douane, montant liquidé repris sur le dossier', async () => {
    const d = await api('yasmine', 'POST', '/api/dossiers', {
      client: unique('CLIENT LIQ'), compagnie: 'MSC', conteneur: 'MSCU6060606', marchandise: 'Divers', site: 'Douala', dateArrivee: new Date().toISOString(),
    })
    const id = d.body.id
    const t = (await api('delba', 'GET', `/api/dossiers/${id}/sous-etapes`)).body.find((x: any) => x.etape === 'codage' && x.cle === 'liquidation')
    assert.ok(t, 'tâche de liquidation créée')
    assert.equal(nom(t.responsableId), 'odette', 'suivie par la validation')
    const sla = await api('delba', 'GET', '/api/parametres/sla-sous-etapes')
    assert.equal(sla.body.find((x: any) => x.cle === 'codage.liquidation').heures, 72, '3 jours')
    await aSonTour(id, 'codage', 'liquidation')
    const r = await api('odette', 'PUT', `/api/dossiers/${id}/sous-etapes/codage/liquidation`, {
      statut: 'valide', metadata: { liq_responsable: 'Douane — Inspecteur vérificateur', liq_inspecteur: 'M. ESSOMBA', liq_numero: 'L-2026-0045', liq_montant: '1 840 000' },
    })
    expectStatus(r, 200)
    const apres = await api('delba', 'GET', `/api/dossiers/${id}`)
    assert.equal(Number(apres.body.montantTaxes), 1_840_000)
    const audit = await api('delba', 'GET', `/api/dossiers/${id}/audit`)
    assert.ok(JSON.stringify(audit.body).includes('inspecteur M. ESSOMBA'))
  })
})

describe('Messagerie : chaque message reçu est notifié', () => {
  it('tous les participants sont notifiés ; ouvrir la conversation marque les messages lus', async () => {
    const c = await api('yasmine', 'POST', '/api/messagerie/conversations', { titre: unique('Conv'), type: 'general', participantIds: [ids.odette, ids.honore] })
    expectStatus(c, [200, 201])
    const conv = c.body.id
    expectStatus(await api('yasmine', 'POST', `/api/messagerie/conversations/${conv}/messages`, { contenu: 'Bonjour, le BL est arrivé' }), [200, 201])
    for (const who of ['odette', 'honore'] as const) {
      const n = await api(who, 'GET', '/api/notifications?limit=10')
      assert.ok(n.body.data.some((x: any) => x.type === 'message' && !x.lu && x.titre.startsWith('Nouveau message de')), `${who} notifié`)
    }
    const y = await api('yasmine', 'GET', '/api/notifications?limit=10')
    assert.ok(!y.body.data.some((x: any) => x.type === 'message' && x.actionUrl?.includes(conv)), 'pas de notification pour l\'auteur')
    const l = await api('odette', 'PATCH', '/api/notifications/messages-lus', { conversationId: conv })
    assert.equal(l.body.lues, 1)
  })
})

describe('Gestion des DI : dossiers rattachés', () => {
  it('rattacher un dossier débite sa facture sur le solde restant ; intégrité des débits', async () => {
    const di = await api('honore', 'POST', '/api/di', { numero: unique('DI-LIEN'), client: 'CLIENT LIEN', montant: 2_000_000, dateEmission: new Date().toISOString() })
    expectStatus(di, 201)
    const { prisma } = await import('../src/config/prisma')
    const solde = async () => Number((await prisma.declarationImportation.findUnique({ where: { id: di.body.id } }))!.soldeActuel)
    // Ancien dossier (créé avant la règle) : sans DI ni mouvement
    const ancien = async (n: string) => {
      const d = (await api('yasmine', 'POST', '/api/dossiers', {
        client: unique(n), compagnie: 'MSC', conteneur: 'MSCU7070707', marchandise: 'Divers', site: 'Douala', dateArrivee: new Date().toISOString(),
      })).body
      await prisma.mouvementDI.deleteMany({ where: { dossierId: d.id } })
      return prisma.dossier.update({ where: { id: d.id }, data: { diId: null } })
    }
    const a = (await api('yasmine', 'POST', '/api/dossiers', {
      client: unique('CL-A'), compagnie: 'MSC', conteneur: 'MSCU7070707', marchandise: 'Divers', site: 'Douala', dateArrivee: new Date().toISOString(),
      diId: di.body.id, montantFacture: 100_000,
    })).body
    assert.equal(await solde(), 1_900_000, 'dossier créé sur la DI : facture débitée')

    // Rattachement sans montant : refusé, rien ne change
    const b = await ancien('CL-B')
    const sansMontant = await api('honore', 'POST', `/api/di/${di.body.id}/lier-dossier`, { dossierId: b.id })
    expectStatus(sansMontant, 422)
    assert.equal(sansMontant.body.error, 'MONTANT_REQUIS')
    assert.equal((await prisma.dossier.findUnique({ where: { id: b.id } }))!.diId, null)
    // Avec le montant : débité sur ce qui reste de la DI
    const lie = await api('honore', 'POST', `/api/di/${di.body.id}/lier-dossier`, { dossierId: b.id, montantFacture: 300_000, referenceFacture: 'FF-LIEN-B' })
    expectStatus(lie, 200)
    assert.equal(lie.body.montantDebite, 300_000)
    assert.equal(lie.body.soldeRestant, 1_600_000)
    assert.equal(await solde(), 1_600_000)
    const mvB = await prisma.mouvementDI.findMany({ where: { dossierId: b.id } })
    assert.equal(mvB.length, 1)
    assert.equal(mvB[0].diId, di.body.id, 'débit uniquement sur sa DI')
    // Rattacher à nouveau : aucun second débit
    expectStatus(await api('honore', 'POST', `/api/di/${di.body.id}/lier-dossier`, { dossierId: b.id, montantFacture: 300_000 }), 200)
    assert.equal(await solde(), 1_600_000)

    // Facture fournisseur déjà saisie sur le dossier : débitée automatiquement, une seule fois
    const c = await ancien('CL-C')
    const ff = await prisma.sousEtapeDossier.upsert({
      where: { dossierId_etape_cle: { dossierId: c.id, etape: 'soumission_sgs', cle: 'ff_soumission' } },
      create: { dossierId: c.id, etape: 'soumission_sgs', cle: 'ff_soumission', metadata: { ff_montant_facture: '250 000', ff_reference_facture: 'PI-C-1' } },
      update: { metadata: { ff_montant_facture: '250 000', ff_reference_facture: 'PI-C-1' } },
    })
    const auto = await api('honore', 'POST', `/api/di/${di.body.id}/lier-dossier`, { dossierId: c.id })
    expectStatus(auto, 200)
    assert.equal(auto.body.montantDebite, 250_000)
    assert.equal(await solde(), 1_350_000)
    const metaFF = (await prisma.sousEtapeDossier.findUnique({ where: { id: ff.id } }))!.metadata as any
    assert.equal(metaFF.ff_montant_debite, 250_000, 'la facture est marquée débitée')
    const { appliquerFactureFournisseur } = await import('../src/services/di')
    assert.equal(await appliquerFactureFournisseur(ff.id, (await prisma.user.findFirst({ where: { email: { contains: 'honore' } } }))!.id), null, 'pas de second débit')
    assert.equal(await solde(), 1_350_000)

    // Solde insuffisant : refus, le dossier n'est pas rattaché
    const d = await ancien('CL-D')
    const trop = await api('honore', 'POST', `/api/di/${di.body.id}/lier-dossier`, { dossierId: d.id, montantFacture: 5_000_000 })
    expectStatus(trop, 422)
    assert.equal(trop.body.error, 'SOLDE_DI_INSUFFISANT')
    assert.equal((await prisma.dossier.findUnique({ where: { id: d.id } }))!.diId, null)
    assert.equal(await solde(), 1_350_000)

    const repli = await api('honore', 'POST', '/api/di', { numero: unique('DI-REPLI'), client: 'CLIENT REPLI', montant: 1_000_000, dateEmission: new Date().toISOString() })
    const autre0 = () => repli.body.id as string
    const liste = await api('honore', 'GET', '/api/di?limit=50')
    const ligne = liste.body.data.find((x: any) => x.id === di.body.id)
    assert.deepEqual(ligne.dossiers.map((x: any) => x.numero).sort(), [a.numero, b.numero, c.numero].sort(), 'la liste renvoie les dossiers rattachés')
    assert.equal(ligne._count.dossiers, 3)
    const detail = await api('honore', 'GET', `/api/di/${di.body.id}`)
    assert.equal(detail.body.dossiers.length, 3)

    // Montant net débité par dossier, visible dans le détail
    assert.equal(detail.body.dossiers.find((x: any) => x.id === b.id).montantDebite, 300_000)

    // Machine arrière : dissocier annule le débit (recrédit tracé) et libère le dossier
    const annule = await api('honore', 'POST', `/api/di/${di.body.id}/delier-dossier`, { dossierId: b.id, motif: 'Erreur de DI' })
    expectStatus(annule, 200)
    assert.equal(annule.body.montantRecredite, 300_000)
    assert.equal(annule.body.soldeRestant, 1_650_000)
    assert.equal(await solde(), 1_650_000)
    assert.equal((await prisma.dossier.findUnique({ where: { id: b.id } }))!.diId, null)
    const credit = await prisma.mouvementDI.findFirst({ where: { dossierId: b.id, type: 'credit' } })
    assert.equal(Number(credit!.montant), 300_000)
    assert.ok(credit!.motif.includes('Erreur de DI'))
    assert.ok(JSON.stringify((await api('delba', 'GET', `/api/dossiers/${b.id}/audit`)).body).includes('recrédités'))
    // Le dossier peut être rattaché de nouveau (nouveau débit, même référence acceptée après annulation)
    const relie = await api('honore', 'POST', `/api/di/${di.body.id}/lier-dossier`, { dossierId: b.id, montantFacture: 200_000, referenceFacture: 'FF-LIEN-B' })
    expectStatus(relie, 200)
    assert.equal(await solde(), 1_450_000)
    // Facture fournisseur déjà saisie : annulée puis re-débitée automatiquement au nouveau rattachement
    expectStatus(await api('honore', 'POST', `/api/di/${di.body.id}/delier-dossier`, { dossierId: c.id }), 200)
    assert.equal(await solde(), 1_700_000)
    assert.equal(((await prisma.sousEtapeDossier.findUnique({ where: { id: ff.id } }))!.metadata as any).ff_montant_debite, undefined)
    expectStatus(await api('honore', 'POST', `/api/di/${autre0()}/lier-dossier`, { dossierId: c.id }), 200)
    assert.equal(await solde(), 1_700_000, 'débité sur sa nouvelle DI, pas sur l\'ancienne')

    // Un dossier débité ne change pas de DI sans être dissocié d'abord
    const autre = await api('honore', 'POST', '/api/di', { numero: unique('DI-AUTRE'), client: 'CLIENT AUTRE', montant: 1_000_000, dateEmission: new Date().toISOString() })
    expectStatus(await api('honore', 'POST', `/api/di/${autre.body.id}/lier-dossier`, { dossierId: a.id, montantFacture: 10 }), 422, 'un dossier débité ne change pas de DI')

    // Dossier sans mouvement : dissociation possible et tracée
    const e = await ancien('CL-E')
    await prisma.dossier.update({ where: { id: e.id }, data: { diId: di.body.id } })
    expectStatus(await api('honore', 'POST', `/api/di/${di.body.id}/delier-dossier`, { dossierId: e.id }), 200)
    const audit = await api('delba', 'GET', `/api/dossiers/${e.id}/audit`)
    assert.ok(JSON.stringify(audit.body).includes('dissocié de la DI'))
    // Suppression d'une DI consommée refusée
    expectStatus(await api('delba', 'DELETE', `/api/di/${di.body.id}`), 422)
  })
})

describe('DI : machine arrière à la dissociation', () => {
  it('dissocier un dossier remet la DI exactement dans son état initial (solde, ventilation, dossiers)', async () => {
    const di = await api('honore', 'POST', '/api/di', { numero: unique('DI-ARR'), client: 'CLIENT ARR', montant: 1_000_000, dateEmission: new Date().toISOString() })
    expectStatus(di, 201)
    const dos = await api('yasmine', 'POST', '/api/dossiers', {
      client: unique('CL-ARR'), compagnie: 'MSC', conteneur: 'MSCU7070707', marchandise: 'Divers', site: 'Douala', dateArrivee: new Date().toISOString(),
      diId: di.body.id, montantFacture: 400_000, referenceFacture: 'FF-ARR-1',
    })
    expectStatus(dos, 201)
    expectStatus(await api('honore', 'POST', `/api/di/${di.body.id}/mouvements`, { type: 'debit', montant: 150_000, motif: 'Droits de douane', categorie: 'droits_douane', dossierId: dos.body.id }), 201)
    const avant = await api('honore', 'GET', `/api/di/${di.body.id}`)
    assert.equal(avant.body.soldeNum, 450_000)
    assert.equal(avant.body.dossiers[0].montantDebite, 550_000)

    const r = await api('honore', 'POST', `/api/di/${di.body.id}/delier-dossier`, { dossierId: dos.body.id })
    expectStatus(r, 200)
    assert.equal(r.body.montantRecredite, 550_000)
    const apres = await api('honore', 'GET', `/api/di/${di.body.id}`)
    assert.equal(apres.body.soldeNum, 1_000_000, 'solde intégralement restauré')
    assert.equal(apres.body.utiliseNum, 0)
    assert.equal(apres.body.dossiers.length, 0, 'le dossier ne figure plus sur la DI')
    const tdb = await api('honore', 'GET', `/api/di/${di.body.id}/tableau-de-bord`)
    expectStatus(tdb, 200)
    assert.deepEqual(tdb.body.ventilationCategorie, [], 'plus aucune consommation ventilée')
    const doss = await api('delba', 'GET', `/api/dossiers/${dos.body.id}`)
    assert.equal(doss.body.diId, null)
    // Rattachement à nouveau possible, avec la même facture
    expectStatus(await api('honore', 'POST', `/api/di/${di.body.id}/lier-dossier`, { dossierId: dos.body.id, montantFacture: 400_000, referenceFacture: 'FF-ARR-1' }), 200)
    assert.equal((await api('honore', 'GET', `/api/di/${di.body.id}`)).body.soldeNum, 600_000)
  })
})

describe('Notifications : Push, priorités, prise en compte, relances, retards', () => {
  it('abonnement Push, clé publique, clé privée jamais exposée', async () => {
    const cle = await api('yaya', 'GET', '/api/push/cle')
    expectStatus(cle, 200)
    assert.ok(cle.body.publicKey.length > 40)
    const p = await api('yaya', 'GET', '/api/parametres')
    assert.equal(p.body.vapid, undefined, 'clé privée masquée')
    expectStatus(await api('delba', 'GET', '/api/parametres/vapid'), 404)
    expectStatus(await api('delba', 'PATCH', '/api/parametres/vapid', { valeur: {} }), 403)
    const ab = await api('yaya', 'POST', '/api/push/abonnements', { endpoint: 'https://fcm.googleapis.com/fcm/send/test-' + unique('ep'), keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) }, navigateur: 'Chrome test' })
    expectStatus(ab, 201)
    const etat = await api('yaya', 'GET', '/api/push/etat')
    assert.ok(etat.body.appareils >= 1)
  })

  it('priorité, auteur, prise en compte et relances progressives', async () => {
    const { prisma } = await import('../src/config/prisma')
    const n = await prisma.notification.create({ data: { userId: ids.yaya, type: 'alerte', titre: 'Blocage test relance', message: 'x' } })
    assert.equal(n.priorite, 'critique')
    const { relancerNotifications, signalerRetards } = await import('../src/services/relances')
    // 31 min plus tard : première relance ; juste après : pas de nouvelle relance (intervalle doublé)
    await relancerNotifications(new Date(Date.now() + 31 * 60_000))
    let r = await prisma.notification.findUnique({ where: { id: n.id } })
    assert.equal(r!.relances, 1)
    await relancerNotifications(new Date(Date.now() + 40 * 60_000))
    r = await prisma.notification.findUnique({ where: { id: n.id } })
    assert.equal(r!.relances, 1, 'relance progressive : 30 min puis 60 min')
    expectStatus(await api('yaya', 'POST', `/api/notifications/${n.id}/acquitter`, {}), 200)
    await relancerNotifications(new Date(Date.now() + 10 * 3600_000))
    r = await prisma.notification.findUnique({ where: { id: n.id } })
    assert.equal(r!.relances, 1, 'plus de relance après prise en compte')
    assert.ok(r!.acquitteLe && r!.lu)
    const urg = await api('yaya', 'GET', '/api/notifications?filtre=urgentes')
    expectStatus(urg, 200)
    assert.equal(typeof urg.body.urgentes, 'number')

    // Retard : une alerte unique au titulaire et au responsable
    const d = await api('yasmine', 'POST', '/api/dossiers', { client: unique('CL RETARD'), compagnie: 'MSC', conteneur: 'MSCU8080808', marchandise: 'Divers', site: 'Douala', dateArrivee: new Date().toISOString() })
    const bl = await prisma.sousEtapeDossier.findFirst({ where: { dossierId: d.body.id, cle: 'bl' } })
    await prisma.sousEtapeDossier.update({ where: { id: bl!.id }, data: { deadline: new Date(Date.now() - 3600_000) } })
    assert.ok(await signalerRetards() >= 1)
    assert.equal(await signalerRetards(), 0, 'pas de doublon')
    const alertes = await prisma.notification.findMany({ where: { dossierId: d.body.id, titre: { startsWith: '⏱ Retard' } } })
    assert.ok(alertes.length >= 1 && alertes.every(a => a.priorite === 'critique'))
  })
})

describe('Gestion des sorties : bons de la compagnie (M. Wandala)', () => {
  it('le suivi liste le bon de la compagnie, son numéro, son état et son document', async () => {
    const d = await api('yasmine', 'POST', '/api/dossiers', { client: unique('CL BON'), compagnie: 'MSC', conteneur: 'MSCU9090909', marchandise: 'Divers', site: 'Douala', dateArrivee: new Date().toISOString() })
    await api('delba', 'GET', `/api/dossiers/${d.body.id}/sous-etapes`)
    await aSonTour(d.body.id, 'bon_compagnie', 'facturation_compagnie')
    expectStatus(await api('wandala', 'PUT', `/api/dossiers/${d.body.id}/sous-etapes/bon_compagnie/facturation_compagnie`, { statut: 'valide', metadata: { bc_bon_numero: 'MSC-BON-77', bc_bon_date: '2026-11-20' } }), 200)
    const r = await api('wandala', 'GET', '/api/dossiers/suivi/bons-compagnie')
    expectStatus(r, 200)
    const ligne = r.body.find((x: any) => x.dossier.id === d.body.id)
    assert.ok(ligne, 'dossier présent dans le suivi')
    const bon = ligne.documents.find((x: any) => x.cle === 'facturation_compagnie')
    assert.equal(bon.numero, 'MSC-BON-77')
    assert.equal(bon.statut, 'valide')
  })
})
