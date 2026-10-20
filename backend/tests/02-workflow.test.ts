/**
 * Parcours complet d'un dossier : chaque compte termine lui-même les tâches qui lui
 * sont attribuées ; DG et Exploitation supervisent et gardent le contrôle total.
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { api, closeApp, expectStatus, upload, userIds, type UserKey } from './helpers'

type Task = { etape: string; cle: string; responsableId: string | null; statut: string }

let ids: Record<UserKey, string>
const nameOf = (id: string | null) => Object.entries(ids).find(([, v]) => v === id)?.[0] ?? String(id)

async function tasks(who: UserKey, dossierId: string, etape?: string): Promise<Task[]> {
  const r = await api(who, 'GET', `/api/dossiers/${dossierId}/sous-etapes`)
  expectStatus(r, 200, 'sous-étapes')
  return etape ? r.body.filter((t: Task) => t.etape === etape) : r.body
}

/** Le titulaire de chaque tâche de l'étape la valide lui-même. */
async function completeStage(dossierId: string, etape: string) {
  const list = await tasks('delba', dossierId, etape)
  // L'étape Validation n'a plus de tâche : elle se termine avec une preuve
  if (etape !== 'validation') assert.ok(list.length > 0, `tâches de ${etape}`)
  for (const t of list) {
    const owner = nameOf(t.responsableId) as UserKey
    assert.ok(ids[owner], `tâche ${etape}/${t.cle} attribuée (${t.responsableId})`)
    const r = await api(owner, 'PUT', `/api/dossiers/${dossierId}/sous-etapes/${etape}/${t.cle}`, {
      statut: 'valide', metadata: { saisi_par: owner },
    })
    expectStatus(r, 200, `${owner} valide ${etape}/${t.cle}`)
  }
}

async function preuve(who: UserKey, dossierId: string, etape: string) {
  const r = await upload(who, `/api/dossiers/${dossierId}/upload`,
    { name: `preuve-${etape}-${Date.now()}.pdf`, type: 'application/pdf', content: `%PDF preuve ${etape} ${Math.random()}` },
    { etape })
  expectStatus(r, 201, `preuve ${etape} par ${who}`)
}

async function advance(who: UserKey, dossierId: string, status: string, expected = 200) {
  const r = await api(who, 'PATCH', `/api/dossiers/${dossierId}/status`, { status })
  expectStatus(r, expected, `${who} → ${status}`)
  return r.body
}

