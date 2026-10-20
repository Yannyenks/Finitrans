/**
 * Compte rendu du parcours d'un dossier (PDF A4, charte FINITRANS) : identité, frise du parcours,
 * étapes, tâches chronométrées (début, fin, durée, respect de l'échéance), codage, finances
 * (dont règlements du client), logistique, documents, échanges, journal d'audit et certification.
 * Généré à la demande et archivé automatiquement dans la bibliothèque à la clôture du dossier.
 */
import { createHash } from 'crypto'
import fs from 'fs'
import path from 'path'
import PDFDocument from 'pdfkit'
import { prisma } from '../config/prisma'
import { getEntreprise } from '../routes/admin.routes'
import { SOUS_ETAPES_CONFIG, STATUS_LABELS, stagesForSite } from './workflow'
import { nomCompagnie } from './compagnies'
import { LIBELLES_ACTION } from '../utils/audit'
import type { DossierStatus } from '@prisma/client'

// ── Charte FINITRANS (couleurs du logo) ───────────────────────────────────────
const C = {
  marine: '#0E2240', marine2: '#173560', orange: '#F07B37', bleu: '#1A9AD6', encre: '#1F2937', gris: '#6B7280',
  grisClair: '#9CA3AF', trait: '#E5E7EB', fond: '#F6F8FB', vert: '#15803D', rouge: '#C0262D', ambre: '#B45309',
}
const PAGE_L = 595.28
const PAGE_H = 841.89
const MARGE = 42
const LARGEUR = PAGE_L - MARGE * 2
const BAS = PAGE_H - 62
const HAUT_SUITE = 76 // début du contenu sous l'en-tête courant des pages suivantes

// ── Logo (PNG transparent 1280×1280 ; contenu utile 111,459 → 1128,902) ───────
const LOGO_BOITE = { x: 111, y: 459, w: 1017, h: 443, taille: 1280 }
let logoCache: Buffer | null | undefined
function logo(): Buffer | null {
  if (logoCache !== undefined) return logoCache
  const candidats = [
    path.join(__dirname, '../../assets/logo-finitrans.png'),
    path.join(process.cwd(), 'backend/assets/logo-finitrans.png'),
    path.join(process.cwd(), 'assets/logo-finitrans.png'),
  ]
  const trouve = candidats.find(p => { try { return fs.existsSync(p) } catch { return false } })
  logoCache = trouve ? fs.readFileSync(trouve) : null
  return logoCache
}

/** Dessine le logo recadré sur son contenu ; renvoie la hauteur utilisée. */
function dessinerLogo(doc: PDFKit.PDFDocument, x: number, y: number, largeur: number): number {
  const img = logo()
  const echelle = largeur / LOGO_BOITE.w
  const hauteur = LOGO_BOITE.h * echelle
  if (!img) {
    doc.font('Helvetica-Bold').fontSize(largeur / 7).fillColor(C.marine).text('FINI', x, y, { continued: true })
      .font('Helvetica').fillColor(C.marine).text('TRANS')
    return largeur / 7 + 4
  }
  doc.save()
  doc.rect(x, y, largeur, hauteur).clip()
  doc.image(img, x - LOGO_BOITE.x * echelle, y - LOGO_BOITE.y * echelle, { width: LOGO_BOITE.taille * echelle })
  doc.restore()
  return hauteur
}

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
/** « 2 j 03 h 12 min », « 4 h 05 min », « 12 min » */
function duree(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const m = Math.round(ms / 60_000)
  const j = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mn = m % 60
  const p = (n: number) => String(n).padStart(2, '0')
  if (j > 0) return `${j} j ${p(h)} h ${p(mn)} min`
  if (h > 0) return `${h} h ${p(mn)} min`
  return `${mn} min`
}

const STATUT_TACHE: Record<string, string> = { todo: 'À faire', en_cours: 'En cours', valide: 'Réalisée', rejete: 'Bloquée' }
const STATUT: Record<string, string> = {
  paye: 'Payé', en_attente: 'En attente', en_retard: 'En retard', effectue: 'Effectué', annule: 'Annulé',
  proforma: 'Proforma', validee: 'À encaisser', reglee: 'Réglée', valide: 'Validée', soumis: 'Soumise', rejete: 'Rejetée',
  brouillon: 'Brouillon', emis: 'Émis', utilise: 'Utilisé', expire: 'Expiré', planifie: 'Planifié', en_route: 'En route',
  livre: 'Livré', retour_vide: 'Retour à vide',
}
const MODES: Record<string, string> = { virement: 'Virement', cheque: 'Chèque', especes: 'Espèces', traite: 'Traite', mobile_money: 'Mobile money', autre: 'Autre' }
const libelleAction = (a: string) => {
  if (LIBELLES_ACTION[a]) return LIBELLES_ACTION[a]
  const t = a.replace(/_/g, ' ').toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1)
}
const libellesEtapes = (t: string) => t.replace(/(reception|soumission_sgs|codage|validation|paiement|bon_compagnie|operations_douala|operations_kribi|cloture)/g, k => STATUS_LABELS[k as DossierStatus] ?? k)
const statut = (s: string) => STATUT[s] ?? s.replace(/_/g, ' ')

