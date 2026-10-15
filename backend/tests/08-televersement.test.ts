/**
 * Gros fichiers : Vercel limite chaque requête et chaque réponse à 4,5 Mo.
 * Envoi par morceaux (/api/televersements) puis lecture par plages (en-tête Range).
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { api, closeApp, expectStatus, getApp, login, upload } from './helpers'

let dossierId = ''
before(async () => {
  const r = await api('yasmine', 'POST', '/api/dossiers', {
    client: 'CLIENT GROS FICHIER', compagnie: 'MSC', conteneur: 'MSCU4444444', marchandise: 'Divers',
    site: 'Douala', dateArrivee: new Date().toISOString(),
  })
  dossierId = r.body.id
  await api('delba', 'GET', `/api/dossiers/${dossierId}/sous-etapes`)
})
after(closeApp)

/** Requête multipart sans fichier : seulement des champs. */
async function champsSeuls(who: 'yasmine', url: string, fields: Record<string, string>) {
  const boundary = '----finitransChamps' + Math.random().toString(16).slice(2)
  const corps = Object.entries(fields).map(([k, v]) => `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`).join('') + `--${boundary}--\r\n`
  const res = await (await getApp()).inject({
    method: 'POST', url, payload: corps,
    headers: { authorization: `Bearer ${(await login(who)).token}`, 'content-type': `multipart/form-data; boundary=${boundary}` },
  })
  return { status: res.statusCode, body: res.json() }
}

describe('Fichier de plus de 4,5 Mo', () => {
  const contenu = Buffer.alloc(7 * 1024 * 1024)
  for (let i = 0; i < contenu.length; i++) contenu[i] = (i * 13) % 256
  const MORCEAU = 3 * 1024 * 1024

  it('envoyé en morceaux, joint comme preuve, relu par plages à l\'identique', async () => {
    const id = randomUUID()
    const total = Math.ceil(contenu.length / MORCEAU)
    for (let i = 0; i < total; i++) {
      const r = await upload('yasmine', `/api/televersements/${id}/morceaux/${i}?total=${total}&nom=scan.pdf&type=application/pdf`,
        { name: 'scan.pdf', type: 'application/pdf', content: contenu.subarray(i * MORCEAU, (i + 1) * MORCEAU) })
      expectStatus(r, 200)
    }
    const r = await champsSeuls('yasmine', `/api/dossiers/${dossierId}/sous-etapes/reception/bl/preuve`, { televersementId: id })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    assert.equal(r.body.metadata.preuve_nom, 'scan.pdf')

    // Lecture par plages de 3 Mo
    const app = await getApp()
    const token = (await login('yasmine')).token
    const parties: Buffer[] = []
    for (let debut = 0; debut < contenu.length; debut += MORCEAU) {
      const res = await app.inject({ method: 'GET', url: r.body.metadata.preuve_url, headers: { authorization: `Bearer ${token}`, range: `bytes=${debut}-${debut + MORCEAU - 1}` } })
      assert.equal(res.statusCode, 206)
      assert.match(String(res.headers['content-range']), new RegExp(`/${contenu.length}$`))
      parties.push(res.rawPayload)
    }
    assert.ok(Buffer.concat(parties).equals(contenu))
  })

  it('un envoi incomplet est refusé avec un message clair', async () => {
    const id = randomUUID()
    expectStatus(await upload('yasmine', `/api/televersements/${id}/morceaux/0?total=3&nom=x.pdf&type=application/pdf`,
      { name: 'x.pdf', type: 'application/pdf', content: Buffer.alloc(1000, 1) }), 200)
    const r = await champsSeuls('yasmine', `/api/dossiers/${dossierId}/upload`, { televersementId: id })
    assert.equal(r.status, 400)
    assert.equal(r.body.error, 'TELEVERSEMENT_INCOMPLET')
  })

  it('les morceaux d\'un autre compte ne sont pas utilisables', async () => {
    const id = randomUUID()
    expectStatus(await upload('honore', `/api/televersements/${id}/morceaux/0?total=1&nom=y.pdf&type=application/pdf`,
      { name: 'y.pdf', type: 'application/pdf', content: Buffer.alloc(1000, 2) }), 200)
    const r = await champsSeuls('yasmine', `/api/dossiers/${dossierId}/upload`, { televersementId: id })
    assert.equal(r.status, 400)
    assert.equal(r.body.error, 'TELEVERSEMENT_INTROUVABLE')
  })
})
