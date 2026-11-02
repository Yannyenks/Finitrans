/**
 * SaaS multi-entreprises : inscription en libre-service, isolation de chaque module,
 * intégrité en base (triggers), abonnements, limites d'offre, administration de la plateforme.
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { getApp, closeApp, api, expectStatus, userIds, type UserKey } from './helpers'
import { prisma } from '../src/config/prisma'

const EMAIL_B = `dg.${Date.now()}@nouvelle-entreprise.test`
const PASSWORD_B = 'Transit2026secure'
let tokenB = ''
let orgA = ''
let orgB = ''
let dossierA = ''
let ids: Record<UserKey, string>

async function req(token: string | null, method: string, url: string, payload?: unknown) {
  const app = await getApp()
  const res = await app.inject({
    method: method as 'GET',
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(payload !== undefined ? { payload: payload as object } : {}),
  })
  let body: any = null
  try { body = res.json() } catch { body = res.body }
  return { status: res.statusCode, body }
}
const B = (method: string, url: string, payload?: unknown) => req(tokenB, method, url, payload)

async function modifierAbonnement(data: Record<string, unknown>) {
  const r = await api('delba', 'PATCH', `/api/plateforme/organisations/${orgB}`, data)
  expectStatus(r, 200, 'modification abonnement')
}

before(async () => {
  ids = await userIds()
  orgA = (await prisma.organisation.findUniqueOrThrow({ where: { slug: 'finitrans' } })).id
  dossierA = (await prisma.dossier.findFirstOrThrow({ where: { organisationId: orgA }, select: { id: true } })).id
})
after(closeApp)

describe('Inscription en libre-service', () => {
  it('refuse un mot de passe faible et l\'absence d\'acceptation des conditions', async () => {
    const base = { entreprise: 'Atlas Freight', nom: 'Awa Diallo', email: EMAIL_B, pays: 'SN', langue: 'fr' }
    expectStatus(await req(null, 'POST', '/api/auth/inscription', { ...base, password: 'court', accepteConditions: true }), 400)
    expectStatus(await req(null, 'POST', '/api/auth/inscription', { ...base, password: PASSWORD_B }), 400)
  })

  it('crée l\'espace, l\'essai et le compte dirigeant ; l\'email ouvre directement le bon espace', async () => {
    const r = await req(null, 'POST', '/api/auth/inscription', {
      entreprise: 'Atlas Freight', nom: 'Awa Diallo', email: EMAIL_B, password: PASSWORD_B,
      pays: 'SN', langue: 'fr', accepteConditions: true,
    })
    expectStatus(r, 201, JSON.stringify(r.body))
    tokenB = r.body.accessToken
    const org = r.body.user.organisation
    orgB = org.id
    assert.equal(org.nom, 'Atlas Freight')
    assert.equal(org.devise, 'XOF', 'devise déduite du pays (Sénégal)')
    assert.equal(org.fuseau, 'Africa/Dakar')
    assert.equal(org.abonnement.statut, 'essai')
    assert.equal(org.abonnement.plan, 'business')
    assert.ok(new Date(org.abonnement.finEssai) > new Date(), 'fin d\'essai dans le futur')
    assert.equal(r.body.user.profil, 'dg')

    const login = await req(null, 'POST', '/api/auth/login', { email: EMAIL_B, password: PASSWORD_B })
    expectStatus(login, 200)
    assert.equal(login.body.user.organisation.id, orgB)
  })

  it('un même email ne peut pas ouvrir un second espace', async () => {
    const r = await req(null, 'POST', '/api/auth/inscription', {
      entreprise: 'Autre', nom: 'X Y', email: EMAIL_B, password: PASSWORD_B, accepteConditions: true,
    })
    expectStatus(r, 409)
    const r2 = await req(null, 'POST', '/api/auth/inscription', {
      entreprise: 'Autre', nom: 'X Y', email: 'delba@finitrans.cm', password: PASSWORD_B, accepteConditions: true,
    })
    expectStatus(r2, 409)
  })
})

describe('Isolation de chaque module entre organisations', () => {
  it('fiche entreprise : le nouvel espace porte son propre nom, jamais celui de FINITRANS', async () => {
    const r = await B('GET', '/api/admin/entreprise')
    expectStatus(r, 200)
    assert.equal(r.body.raisonSociale, 'Atlas Freight')
    assert.notEqual(r.body.adresse, 'Douala, Cameroun')
  })

  it('employés : aucun compte FINITRANS visible', async () => {
    const r = await B('GET', '/api/employes?limit=200')
    expectStatus(r, 200)
    const emails = r.body.data.map((u: { email: string }) => u.email)
    assert.deepEqual(emails, [EMAIL_B])
  })

  it('tableau de bord : les indicateurs ne comptent que les dossiers de l\'organisation', async () => {
    const r = await B('GET', '/api/dashboard/kpis')
    expectStatus(r, 200)
    assert.equal(r.body.totalDossiers, 0)
    const a = await api('delba', 'GET', '/api/dashboard/kpis')
    assert.ok(a.body.totalDossiers > 0)
  })

  it('compagnies maritimes : une compagnie ajoutée par FINITRANS n\'apparaît pas ailleurs', async () => {
    const nom = `Ligne Test ${Date.now() % 100000}`
    expectStatus(await api('delba', 'POST', '/api/compagnies', { nom }), [200, 201])
    const a = await api('delba', 'GET', '/api/compagnies')
    assert.ok(a.body.some((c: { nom: string }) => c.nom === nom))
    const b = await B('GET', '/api/compagnies')
    expectStatus(b, 200)
    assert.equal(b.body.some((c: { nom: string }) => c.nom === nom), false)
  })

  it('CRM, notifications, DI : aucune donnée de FINITRANS', async () => {
    const clients = await B('GET', '/api/crm/clients')
    expectStatus(clients, 200)
    assert.equal(clients.body.length, 0)
    const notifs = await B('GET', '/api/notifications')
    expectStatus(notifs, 200)
    assert.equal(notifs.body.data.length, 0)
    const di = await B('GET', '/api/di')
    expectStatus(di, 200)
    const liste = Array.isArray(di.body) ? di.body : di.body.data
    assert.equal(liste.length, 0)
  })

  it('numérotation par organisation : le premier dossier du nouvel espace est créé normalement', async () => {
    const r = await B('POST', '/api/dossiers', {
      client: 'CLIENT ATLAS', compagnie: 'MSC', conteneur: 'MSCU3333333', marchandise: 'Textile',
      site: 'Douala', dateArrivee: new Date().toISOString(),
    })
    expectStatus(r, 201, JSON.stringify(r.body))
    const d = await prisma.dossier.findUniqueOrThrow({ where: { id: r.body.id }, select: { organisationId: true } })
    assert.equal(d.organisationId, orgB)
    const tachesB = await prisma.sousEtapeDossier.findMany({ where: { dossierId: r.body.id }, select: { organisationId: true } })
    assert.ok(tachesB.every(t => t.organisationId === orgB), 'les tâches créées en cascade appartiennent à la même organisation')
  })
})

describe('Intégrité en base : aucune référence croisée possible', () => {
  it('un commentaire d\'une organisation sur le dossier d\'une autre est refusé par la base', async () => {
    const auteurB = (await prisma.user.findUniqueOrThrow({ where: { email: EMAIL_B } })).id
    await assert.rejects(
      prisma.commentaire.create({ data: { organisationId: orgB, dossierId: dossierA, auteurId: auteurB, message: 'intrusion' } }),
      /Référence croisée entre organisations interdite/,
    )
  })

  it('une ligne sans organisation prend celle de son parent', async () => {
    const c = await prisma.commentaire.create({ data: { dossierId: dossierA, auteurId: ids.delba, message: 'test trigger' } })
    assert.equal(c.organisationId, orgA)
    await prisma.commentaire.delete({ where: { id: c.id } })
  })

  it('l\'organisation d\'une ligne ne peut pas être changée', async () => {
    await assert.rejects(
      prisma.dossier.update({ where: { id: dossierA }, data: { organisationId: orgB } }),
      /Changement d'organisation interdit/,
    )
  })
})

describe('Abonnements et offres (appliqués côté serveur)', () => {
  it('impayé : consultation possible, aucune modification', async () => {
    await modifierAbonnement({ statut: 'impaye' })
    expectStatus(await B('GET', '/api/dossiers'), 200)
    const r = await B('POST', '/api/dossiers', {
      client: 'X', compagnie: 'MSC', conteneur: 'MSCU4444444', marchandise: 'X', site: 'Douala', dateArrivee: new Date().toISOString(),
    })
    expectStatus(r, 402)
    assert.equal(r.body.error, 'ABONNEMENT_IMPAYE')
  })

  it('suspendu : plus aucun accès, connexion refusée avec un message clair', async () => {
    await modifierAbonnement({ statut: 'suspendu' })
    const r = await B('GET', '/api/dossiers')
    expectStatus(r, 402)
    const login = await req(null, 'POST', '/api/auth/login', { email: EMAIL_B, password: PASSWORD_B })
    expectStatus(login, 402)
    assert.equal(login.body.error, 'ABONNEMENT_INACTIF')
  })

  it('essai terminé : accès refusé', async () => {
    await modifierAbonnement({ statut: 'essai', finEssai: new Date(Date.now() - 86_400_000).toISOString() })
    const r = await B('GET', '/api/dossiers')
    expectStatus(r, 402)
    assert.equal(r.body.error, 'ESSAI_TERMINE')
  })

  it('organisation désactivée par la plateforme : accès refusé', async () => {
    await modifierAbonnement({ statut: 'actif', finEssai: null, actif: false })
    expectStatus(await B('GET', '/api/dossiers'), 402)
    await modifierAbonnement({ actif: true })
    expectStatus(await B('GET', '/api/dossiers'), 200)
  })

  it('limite d\'utilisateurs de l\'offre', async () => {
    await modifierAbonnement({ maxUtilisateurs: 1 })
    const r = await B('POST', '/api/auth/register', {
      email: `agent.${Date.now()}@atlas.test`, password: 'Agent2026secure', nom: 'Agent Atlas', profil: 'operations', site: 'Douala',
    })
    expectStatus(r, 402)
    assert.equal(r.body.error, 'LIMITE_UTILISATEURS')
    await modifierAbonnement({ maxUtilisateurs: null })
  })

  it('offre Starter : les modules hors offre sont fermés côté serveur', async () => {
    await modifierAbonnement({ plan: 'starter' })
    const me = await B('GET', '/api/auth/me')
    assert.equal(me.body.modules.includes('crm'), false)
    expectStatus(await B('GET', '/api/crm/clients'), 403)
    await modifierAbonnement({ plan: 'business' })
    expectStatus(await B('GET', '/api/crm/clients'), 200)
  })
})

describe('Administration de la plateforme', () => {
  it('réservée aux administrateurs de la plateforme', async () => {
    expectStatus(await B('GET', '/api/plateforme/organisations'), 403)
    expectStatus(await B('PATCH', `/api/plateforme/organisations/${orgA}`, { actif: false }), 403)
    expectStatus(await api('yasmine', 'GET', '/api/plateforme/organisations'), 403)
  })

  it('vue d\'ensemble des espaces clients', async () => {
    const r = await api('delba', 'GET', '/api/plateforme/organisations')
    expectStatus(r, 200)
    const b = r.body.organisations.find((o: { id: string }) => o.id === orgB)
    assert.ok(b, 'le nouvel espace est listé')
    assert.equal(b.utilisateursActifs, 1)
    assert.equal(b.dossiers, 1)
  })

  it('l\'administrateur ne peut pas suspendre l\'organisation de la plateforme', async () => {
    expectStatus(await api('delba', 'PATCH', `/api/plateforme/organisations/${orgA}`, { actif: false }), 422)
  })

  it('les sauvegardes complètes (toutes organisations) sont fermées aux dirigeants d\'entreprise', async () => {
    expectStatus(await B('GET', '/api/sauvegardes'), 403)
    expectStatus(await B('POST', '/api/sauvegardes', {}), 403)
  })
})

describe('Demandes de démonstration (site public)', () => {
  it('enregistrée en base, puis visible par la plateforme', async () => {
    const email = `contact.${Date.now()}@prospect.test`
    const r = await req(null, 'POST', '/api/public/demandes-demo', {
      nom: 'Jean Mbarga', entreprise: 'Prospect Logistics', email, pays: 'Cameroun', taille: '11-50', langue: 'fr',
    })
    expectStatus(r, 201)
    const l = await api('delba', 'GET', '/api/plateforme/demandes-demo')
    assert.ok(l.body.demandes.some((d: { email: string }) => d.email === email))
  })

  it('données invalides et robots refusés, sans fausse confirmation', async () => {
    expectStatus(await req(null, 'POST', '/api/public/demandes-demo', { nom: 'J', entreprise: 'P', email: 'pas-un-email' }), 400)
    expectStatus(await req(null, 'POST', '/api/public/demandes-demo', {
      nom: 'Robot', entreprise: 'Spam', email: 'robot@spam.test', site: 'http://spam',
    }), 400)
  })

  it('offres publiées sans prix', async () => {
    const r = await req(null, 'GET', '/api/public/offres')
    expectStatus(r, 200)
    assert.deepEqual(r.body.map((p: { cle: string }) => p.cle), ['starter', 'business', 'enterprise'])
  })
})