/** Détails métier saisis sur une tâche (paiement, facture, règlement, immatriculation…) */
function detailsTache(meta: Record<string, any> | null): string {
  if (!meta) return ''
  const d: string[] = []
  if (meta.pvc_resultat) d.push(`RVC : ${meta.pvc_resultat === 'succes' ? 'succès' : 'rejet'}${meta.pvc_motif ? ` (${meta.pvc_motif})` : ''}`)
  if (meta.reglement_montant) d.push(`Règlement ${MODES[meta.reglement_mode] ?? meta.reglement_mode ?? ''} : ${fcfa(String(meta.reglement_montant).replace(/\s/g, ''))}${meta.reglement_reference ? ` (${meta.reglement_reference})` : ''}`)
  if (meta.paiement_montant) d.push(`Montant : ${fcfa(String(meta.paiement_montant).replace(/\s/g, ''))}`)
  if (meta.paiement_quittance) d.push(`Quittance : ${meta.paiement_quittance}`)
  for (const p of ['bc', 'term', 'kct']) {
    if (meta[`${p}_montant`]) d.push(`Facture ${meta[`${p}_facture_numero`] ?? ''} : ${fcfa(meta[`${p}_montant`])}`.replace('  ', ' '))
  }
  if (meta.immatriculation) d.push(`Véhicule : ${meta.immatriculation}`)
  if (meta.gp_chauffeur || meta.kgp_chauffeur) d.push(`Chauffeur : ${meta.gp_chauffeur ?? meta.kgp_chauffeur}`)
  if (meta.gate_pass_numero) d.push(`Gate pass ${meta.gate_pass_numero}`)
  if (meta.preuve_nom) d.push(`Preuve : ${meta.preuve_nom}`)
  return d.join(' · ')
}

// ── Collecte ──────────────────────────────────────────────────────────────────
async function collecter(dossierId: string) {
  return prisma.dossier.findUnique({
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
      reglementsClient:   { orderBy: { dateReglement: 'asc' } },
      etatsCodeage:       { orderBy: { createdAt: 'asc' }, include: { validePar: { select: { nom: true } } } },
      gatePasses:         { orderBy: { dateEmission: 'asc' }, include: { emetteur: { select: { nom: true } } } },
      transports:         { orderBy: { dateEnlevement: 'asc' }, include: { camion: { select: { immatriculation: true } }, chauffeur: { select: { nom: true } } } },
      soumissionsSGS:     { orderBy: { dateDepot: 'asc' } },
    },
  })
}

// ── Rendu ─────────────────────────────────────────────────────────────────────
type Colonne = { titre: string; largeur: number; align?: 'left' | 'right' | 'center' }
type Cellule = string | { t: string; couleur?: string; gras?: boolean }

class Rendu {
  doc: PDFKit.PDFDocument
  constructor(doc: PDFKit.PDFDocument) { this.doc = doc }

  /** Nouvelle page si la place manque (l'en-tête courant est dessiné par l'évènement pageAdded). */
  place(h: number) { if (this.doc.y + h > BAS) this.doc.addPage() }

  section(numero: string, titre: string, sousTitre?: string) {
    this.place(80)
    const d = this.doc
    d.moveDown(1)
    const y = d.y
    d.save().circle(MARGE + 11, y + 10, 11).fill(C.marine).restore()
    d.font('Helvetica-Bold').fontSize(8.5).fillColor('#FFFFFF').text(numero, MARGE, y + 6, { width: 22, align: 'center' })
    d.font('Helvetica-Bold').fontSize(13.5).fillColor(C.marine).text(txt(titre), MARGE + 32, y + 2.5, { width: LARGEUR - 32 })
    if (sousTitre) d.font('Helvetica').fontSize(8).fillColor(C.gris).text(txt(sousTitre), MARGE + 32, y + 19, { width: LARGEUR - 32 })
    const yl = y + (sousTitre ? 33 : 27)
    d.save().rect(MARGE + 32, yl, 36, 2).fill(C.orange).restore()
    d.save().rect(MARGE + 68, yl, 18, 2).fill(C.bleu).restore()
    d.y = yl + 10
    d.x = MARGE
  }

  vide(message: string) {
    this.place(24)
    const d = this.doc
    const y = d.y
    d.save().roundedRect(MARGE, y, LARGEUR, 24, 4).fill(C.fond).restore()
    d.font('Helvetica-Oblique').fontSize(8.5).fillColor(C.gris).text(txt(message), MARGE + 12, y + 8, { width: LARGEUR - 24 })
    d.y = y + 30
  }

