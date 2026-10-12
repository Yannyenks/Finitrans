import { describe, it, after, before } from 'node:test'
import assert from 'node:assert/strict'
import { api, closeApp, expectStatus, forgetSession, getApp, login, unique, userIds, USERS, type UserKey } from './helpers'

const SOCLE = ['dashboard', 'mon_espace', 'messagerie', 'alertes']
const MODULES_ATTENDUS: Record<UserKey, string[]> = {
  delba:   ['administration', 'comptabilite_avancee', 'supervision', 'parametres', 'employes', 'performance'],
  soudi:   ['supervision', 'exploitation', 'parametres', 'employes', 'codage', 'sorties', 'kribi', 'logistique'],
  yaya:    ['dossiers', 'logistique', 'finance'],
  odette:  ['dossiers', 'codage'],
  wandala: ['dossiers', 'sorties', 'finance'],
  rasoul:  ['dossiers', 'sorties', 'finance'],
  yasmine: ['dossiers', 'administratif', 'di', 'finance', 'employes'],
  honore:  ['comptabilite', 'comptabilite_avancee', 'finance', 'di', 'reporting'],
  aliou:   ['dossiers', 'kribi', 'finance'],
  raphael: ['dossiers', 'kribi', 'finance'],
}
const MODULES_INTERDITS: Partial<Record<UserKey, string[]>> = {
  soudi:   ['administration', 'comptabilite_avancee'],
  yaya:    ['administration', 'comptabilite_avancee', 'supervision', 'codage'],
  odette:  ['finance', 'administration', 'supervision'],
  wandala: ['kribi', 'administration', 'supervision'],
  yasmine: ['administration', 'comptabilite_avancee', 'supervision'],
  honore:  ['administration', 'supervision', 'parametres'],
  aliou:   ['sorties', 'administration', 'supervision'],
}

describe('Authentification', () => {
  after(closeApp)

  it('connecte les 10 comptes de l\'organigramme et renvoie modules + rôle', async () => {
    for (const key of Object.keys(USERS) as UserKey[]) {
      const s = await login(key)
      assert.ok(s.token && s.refresh, `tokens ${key}`)
      for (const m of [...SOCLE, ...MODULES_ATTENDUS[key]]) {
        assert.ok(s.user.modules.includes(m), `${key} doit avoir le module ${m}`)
      }
      for (const m of MODULES_INTERDITS[key] ?? []) {
        assert.ok(!s.user.modules.includes(m), `${key} ne doit pas avoir le module ${m}`)
      }
      assert.ok(s.user.profilLabel, 'libellé du rôle')
      assert.equal(s.user.passwordHash, undefined, 'jamais de hash renvoyé')
    }
  })

  it('DG et Exploitation sont superviseurs avec contrôle total', async () => {
    for (const key of ['delba', 'soudi'] as const) {
      const me = await api(key, 'GET', '/api/auth/me')
      expectStatus(me, 200)
      assert.equal(me.body.superviseur, true)
      for (const p of ['permDossier', 'permValidation', 'permFinancier', 'permRapports', 'permAdministration']) {
        assert.equal(me.body[p], 'complet', `${key} ${p}`)
      }
    }
    const odette = await api('odette', 'GET', '/api/auth/me')
    assert.equal(odette.body.superviseur, false)
  })

  it('refuse un mauvais mot de passe et un email inconnu (401)', async () => {
    const a = await getApp()
    const r1 = await a.inject({ method: 'POST', url: '/api/auth/login', payload: { email: USERS.odette, password: 'mauvais-mdp' } })
    assert.equal(r1.statusCode, 401)
    const r2 = await a.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'inconnu@finitrans.cm', password: 'finitrans2025' } })
    assert.equal(r2.statusCode, 401)
    const r3 = await a.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'ODETTE@Finitrans.cm', password: 'finitrans2025' } })
    assert.equal(r3.statusCode, 200, 'email insensible à la casse')
  })

  it('refuse les requêtes sans jeton et avec un refresh token utilisé comme accès', async () => {
    const r = await api(null, 'GET', '/api/dossiers')
    assert.equal(r.status, 401)
    const a = await getApp()
    const s = await login('yaya')
    const r2 = await a.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization: `Bearer ${s.refresh}` } })
    assert.equal(r2.statusCode, 401)
  })

  it('fait tourner le refresh token et révoque l\'ancien', async () => {
    const a = await getApp()
    const res = await a.inject({ method: 'POST', url: '/api/auth/login', payload: { email: USERS.aliou, password: 'finitrans2025' } })
    const { refreshToken } = res.json()
    const r1 = await a.inject({ method: 'POST', url: '/api/auth/refresh', payload: { refreshToken } })
    assert.equal(r1.statusCode, 200)
    assert.ok(r1.json().user.modules.includes('kribi'))
    const r2 = await a.inject({ method: 'POST', url: '/api/auth/refresh', payload: { refreshToken } })
    assert.equal(r2.statusCode, 401, 'ancien refresh révoqué')
  })

  it('chaque compte peut changer son propre mot de passe', async () => {
    const a = await getApp()
    const s = await login('raphael')
    const r = await a.inject({
      method: 'PATCH', url: '/api/auth/me/password', headers: { authorization: `Bearer ${s.token}` },
      payload: { currentPassword: 'finitrans2025', newPassword: 'nouveauMdp2026' },
    })
    assert.equal(r.statusCode, 204)
    forgetSession('raphael')
    await login('raphael', 'nouveauMdp2026')
    const back = await api('raphael', 'PATCH', '/api/auth/me/password', { currentPassword: 'nouveauMdp2026', newPassword: 'finitrans2025' })
    expectStatus(back, 204)
    forgetSession('raphael')
  })
})

