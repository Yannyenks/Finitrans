/**
 * « Tout faire depuis la plateforme » : une tâche terminée crée l'enregistrement métier,
 * le codage validé alimente le dossier, le répertoire est partagé, la finance est actionnable.
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { api, closeApp, expectStatus, unique, userIds, type UserKey } from './helpers'

let ids: Record<UserKey, string>
let dossierId = ''
const nom = (uid: string) => Object.entries(ids).find(([, v]) => v === uid)?.[0] as UserKey

before(async () => {
  ids = await userIds()
  const r = await api('yasmine', 'POST', '/api/dossiers', {
    client: 'CLIENT ACTIVITES', compagnie: 'MSC', conteneur: 'MSCU5555555', marchandise: 'Divers',
    site: 'Douala', dateArrivee: new Date().toISOString(),
  })
  dossierId = r.body.id
  await api('delba', 'GET', `/api/dossiers/${dossierId}/sous-etapes`)
})
after(closeApp)

async function titulaire(etape: string, cle: string): Promise<UserKey> {
  const r = await api('delba', 'GET', `/api/dossiers/${dossierId}/sous-etapes`)
  return nom(r.body.find((t: any) => t.etape === etape && t.cle === cle).responsableId)
}

describe('Une tâche terminée crée l\'enregistrement correspondant', () => {
  it('paiement des droits (Mr Yaya) → paiement douane visible en Finance, sans doublon', async () => {
    const who = await titulaire('paiement', 'paiement_droits')
    assert.equal(who, 'yaya')
    const quittance = unique('QTT')
    const r = await api('yaya', 'PUT', `/api/dossiers/${dossierId}/sous-etapes/paiement/paiement_droits`, {
      statut: 'valide', metadata: { paiement_montant: '1 250 000', paiement_quittance: quittance, mode_paiement: 'virement' },
    })
    expectStatus(r, 200)
    assert.equal(r.body.metadata.enregistrement_type, 'paiement_douane')
    const fin = await api('honore', 'GET', `/api/finance/paiements-douane?dossierId=${dossierId}`)
    assert.equal(fin.body.data.length, 1)
    assert.equal(Number(fin.body.data[0].montant), 1_250_000)
    assert.equal(fin.body.data[0].reference, quittance)
    assert.equal(fin.body.data[0].statut, 'paye')

    // Révision puis nouvelle validation : pas de second paiement
    await api('yaya', 'PUT', `/api/dossiers/${dossierId}/sous-etapes/paiement/paiement_droits`, { statut: 'en_cours' })
    await api('yaya', 'PUT', `/api/dossiers/${dossierId}/sous-etapes/paiement/paiement_droits`, { statut: 'valide' })
    const fin2 = await api('honore', 'GET', `/api/finance/paiements-douane?dossierId=${dossierId}`)
    assert.equal(fin2.body.data.length, 1)
  })

  it('facture compagnie et redevance terminal (Mr Wandala) → paiements compagnie', async () => {
    assert.equal(await titulaire('bon_compagnie', 'facturation_compagnie'), 'wandala')
    expectStatus(await api('wandala', 'PUT', `/api/dossiers/${dossierId}/sous-etapes/bon_compagnie/facturation_compagnie`, {
      statut: 'valide', metadata: { bc_montant: 380000, bc_facture_numero: unique('MSC-INV') },
    }), 200)
    expectStatus(await api('wandala', 'PUT', `/api/dossiers/${dossierId}/sous-etapes/bon_compagnie/facturation_terminal`, {
      statut: 'valide', metadata: { term_montant: 120000 },
    }), 200)
    const pc = await api('wandala', 'GET', `/api/finance/paiements-compagnie?dossierId=${dossierId}`)
    const types = pc.body.data.map((p: any) => p.type).sort()
    assert.deepEqual(types, ['frais_portuaires', 'terminal'])
  })

  it('gate pass validé avec chauffeur → ticket de sortie enregistré', async () => {
    const r = await api('wandala', 'PUT', `/api/dossiers/${dossierId}/sous-etapes/bon_compagnie/gate_pass`, {
      statut: 'valide', metadata: { immatriculation: 'LT 999 ZZ', gp_chauffeur: 'MBARGA Paul', gp_telephone: '677112233', gp_destination: 'Yaoundé' },
    })
    expectStatus(r, 200)
    assert.match(r.body.metadata.gate_pass_numero, /^GP-DLA-\d{4}$/)
    const gps = await api('wandala', 'GET', `/api/dossiers/${dossierId}/gate-passes`)
    assert.equal(gps.body[0].chauffeur, 'MBARGA Paul')
  })

  it('tâche sans montant : simplement terminée, aucun enregistrement créé', async () => {
    const r = await api('yasmine', 'PUT', `/api/dossiers/${dossierId}/sous-etapes/reception/bl`, { statut: 'valide' })
    expectStatus(r, 200)
    assert.equal(r.body.metadata?.enregistrement_id, undefined)
  })
})

describe('Codage validé → dossier et tâche mis à jour automatiquement', () => {
  it('la validation de toutes les positions termine la tâche « état de codage » et calcule les taxes', async () => {
    const a = await api('odette', 'POST', '/api/codage', { dossierId, codeDouanier: '8471.30', designation: 'Ordinateurs', tauxDroits: 10, tauxTVA: 0, valeurCIF: 1_000_000 })
    const b = await api('odette', 'POST', '/api/codage', { dossierId, codeDouanier: '8517.12', designation: 'Téléphones', tauxDroits: 5, tauxTVA: 0, valeurCIF: 2_000_000 })
    for (const p of [a, b]) expectStatus(await api('odette', 'POST', `/api/codage/${p.body.id}/soumettre`), 200)
    expectStatus(await api('odette', 'POST', `/api/codage/${a.body.id}/valider`, {}), 200)
    let t = await api('odette', 'GET', `/api/dossiers/${dossierId}/sous-etapes`)
    assert.notEqual(t.body.find((x: any) => x.cle === 'etat_codage').statut, 'valide', 'pas encore : une position reste')
    expectStatus(await api('odette', 'POST', `/api/codage/${b.body.id}/valider`, {}), 200)
    t = await api('odette', 'GET', `/api/dossiers/${dossierId}/sous-etapes`)
    assert.equal(t.body.find((x: any) => x.cle === 'etat_codage').statut, 'valide')
    const d = await api('odette', 'GET', `/api/dossiers/${dossierId}`)
    assert.equal(Number(d.body.montantTaxes), 200_000)
  })
})

describe('Répertoire et finance actionnables', () => {
  it('chaque compte consulte et alimente le répertoire ; suppression par l\'auteur ou la Direction', async () => {
    const c = await api('aliou', 'POST', '/api/repertoire', { type: 'administration', nom: 'Bureau des douanes Kribi', telephone: '+237 222 00 00 00', email: '' })
    expectStatus(c, 201)
    const liste = await api('odette', 'GET', '/api/repertoire?q=douanes')
    assert.ok(liste.body.contacts.some((x: any) => x.id === c.body.id))
    expectStatus(await api('odette', 'DELETE', `/api/repertoire/${c.body.id}`), 403)
    expectStatus(await api('aliou', 'PATCH', `/api/repertoire/${c.body.id}`, { notes: 'Ouvert 7h30–15h30' }), 200)
    expectStatus(await api('soudi', 'DELETE', `/api/repertoire/${c.body.id}`), 204)
  })

  it('le comptable valide une proforma puis l\'encaisse ; un paiement en attente passe à payé', async () => {
    const f = await api('yasmine', 'POST', `/api/dossiers/${dossierId}/factures`, {
      numero: unique('PRO'), type: 'proforma', montant: 500_000, compagnie: 'MSC', dateFacture: new Date().toISOString(), description: 'Proforma',
    })
    expectStatus(f, 201)
    expectStatus(await api('honore', 'PATCH', `/api/finance/factures/${f.body.id}`, { type: 'validee' }), 200)
    const reglee = await api('honore', 'PATCH', `/api/finance/factures/${f.body.id}`, { type: 'reglee', datePaiement: new Date().toISOString() })
    expectStatus(reglee, 200)
    assert.equal(reglee.body.type, 'reglee')
    const pd = await api('yaya', 'POST', '/api/finance/paiements-douane', { dossierId, type: 'taxes', montant: 10_000, datePaiement: new Date().toISOString(), reference: unique('ATT') })
    expectStatus(await api('honore', 'PATCH', `/api/finance/paiements-douane/${pd.body.id}`, { statut: 'paye' }), 200)
  })
})