  table(colonnes: Colonne[], lignes: Cellule[][], opts: { total?: string[] } = {}) {
    const d = this.doc
    const total = colonnes.reduce((s, c) => s + c.largeur, 0)
    const cols = colonnes.map(c => ({ ...c, largeur: (c.largeur / total) * LARGEUR }))
    const pad = 6
    const entete = () => {
      d.font('Helvetica-Bold').fontSize(7)
      const hEntete = Math.max(19, ...cols.map(c => d.heightOfString(txt(c.titre).toUpperCase(), { width: c.largeur - pad * 2, characterSpacing: 0.5 }) + 11))
      this.place(hEntete + 20)
      const y = d.y
      d.save().roundedRect(MARGE, y, LARGEUR, hEntete, 3).fill(C.marine).restore()
      let x = MARGE
      d.fillColor('#FFFFFF')
      for (const c of cols) { d.text(txt(c.titre).toUpperCase(), x + pad, y + 6, { width: c.largeur - pad * 2, align: c.align ?? 'left', characterSpacing: 0.5 }); x += c.largeur }
      d.y = y + hEntete
    }
    entete()
    const rendreLigne = (cells: Cellule[], i: number, estTotal = false) => {
      d.font(estTotal ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.8)
      const valeurs = cells.map(c => (typeof c === 'string' ? { t: c } : c))
      // Hauteur mesurée avec la police réelle de chaque cellule (le gras est plus large)
      const h = Math.max(17, ...valeurs.map((v, k) => d.font(v.gras || estTotal ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.8)
        .heightOfString(txt(v.t), { width: cols[k].largeur - pad * 2 }) + 9))
      if (d.y + h > BAS) { d.addPage(); entete() }
      const y = d.y
      if (estTotal) d.save().rect(MARGE, y, LARGEUR, h).fill('#FDF0E7').restore()
      else if (i % 2 === 1) d.save().rect(MARGE, y, LARGEUR, h).fill(C.fond).restore()
      let x = MARGE
      valeurs.forEach((v, k) => {
        d.font(v.gras || estTotal ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.8).fillColor(v.couleur ?? C.encre)
          .text(txt(v.t), x + pad, y + 4.5, { width: cols[k].largeur - pad * 2, align: cols[k].align ?? 'left' })
        x += cols[k].largeur
      })
      d.save().moveTo(MARGE, y + h).lineTo(MARGE + LARGEUR, y + h).lineWidth(0.4).strokeColor(C.trait).stroke().restore()
      d.y = y + h
    }
    lignes.forEach((l, i) => rendreLigne(l, i))
    if (opts.total) rendreLigne(opts.total, 0, true)
    d.x = MARGE
    d.moveDown(0.4)
  }

  /** Fiche d'identité : pavés étiquette / valeur sur fond clair */
  champs(paires: [string, unknown][], colonnes = 3) {
    const d = this.doc
    const gap = 6
    const largeur = (LARGEUR - gap * (colonnes - 1)) / colonnes
    for (let i = 0; i < paires.length; i += colonnes) {
      const rang = paires.slice(i, i + colonnes)
      d.font('Helvetica-Bold').fontSize(9)
      const h = Math.max(...rang.map(([, v]) => d.heightOfString(txt(v), { width: largeur - 20 }))) + 22
      this.place(h + gap)
      const y = d.y
      rang.forEach(([label, valeur], k) => {
        const x = MARGE + k * (largeur + gap)
        d.save().roundedRect(x, y, largeur, h, 4).fill(C.fond).restore()
        d.save().rect(x, y + 6, 2, h - 12).fill(k % 2 === 0 ? C.orange : C.bleu).restore()
        d.font('Helvetica').fontSize(6.6).fillColor(C.gris).text(txt(label).toUpperCase(), x + 10, y + 5, { width: largeur - 20, characterSpacing: 0.5 })
        d.font('Helvetica-Bold').fontSize(9).fillColor(C.encre).text(txt(valeur), x + 10, y + 14, { width: largeur - 20 })
      })
      d.y = y + h + gap
    }
    d.x = MARGE
  }

  tuiles(items: { label: string; valeur: string; couleur?: string; detail?: string }[]) {
    const d = this.doc
    this.place(66)
    const gap = 8
    const w = (LARGEUR - gap * (items.length - 1)) / items.length
    const y = d.y + 4
    items.forEach((it, k) => {
      const x = MARGE + k * (w + gap)
      d.save().roundedRect(x, y, w, 56, 5).fill('#FFFFFF').restore()
      d.save().roundedRect(x, y, w, 56, 5).lineWidth(0.6).strokeColor(C.trait).stroke().restore()
      d.save().rect(x + 10, y + 9, 16, 2.5).fill(it.couleur ?? C.orange).restore()
      d.font('Helvetica-Bold').fontSize(16).fillColor(it.couleur ?? C.marine).text(txt(it.valeur), x + 10, y + 16, { width: w - 20, lineBreak: false, ellipsis: true })
      d.font('Helvetica-Bold').fontSize(6.6).fillColor(C.gris).text(txt(it.label).toUpperCase(), x + 10, y + 36, { width: w - 20, characterSpacing: 0.4, lineBreak: false, ellipsis: true })
      if (it.detail) d.font('Helvetica').fontSize(6.6).fillColor(C.grisClair).text(txt(it.detail), x + 10, y + 45, { width: w - 20, lineBreak: false, ellipsis: true })
    })
    d.y = y + 64
    d.x = MARGE
  }