describe('Workflow Douala (MSC) — chaque responsable termine son étape', () => {
  let dossierId = ''
  before(async () => { ids = await userIds() })
  after(closeApp)

  it('le Service administratif enregistre le dossier : attribution automatique', async () => {
    const r = await api('yasmine', 'POST', '/api/dossiers', {
      client: 'CLIENT TEST DOUALA', compagnie: 'MSC', conteneur: 'MSCU0000001', marchandise: 'Pièces détachées',
      site: 'Douala', dateArrivee: new Date().toISOString(), priorite: 'haute', numeroBL: 'BL-TEST-1',
    })
    expectStatus(r, 201, 'création par Yasmine')
    dossierId = r.body.id
    assert.match(r.body.numero, /^DOS-\d{4}-\d{4}$/)
    assert.equal(r.body.responsableId, ids.yasmine, 'réception → Service administratif')

    const all = await tasks('yasmine', dossierId)
    const owner = (etape: string, cle: string) => nameOf(all.find(t => t.etape === etape && t.cle === cle)!.responsableId)
    assert.equal(owner('reception', 'bl'), 'yasmine')
    assert.equal(owner('reception', 'saisie_pr'), 'odette')
    assert.equal(owner('reception', 'paiement_client'), 'honore')
    assert.equal(owner('codage', 'etat_codage'), 'odette')
    assert.equal(owner('paiement', 'paiement_droits'), 'yaya')
    assert.equal(owner('bon_compagnie', 'facturation_compagnie'), 'wandala', 'MSC → Wandala')
    assert.equal(owner('operations_douala', 'bad_terminal'), 'wandala', 'Opérations Douala → Mr Wandala (MSC)')
    assert.equal(owner('cloture', 'rapport_final'), 'yasmine')
    assert.ok(!all.some(t => t.etape === 'operations_kribi'), 'pas d\'étape Kribi pour Douala')
    // Fournisseur & soumission + RVC : M. Soudi ; ailleurs, la Direction supervise
    assert.equal(owner('soumission_sgs', 'ff_soumission'), 'soudi')
    assert.equal(owner('soumission_sgs', 'pvc'), 'soudi')
    assert.ok(all.filter(t => t.etape !== 'soumission_sgs').every(t => t.responsableId !== ids.delba && t.responsableId !== ids.soudi), 'DG/Exploitation supervisent seulement')
  })

  it('les tâches apparaissent dans « Mon espace » de chaque compte', async () => {
    const odette = await api('odette', 'GET', '/api/employe/mes-taches')
    expectStatus(odette, 200)
    assert.ok(odette.body.taches.some((t: any) => t.dossier.id === dossierId && t.cle === 'saisie_pr' && t.actionnable))
    const honore = await api('honore', 'GET', '/api/employe/mes-taches')
    assert.ok(honore.body.taches.some((t: any) => t.dossier.id === dossierId && t.cle === 'paiement_client'))
    const list = await api('odette', 'GET', '/api/dossiers?limit=100')
    assert.ok(list.body.data.some((d: any) => d.id === dossierId), 'Odette voit le dossier où elle intervient')
    const aliou = await api('aliou', 'GET', '/api/dossiers?limit=100')
    assert.ok(!aliou.body.data.some((d: any) => d.id === dossierId), 'Aliou ne voit pas un dossier Douala qui ne le concerne pas')
  })

  it('un compte ne peut pas valider ni réattribuer la tâche d\'un autre', async () => {
    const r = await api('odette', 'PUT', `/api/dossiers/${dossierId}/sous-etapes/reception/bl`, { statut: 'valide' })
    expectStatus(r, 403)
    // Odette n'a encore rien terminé à la réception : elle ne peut pas réattribuer la tâche de Yasmine
    const r2 = await api('odette', 'PUT', `/api/dossiers/${dossierId}/sous-etapes/reception/bl`, { responsableId: ids.yaya })
    expectStatus(r2, 403, 'réattribution par un compte non habilité')
  })

  it('l\'étape ne peut pas être terminée tant que les tâches ne sont pas validées', async () => {
    const r = await advance('yasmine', dossierId, 'soumission_sgs', 422)
    assert.equal(r.error, 'SOUS_ETAPES_INCOMPLETES')
    const ns = await api('yasmine', 'GET', `/api/dossiers/${dossierId}/next-step`)
    assert.equal(ns.body.peutAvancer, false)
    assert.ok(ns.body.raisons.length > 0)
  })

  it('chaque titulaire valide ses tâches de réception ; la preuve est exigée', async () => {
    await completeStage(dossierId, 'reception')
    const r = await advance('yasmine', dossierId, 'soumission_sgs', 422)
    assert.equal(r.error, 'PREUVE_REQUISE')
    // Le comptable joint la preuve de paiement client sur SA tâche
    const p = await upload('honore', `/api/dossiers/${dossierId}/sous-etapes/reception/paiement_client/preuve`,
      { name: 'recu-client.pdf', type: 'application/pdf', content: '%PDF recu client' })
    expectStatus(p, 201, 'preuve de tâche')
    assert.ok(p.body.metadata.preuve_url.includes('/documents/'))
    const doc = await api('honore', 'GET', p.body.metadata.preuve_url)
    expectStatus(doc, 200, 'téléchargement de la preuve')
    assert.match(doc.raw, /PDF recu client/)
  })

  it('un compte non concerné ne peut pas terminer l\'étape ; on ne saute pas d\'étape', async () => {
    await advance('yaya', dossierId, 'soumission_sgs', 403)
    const skip = await advance('yasmine', dossierId, 'codage', 422)
    assert.equal(skip.error, 'ETAPE_INVALIDE')
  })

  it('Réception → Soumission SGS → Codage (passation automatique à la Validation)', async () => {
    const ns = await api('yasmine', 'GET', `/api/dossiers/${dossierId}/next-step`)
    assert.equal(ns.body.peutAvancer, true, JSON.stringify(ns.body.raisons))
    const d1 = await advance('yasmine', dossierId, 'soumission_sgs')
    assert.equal(d1.status, 'soumission_sgs')
    // Fournisseur & soumission + RVC : M. Soudi (Exploitation)
    assert.equal(d1.responsableId, ids.soudi, 'soumission SGS → Mr Soudi')
    await completeStage(dossierId, 'soumission_sgs')
    await preuve('soudi', dossierId, 'soumission_sgs')
    const d2 = await advance('soudi', dossierId, 'codage')
    assert.equal(d2.responsableId, ids.odette, 'codage → Mme Odette')
    const notifs = await api('odette', 'GET', '/api/notifications?limit=50')
    assert.ok(notifs.body.data.some((n: any) => n.dossierId === dossierId && n.type === 'action_requise'))
  })

  it('Codage → Validation → Paiement (Mme Odette termine elle-même)', async () => {
    await completeStage(dossierId, 'codage')
    await preuve('odette', dossierId, 'codage')
    await advance('odette', dossierId, 'validation')
    await completeStage(dossierId, 'validation')
    await preuve('odette', dossierId, 'validation')
    const d = await advance('odette', dossierId, 'paiement')
    assert.equal(d.responsableId, ids.yaya, 'paiement → Mr Yaya')
    await advance('odette', dossierId, 'bon_compagnie', 403)
  })

  it('Paiement → Bon compagnie (Mr Yaya), attribué à Mr Wandala pour MSC', async () => {
    await completeStage(dossierId, 'paiement')
    await preuve('yaya', dossierId, 'paiement')
    const d = await advance('yaya', dossierId, 'bon_compagnie')
    assert.equal(d.responsableId, ids.wandala)
  })

  it('Bon compagnie → Opérations Douala → Clôture (pas d\'étape Kribi pour un dossier Douala)', async () => {
    await completeStage(dossierId, 'bon_compagnie')
    await preuve('wandala', dossierId, 'bon_compagnie')
    await advance('wandala', dossierId, 'operations_kribi', 422)
    await advance('wandala', dossierId, 'operations_douala')
    await completeStage(dossierId, 'operations_douala')
    await preuve('wandala', dossierId, 'operations_douala')
    const d = await advance('wandala', dossierId, 'cloture')
    assert.equal(d.responsableId, ids.yasmine)
    await completeStage(dossierId, 'cloture')
    const ns = await api('yasmine', 'GET', `/api/dossiers/${dossierId}/next-step`)
    assert.equal(ns.body.etapeSuivante, null)
    assert.equal(ns.body.completion.allDone, true)
  })

  it('l\'historique trace chaque responsable d\'étape', async () => {
    const d = await api('delba', 'GET', `/api/dossiers/${dossierId}`)
    const traitePar = Object.fromEntries(d.body.timings.filter((t: any) => t.dateFin).map((t: any) => [t.etape, nameOf(t.responsableId)]))
    assert.equal(traitePar.reception, 'yasmine')
    assert.equal(traitePar.codage, 'odette')
    assert.equal(traitePar.paiement, 'yaya')
    assert.equal(traitePar.bon_compagnie, 'wandala')
    const audit = await api('delba', 'GET', `/api/dossiers/${dossierId}/audit`)
    assert.ok(audit.body.filter((a: any) => a.action === 'SOUS_ETAPE_VALIDEE').length >= 15)
  })
})

