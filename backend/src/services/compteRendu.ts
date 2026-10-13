/**
 * Compte rendu d'évolution d'un dossier (PDF A4) : identité, parcours complet étape par étape,
 * tâches réalisées, codage, synthèse financière, logistique, documents, échanges et journal d'audit.
 * Généré à la demande et archivé automatiquement dans la bibliothèque à la clôture du dossier.
 */
import { createHash } from 'crypto'
import PDFDocument from 'pdfkit'
import { prisma } from '../config/prisma'
import { getEntreprise } from '../routes/admin.routes'
import { SOUS_ETAPES_CONFIG, STATUS_LABELS, stagesForSite } from './workflow'
import type { DossierStatus } from '@prisma/client'

// ── Charte ────────────────────────────────────────────────────────────────────
const C = {
  marine: '#0B1F3A', marine2: '#16335C', or: '#C9A227', encre: '#1F2937', gris: '#6B7280',
  trait: '#E5E7EB', fond: '#F5F7FA', vert: '#15803D', rouge: '#B91C1C', ambre: '#B45309', bleu: '#1D4ED8',
}
const MARGE = 42
const LARGEUR = 595.28 - MARGE * 2
const BAS = 841.89 - 60

// ── Formatage (polices standard PDF : jeu WinAnsi uniquement) ────────────────
const WINANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ')
export function txt(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  return String(v)
    .replace(/[   ]/g, ' ')
    .replace(/[→⇒]/g, '->').replace(/[✓✔]/g, 'OK').replace(/≥/g, '>=').replace(/≤/g, '<=')
    .split('').filter(ch => ch.charCodeAt(0) < 256 || WINANSI_EXTRA.has(ch)).join('')
    .replace(/\s+\n/g, '\n').trim() || '—'
}
const nombre = (n: unknown) => Math.round(Number(n ?? 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
const fcfa = (n: unknown) => (n === null || n === undefined ? '—' : `${nombre(n)} FCFA`)
const TZ = 'Africa/Douala'
const jour = (d?: Date | string | null) => (d ? txt(new Date(d).toLocaleDateString('fr-FR', { timeZone: TZ })) : '—')
const heure = (d?: Date | string | null) =>
  d ? txt(new Date(d).toLocaleString('fr-FR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })) : '—'
const jours = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000 * 10) / 10)

const STATUT_TACHE: Record<string, string> = { todo: 'À faire', en_cours: 'En cours', valide: 'Réalisée', rejete: 'Rejetée' }
const STATUT: Record<string, string> = {
  paye: 'Payé', en_attente: 'En attente', en_retard: 'En retard', effectue: 'Effectué', annule: 'Annulé',
  proforma: 'Proforma', validee: 'À encaisser', reglee: 'Réglée', valide: 'Validée', soumis: 'Soumise', rejete: 'Rejetée',
  brouillon: 'Brouillon', emis: 'Émis', utilise: 'Utilisé', expire: 'Expiré', planifie: 'Planifié', en_route: 'En route',
  livre: 'Livré', retour_vide: 'Retour à vide',
}
const libelleAction = (a: string) => { const t = a.replace(/_/g, ' ').toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1) }
const libellesEtapes = (t: string) => t.replace(/(reception|soumission_sgs|codage|validation|paiement|bon_compagnie|operations_kribi|cloture)/g, k => STATUS_LABELS[k as DossierStatus] ?? k)
const statut = (s: string) => STATUT[s] ?? s.replace(/_/g, ' ')

/** Détails métier saisis sur une tâche (paiement, facture, immatriculation…) */
function detailsTache(meta: Record<string, any> | null): string {
  if (!meta) return ''
  const d: string[] = []
  if (meta.pvc_resultat) d.push(`PVC : ${meta.pvc_resultat === 'succes' ? 'succès' : 'rejet'}${meta.pvc_motif ? ` (${meta.pvc_motif})` : ''}`)
  if (meta.paiement_montant) d.push(`Montant : ${fcfa(String(meta.paiement_montant).replace(/\s/g, ''))}`)
  if (meta.paiement_quittance || meta.reference) d.push(`Quittance : ${meta.paiement_quittance ?? meta.reference}`)
  if (meta.mode_paiement) d.push(`Mode : ${meta.mode_paiement}`)
  for (const p of ['bc', 'term', 'kct']) {
    if (meta[`${p}_montant`]) d.push(`Facture ${meta[`${p}_facture_numero`] ?? ''} : ${fcfa(meta[`${p}_montant`])}`.replace('  ', ' '))
  }
  if (meta.immatriculation) d.push(`Véhicule : ${meta.immatriculation}`)
  if (meta.gp_chauffeur || meta.kgp_chauffeur) d.push(`Chauffeur : ${meta.gp_chauffeur ?? meta.kgp_chauffeur}`)
  if (meta.gate_pass_numero) d.push(`Gate pass ${meta.gate_pass_numero}`)
  return d.join(' · ')
}

// ── Collecte ──────────────────────────────────────────────────────────────────
async function collecter(dossierId: string) {
  const dossier = await prisma.dossier.findUnique({
    where: { id: dossierId },
    include: {
      responsable:        { select: { nom: true, role: true } },
      di:                 { select: { numero: true, montant: true, soldeActuel: true, client: true } },
      timings:            { orderBy: { dateDebut: 'asc' }, include: { responsable: { select: { nom: true, profil: true } } } },
      sousEtapes:         { include: { responsable: { select: { nom: true } }, completedBy: { select: { nom: true } } } },
      affectations:       { include: { responsable: { select: { nom: true } }, assignePar: { select: { nom: true } } } },
      documents:          { select: { nom: true, type: true, taille: true, etape: true, categorie: true, createdAt: true, uploader: { select: { nom: true } } }, orderBy: { createdAt: 'asc' } },
      commentaires:       { orderBy: { createdAt: 'asc' }, include: { auteur: { select: { nom: true } } } },
      auditEntries:       { orderBy: { createdAt: 'asc' }, include: { auteur: { select: { nom: true } } } },
      paiementsDouane:    { orderBy: { datePaiement: 'asc' } },
      paiementsCompagnie: { orderBy: { datePaiement: 'asc' } },
      virements:          { orderBy: { dateVirement: 'asc' } },
      factures:           { orderBy: { dateFacture: 'asc' } },
      etatsCodeage:       { orderBy: { createdAt: 'asc' }, include: { validePar: { select: { nom: true } } } },
      gatePasses:         { orderBy: { dateEmission: 'asc' }, include: { emetteur: { select: { nom: true } } } },
      transports:         { orderBy: { dateEnlevement: 'asc' }, include: { camion: { select: { immatriculation: true } }, chauffeur: { select: { nom: true } } } },
      soumissionsSGS:     { orderBy: { dateDepot: 'asc' } },
    },
  })
  return dossier
}

type Dossier = NonNullable<Awaited<ReturnType<typeof collecter>>>

// ── Rendu ─────────────────────────────────────────────────────────────────────
type Colonne = { titre: string; largeur: number; align?: 'left' | 'right' | 'center' }

class Rendu {
  doc: PDFKit.PDFDocument
  constructor(doc: PDFKit.PDFDocument) { this.doc = doc }

  get y() { return this.doc.y }
  place(h: number) { if (this.doc.y + h > BAS) { this.doc.addPage(); this.doc.y = MARGE + 14 } }

  section(numero: string, titre: string, sousTitre?: string) {
    this.place(70)
    const d = this.doc
    d.moveDown(0.8)
    const y = d.y
    d.save().rect(MARGE, y, 3, 18).fill(C.or).restore()
    d.font('Helvetica-Bold').fontSize(8).fillColor(C.or).text(numero, MARGE + 10, y + 1, { characterSpacing: 1.2 })
    d.font('Helvetica-Bold').fontSize(13).fillColor(C.marine).text(txt(titre).toUpperCase(), MARGE + 32, y + 1, { characterSpacing: 0.6 })
    if (sousTitre) d.font('Helvetica').fontSize(8).fillColor(C.gris).text(txt(sousTitre), MARGE + 10, y + 19)
    d.y = y + (sousTitre ? 32 : 26)
    d.x = MARGE
  }

  vide(message: string) {
    this.place(24)
    this.doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(C.gris).text(txt(message), MARGE + 10, this.doc.y)
    this.doc.moveDown(0.4)
  }

  table(colonnes: Colonne[], lignes: (string | { t: string; couleur?: string; gras?: boolean })[][], opts: { total?: string[] } = {}) {
    const d = this.doc
    const total = colonnes.reduce((s, c) => s + c.largeur, 0)
    const cols = colonnes.map(c => ({ ...c, largeur: (c.largeur / total) * LARGEUR }))
    const pad = 5
    const entete = () => {
      d.font('Helvetica-Bold').fontSize(7.2)
      const hEntete = Math.max(18, ...cols.map(c => d.heightOfString(txt(c.titre).toUpperCase(), { width: c.largeur - pad * 2, characterSpacing: 0.4 }) + 10))
      this.place(hEntete + 18)
      const y = d.y
      d.save().rect(MARGE, y, LARGEUR, hEntete).fill(C.marine).restore()
      let x = MARGE
      d.fillColor('#FFFFFF')
      for (const c of cols) { d.text(txt(c.titre).toUpperCase(), x + pad, y + 5.5, { width: c.largeur - pad * 2, align: c.align ?? 'left', characterSpacing: 0.4 }); x += c.largeur }
      d.y = y + hEntete
    }
    entete()
    const rendreLigne = (cells: (string | { t: string; couleur?: string; gras?: boolean })[], i: number, estTotal = false) => {
      d.font(estTotal ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.8)
      const valeurs = cells.map(c => (typeof c === 'string' ? { t: c } : c))
      const h = Math.max(16, ...valeurs.map((v, k) => d.heightOfString(txt(v.t), { width: cols[k].largeur - pad * 2 }) + 8))
      if (d.y + h > BAS) { d.addPage(); d.y = MARGE + 14; entete() }
      const y = d.y
      if (estTotal) d.save().rect(MARGE, y, LARGEUR, h).fill('#EEF2F7').restore()
      else if (i % 2 === 1) d.save().rect(MARGE, y, LARGEUR, h).fill(C.fond).restore()
      let x = MARGE
      valeurs.forEach((v, k) => {
        d.font(v.gras || estTotal ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.8).fillColor(v.couleur ?? C.encre)
          .text(txt(v.t), x + pad, y + 4, { width: cols[k].largeur - pad * 2, align: cols[k].align ?? 'left' })
        x += cols[k].largeur
      })
      d.save().moveTo(MARGE, y + h).lineTo(MARGE + LARGEUR, y + h).lineWidth(0.5).strokeColor(C.trait).stroke().restore()
      d.y = y + h
    }
    lignes.forEach((l, i) => rendreLigne(l, i))
    if (opts.total) rendreLigne(opts.total, 0, true)
    d.x = MARGE
    d.moveDown(0.3)
  }

  champs(paires: [string, unknown][], colonnes = 3) {
    const d = this.doc
    const largeur = LARGEUR / colonnes
    for (let i = 0; i < paires.length; i += colonnes) {
      const rang = paires.slice(i, i + colonnes)
      d.font('Helvetica-Bold').fontSize(9)
      const h = Math.max(...rang.map(([, v]) => d.heightOfString(txt(v), { width: largeur - 16 }))) + 18
      this.place(h + 4)
      const y = d.y
      rang.forEach(([label, valeur], k) => {
        const x = MARGE + k * largeur
        d.font('Helvetica').fontSize(6.8).fillColor(C.gris).text(txt(label).toUpperCase(), x + 8, y + 3, { width: largeur - 16, characterSpacing: 0.5 })
        d.font('Helvetica-Bold').fontSize(9).fillColor(C.encre).text(txt(valeur), x + 8, y + 12, { width: largeur - 16 })
      })
      d.save().moveTo(MARGE, y + h).lineTo(MARGE + LARGEUR, y + h).lineWidth(0.5).strokeColor(C.trait).stroke().restore()
      d.y = y + h + 2
    }
    d.x = MARGE
  }

  tuiles(items: { label: string; valeur: string; couleur?: string; detail?: string }[]) {
    const d = this.doc
    this.place(62)
    const gap = 8
    const w = (LARGEUR - gap * (items.length - 1)) / items.length
    const y = d.y + 4
    items.forEach((it, k) => {
      const x = MARGE + k * (w + gap)
      d.save().roundedRect(x, y, w, 54, 4).fill(C.fond).restore()
      d.save().rect(x, y, w, 2.5).fill(it.couleur ?? C.or).restore()
      d.font('Helvetica-Bold').fontSize(16).fillColor(it.couleur ?? C.marine).text(txt(it.valeur), x + 10, y + 11, { width: w - 20 })
      d.font('Helvetica').fontSize(7).fillColor(C.gris).text(txt(it.label).toUpperCase(), x + 10, y + 32, { width: w - 20, characterSpacing: 0.4, lineBreak: false, ellipsis: true })
      if (it.detail) d.font('Helvetica').fontSize(6.8).fillColor(C.gris).text(txt(it.detail), x + 10, y + 42, { width: w - 20, lineBreak: false, ellipsis: true })
    })
    d.y = y + 62
    d.x = MARGE
  }
}

export async function genererCompteRendu(dossierId: string, generePar?: { nom: string } | null): Promise<{ buffer: Buffer; nomFichier: string; numero: string } | null> {
  const dossier = await collecter(dossierId)
  if (!dossier) return null
  const entreprise = await getEntreprise() as Record<string, any>
  const maintenant = new Date()
  const cloture = dossier.status === 'cloture'
  const parcours = stagesForSite(dossier.site)
  const timingCloture = dossier.timings.find(t => t.etape === 'cloture')
  const fin = cloture ? (timingCloture?.dateDebut ?? maintenant) : maintenant
  const debut = dossier.dateCreation
  const reference = createHash('sha256').update(`${dossier.id}:${dossier.updatedAt.toISOString()}:${maintenant.toISOString()}`).digest('hex').slice(0, 12).toUpperCase()

  const doc = new PDFDocument({
    size: 'A4', margins: { top: MARGE, bottom: 30, left: MARGE, right: MARGE }, bufferPages: true,
    info: {
      Title: `Compte rendu du dossier ${dossier.numero}`, Author: txt(entreprise.raisonSociale ?? 'FINITRANS'),
      Subject: `Évolution complète du dossier ${dossier.numero} — ${dossier.client}`, Creator: 'Plateforme FINITRANS',
    },
  })
  const morceaux: Buffer[] = []
  doc.on('data', (c: Buffer) => morceaux.push(c))
  const termine = new Promise<Buffer>(resolve => doc.on('end', () => resolve(Buffer.concat(morceaux))))
  const r = new Rendu(doc)

  // ── En-tête ─────────────────────────────────────────────────────────────────
  doc.save().rect(0, 0, 595.28, 150).fill(C.marine).restore()
  doc.save().rect(0, 150, 595.28, 3).fill(C.or).restore()
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#FFFFFF').text(txt(entreprise.raisonSociale ?? 'FINITRANS'), MARGE, 34, { width: 320 })
  doc.font('Helvetica').fontSize(7.5).fillColor('#C7D2E3')
    .text(txt([entreprise.formeJuridique, entreprise.agrementCommissionnaire ? `Agrément ${entreprise.agrementCommissionnaire}` : null].filter(Boolean).join(' · ') || 'Commissionnaire agréé en douane'), MARGE, 57, { width: 320 })
    .text(txt([entreprise.adresse, entreprise.telephone, entreprise.email].filter(Boolean).join(' · ')), MARGE, 68, { width: 320 })
    .text(txt([entreprise.rccm ? `RCCM ${entreprise.rccm}` : null, entreprise.niu ? `NIU ${entreprise.niu}` : null].filter(Boolean).join(' · ')), MARGE, 79, { width: 320 })
  doc.font('Helvetica-Bold').fontSize(7).fillColor(C.or).text('COMPTE RENDU D\'ÉVOLUTION', 360, 34, { width: LARGEUR - 318, align: 'right', characterSpacing: 1.5 })
  doc.font('Helvetica-Bold').fontSize(22).fillColor('#FFFFFF').text(txt(dossier.numero), 340, 46, { width: LARGEUR - 298, align: 'right' })
  doc.font('Helvetica').fontSize(8).fillColor('#C7D2E3')
    .text(cloture ? `Dossier clôturé le ${jour(fin)}` : `Situation au ${heure(maintenant)}`, 340, 74, { width: LARGEUR - 298, align: 'right' })
    .text(`Réf. ${reference}`, 340, 85, { width: LARGEUR - 298, align: 'right' })
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#FFFFFF').text(txt(dossier.client), MARGE, 108, { width: LARGEUR * 0.65 })
  doc.font('Helvetica').fontSize(8.5).fillColor('#C7D2E3').text(txt(`${dossier.marchandise} · ${dossier.compagnie.replace('_', ' ')} · ${dossier.site}`), MARGE, 125, { width: LARGEUR * 0.65 })
  const badge = cloture ? 'CLÔTURÉ' : txt(STATUS_LABELS[dossier.status]).toUpperCase()
  doc.save().roundedRect(MARGE + LARGEUR - 110, 112, 110, 22, 11).fill(cloture ? C.vert : C.or).restore()
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#FFFFFF').text(badge, MARGE + LARGEUR - 110, 119, { width: 110, align: 'center', characterSpacing: 1 })
  doc.y = 170
  doc.x = MARGE

  // ── Indicateurs ─────────────────────────────────────────────────────────────
  const etapesTerminees = dossier.timings.filter(t => t.dateFin)
  const dansLesDelais = etapesTerminees.filter(t => jours(t.dateDebut, t.dateFin!) <= t.dureePrevueJours).length
  const taches = dossier.sousEtapes
  const tachesFaites = taches.filter(t => t.statut === 'valide').length
  const dureeTotale = jours(debut, fin)
  r.tuiles([
    { label: 'Durée totale', valeur: `${dureeTotale} j`, detail: `du ${jour(debut)} au ${jour(fin)}` },
    { label: 'Étapes dans les délais', valeur: `${dansLesDelais}/${etapesTerminees.length}`, couleur: dansLesDelais === etapesTerminees.length ? C.vert : C.ambre },
    { label: 'Tâches réalisées', valeur: `${tachesFaites}/${taches.length}`, couleur: tachesFaites === taches.length ? C.vert : C.bleu },
    { label: 'Documents', valeur: String(dossier.documents.length), detail: `${dossier.commentaires.length} échange(s)` },
  ])

  // ── 1. Identité ─────────────────────────────────────────────────────────────
  r.section('01', 'Identification du dossier')
  r.champs([
    ['Client', dossier.client], ['Marchandise', dossier.marchandise], ['Fournisseur', dossier.fournisseur],
    ['Compagnie maritime', dossier.compagnie.replace('_', ' ')], ['Site', dossier.site], ['Conteneur', dossier.conteneur],
    ['N° BL', dossier.numeroBL], ['N° déclaration', dossier.numDeclaration], ['Régime douanier', dossier.regimeDouanier],
    ['DI', dossier.di?.numero ?? dossier.numeroDI], ['Arrivée', jour(dossier.dateArrivee)], ['Date limite de sortie', jour(dossier.dateLimiteSortie)],
    ['Ouverture', heure(dossier.dateCreation)], [cloture ? 'Responsable de clôture' : 'Responsable actuel', dossier.responsable?.nom], ['Priorité', dossier.priorite],
  ])

  // ── 2. Parcours ─────────────────────────────────────────────────────────────
  r.section('02', 'Parcours du dossier', 'Chaque étape avec son responsable, ses dates et le respect du délai cible')
  const lignesParcours = parcours.map(etape => {
    const t = [...dossier.timings].reverse().find(x => x.etape === etape)
    const aff = dossier.affectations.find(a => a.etape === etape)
    if (!t) return [txt(STATUS_LABELS[etape]), aff ? `${aff.responsable.nom} (désigné)` : '—', '—', '—', '—', { t: cloture ? 'Non parcourue' : 'À venir', couleur: C.gris }]
    const finEtape = t.dateFin ?? (etape === 'cloture' ? t.dateDebut : null)
    const duree = finEtape ? jours(t.dateDebut, finEtape) : jours(t.dateDebut, maintenant)
    const statut = etape === 'cloture' ? { t: 'Clôturé', couleur: C.vert, gras: true }
      : !t.dateFin ? { t: 'En cours', couleur: C.bleu, gras: true }
      : duree <= t.dureePrevueJours ? { t: 'Dans les délais', couleur: C.vert } : { t: `Retard +${Math.round((duree - t.dureePrevueJours) * 10) / 10} j`, couleur: C.rouge, gras: true }
    return [
      { t: txt(STATUS_LABELS[etape]), gras: true }, t.responsable?.nom ?? '—', heure(t.dateDebut), t.dateFin ? heure(t.dateFin) : '—',
      etape === 'cloture' ? '—' : `${duree} j / ${t.dureePrevueJours} j`, statut,
    ]
  })
  r.table([{ titre: 'Étape', largeur: 18 }, { titre: 'Responsable', largeur: 20 }, { titre: 'Début', largeur: 17 }, { titre: 'Fin', largeur: 17 },
    { titre: 'Durée / cible', largeur: 13, align: 'right' }, { titre: 'Statut', largeur: 15 }], lignesParcours)

  // ── 3. Tâches ───────────────────────────────────────────────────────────────
  r.section('03', 'Tâches réalisées', 'Détail des opérations par étape : titulaire, exécution et informations saisies')
  const ordre = (e: string) => parcours.indexOf(e as DossierStatus)
  const libelle = (etape: string, cle: string) => SOUS_ETAPES_CONFIG[etape as DossierStatus]?.find(s => s.cle === cle)?.label ?? cle
  const tachesTriees = [...taches].sort((a, b) => ordre(a.etape) - ordre(b.etape) || (a.completedAt?.getTime() ?? 9e15) - (b.completedAt?.getTime() ?? 9e15))
  if (tachesTriees.length === 0) r.vide('Aucune tâche enregistrée.')
  else r.table(
    [{ titre: 'Étape', largeur: 13 }, { titre: 'Tâche', largeur: 22 }, { titre: 'Titulaire', largeur: 14 }, { titre: 'Réalisée par / le', largeur: 17 },
      { titre: 'Statut', largeur: 9 }, { titre: 'Informations', largeur: 25 }],
    tachesTriees.map(t => [
      txt(STATUS_LABELS[t.etape as DossierStatus] ?? t.etape), libelle(t.etape, t.cle), t.responsable?.nom ?? '—',
      t.completedAt ? `${t.completedBy?.nom ?? '—'}\n${heure(t.completedAt)}` : '—',
      { t: STATUT_TACHE[t.statut] ?? t.statut, couleur: t.statut === 'valide' ? C.vert : t.statut === 'rejete' ? C.rouge : C.ambre },
      [detailsTache(t.metadata as Record<string, any> | null), t.notes].filter(Boolean).join('\n') || '—',
    ]),
  )

  // ── 4. Codage ───────────────────────────────────────────────────────────────
  r.section('04', 'Codage et positions tarifaires')
  if (dossier.etatsCodeage.length === 0) r.vide('Aucune position tarifaire saisie.')
  else {
    const somme = (k: 'valeurCIF' | 'montantDroits' | 'montantTVA') => dossier.etatsCodeage.reduce((s, p) => s + Number(p[k]), 0)
    r.table(
      [{ titre: 'Code SH', largeur: 12 }, { titre: 'Désignation', largeur: 28 }, { titre: 'Valeur CIF', largeur: 15, align: 'right' },
        { titre: 'Droits', largeur: 14, align: 'right' }, { titre: 'TVA', largeur: 13, align: 'right' }, { titre: 'Statut', largeur: 18 }],
      dossier.etatsCodeage.map(p => [p.codeDouanier, p.designation, fcfa(p.valeurCIF), fcfa(p.montantDroits), fcfa(p.montantTVA),
        { t: `${statut(p.statut)}${p.validePar?.nom ? ` — ${p.validePar.nom}` : ''}`, couleur: p.statut === 'valide' ? C.vert : p.statut === 'rejete' ? C.rouge : C.ambre }]),
      { total: ['Total', `${dossier.etatsCodeage.length} position(s)`, fcfa(somme('valeurCIF')), fcfa(somme('montantDroits')), fcfa(somme('montantTVA')), ''] },
    )
  }

  // ── 5. Finances ─────────────────────────────────────────────────────────────
  r.section('05', 'Synthèse financière')
  const paye = (arr: { statut: string; montant: unknown }[]) => arr.filter(p => ['paye', 'effectue'].includes(p.statut)).reduce((s, p) => s + Number(p.montant), 0)
  const factureTotal = dossier.factures.filter(f => f.type !== 'proforma').reduce((s, f) => s + Number(f.montant), 0)
  r.tuiles([
    { label: 'Droits & taxes payés', valeur: nombre(paye(dossier.paiementsDouane)), detail: 'FCFA' },
    { label: 'Frais compagnies', valeur: nombre(paye(dossier.paiementsCompagnie)), detail: 'FCFA' },
    { label: 'Facturé au client', valeur: nombre(factureTotal), detail: 'FCFA (hors proforma)', couleur: C.vert },
    { label: 'Honoraires prévus', valeur: nombre(dossier.montantHonoraires ?? 0), detail: 'FCFA' },
  ])
  const mouvements = [
    ...dossier.paiementsDouane.map(p => ({ d: p.datePaiement, nature: `Douane — ${p.type}`, ref: p.reference, montant: p.montant, statut: p.statut })),
    ...dossier.paiementsCompagnie.map(p => ({ d: p.datePaiement, nature: `${p.compagnie.replace('_', ' ')} — ${p.type.replace(/_/g, ' ')}`, ref: p.reference, montant: p.montant, statut: p.statut })),
    ...dossier.factures.map(f => ({ d: f.dateFacture, nature: 'Facture client', ref: f.numero, montant: f.montant, statut: f.type === 'reglee' ? 'reglee' : f.type })),
    ...dossier.virements.map(v => ({ d: v.dateVirement, nature: `Virement ${v.source} -> ${v.destination}`, ref: v.reference, montant: v.montant, statut: v.statut })),
  ].sort((a, b) => a.d.getTime() - b.d.getTime())
  if (mouvements.length === 0) r.vide('Aucun mouvement financier enregistré.')
  else r.table(
    [{ titre: 'Date', largeur: 12 }, { titre: 'Nature', largeur: 34 }, { titre: 'Référence', largeur: 22 }, { titre: 'Montant', largeur: 18, align: 'right' }, { titre: 'Statut', largeur: 14 }],
    mouvements.map(m => [jour(m.d), m.nature, m.ref, fcfa(m.montant),
      { t: statut(m.statut), couleur: ['paye', 'effectue', 'reglee'].includes(m.statut) ? C.vert : C.ambre }]),
  )
  if (dossier.di) r.champs([['Déclaration d\'importation', dossier.di.numero], ['Montant DI', fcfa(dossier.di.montant)], ['Solde DI', fcfa(dossier.di.soldeActuel)]])

  // ── 6. Logistique & sortie ─────────────────────────────────────────────────
  r.section('06', 'Logistique et sortie de la marchandise')
  if (dossier.gatePasses.length === 0 && dossier.transports.length === 0) r.vide('Aucun gate pass ni transport enregistré.')
  if (dossier.gatePasses.length) r.table(
    [{ titre: 'Gate pass', largeur: 16 }, { titre: 'Émis le', largeur: 16 }, { titre: 'Chauffeur', largeur: 22 }, { titre: 'Destination', largeur: 22 }, { titre: 'Émetteur', largeur: 14 }, { titre: 'Statut', largeur: 10 }],
    dossier.gatePasses.map(g => [{ t: g.numero, gras: true }, heure(g.dateEmission), `${g.chauffeur}\n${g.telephone}`, g.destination, g.emetteur?.nom ?? '—', statut(g.statut)]),
  )
  if (dossier.transports.length) r.table(
    [{ titre: 'Conteneur', largeur: 16 }, { titre: 'Véhicule / chauffeur', largeur: 24 }, { titre: 'Trajet', largeur: 26 }, { titre: 'Enlèvement', largeur: 13 }, { titre: 'Livraison', largeur: 13 }, { titre: 'Statut', largeur: 10 }],
    dossier.transports.map(t => [t.conteneur, `${t.camion?.immatriculation ?? '—'}\n${t.chauffeur?.nom ?? '—'}`, `${t.origine ?? '—'} -> ${t.destination}`, jour(t.dateEnlevement), jour(t.dateLivraison), statut(t.statut)]),
  )

  // ── 7. Documents ────────────────────────────────────────────────────────────
  r.section('07', 'Documents du dossier', 'Pièces archivées dans la bibliothèque documentaire')
  if (dossier.documents.length === 0) r.vide('Aucun document joint.')
  else r.table(
    [{ titre: 'Document', largeur: 40 }, { titre: 'Étape', largeur: 16 }, { titre: 'Déposé par', largeur: 18 }, { titre: 'Date', largeur: 16 }, { titre: 'Taille', largeur: 10, align: 'right' }],
    dossier.documents.map(d => [d.nom, txt(d.etape ? STATUS_LABELS[d.etape] : d.categorie), d.uploader?.nom ?? '—', heure(d.createdAt), d.taille]),
  )

  // ── 8. Échanges ─────────────────────────────────────────────────────────────
  r.section('08', 'Échanges et observations')
  if (dossier.commentaires.length === 0) r.vide('Aucun commentaire.')
  else r.table([{ titre: 'Date', largeur: 16 }, { titre: 'Auteur', largeur: 18 }, { titre: 'Message', largeur: 66 }],
    dossier.commentaires.map(c => [heure(c.createdAt), c.auteur?.nom ?? '—', c.message.length > 600 ? `${c.message.slice(0, 600)}…` : c.message]))

  // ── 9. Journal ──────────────────────────────────────────────────────────────
  r.section('09', 'Journal d\'audit', 'Traçabilité complète des actions effectuées sur le dossier')
  if (dossier.auditEntries.length === 0) r.vide('Aucune action journalisée.')
  else r.table([{ titre: 'Date', largeur: 17 }, { titre: 'Auteur', largeur: 17 }, { titre: 'Action', largeur: 22 }, { titre: 'Détails', largeur: 44 }],
    dossier.auditEntries.map(a => [heure(a.createdAt), a.auteur?.nom ?? '—', libelleAction(a.action), libellesEtapes(a.details ?? '—')]))

  // ── Visas ───────────────────────────────────────────────────────────────────
  r.place(110)
  doc.moveDown(1.2)
  const yv = doc.y
  const lv = (LARGEUR - 20) / 2
  for (const [k, titre] of [[0, 'Visa du responsable d\'exploitation'], [1, 'Visa de la Direction Générale']] as const) {
    const x = MARGE + k * (lv + 20)
    doc.save().roundedRect(x, yv, lv, 78, 4).lineWidth(0.8).strokeColor(C.trait).stroke().restore()
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.marine).text(txt(titre).toUpperCase(), x + 10, yv + 8, { width: lv - 20, characterSpacing: 0.5 })
    doc.font('Helvetica').fontSize(7).fillColor(C.gris).text('Nom, date et signature', x + 10, yv + 20)
  }
  doc.y = yv + 90

  // ── Pieds de page ──────────────────────────────────────────────────────────
  const pages = doc.bufferedPageRange()
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(pages.start + i)
    doc.page.margins.bottom = 0
    const yp = 841.89 - 34
    doc.save().moveTo(MARGE, yp - 6).lineTo(MARGE + LARGEUR, yp - 6).lineWidth(0.5).strokeColor(C.trait).stroke().restore()
    doc.font('Helvetica').fontSize(6.8).fillColor(C.gris)
      .text(txt(`${entreprise.sigle ?? entreprise.raisonSociale ?? 'FINITRANS'} — Compte rendu ${dossier.numero} — Réf. ${reference} — généré le ${heure(maintenant)}${generePar?.nom ? ` par ${generePar.nom}` : ''}`),
        MARGE, yp, { width: LARGEUR - 60, lineBreak: false })
      .text(`${i + 1} / ${pages.count}`, MARGE + LARGEUR - 60, yp, { width: 60, align: 'right', lineBreak: false })
  }

  doc.end()
  const buffer = await termine
  return { buffer, nomFichier: `Compte-rendu-${dossier.numero}.pdf`, numero: dossier.numero }
}

/** Archive le compte rendu de clôture dans la bibliothèque (remplace une version précédente). */
export async function archiverCompteRendu(dossierId: string, userId: string, generePar?: { nom: string } | null) {
  const cr = await genererCompteRendu(dossierId, generePar)
  if (!cr) return null
  const taille = cr.buffer.length < 1_048_576 ? `${Math.max(1, Math.round(cr.buffer.length / 1024))} Ko` : `${(cr.buffer.length / 1_048_576).toFixed(1)} Mo`
  await prisma.document.deleteMany({ where: { dossierId, categorie: 'compte_rendu' } })
  const doc = await prisma.document.create({
    data: {
      dossierId, nom: cr.nomFichier, type: 'application/pdf', taille, tailleOctets: cr.buffer.length, url: '',
      contenu: cr.buffer, hashContenu: createHash('sha256').update(cr.buffer).digest('hex'), uploadePar: userId,
      etape: 'cloture', categorie: 'compte_rendu', description: `Compte rendu de clôture du dossier ${cr.numero}`, tags: ['clôture'],
    },
  })
  return prisma.document.update({ where: { id: doc.id }, data: { url: `/api/bibliotheque/${doc.id}/contenu` }, select: { id: true, nom: true, url: true } })
}
