/**
 * Affectation des étapes du parcours, compte rendu PDF de clôture et bibliothèque documentaire.
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { api, closeApp, expectStatus, placerEtape, preparerPassage, unique, upload, userIds, type UserKey } from './helpers'

let ids: Record<UserKey, string>
let dossier: { id: string; numero: string; responsableId: string }
const nom = (uid: string) => Object.entries(ids).find(([, v]) => v === uid)?.[0] as UserKey

before(async () => {
  ids = await userIds()
  const r = await api('yasmine', 'POST', '/api/dossiers', {
    client: 'CLIENT PARCOURS', compagnie: 'MSC', conteneur: 'MSCU7777777', marchandise: 'Électroménager',
    site: 'Douala', dateArrivee: new Date().toISOString(), numeroBL: 'BL-PARCOURS-1',
  })
  expectStatus(r, 201)
  dossier = r.body
})
after(closeApp)

describe('Les responsables assignent les étapes suivantes du parcours', () => {
  it('le responsable du dossier confie l\'étape « Bon Compagnie » à un autre employé', async () => {
    const qui = nom(dossier.responsableId)
    const avant = await api(qui, 'GET', `/api/dossiers/${dossier.id}/affectations`)
    expectStatus(avant, 200)
    const bc = avant.body.find((e: any) => e.etape === 'bon_compagnie')
    assert.equal(bc.modifiable, true)
    assert.ok(bc.titulaires.length > 0, 'tâches déjà attribuées automatiquement')

    const r = await api(qui, 'PUT', `/api/dossiers/${dossier.id}/affectations/bon_compagnie`, { responsableId: ids.rasoul, note: 'Mr Rasoul connaît ce client' })
    expectStatus(r, 200)
    assert.ok(r.body.tachesAttribuees > 0)

    const taches = await api('delba', 'GET', `/api/dossiers/${dossier.id}/sous-etapes`)
    const bcTaches = taches.body.filter((t: any) => t.etape === 'bon_compagnie')
    assert.ok(bcTaches.every((t: any) => t.responsableId === ids.rasoul), 'toutes les tâches ouvertes de l\'étape passent à la personne désignée')

    const notifs = await api('rasoul', 'GET', '/api/notifications')
    const liste = notifs.body.data ?? notifs.body
    assert.ok(liste.some((n: any) => n.dossierId === dossier.id && /vous est confiée/.test(n.titre)))

    const apres = await api('rasoul', 'GET', `/api/dossiers/${dossier.id}/affectations`)
    assert.equal(apres.body.find((e: any) => e.etape === 'bon_compagnie').affectation.responsable.id, ids.rasoul)
  })

  it('un compte qui n\'intervient pas sur le dossier ne peut pas assigner ; une étape passée est verrouillée', async () => {
    expectStatus(await api('raphael', 'PUT', `/api/dossiers/${dossier.id}/affectations/paiement`, { responsableId: ids.raphael }), 403)
    await placerEtape(dossier.id, 'paiement')
    expectStatus(await api('delba', 'PUT', `/api/dossiers/${dossier.id}/affectations/codage`, { responsableId: ids.odette }), 422)
    expectStatus(await api('delba', 'PUT', `/api/dossiers/${dossier.id}/affectations/operations_kribi`, { responsableId: ids.aliou }), 422)
  })

  it('au passage d\'étape, la personne désignée est proposée puis devient responsable', async () => {
    const next = await api('delba', 'GET', `/api/dossiers/${dossier.id}/next-step`)
    assert.equal(next.body.etapeSuivante, 'bon_compagnie')
    assert.equal(next.body.responsableSuggere.id, ids.rasoul)
    await preparerPassage(dossier.id, 'paiement')
    const r = await api('delba', 'PATCH', `/api/dossiers/${dossier.id}/status`, { status: 'bon_compagnie' })
    expectStatus(r, 200)
    assert.equal(r.body.responsableId, ids.rasoul)
  })

  it('confier l\'étape en cours change aussi le responsable du dossier', async () => {
    const r = await api('rasoul', 'PUT', `/api/dossiers/${dossier.id}/affectations/bon_compagnie`, { responsableId: ids.wandala })
    expectStatus(r, 200)
    const d = await api('wandala', 'GET', `/api/dossiers/${dossier.id}`)
    assert.equal(d.body.responsableId, ids.wandala)
  })
})

describe('Compte rendu d\'évolution du dossier (PDF)', () => {
  it('disponible à tout moment, en PDF', async () => {
    const r = await api('wandala', 'GET', `/api/dossiers/${dossier.id}/compte-rendu`)
    expectStatus(r, 200)
    assert.match(String(r.headers['content-type']), /application\/pdf/)
    assert.ok(r.raw.startsWith('%PDF'), 'contenu PDF')
    assert.ok(Number(r.headers['content-length']) > 3000)
  })

  it('à la clôture, il est archivé automatiquement dans la bibliothèque', async () => {
    await placerEtape(dossier.id, 'operations_douala')
    await preparerPassage(dossier.id, 'operations_douala')
    expectStatus(await api('delba', 'PATCH', `/api/dossiers/${dossier.id}/status`, { status: 'cloture' }), 200)
    const lib = await api('delba', 'GET', `/api/bibliotheque?dossierId=${dossier.id}&categorie=compte_rendu`)
    expectStatus(lib, 200)
    assert.equal(lib.body.data.length, 1)
    const cr = lib.body.data[0]
    assert.equal(cr.nom, `Compte-rendu-${dossier.numero}.pdf`)
    assert.equal(cr.etape, 'cloture')
    const contenu = await api('wandala', 'GET', cr.url)
    expectStatus(contenu, 200)
    assert.ok(contenu.raw.startsWith('%PDF'))
    // Visible depuis le dossier, non supprimable par un employé
    const docs = await api('wandala', 'GET', `/api/dossiers/${dossier.id}/documents`)
    assert.ok(docs.body.some((d: any) => d.id === cr.id))
    expectStatus(await api('wandala', 'DELETE', `/api/bibliotheque/${cr.id}`), 403)
    const audit = await api('delba', 'GET', `/api/dossiers/${dossier.id}/audit`)
    assert.ok(JSON.stringify(audit.body).includes('COMPTE_RENDU_ARCHIVE'))
  })
})

describe('Bibliothèque documentaire', () => {
  let docEntreprise = ''

  it('un employé dépose un document d\'entreprise catégorisé et étiqueté', async () => {
    const r = await upload('aliou', '/api/bibliotheque', { name: 'procedure-sortie-kribi.pdf', type: 'application/pdf', content: `%PDF procédure ${unique('P')}` },
      { categorie: 'procedure', description: 'Procédure de sortie des conteneurs au port de Kribi', tags: 'Kribi, sortie, port' })
    expectStatus(r, 201)
    assert.equal(r.body.dossierId, null)
    assert.deepEqual(r.body.tags, ['kribi', 'sortie', 'port'])
    docEntreprise = r.body.id
  })

  it('recherche plein texte, filtres, facettes et favoris', async () => {
    const r = await api('odette', 'GET', '/api/bibliotheque?q=kribi%20sortie&espace=entreprise')
    expectStatus(r, 200)
    assert.ok(r.body.data.some((d: any) => d.id === docEntreprise))
    assert.ok(r.body.facettes.total >= 1)
    assert.ok(r.body.facettes.parCategorie.procedure >= 1)
    const parFormat = await api('odette', 'GET', '/api/bibliotheque?format=pdf&categorie=procedure')
    assert.ok(parFormat.body.data.every((d: any) => d.type.includes('pdf') && d.categorie === 'procedure'))

    assert.equal((await api('odette', 'POST', `/api/bibliotheque/${docEntreprise}/favori`)).body.favori, true)
    const fav = await api('odette', 'GET', '/api/bibliotheque?favoris=1')
    assert.deepEqual(fav.body.data.map((d: any) => d.id), [docEntreprise])
    assert.equal(fav.body.facettes.favoris, 1)
    assert.equal((await api('odette', 'POST', `/api/bibliotheque/${docEntreprise}/favori`)).body.favori, false)
  })

  it('droits : seul l\'auteur ou la Direction modifie et supprime ; les documents confidentiels restent privés', async () => {
    expectStatus(await api('odette', 'PATCH', `/api/bibliotheque/${docEntreprise}`, { description: 'x' }), 403)
    expectStatus(await api('aliou', 'PATCH', `/api/bibliotheque/${docEntreprise}`, { tags: ['kribi', 'procédure'], confidentiel: true }), 200)
    expectStatus(await api('odette', 'GET', `/api/bibliotheque/${docEntreprise}`), 404)
    expectStatus(await api('soudi', 'GET', `/api/bibliotheque/${docEntreprise}/contenu`), 200)
    expectStatus(await api('odette', 'DELETE', `/api/bibliotheque/${docEntreprise}`), 404)
    expectStatus(await api('aliou', 'DELETE', `/api/bibliotheque/${docEntreprise}`), 204)
  })

  it('les pièces d\'un dossier ne sont visibles que par ses intervenants (et la Direction)', async () => {
    const piece = await upload('wandala', '/api/bibliotheque', { name: 'bon-msc.pdf', type: 'application/pdf', content: `%PDF bon ${unique('B')}` }, { dossierId: dossier.id })
    expectStatus(piece, 201)
    assert.equal(piece.body.categorie, 'preuve')
    assert.equal(piece.body.etape, 'cloture')
    expectStatus(await api('raphael', 'GET', `/api/bibliotheque/${piece.body.id}`), 404)
    expectStatus(await api('honore', 'GET', `/api/bibliotheque/${piece.body.id}`), 200)
    const doublon = await upload('wandala', '/api/bibliotheque', { name: 'copie.pdf', type: 'application/pdf', content: (await api('wandala', 'GET', piece.body.url)).raw }, { dossierId: dossier.id })
    expectStatus(doublon, 409)
  })
})
