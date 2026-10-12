/**
 * Évolutions : historique DI, alerte seuil DI, logistique (véhicules / chauffeurs / TC / date),
 * mentions dans la messagerie, passation choisie en fin d'étape.
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { api, closeApp, expectStatus, unique, upload, userIds, type UserKey } from './helpers'

let ids: Record<UserKey, string>
before(async () => { ids = await userIds() })
after(closeApp)

describe('Historique et alerte des DI', () => {
  let diId = ''
  it('historique global filtrable des mouvements, avec totaux et export CSV', async () => {
    const numero = unique('DI-HIST')
    const c = await api('yasmine', 'POST', '/api/di', { numero, client: 'CLIENT HISTO', montant: 1_000_000, dateEmission: new Date().toISOString() })
    expectStatus(c, 201)
    diId = c.body.id
    expectStatus(await api('yasmine', 'POST', `/api/di/${diId}/mouvements`, { type: 'debit', montant: 850_000, motif: 'Droits douane HISTO', categorie: 'droits_douane', referenceFacture: unique('F') }), 201)

    const h = await api('honore', 'GET', `/api/di/mouvements?diId=${diId}`)
    expectStatus(h, 200)
    assert.equal(h.body.data.length, 2, 'ouverture + débit')
    assert.equal(h.body.totaux.debits, 850_000)
    assert.equal(h.body.data[0].di.numero, numero)
    const filtre = await api('honore', 'GET', `/api/di/mouvements?type=debit&q=HISTO`)
    assert.ok(filtre.body.data.every((m: any) => m.type === 'debit'))
    const csv = await api('honore', 'GET', `/api/di/mouvements/export?diId=${diId}`)
    expectStatus(csv, 200)
    assert.match(String(csv.headers['content-type']), /text\/csv/)
    assert.match(csv.raw, /Droits douane HISTO/)
    expectStatus(await api('odette', 'GET', '/api/di/mouvements'), 403)
  })

  it('les DI sous 20 % sont listées pour l\'alarme sonore', async () => {
    const r = await api('yasmine', 'GET', '/api/di/alertes-seuil')
    expectStatus(r, 200)
    const d = r.body.find((x: any) => x.id === diId)
    assert.ok(d, 'DI à 15 % présente')
    assert.equal(d.alerteNiveau, 'warning')
    assert.equal(d.tauxRestant, 15)
  })
})

describe('Logistique : véhicules, chauffeurs, TC, date', () => {
  it('Mr Yaya enregistre véhicule et chauffeur puis planifie et livre un transport', async () => {
    const immat = `LT ${Math.floor(Math.random() * 9000 + 1000)} AB`
    const cam = await api('yaya', 'POST', '/api/logistique/camions', { immatriculation: immat.toLowerCase(), marque: 'Mercedes Actros', capacite: '40', transporteur: 'FINITRANS' })
    expectStatus(cam, 201)
    assert.equal(cam.body.immatriculation, immat)
    expectStatus(await api('yaya', 'POST', '/api/logistique/camions', { immatriculation: immat }), 409, 'immatriculation unique')

    const ch = await api('yaya', 'POST', '/api/logistique/chauffeurs', { nom: 'NJOYA Paul', telephone: '+237 677 11 22 33', numeroPermis: 'CM-123456' })
    expectStatus(ch, 201)

    const dossiers = await api('delba', 'GET', '/api/dossiers?limit=1')
    const dossier = dossiers.body.data[0]
    const t = await api('yaya', 'POST', '/api/logistique/transports', {
      dossierId: dossier.id, conteneur: 'mscu1234567', camionId: cam.body.id, chauffeurId: ch.body.id,
      dateEnlevement: new Date().toISOString(), destination: 'Yaoundé — entrepôt client',
    })
    expectStatus(t, 201)
    assert.equal(t.body.conteneur, 'MSCU1234567')
    assert.equal(t.body.chauffeur.nom, 'NJOYA Paul')
    assert.equal(t.body.statut, 'planifie')

    const livre = await api('yaya', 'PATCH', `/api/logistique/transports/${t.body.id}`, { statut: 'livre' })
    expectStatus(livre, 200)
    assert.ok(livre.body.dateLivraison, 'date de livraison renseignée automatiquement')

    const liste = await api('yaya', 'GET', `/api/logistique/transports?q=MSCU1234567`)
    assert.ok(liste.body.data.some((x: any) => x.id === t.body.id))
    const audit = await api('delba', 'GET', `/api/dossiers/${dossier.id}/audit`)
    assert.ok(audit.body.some((a: any) => a.action === 'TRANSPORT'))
    const resume = await api('yaya', 'GET', '/api/logistique/resume')
    expectStatus(resume, 200)
    assert.ok(resume.body.chauffeursActifs >= 1)
  })

  it('les chauffeurs sont consultables par tous ; la gestion est réservée au module Logistique', async () => {
    expectStatus(await api('aliou', 'GET', '/api/logistique/chauffeurs?actifs=true'), 200)
    expectStatus(await api('aliou', 'POST', '/api/logistique/chauffeurs', { nom: 'Test', telephone: '699000000' }), 403)
    expectStatus(await api('odette', 'GET', '/api/logistique/transports'), 403)
    expectStatus(await api('soudi', 'GET', '/api/logistique/transports'), 200)
  })
})

describe('Messagerie : mentionner une personne', () => {
  it('la personne mentionnée est notifiée et rejoint la conversation', async () => {
    const c = await api('yaya', 'POST', '/api/messagerie/conversations', { titre: unique('Coordination'), participantIds: [ids.wandala] })
    expectStatus(c, 201)
    const m = await api('yaya', 'POST', `/api/messagerie/conversations/${c.body.id}/messages`, {
      contenu: '@Mme ODETTE peux-tu vérifier le codage ?', mentions: [ids.odette],
    })
    expectStatus(m, 201)
    const notifs = await api('odette', 'GET', '/api/notifications?limit=10')
    assert.ok(notifs.body.data.some((n: any) => n.titre === 'Mr YAYA vous a mentionné'))
    const msgs = await api('odette', 'GET', `/api/messagerie/conversations/${c.body.id}/messages`)
    expectStatus(msgs, 200, 'Odette a maintenant accès à la conversation')
    assert.deepEqual(msgs.body.data[0].mentions, [ids.odette])
  })
})

describe('Passation : celui qui termine l\'étape choisit qui continue', () => {
  it('la personne choisie devient responsable et reçoit les tâches de l\'étape suivante', async () => {
    const r = await api('yasmine', 'POST', '/api/dossiers', {
      client: 'CLIENT PASSATION', compagnie: 'MSC', conteneur: 'MSCU7777777', marchandise: 'Divers',
      site: 'Douala', dateArrivee: new Date().toISOString(),
    })
    const id = r.body.id
    const taches = await api('delba', 'GET', `/api/dossiers/${id}/sous-etapes`)
    const nom = (uid: string) => Object.entries(ids).find(([, v]) => v === uid)?.[0] as UserKey
    for (const t of taches.body.filter((x: any) => x.etape === 'reception')) {
      expectStatus(await api(nom(t.responsableId), 'PUT', `/api/dossiers/${id}/sous-etapes/reception/${t.cle}`, { statut: 'valide' }), 200)
    }
    expectStatus(await upload('yasmine', `/api/dossiers/${id}/upload`, { name: 'p.pdf', type: 'application/pdf', content: `%PDF ${Date.now()}` }, { etape: 'reception' }), 201)

    // Mme Yasmine confie la soumission SGS à Mme Odette au lieu de l'attribution automatique
    const d = await api('yasmine', 'PATCH', `/api/dossiers/${id}/status`, { status: 'soumission_sgs', responsableId: ids.odette, note: 'Odette prend la suite' })
    expectStatus(d, 200)
    assert.equal(d.body.responsableId, ids.odette)
    const apres = await api('odette', 'GET', `/api/dossiers/${id}/sous-etapes`)
    const sgs = apres.body.filter((x: any) => x.etape === 'soumission_sgs')
    assert.ok(sgs.length > 0 && sgs.every((x: any) => x.responsableId === ids.odette))
    const ns = await api('odette', 'GET', `/api/employe/mes-taches`)
    assert.ok(ns.body.taches.some((t: any) => t.dossier.id === id && t.actionnable))
  })
})