  /** Frise du parcours : une pastille par étape, reliées, avec dates et durées */
  frise(etapes: { label: string; etat: 'fait' | 'courant' | 'avenir'; date?: string; duree?: string; retard?: boolean }[]) {
    const d = this.doc
    this.place(92)
    const y = d.y + 6
    d.save().roundedRect(MARGE, y, LARGEUR, 84, 6).fill(C.fond).restore()
    const n = etapes.length
    const pas = (LARGEUR - 40) / Math.max(1, n - 1)
    const cy = y + 26
    // Lignes de liaison
    for (let i = 0; i < n - 1; i++) {
      const x1 = MARGE + 20 + i * pas, x2 = x1 + pas
      const fait = etapes[i + 1].etat !== 'avenir'
      d.save().moveTo(x1 + 9, cy).lineTo(x2 - 9, cy).lineWidth(fait ? 2.2 : 1).strokeColor(fait ? C.marine : C.trait).stroke().restore()
    }
    etapes.forEach((e, i) => {
      const cx = MARGE + 20 + i * pas
      if (e.etat === 'fait') {
        d.save().circle(cx, cy, 9).fill(e.retard ? C.rouge : C.marine).restore()
        d.save().moveTo(cx - 4, cy + 0.5).lineTo(cx - 1, cy + 3.5).lineTo(cx + 4.5, cy - 3).lineWidth(1.6).strokeColor('#FFFFFF').stroke().restore()
      } else if (e.etat === 'courant') {
        d.save().circle(cx, cy, 11).fill('#FDE3D2').restore()
        d.save().circle(cx, cy, 7).fill(C.orange).restore()
      } else {
        d.save().circle(cx, cy, 8).lineWidth(1.2).strokeColor(C.grisClair).stroke().restore()
      }
      const lw = Math.min(pas, 78)
      d.font('Helvetica-Bold').fontSize(6.8).fillColor(e.etat === 'avenir' ? C.grisClair : C.marine)
        .text(txt(e.label), cx - lw / 2, cy + 15, { width: lw, align: 'center', lineBreak: false, ellipsis: true })
      if (e.date) d.font('Helvetica').fontSize(6.2).fillColor(C.gris).text(txt(e.date), cx - lw / 2, cy + 25, { width: lw, align: 'center', lineBreak: false })
      if (e.duree) d.font('Helvetica-Bold').fontSize(6.2).fillColor(e.retard ? C.rouge : e.etat === 'courant' ? C.orange : C.vert)
        .text(txt(e.duree), cx - lw / 2, cy + 34, { width: lw, align: 'center', lineBreak: false })
    })
    d.y = y + 92
    d.x = MARGE
  }
}

