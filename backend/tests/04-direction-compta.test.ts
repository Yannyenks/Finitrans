/**
 * Modules de Direction : administration de l'entreprise, RH & congés,
 * comptabilité avancée SYSCOHADA (partie double, états financiers).
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { api, closeApp, expectStatus, unique, userIds, type UserKey } from './helpers'

let ids: Record<UserKey, string>
before(async () => { ids = await userIds() })
after(closeApp)

describe('Administration de l\'entreprise (DG)', () => {
  it('fiche entreprise : lisible par tous, modifiable par le DG seul', async () => {
    const r = await api('delba', 'PUT', '/api/admin/entreprise', {
      raisonSociale: 'FINITRANS SARL', niu: 'M0123456789', rccm: 'RC/DLA/2020/B/1234', tauxTVA: 19.25, capital: 10_000_000,
    })
    expectStatus(r, 200)
    const lu = await api('odette', 'GET', '/api/admin/entreprise')
    assert.equal(lu.body.raisonSociale, 'FINITRANS SARL')
    expectStatus(await api('soudi', 'PUT', '/api/admin/entreprise', { raisonSociale: 'X Corp' }), 403)
  })

  it('journal d\'activité et synthèse de pilotage', async () => {
    const act = await api('delba', 'GET', '/api/admin/activites?limit=50')
    expectStatus(act, 200)
    assert.ok(act.body.some((a: any) => a.action === 'ENTREPRISE_MODIFIEE'))
    assert.ok(act.body.some((a: any) => a.action === 'CONNEXION'))
    const syn = await api('delba', 'GET', '/api/admin/synthese')
    expectStatus(syn, 200)
    assert.ok(syn.body.effectifs.actifs >= 10)
  })
})

describe('Ressources humaines', () => {
  it('le DG renseigne les fiches RH ; la masse salariale est calculée', async () => {
    const salaires: [UserKey, number][] = [['yaya', 450_000], ['odette', 500_000], ['honore', 550_000]]
    for (const [u, s] of salaires) {
      const r = await api('delba', 'PUT', `/api/rh/fiches/${ids[u]}`, { salaireBase: s, primes: 50_000, typeContrat: 'CDI', dateEmbauche: '2022-01-03T00:00:00.000Z' })
      expectStatus(r, 200)
    }
    const m = await api('delba', 'GET', '/api/rh/masse-salariale')
    expectStatus(m, 200)
    assert.ok(m.body.totalMensuel >= 1_650_000)
    expectStatus(await api('yasmine', 'PUT', `/api/rh/fiches/${ids.yaya}`, { salaireBase: 1 }), 403)
    const vueYasmine = await api('yasmine', 'GET', '/api/rh/fiches')
    expectStatus(vueYasmine, 200)
    assert.equal(vueYasmine.body.find((f: any) => f.id === ids.yaya).ficheRH.salaireBase, null, 'salaires masqués hors Direction')
  })

  it('chaque compte demande ses congés ; la Direction décide', async () => {
    const debut = new Date(Date.UTC(new Date().getFullYear() + 1, 1, 2))
    const fin = new Date(debut.getTime() + 4 * 86_400_000)
    const d = await api('odette', 'POST', '/api/rh/conges', { type: 'annuel', dateDebut: debut.toISOString(), dateFin: fin.toISOString(), motif: 'Vacances' })
    expectStatus(d, 201)
    assert.equal(d.body.jours, 5)
    expectStatus(await api('odette', 'POST', '/api/rh/conges', { type: 'annuel', dateDebut: debut.toISOString(), dateFin: fin.toISOString() }), 409, 'chevauchement')
    const trop = new Date(debut.getTime() + 60 * 86_400_000)
    expectStatus(await api('odette', 'POST', '/api/rh/conges', {
      type: 'annuel', dateDebut: new Date(trop.getTime() + 86_400_000).toISOString(), dateFin: new Date(trop.getTime() + 40 * 86_400_000).toISOString(),
    }), 422, 'solde insuffisant')

    const mes = await api('odette', 'GET', `/api/rh/mes-conges?annee=${debut.getUTCFullYear()}`)
    assert.ok(mes.body.solde.restant <= 13)
    expectStatus(await api('yaya', 'PATCH', `/api/rh/conges/${d.body.id}/decision`, { decision: 'approuve' }), 403)
    expectStatus(await api('soudi', 'PATCH', `/api/rh/conges/${d.body.id}/decision`, { decision: 'approuve', commentaire: 'Bon repos' }), 200)
    const notif = await api('odette', 'GET', '/api/notifications?limit=20')
    assert.ok(notif.body.data.some((n: any) => n.titre === 'Congé approuvé'))
    const tous = await api('delba', 'GET', '/api/rh/conges')
    assert.ok(tous.body.some((c: any) => c.id === d.body.id))
    const siens = await api('yaya', 'GET', '/api/rh/conges')
    assert.ok(siens.body.every((c: any) => c.userId === ids.yaya), 'un employé ne voit que ses congés')
  })
})

describe('Comptabilité avancée SYSCOHADA', () => {
  const today = new Date().toISOString()

  it('référentiel SYSCOHADA créé au premier accès ; accès réservé DG + Comptable', async () => {
    const c = await api('honore', 'GET', '/api/compta/comptes')
    expectStatus(c, 200)
    assert.ok(c.body.some((x: any) => x.numero === '411000'))
    assert.ok(c.body.some((x: any) => x.numero === '706000'))
    const j = await api('delba', 'GET', '/api/compta/journaux')
    assert.deepEqual(j.body.map((x: any) => x.code).sort(), ['ACH', 'BQ', 'CAI', 'OD', 'PAI', 'VTE'])
    expectStatus(await api('soudi', 'GET', '/api/compta/comptes'), 403)
    expectStatus(await api('yasmine', 'POST', '/api/compta/ecritures', {}), 403)
  })

  it('refuse les écritures déséquilibrées ou invalides', async () => {
    const desequilibre = await api('honore', 'POST', '/api/compta/ecritures', {
      journal: 'OD', date: today, libelle: 'Test déséquilibré',
      lignes: [{ compte: '622000', debit: 100 }, { compte: '521100', credit: 90 }],
    })
    expectStatus(desequilibre, 422)
    assert.equal(desequilibre.body.error, 'ECRITURE_DESEQUILIBREE')
    expectStatus(await api('honore', 'POST', '/api/compta/ecritures', {
      journal: 'OD', date: today, libelle: 'Compte inconnu', lignes: [{ compte: '999999', debit: 10 }, { compte: '521100', credit: 10 }],
    }), 422)
    expectStatus(await api('honore', 'POST', '/api/compta/ecritures', {
      journal: 'OD', date: today, libelle: 'Débit et crédit', lignes: [{ compte: '622000', debit: 10, credit: 10 }, { compte: '521100', credit: 0 }],
    }), 422)
  })

  let loyerId = ''
  it('saisie, modification du brouillon, validation, verrouillage et contre-passation', async () => {
    const e = await api('honore', 'POST', '/api/compta/ecritures', {
      journal: 'ACH', date: today, libelle: 'Loyer bureaux Douala', piece: unique('QUIT'),
      lignes: [{ compte: '622000', debit: 800_000 }, { compte: '521100', credit: 800_000 }],
    })
    expectStatus(e, 201)
    loyerId = e.body.id
    assert.match(e.body.numero, /^ACH-\d{4}-\d{5}$/)
    assert.equal(e.body.statut, 'brouillon')

    const maj = await api('honore', 'PUT', `/api/compta/ecritures/${loyerId}`, {
      journal: 'ACH', date: today, libelle: 'Loyer bureaux Douala (mois)',
      lignes: [{ compte: '622000', debit: 750_000 }, { compte: '521100', credit: 750_000 }],
    })
    expectStatus(maj, 200)
    expectStatus(await api('honore', 'POST', `/api/compta/ecritures/${loyerId}/valider`), 200)
    expectStatus(await api('honore', 'DELETE', `/api/compta/ecritures/${loyerId}`), 422, 'écriture validée verrouillée')
    const cp = await api('delba', 'POST', `/api/compta/ecritures/${loyerId}/contrepasser`, { motif: 'Erreur de montant' })
    expectStatus(cp, 201)
    assert.equal(Number(cp.body.lignes.find((l: any) => l.compte.numero === '622000').credit), 750_000)
    expectStatus(await api('delba', 'POST', `/api/compta/ecritures/${loyerId}/contrepasser`), 409)
  })

  it('comptabilisation automatique des opérations, sans doublon', async () => {
    // Facture d'honoraires avec ventilation TVA + débours sur un dossier existant
    const dossiers = await api('honore', 'GET', '/api/dossiers?limit=1')
    const dossierId = dossiers.body.data[0].id
    const f = await api('honore', 'POST', `/api/dossiers/${dossierId}/factures`, {
      numero: unique('FAC-HON'), type: 'reglee', montant: 1_238_500, montantTVA: 38_500, montantDebours: 1_000_000,
      compagnie: 'MSC', dateFacture: today, description: 'Honoraires + débours',
    })
    expectStatus(f, 201)

    const apercu = await api('honore', 'GET', '/api/compta/comptabilisation/apercu')
    expectStatus(apercu, 200)
    assert.ok(apercu.body.FACTURE.nombre >= 1)
    assert.ok(apercu.body.FACTURE_REGLEMENT.nombre >= 1)

    const gen = await api('honore', 'POST', '/api/compta/comptabilisation/generer', {})
    expectStatus(gen, 200)
    assert.ok(gen.body.creees.length >= 3, JSON.stringify(gen.body))
    assert.deepEqual(gen.body.erreurs, [])
    const gen2 = await api('honore', 'POST', '/api/compta/comptabilisation/generer', {})
    assert.equal(gen2.body.creees.length, 0, 'aucune opération comptabilisée deux fois')

    const vente = await api('honore', 'GET', `/api/compta/ecritures?journal=VTE&q=${encodeURIComponent(f.body.numero)}`)
    const lignes = vente.body.data[0].lignes
    const ligne = (n: string) => lignes.find((l: any) => l.compte.numero === n)
    assert.equal(Number(ligne('411000').debit), 1_238_500)
    assert.equal(Number(ligne('706000').credit), 200_000, 'HT = total − TVA − débours')
    assert.equal(Number(ligne('443100').credit), 38_500)
    assert.equal(Number(ligne('467100').credit), 1_000_000)
  })

  it('paie mensuelle générée depuis les fiches RH (une seule fois par mois)', async () => {
    const mois = `${new Date().getFullYear()}-01`
    const p = await api('honore', 'POST', '/api/compta/paie/generer', { mois })
    expectStatus(p, 201)
    assert.equal(p.body.lignes.filter((l: any) => l.compte.numero === '422000').length >= 3, true)
    expectStatus(await api('honore', 'POST', '/api/compta/paie/generer', { mois }), 409)
  })

  it('balance équilibrée, bilan équilibré, résultat cohérent', async () => {
    const bal = await api('delba', 'GET', '/api/compta/balance')
    expectStatus(bal, 200)
    assert.equal(bal.body.equilibree, true)
    assert.equal(bal.body.totaux.soldeDebiteur, bal.body.totaux.soldeCrediteur)

    const bilan = await api('delba', 'GET', '/api/compta/bilan')
    expectStatus(bilan, 200)
    assert.equal(bilan.body.equilibre, true, `actif ${bilan.body.totalActif} / passif ${bilan.body.totalPassif}`)

    const debutAnnee = new Date(Date.UTC(new Date().getFullYear(), 0, 1)).toISOString()
    const res = await api('delba', 'GET', `/api/compta/resultat?from=${debutAnnee}`)
    expectStatus(res, 200)
    assert.ok(res.body.totalProduits >= 200_000)
    assert.equal(Math.round((res.body.totalProduits - res.body.totalCharges) * 100) / 100, res.body.resultat)

    const gl = await api('honore', 'GET', '/api/compta/grand-livre/521100')
    expectStatus(gl, 200)
    assert.equal(gl.body.soldeFinal, Math.round((gl.body.soldeOuverture + gl.body.totalDebit - gl.body.totalCredit) * 100) / 100)

    const treso = await api('honore', 'GET', '/api/compta/tresorerie')
    expectStatus(treso, 200)
    assert.equal(treso.body.mois.length, 12)

    const creances = await api('honore', 'GET', '/api/compta/creances')
    expectStatus(creances, 200)
    assert.ok('0-30' in creances.body.tranches)

    const dash = await api('delba', 'GET', '/api/compta/dashboard')
    expectStatus(dash, 200)
    assert.ok(dash.body.brouillons >= 1)
  })

  it('exports CSV (écritures, balance, grand livre)', async () => {
    for (const url of ['/api/compta/export/ecritures', '/api/compta/export/balance', '/api/compta/export/grand-livre?compte=521100']) {
      const r = await api('honore', 'GET', url)
      expectStatus(r, 200, url)
      assert.match(String(r.headers['content-type']), /text\/csv/)
      assert.ok(r.raw.split('\n').length >= 2, `${url} non vide`)
    }
  })

  it('clôture d\'exercice : brouillons interdits, puis plus aucune saisie possible', async () => {
    const ex = await api('honore', 'GET', '/api/compta/exercices')
    const courant = ex.body.find((e: any) => e.code === String(new Date().getUTCFullYear()))
    assert.ok(courant)
    const refus = await api('honore', 'POST', `/api/compta/exercices/${courant.id}/cloturer`)
    expectStatus(refus, 422)
    assert.equal(refus.body.error, 'BROUILLONS')

    expectStatus(await api('honore', 'POST', '/api/compta/ecritures/valider-lot', {}), 200)
    const ok = await api('honore', 'POST', `/api/compta/exercices/${courant.id}/cloturer`)
    expectStatus(ok, 200)
    assert.equal(ok.body.statut, 'cloture')
    const bloque = await api('honore', 'POST', '/api/compta/ecritures', {
      journal: 'OD', date: today, libelle: 'Après clôture', lignes: [{ compte: '622000', debit: 1 }, { compte: '521100', credit: 1 }],
    })
    expectStatus(bloque, 422)
    assert.equal(bloque.body.error, 'EXERCICE_CLOTURE')

    expectStatus(await api('honore', 'POST', `/api/compta/exercices/${courant.id}/rouvrir`), 403, 'réouverture réservée au DG')
    expectStatus(await api('delba', 'POST', `/api/compta/exercices/${courant.id}/rouvrir`), 200)
  })
})