describe('Attribution des rôles par type de compte', () => {
  let ids: Record<UserKey, string>
  const crees: string[] = []
  before(async () => { ids = await userIds() })
  // Désactive les comptes de test pour ne pas fausser l'attribution automatique des tests suivants
  after(async () => {
    for (const id of crees) await api('delba', 'DELETE', `/api/employes/${id}`)
    await closeApp()
  })

  it('publie le catalogue des rôles et des modules', async () => {
    const r = await api('odette', 'GET', '/api/roles')
    expectStatus(r, 200)
    assert.equal(r.body.profils.length, 9)
    const dg = r.body.profils.find((p: any) => p.profil === 'dg')
    assert.equal(dg.superviseur, true)
    assert.ok(r.body.modules.some((m: any) => m.cle === 'comptabilite_avancee'))
  })

  it('le DG crée un compte : permissions et modules issus du modèle du rôle', async () => {
    const email = `${unique('agent')}@finitrans.cm`
    const r = await api('delba', 'POST', '/api/employes', {
      email, password: 'MotDePasse2026', nom: 'Agent Test', site: 'Douala', profil: 'logistique',
    })
    expectStatus(r, 201)
    crees.push(r.body.id)
    assert.equal(r.body.permDossier, 'partiel')
    assert.equal(r.body.permFinancier, 'partiel')
    assert.equal(r.body.role, 'Responsable Logistique')
    const s = await login(email, 'MotDePasse2026')
    assert.ok(s.user.modules.includes('logistique'))
    assert.ok(!s.user.modules.includes('administration'))
  })

  it('le Responsable Exploitation attribue un rôle ; un compte simple ne le peut pas', async () => {
    const email = `${unique('agent')}@finitrans.cm`
    const created = await api('soudi', 'POST', '/api/employes', { email, password: 'MotDePasse2026', nom: 'Agent Deux', site: 'Kribi', profil: 'operations' })
    expectStatus(created, 201)
    const id = created.body.id
    crees.push(id)

    const refus = await api('yasmine', 'POST', `/api/roles/attribuer/${id}`, { profil: 'comptabilite' })
    expectStatus(refus, 403, 'Yasmine ne peut pas attribuer de rôle')

    const ok = await api('soudi', 'POST', `/api/roles/attribuer/${id}`, { profil: 'terrain_kribi', compagniesAssignees: ['MSC'] })
    expectStatus(ok, 200)
    assert.equal(ok.body.profil, 'terrain_kribi')
    assert.deepEqual(ok.body.compagniesAssignees, ['MSC'])
    assert.ok(ok.body.modules.includes('kribi'))

    const s = await login(email, 'MotDePasse2026')
    const a = await getApp()
    const me2 = await a.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization: `Bearer ${s.token}` } })
    assert.ok(me2.json().modules.includes('kribi'), 'le nouveau rôle s\'applique immédiatement')
  })

  it('seul le DG peut attribuer le profil DG', async () => {
    const r = await api('soudi', 'POST', `/api/roles/attribuer/${ids.yaya}`, { profil: 'dg' })
    expectStatus(r, 403)
  })

  it('personne ne peut changer son propre rôle ; le dernier DG est protégé', async () => {
    const r = await api('delba', 'POST', `/api/roles/attribuer/${ids.delba}`, { profil: 'exploitation' })
    expectStatus(r, 422)
    const d = await api('soudi', 'DELETE', `/api/employes/${ids.delba}`)
    expectStatus(d, 403)
  })

  it('le DG personnalise un modèle de rôle puis le réinitialise', async () => {
    const r = await api('delba', 'PUT', '/api/roles/validation', { modules: ['dossiers', 'codage', 'reporting'] })
    expectStatus(r, 200)
    assert.ok(r.body.modules.includes('reporting'))
    forgetSession('odette')
    assert.ok((await login('odette')).user.modules.includes('reporting'))

    const refus = await api('soudi', 'PUT', '/api/roles/validation', { modules: ['dossiers'] })
    expectStatus(refus, 403, 'modèles de rôles réservés au DG')

    const reset = await api('delba', 'POST', '/api/roles/validation/reinitialiser')
    expectStatus(reset, 200)
    assert.ok(!reset.body.modules.includes('reporting'))
    forgetSession('odette')
  })

  it('les permissions des superviseurs restent totales', async () => {
    const r = await api('delba', 'PUT', '/api/roles/exploitation', { permissions: { permFinancier: 'lecture' } })
    expectStatus(r, 422)
  })

  it('expose et modifie l\'attribution des étapes (DG)', async () => {
    const r = await api('soudi', 'GET', '/api/roles/attribution')
    expectStatus(r, 200)
    const paiement = r.body.etapes.find((e: any) => e.etape === 'paiement')
    assert.equal(paiement.owner, 'logistique')
    const kribi = r.body.etapes.find((e: any) => e.etape === 'operations_kribi')
    assert.equal(kribi.owner, 'terrain_kribi')

    const refus = await api('soudi', 'PUT', '/api/roles/attribution', { cloture: { owner: 'comptabilite' } })
    expectStatus(refus, 403)
    const inconnue = await api('delba', 'PUT', '/api/roles/attribution', { cloture: { sousEtapes: { inexistante: 'comptabilite' } } })
    expectStatus(inconnue, 422)
    const ok = await api('delba', 'PUT', '/api/roles/attribution', { cloture: { sousEtapes: { rapport_final: 'comptabilite' } } })
    expectStatus(ok, 200)
    assert.equal(ok.body.cloture.sousEtapes.rapport_final, 'comptabilite')
    const reset = await api('delba', 'DELETE', '/api/roles/attribution')
    expectStatus(reset, 200)
    assert.equal(reset.body.cloture.sousEtapes.rapport_final, 'administration')
  })

  it('désactive puis réactive un compte (connexion bloquée entre les deux)', async () => {
    const email = `${unique('temp')}@finitrans.cm`
    const c = await api('delba', 'POST', '/api/employes', { email, password: 'MotDePasse2026', nom: 'Temporaire', site: 'Douala', profil: 'operations' })
    expectStatus(c, 201)
    crees.push(c.body.id)
    expectStatus(await api('soudi', 'DELETE', `/api/employes/${c.body.id}`), 204)
    const a = await getApp()
    const r = await a.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: 'MotDePasse2026' } })
    assert.equal(r.statusCode, 401)
    expectStatus(await api('soudi', 'POST', `/api/employes/${c.body.id}/reactiver`), 200)
    const r2 = await a.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: 'MotDePasse2026' } })
    assert.equal(r2.statusCode, 200)
  })
})