export async function genererCompteRendu(dossierId: string, generePar?: { nom: string } | null): Promise<{ buffer: Buffer; nomFichier: string; numero: string } | null> {
  const dossier = await collecter(dossierId)
  if (!dossier) return null
  const entreprise = await getEntreprise() as Record<string, any>
  const compagnie = await nomCompagnie(dossier.compagnie)
  const maintenant = new Date()
  const cloture = dossier.status === 'cloture'
  const parcours = stagesForSite(dossier.site)
  const timingCloture = dossier.timings.find(t => t.etape === 'cloture')
  const fin = cloture ? (timingCloture?.dateDebut ?? maintenant) : maintenant
  const debut = dossier.dateCreation
  const reference = createHash('sha256').update(`${dossier.id}:${dossier.updatedAt.toISOString()}:${maintenant.toISOString()}`).digest('hex').slice(0, 12).toUpperCase()
  const raison = txt(entreprise.raisonSociale ?? 'FINITRANS')

  const doc = new PDFDocument({
    size: 'A4', margins: { top: MARGE, bottom: 30, left: MARGE, right: MARGE }, bufferPages: true,
    info: {
      Title: `Compte rendu du parcours — dossier ${dossier.numero}`, Author: raison,
      Subject: `Parcours complet du dossier ${dossier.numero} — ${dossier.client}`, Creator: 'Plateforme FINITRANS',
    },
  })
  const morceaux: Buffer[] = []
  doc.on('data', (c: Buffer) => morceaux.push(c))
  const termine = new Promise<Buffer>(resolve => doc.on('end', () => resolve(Buffer.concat(morceaux))))
  const r = new Rendu(doc)

  // En-tête courant des pages suivantes : logo, dossier, filet aux couleurs du logo
  doc.on('pageAdded', () => {
    dessinerLogo(doc, MARGE, 20, 92)
    doc.font('Helvetica-Bold').fontSize(8).fillColor(C.marine).text(txt(`Dossier ${dossier.numero}`), MARGE + LARGEUR - 220, 24, { width: 220, align: 'right' })
    doc.font('Helvetica').fontSize(7).fillColor(C.gris).text(txt(dossier.client), MARGE + LARGEUR - 220, 35, { width: 220, align: 'right', lineBreak: false, ellipsis: true })
    doc.save().rect(MARGE, 58, LARGEUR * 0.7, 1.4).fill(C.orange).restore()
    doc.save().rect(MARGE + LARGEUR * 0.7, 58, LARGEUR * 0.3, 1.4).fill(C.bleu).restore()
    doc.x = MARGE
    doc.y = HAUT_SUITE
  })

  // ── Page de garde : bandeau logo + carte d'identité du dossier ─────────────
  dessinerLogo(doc, MARGE, 30, 168)
  doc.font('Helvetica').fontSize(7.2).fillColor(C.gris)
    .text(txt([entreprise.formeJuridique, entreprise.agrementCommissionnaire ? `Agrément ${entreprise.agrementCommissionnaire}` : null].filter(Boolean).join(' · ') || 'Commissionnaire agréé en douane'), MARGE, 108, { width: 300 })
    .text(txt([entreprise.adresse, entreprise.telephone, entreprise.email].filter(Boolean).join(' · ')), MARGE, 118, { width: 300 })
    .text(txt([entreprise.rccm ? `RCCM ${entreprise.rccm}` : null, entreprise.niu ? `NIU ${entreprise.niu}` : null].filter(Boolean).join(' · ')), MARGE, 128, { width: 300 })
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.orange).text('COMPTE RENDU DU PARCOURS', 330, 36, { width: LARGEUR - 288, align: 'right', characterSpacing: 1.6 })
  doc.font('Helvetica-Bold').fontSize(24).fillColor(C.marine).text(txt(dossier.numero), 300, 50, { width: LARGEUR - 258, align: 'right' })
  doc.font('Helvetica').fontSize(8).fillColor(C.gris)
    .text(cloture ? `Dossier clôturé le ${jour(fin)}` : `Situation au ${heure(maintenant)}`, 300, 82, { width: LARGEUR - 258, align: 'right' })
    .text(`Référence ${reference}`, 300, 93, { width: LARGEUR - 258, align: 'right' })
  doc.save().rect(MARGE, 146, LARGEUR * 0.7, 2).fill(C.orange).restore()
  doc.save().rect(MARGE + LARGEUR * 0.7, 146, LARGEUR * 0.3, 2).fill(C.bleu).restore()

  // Carte dossier (fond marine)
  const yc = 160
  doc.save().roundedRect(MARGE, yc, LARGEUR, 92, 8).fill(C.marine).restore()
  doc.save().roundedRect(MARGE + LARGEUR - 140, yc, 140, 92, 8).fill(C.marine2).restore()
  doc.font('Helvetica').fontSize(7).fillColor('#9FB3CF').text('CLIENT', MARGE + 18, yc + 14, { characterSpacing: 1.2 })
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#FFFFFF').text(txt(dossier.client), MARGE + 18, yc + 24, { width: LARGEUR - 180, lineBreak: false, ellipsis: true })
  doc.font('Helvetica').fontSize(8.5).fillColor('#C9D6E8')
    .text(txt(`${dossier.marchandise}  ·  ${compagnie}  ·  ${dossier.site}  ·  ${dossier.nombreConteneurs} x ${dossier.tailleConteneur ?? 'conteneur'}  ·  ${dossier.conteneur}`), MARGE + 18, yc + 46, { width: LARGEUR - 180 })
    .text(txt(`Ouvert le ${heure(dossier.dateCreation)}  ·  Responsable : ${dossier.responsable?.nom ?? '—'}`), MARGE + 18, yc + 62, { width: LARGEUR - 180 })
  const badge = cloture ? 'CLÔTURÉ' : txt(STATUS_LABELS[dossier.status]).toUpperCase()
  doc.font('Helvetica').fontSize(7).fillColor('#9FB3CF').text('ÉTAPE', MARGE + LARGEUR - 122, yc + 14, { characterSpacing: 1.2 })
  doc.save().roundedRect(MARGE + LARGEUR - 122, yc + 28, 104, 22, 11).fill(cloture ? C.vert : C.orange).restore()
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF').text(badge, MARGE + LARGEUR - 122, yc + 35, { width: 104, align: 'center', characterSpacing: 0.8, lineBreak: false, ellipsis: true })
  const idx = parcours.indexOf(dossier.status)
  const avancement = cloture ? 100 : Math.round((Math.max(0, idx) / Math.max(1, parcours.length - 1)) * 100)
  doc.font('Helvetica').fontSize(7).fillColor('#C9D6E8').text(`Avancement ${avancement} %`, MARGE + LARGEUR - 122, yc + 58, { width: 104, align: 'center' })
  doc.save().roundedRect(MARGE + LARGEUR - 122, yc + 70, 104, 4, 2).fill('#2A4A78').restore()
  doc.save().roundedRect(MARGE + LARGEUR - 122, yc + 70, Math.max(4, 104 * avancement / 100), 4, 2).fill(C.orange).restore()
  doc.y = yc + 104
  doc.x = MARGE

  // Frise du parcours
  r.frise(parcours.map(etape => {
    const t = [...dossier.timings].reverse().find(x => x.etape === etape)
    if (!t) return { label: STATUS_LABELS[etape], etat: 'avenir' as const }
    const enCours = !t.dateFin && etape !== 'cloture'
    const finEtape = t.dateFin ?? (etape === 'cloture' ? t.dateDebut : null)
    const dureeJ = finEtape ? jours(t.dateDebut, finEtape) : jours(t.dateDebut, maintenant)
    return {
      label: STATUS_LABELS[etape],
      etat: enCours ? 'courant' as const : 'fait' as const,
      date: jour(t.dateDebut),
      duree: etape === 'cloture' ? 'Clôture' : enCours ? `en cours ${duree(maintenant.getTime() - t.dateDebut.getTime())}` : duree(finEtape!.getTime() - t.dateDebut.getTime()),
      retard: !enCours && etape !== 'cloture' && dureeJ > t.dureePrevueJours,
    }
  }))

  // Indicateurs clés
  const etapesTerminees = dossier.timings.filter(t => t.dateFin)
  const dansLesDelais = etapesTerminees.filter(t => jours(t.dateDebut, t.dateFin!) <= t.dureePrevueJours).length
  const taches = dossier.sousEtapes
  const tachesFaites = taches.filter(t => t.statut === 'valide').length
  const tachesDansDelai = taches.filter(t => t.statut === 'valide' && t.deadline && t.completedAt && t.completedAt <= t.deadline).length
  const tachesAvecDelai = taches.filter(t => t.statut === 'valide' && t.deadline && t.completedAt).length
  r.tuiles([
    { label: 'Durée totale', valeur: duree(fin.getTime() - debut.getTime()), detail: `du ${jour(debut)} au ${jour(fin)}` },
    { label: 'Étapes dans les délais', valeur: `${dansLesDelais}/${etapesTerminees.length}`, couleur: dansLesDelais === etapesTerminees.length ? C.vert : C.ambre },
    { label: 'Tâches réalisées', valeur: `${tachesFaites}/${taches.length}`, couleur: tachesFaites === taches.length ? C.vert : C.bleu, detail: tachesAvecDelai ? `${tachesDansDelai}/${tachesAvecDelai} dans l'échéance` : undefined },
    { label: 'Documents', valeur: String(dossier.documents.length), detail: `${dossier.commentaires.length} échange(s)` },
  ])

  // ── 1. Identité ─────────────────────────────────────────────────────────────
  r.section('1', 'Identification du dossier')
  r.champs([
    ['Client', dossier.client], ['Marchandise', dossier.marchandise], ['Fournisseur', dossier.fournisseur],
    ['Compagnie maritime', compagnie], ['Site', dossier.site], ['Conteneur(s)', dossier.conteneur],
    ['Nombre de conteneurs', String(dossier.nombreConteneurs)], ['Taille', dossier.tailleConteneur], ['Honoraires prévus', dossier.montantHonoraires ? fcfa(dossier.montantHonoraires) : null],
    ['N° BL', dossier.numeroBL], ['N° déclaration', dossier.numDeclaration], ['Régime douanier', dossier.regimeDouanier],
    ['DI', dossier.di?.numero ?? dossier.numeroDI], ['Arrivée', jour(dossier.dateArrivee)], ['Date limite de sortie', jour(dossier.dateLimiteSortie)],
    ['Ouverture', heure(dossier.dateCreation)], [cloture ? 'Responsable de clôture' : 'Responsable actuel', dossier.responsable?.nom], ['Priorité', dossier.priorite],
  ])

  // ── 2. Étapes ───────────────────────────────────────────────────────────────
  r.section('2', 'Étapes du parcours', 'Chaque étape avec son responsable, ses dates et le respect du délai cible')
  const lignesParcours = parcours.map(etape => {
    const t = [...dossier.timings].reverse().find(x => x.etape === etape)
    const aff = dossier.affectations.find(a => a.etape === etape)
    if (!t) return [{ t: txt(STATUS_LABELS[etape]), gras: true }, aff ? `${aff.responsable.nom} (désigné)` : '—', '—', '—', '—', { t: cloture ? 'Non parcourue' : 'À venir', couleur: C.gris }] as Cellule[]
    const finEtape = t.dateFin ?? (etape === 'cloture' ? t.dateDebut : null)
    const dureeJ = finEtape ? jours(t.dateDebut, finEtape) : jours(t.dateDebut, maintenant)
    const etat: Cellule = etape === 'cloture' ? { t: 'Clôturé', couleur: C.vert, gras: true }
      : !t.dateFin ? { t: 'En cours', couleur: C.orange, gras: true }
      : dureeJ <= t.dureePrevueJours ? { t: 'Dans les délais', couleur: C.vert } : { t: `Retard +${Math.round((dureeJ - t.dureePrevueJours) * 10) / 10} j`, couleur: C.rouge, gras: true }
    return [
      { t: txt(STATUS_LABELS[etape]), gras: true }, t.responsable?.nom ?? '—', heure(t.dateDebut), t.dateFin ? heure(t.dateFin) : '—',
      etape === 'cloture' ? '—' : `${duree((finEtape ?? maintenant).getTime() - t.dateDebut.getTime())}\ncible ${t.dureePrevueJours} j`, etat,
    ] as Cellule[]
  })
  r.table([{ titre: 'Étape', largeur: 17 }, { titre: 'Responsable', largeur: 18 }, { titre: 'Début', largeur: 16 }, { titre: 'Fin', largeur: 16 },
    { titre: 'Durée', largeur: 17, align: 'right' }, { titre: 'Statut', largeur: 16 }], lignesParcours)

  // ── 3. Tâches chronométrées ─────────────────────────────────────────────────
  r.section('3', 'Tâches réalisées', 'Titulaire, démarrage, fin, durée de traitement, respect de l\'échéance et informations saisies')
  const ordre = (e: string) => parcours.indexOf(e as DossierStatus)
  const libelle = (etape: string, cle: string) => SOUS_ETAPES_CONFIG[etape as DossierStatus]?.find(s => s.cle === cle)?.label ?? cle
  const tachesTriees = [...taches].filter(t => SOUS_ETAPES_CONFIG[t.etape as DossierStatus]?.some(s => s.cle === t.cle) || t.statut === 'valide')
    .sort((a, b) => ordre(a.etape) - ordre(b.etape) || (a.completedAt?.getTime() ?? 9e15) - (b.completedAt?.getTime() ?? 9e15))
  if (tachesTriees.length === 0) r.vide('Aucune tâche enregistrée.')
  else r.table(
    [{ titre: 'Tâche', largeur: 22 }, { titre: 'Titulaire', largeur: 13 }, { titre: 'Démarrée / terminée', largeur: 19 },
      { titre: 'Durée', largeur: 11, align: 'right' }, { titre: 'Échéance', largeur: 13 }, { titre: 'Informations', largeur: 22 }],
    tachesTriees.map(t => {
      const dureeT = t.startedAt && t.completedAt ? duree(t.completedAt.getTime() - t.startedAt.getTime()) : '—'
      const echeance: Cellule = !t.deadline ? { t: STATUT_TACHE[t.statut] ?? t.statut, couleur: t.statut === 'valide' ? C.vert : C.ambre }
        : t.completedAt
          ? (t.completedAt <= t.deadline ? { t: 'Respectée', couleur: C.vert, gras: true } : { t: `Dépassée de ${duree(t.completedAt.getTime() - t.deadline.getTime())}`, couleur: C.rouge, gras: true })
          : (t.deadline < maintenant ? { t: `En retard (${heure(t.deadline)})`, couleur: C.rouge } : { t: `Prévue ${heure(t.deadline)}`, couleur: C.orange })
      return [
        { t: `${libelle(t.etape, t.cle)}\n${txt(STATUS_LABELS[t.etape as DossierStatus] ?? t.etape)}`, gras: true },
        t.completedBy?.nom ?? t.responsable?.nom ?? '—',
        `${t.startedAt ? heure(t.startedAt) : '—'}\n${t.completedAt ? heure(t.completedAt) : '—'}`,
        dureeT, echeance,
        [detailsTache(t.metadata as Record<string, any> | null), t.notes].filter(Boolean).join('\n') || '—',
      ] as Cellule[]
    }),
  )

  // ── 4. Codage ───────────────────────────────────────────────────────────────
  r.section('4', 'Codage et positions tarifaires')
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
  r.section('5', 'Synthèse financière', 'Débours, frais, facturation et règlements du client')
  const paye = (arr: { statut: string; montant: unknown }[]) => arr.filter(p => ['paye', 'effectue'].includes(p.statut)).reduce((s, p) => s + Number(p.montant), 0)
  const factureTotal = dossier.factures.filter(f => f.type !== 'proforma').reduce((s, f) => s + Number(f.montant), 0)
  const regleClient = dossier.reglementsClient.reduce((s, x) => s + Number(x.montant), 0)
  r.tuiles([
    { label: 'Droits & taxes payés', valeur: nombre(paye(dossier.paiementsDouane)), detail: 'FCFA' },
    { label: 'Frais compagnies', valeur: nombre(paye(dossier.paiementsCompagnie)), detail: 'FCFA, terminal inclus' },
    { label: 'Facturé au client', valeur: nombre(factureTotal), detail: 'FCFA (hors proforma)', couleur: C.bleu },
    { label: 'Réglé par le client', valeur: nombre(regleClient), detail: 'FCFA', couleur: C.vert },
  ])
  const mouvements = [
    ...dossier.paiementsDouane.map(p => ({ d: p.datePaiement, nature: `Douane — ${p.type}`, ref: p.reference, montant: p.montant, statut: p.statut })),
    ...dossier.paiementsCompagnie.map(p => ({ d: p.datePaiement, nature: `${p.compagnie.replace(/_/g, ' ')} — ${p.type.replace(/_/g, ' ')}`, ref: p.reference, montant: p.montant, statut: p.statut })),
    ...dossier.factures.map(f => ({ d: f.dateFacture, nature: 'Facture client', ref: f.numero, montant: f.montant, statut: f.type === 'reglee' ? 'reglee' : f.type })),
    ...dossier.virements.map(v => ({ d: v.dateVirement, nature: `Virement ${v.source} -> ${v.destination}`, ref: v.reference, montant: v.montant, statut: v.statut })),
    ...dossier.reglementsClient.map(x => ({ d: x.dateReglement, nature: `Règlement client — ${MODES[x.mode] ?? x.mode}${x.banque ? ` (${x.banque})` : ''}`, ref: x.reference ?? '—', montant: x.montant, statut: 'paye' })),
  ].sort((a, b) => a.d.getTime() - b.d.getTime())
  if (mouvements.length === 0) r.vide('Aucun mouvement financier enregistré.')
  else r.table(
    [{ titre: 'Date', largeur: 12 }, { titre: 'Nature', largeur: 36 }, { titre: 'Référence', largeur: 20 }, { titre: 'Montant', largeur: 18, align: 'right' }, { titre: 'Statut', largeur: 14 }],
    mouvements.map(m => [jour(m.d), m.nature, m.ref, fcfa(m.montant),
      { t: statut(m.statut), couleur: ['paye', 'effectue', 'reglee'].includes(m.statut) ? C.vert : C.ambre }]),
  )
  if (dossier.di) r.champs([['Déclaration d\'importation', dossier.di.numero], ['Montant DI', fcfa(dossier.di.montant)], ['Solde DI', fcfa(dossier.di.soldeActuel)]])

  // ── 6. Logistique & sortie ─────────────────────────────────────────────────
  r.section('6', 'Logistique et sortie de la marchandise')
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
  r.section('7', 'Documents du dossier', 'Pièces archivées dans la bibliothèque documentaire')
  if (dossier.documents.length === 0) r.vide('Aucun document joint.')
  else r.table(
    [{ titre: 'Document', largeur: 40 }, { titre: 'Étape', largeur: 16 }, { titre: 'Déposé par', largeur: 18 }, { titre: 'Date', largeur: 16 }, { titre: 'Taille', largeur: 10, align: 'right' }],
    dossier.documents.map(d => [d.nom, txt(d.etape ? STATUS_LABELS[d.etape] : d.categorie), d.uploader?.nom ?? '—', heure(d.createdAt), d.taille]),
  )

  // ── 8. Échanges ─────────────────────────────────────────────────────────────
  r.section('8', 'Échanges et observations')
  if (dossier.commentaires.length === 0) r.vide('Aucun commentaire.')
  else r.table([{ titre: 'Date', largeur: 16 }, { titre: 'Auteur', largeur: 18 }, { titre: 'Message', largeur: 66 }],
    dossier.commentaires.map(c => [heure(c.createdAt), c.auteur?.nom ?? '—', c.message.length > 600 ? `${c.message.slice(0, 600)}…` : c.message]))

  // ── 9. Journal ──────────────────────────────────────────────────────────────
  r.section('9', 'Journal d\'audit', 'Traçabilité complète des actions effectuées sur le dossier')
  if (dossier.auditEntries.length === 0) r.vide('Aucune action journalisée.')
  else r.table([{ titre: 'Date', largeur: 17 }, { titre: 'Auteur', largeur: 17 }, { titre: 'Action', largeur: 22 }, { titre: 'Détails', largeur: 44 }],
    dossier.auditEntries.map(a => [heure(a.createdAt), a.auteur?.nom ?? '—', libelleAction(a.action), libellesEtapes(a.details ?? '—')]))

  // ── Certification et visas ──────────────────────────────────────────────────
  r.place(160)
  doc.moveDown(1.2)
  const yz = doc.y
  doc.save().roundedRect(MARGE, yz, LARGEUR, 46, 6).fill(C.fond).restore()
  doc.save().rect(MARGE, yz, 3, 46).fill(C.orange).restore()
  doc.font('Helvetica-Bold').fontSize(8).fillColor(C.marine).text('Certification du compte rendu', MARGE + 14, yz + 9)
  doc.font('Helvetica').fontSize(7.4).fillColor(C.gris).text(
    txt(`Document généré automatiquement par la plateforme ${raison} le ${heure(maintenant)}${generePar?.nom ? ` à la demande de ${generePar.nom}` : ''}. ` +
      `Il reflète l'état du dossier en base à cet instant. Référence d'intégrité : ${reference}.`),
    MARGE + 14, yz + 21, { width: LARGEUR - 28 })
  doc.y = yz + 58
  const yv = doc.y
  const lv = (LARGEUR - 20) / 2
  for (const [k, titre] of [[0, 'Visa du responsable d\'exploitation'], [1, 'Visa de la Direction Générale']] as const) {
    const x = MARGE + k * (lv + 20)
    doc.save().roundedRect(x, yv, lv, 80, 6).lineWidth(0.8).strokeColor(C.trait).stroke().restore()
    doc.save().rect(x + 12, yv + 10, 18, 2).fill(k === 0 ? C.orange : C.bleu).restore()
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.marine).text(txt(titre).toUpperCase(), x + 12, yv + 18, { width: lv - 24, characterSpacing: 0.5 })
    doc.font('Helvetica').fontSize(7).fillColor(C.gris).text('Nom, date et signature', x + 12, yv + 30)
  }
  doc.y = yv + 90

  // ── Pieds de page ──────────────────────────────────────────────────────────
  const pages = doc.bufferedPageRange()
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(pages.start + i)
    doc.page.margins.bottom = 0
    const yp = PAGE_H - 32
    doc.save().rect(MARGE, yp - 8, LARGEUR * 0.7, 0.8).fill(C.orange).restore()
    doc.save().rect(MARGE + LARGEUR * 0.7, yp - 8, LARGEUR * 0.3, 0.8).fill(C.bleu).restore()
    doc.font('Helvetica').fontSize(6.8).fillColor(C.gris)
      .text(txt(`${entreprise.sigle ?? raison} — Compte rendu du parcours ${dossier.numero} — Réf. ${reference} — ${heure(maintenant)}`),
        MARGE, yp, { width: LARGEUR - 60, lineBreak: false })
    doc.font('Helvetica-Bold').fontSize(6.8).fillColor(C.marine).text(`${i + 1} / ${pages.count}`, MARGE + LARGEUR - 60, yp, { width: 60, align: 'right', lineBreak: false })
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