describe('Workflow Kribi (MAERSK) et supervision', () => {
  let dossierId = ''
  before(async () => { ids = await userIds() })
  after(closeApp)

  it('dossier Kribi MAERSK : sorties → Mr Rasoul, terrain → Mr Raphael', async () => {
    const r = await api('yasmine', 'POST', '/api/dossiers', {
      client: 'CLIENT TEST KRIBI', compagnie: 'MAERSK', conteneur: 'MSKU0000002', marchandise: 'Engrais',
      site: 'Kribi', dateArrivee: new Date().toISOString(),
    })
    expectStatus(r, 201)
    dossierId = r.body.id
    const all = await tasks('delba', dossierId)
    const bc = all.filter(t => t.etape === 'bon_compagnie')
    assert.deepEqual(bc.map(t => t.cle).sort(), ['bon_a_delivrer', 'facturation_compagnie'], 'partie terminal traitée à Kribi')
    assert.ok(bc.every(t => t.responsableId === ids.rasoul))
    const kr = all.filter(t => t.etape === 'operations_kribi')
    assert.equal(kr.length, 3)
    assert.ok(kr.every(t => t.responsableId === ids.raphael), 'MAERSK Kribi → Raphael')
  })

  it('le Responsable Exploitation peut forcer une étape (contrôle total)', async () => {
    const d = await advance('soudi', dossierId, 'bon_compagnie')
    assert.equal(d.status, 'bon_compagnie')
    assert.equal(d.responsableId, ids.rasoul)
  })

  it('Mr Rasoul termine le bon compagnie → Opérations Kribi (Mr Raphael) → Clôture', async () => {
    await completeStage(dossierId, 'bon_compagnie')
    await preuve('rasoul', dossierId, 'bon_compagnie')
    const d = await advance('rasoul', dossierId, 'operations_kribi')
    assert.equal(d.responsableId, ids.raphael)
    await completeStage(dossierId, 'operations_kribi')
    await preuve('raphael', dossierId, 'operations_kribi')
    const c = await advance('raphael', dossierId, 'cloture')
    assert.equal(c.status, 'cloture')
  })

  it('la supervision voit le pipeline, la charge et peut réattribuer', async () => {
    const r = await api('yasmine', 'POST', '/api/dossiers', {
      client: 'CLIENT REATTRIB', compagnie: 'MSC', conteneur: 'MSCU0000003', marchandise: 'Divers',
      site: 'Kribi', dateArrivee: new Date().toISOString(),
    })
    const id = r.body.id
    await tasks('delba', id)

    expectStatus(await api('yaya', 'GET', '/api/supervision/pipeline'), 403)
    const p = await api('soudi', 'GET', '/api/supervision/pipeline')
    expectStatus(p, 200)
    const row = p.body.dossiers.find((d: any) => d.id === id)
    assert.ok(row && row.etape.total === 5, 'réception : 5 tâches (sous-étape SGS retirée)')
    const charge = await api('delba', 'GET', '/api/supervision/charge')
    expectStatus(charge, 200)
    assert.ok(charge.body.find((u: any) => u.id === ids.aliou).tachesOuvertes >= 3)

    const re = await api('delba', 'POST', '/api/supervision/reattribuer', { deUserId: ids.aliou, versUserId: ids.raphael, dossierId: id })
    expectStatus(re, 200)
    assert.equal(re.body.tachesTransferees, 3)
    const kr = await tasks('delba', id, 'operations_kribi')
    assert.ok(kr.every(t => t.responsableId === ids.raphael))
  })

  it('une tâche non attribuée peut être prise en charge par le bon profil uniquement', async () => {
    const r = await api('yasmine', 'POST', '/api/dossiers', {
      client: 'CLIENT PRISE', compagnie: 'COSCO', conteneur: 'COSU0000004', marchandise: 'Divers',
      site: 'Douala', dateArrivee: new Date().toISOString(),
    })
    const id = r.body.id
    await tasks('delba', id)
    expectStatus(await api('soudi', 'PUT', `/api/dossiers/${id}/sous-etapes/reception/saisie_pr`, { responsableId: null }), 200)
    expectStatus(await api('yaya', 'POST', `/api/dossiers/${id}/sous-etapes/reception/saisie_pr/prendre`), 403)
    const mine = await api('odette', 'GET', '/api/employe/mes-taches')
    assert.ok(mine.body.aPrendre.some((t: any) => t.dossier.id === id && t.cle === 'saisie_pr'))
    const ok = await api('odette', 'POST', `/api/dossiers/${id}/sous-etapes/reception/saisie_pr/prendre`)
    expectStatus(ok, 200)
    assert.equal(ok.body.responsableId, ids.odette)
    expectStatus(await api('odette', 'PUT', `/api/dossiers/${id}/sous-etapes/reception/saisie_pr`, { statut: 'valide' }), 200)
  })

  it('gestion des sorties : Mr Wandala suit aussi les dossiers MAERSK, mais ne peut pas les faire avancer', async () => {
    const w = await api('wandala', 'GET', '/api/dossiers?limit=100')
    assert.ok(w.body.data.some((d: any) => d.id === dossierId), 'visible par toute la gestion des sorties')
    const d = (await api('delba', 'GET', `/api/dossiers/${dossierId}`)).body
    const suivante = (await api('delba', 'GET', `/api/dossiers/${dossierId}/next-step`)).body.etapeSuivante
    if (suivante && d.responsableId !== ids.wandala) await advance('wandala', dossierId, suivante, 403)
    const ra = await api('rasoul', 'GET', '/api/dossiers?limit=100')
    assert.ok(ra.body.data.some((d: any) => d.id === dossierId))
    const h = await api('honore', 'GET', '/api/dossiers?limit=100')
    assert.ok(h.body.data.some((d: any) => d.id === dossierId), 'la comptabilité voit tous les dossiers')
  })
})
