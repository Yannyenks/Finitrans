/**
 * Multi-entreprises : chaque organisation ne voit que ses propres dossiers.
 * Un compte d'une autre organisation doit recevoir 404 (le dossier n'existe pas pour lui),
 * jamais des données ni une confirmation d'existence.
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { getApp, closeApp, login, PASSWORD, api, userIds, type UserKey } from './helpers'
import { prisma } from '../src/config/prisma'

const EMAIL_B = 'dg.acme@test.cm'
let orgA: string
let orgB: string
let dossierA: { id: string }
let delbaId: string
let tokenB: string

async function requeteB(method: string, url: string, payload?: unknown) {
  const app = await getApp()
  return app.inject({
    method: method as 'GET',
    url,
    headers: { authorization: `Bearer ${tokenB}` },
    ...(payload !== undefined ? { payload: payload as object } : {}),
  })
}

before(async () => {
  orgA = (await prisma.organisation.findUniqueOrThrow({ where: { slug: 'finitrans' } })).id
  orgB = (await prisma.organisation.upsert({
    where: { slug: 'acme-test' }, update: {}, create: { slug: 'acme-test', nom: 'ACME TEST' },
  })).id

  // Directeur d'une AUTRE entreprise (même profil que la Direction de FINITRANS)
  await prisma.user.upsert({
    where: { email: EMAIL_B },
    update: { organisationId: orgB, actif: true },
    create: {
      email: EMAIL_B, passwordHash: await bcrypt.hash(PASSWORD, 10), nom: 'DG ACME', role: 'Directeur',
      site: 'Douala', profil: 'dg', organisationId: orgB,
    },
  })
  tokenB = (await login(EMAIL_B)).token

  dossierA = await prisma.dossier.findFirstOrThrow({ where: { organisationId: orgA }, select: { id: true } })
  delbaId = (await userIds())['delba' as UserKey]
})
after(closeApp)

describe('Isolation des dossiers entre organisations', () => {
  it('chaque compte est rattaché à son organisation', async () => {
    const delba = await prisma.user.findUniqueOrThrow({ where: { id: delbaId }, select: { organisationId: true } })
    const dgB = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL_B }, select: { organisationId: true } })
    assert.equal(delba.organisationId, orgA)
    assert.equal(dgB.organisationId, orgB)
  })

  it('la liste de FINITRANS contient ses dossiers', async () => {
    const r = await api('delba', 'GET', '/api/dossiers?limit=200')
    assert.equal(r.status, 200)
    assert.ok(r.body.data.some((d: { id: string }) => d.id === dossierA.id))
  })

  it('la liste de l\'autre organisation ne contient aucun dossier de FINITRANS', async () => {
    const r = await requeteB('GET', '/api/dossiers?limit=200')
    assert.equal(r.statusCode, 200)
    const corps = JSON.parse(r.body)
    assert.equal(corps.data.some((d: { id: string }) => d.id === dossierA.id), false)
  })

  it('lecture directe d\'un dossier d\'une autre organisation : 404', async () => {
    const r = await requeteB('GET', `/api/dossiers/${dossierA.id}`)
    assert.equal(r.statusCode, 404)
  })

  it('modification d\'un dossier d\'une autre organisation : 404, aucune écriture', async () => {
    const avant = await prisma.dossier.findUniqueOrThrow({ where: { id: dossierA.id }, select: { updatedAt: true, notes: true } })
    const r = await requeteB('PATCH', `/api/dossiers/${dossierA.id}`, { notes: 'intrusion' })
    assert.equal(r.statusCode, 404)
    const apres = await prisma.dossier.findUniqueOrThrow({ where: { id: dossierA.id }, select: { updatedAt: true, notes: true } })
    assert.equal(apres.notes, avant.notes)
    assert.equal(apres.updatedAt.getTime(), avant.updatedAt.getTime())
  })

  it('sous-ressources (commentaires, documents, sous-étapes, suivi client) : 404', async () => {
    for (const url of [
      `/api/dossiers/${dossierA.id}/commentaires`,
      `/api/dossiers/${dossierA.id}/documents`,
      `/api/dossiers/${dossierA.id}/sous-etapes`,
      `/api/dossiers/${dossierA.id}/suivi-client`,
    ]) {
      const r = await requeteB('GET', url)
      assert.equal(r.statusCode, 404, `${url} doit refuser l'accès croisé`)
    }
  })

  it('identifiant non valide : 404 sans erreur serveur', async () => {
    const r = await requeteB('GET', '/api/dossiers/pas-un-uuid')
    assert.equal(r.statusCode, 404)
  })

  it('un responsable d\'une autre organisation ne peut pas être désigné sur un dossier', async () => {
    const r = await requeteB('POST', '/api/dossiers', {
      client: 'CLIENT CROISE', compagnie: 'MSC', conteneur: 'MSCU1111111', marchandise: 'Test',
      site: 'Douala', dateArrivee: new Date().toISOString(), responsableId: delbaId,
    })
    assert.equal(r.statusCode, 422)
    assert.equal(JSON.parse(r.body).error, 'INVALID_USER')
  })

  it('un dossier créé par l\'autre organisation lui appartient, et reste invisible pour FINITRANS', async () => {
    const r = await requeteB('POST', '/api/dossiers', {
      client: 'CLIENT ACME', compagnie: 'MSC', conteneur: 'MSCU2222222', marchandise: 'Test',
      site: 'Douala', dateArrivee: new Date().toISOString(),
    })
    assert.equal(r.statusCode, 201, r.body)
    const cree = JSON.parse(r.body) as { id: string }
    const enBase = await prisma.dossier.findUniqueOrThrow({ where: { id: cree.id }, select: { organisationId: true } })
    assert.equal(enBase.organisationId, orgB)

    const listeA = await api('delba', 'GET', '/api/dossiers?limit=200')
    assert.equal(listeA.body.data.some((d: { id: string }) => d.id === cree.id), false)
    const directA = await api('delba', 'GET', `/api/dossiers/${cree.id}`)
    assert.equal(directA.status, 404)
  })
})
