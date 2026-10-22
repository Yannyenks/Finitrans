/**
 * Facturation du dossier au client (étape « Facturation client », après la clôture) :
 * proposition pré-remplie depuis le dossier, création de la facture et facture PDF aux couleurs FINITRANS.
 */
import { createHash } from 'crypto'
import PDFDocument from 'pdfkit'
import { prisma } from '../config/prisma'
import { getEntreprise } from '../routes/admin.routes'
import { nextSequence, withUniqueRetry } from '../utils/sequence'
import { AppError } from '../utils/errors'
import { C, dessinerLogo, txt } from './compteRendu'
import { nomCompagnie } from './compagnies'

export type NatureLigne = 'honoraires' | 'debours'
export interface LigneFacture { libelle: string; montant: number; nature: NatureLigne }

const nombre = (n: unknown) => Math.round(Number(n ?? 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
const fcfa = (n: unknown) => `${nombre(n)} FCFA`
const TZ = 'Africa/Douala'
const jour = (d?: Date | string | null) => (d ? txt(new Date(d).toLocaleDateString('fr-FR', { timeZone: TZ })) : '—')

// ── Montant en lettres (français) ─────────────────────────────────────────────
const UNITES = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize',
  'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf']
const DIZAINES = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt']
function moinsDeCent(n: number): string {
  if (n < 20) return UNITES[n]
  const d = Math.floor(n / 10), u = n % 10
  if (d === 7 || d === 9) return `${DIZAINES[d]}${d === 7 && u === 1 ? ' et ' : '-'}${UNITES[10 + u]}`
  if (u === 0) return d === 8 ? 'quatre-vingts' : DIZAINES[d]
  return `${DIZAINES[d]}${u === 1 && d !== 8 ? ' et ' : '-'}${UNITES[u]}`
}
function moinsDeMille(n: number): string {
  const c = Math.floor(n / 100), r = n % 100
  const centaine = c === 0 ? '' : c === 1 ? 'cent' : `${UNITES[c]} cent${r === 0 ? 's' : ''}`
  return [centaine, r ? moinsDeCent(r) : ''].filter(Boolean).join(' ')
}
export function enLettres(montant: number): string {
  let n = Math.round(Math.abs(montant))
  if (n === 0) return 'zéro'
  const parts: string[] = []
  const echelles: [number, string, string][] = [[1e9, 'milliard', 'milliards'], [1e6, 'million', 'millions'], [1e3, 'mille', 'mille']]
  for (const [v, s, p] of echelles) {
    const q = Math.floor(n / v)
    if (q) { parts.push(v === 1e3 && q === 1 ? 'mille' : `${moinsDeMille(q)} ${q > 1 ? p : s}`.replace(/cents (mille|million|milliard)/, 'cent $1')); n %= v }
  }
  if (n) parts.push(moinsDeMille(n))
  return parts.join(' ')
}

// ── Proposition pré-remplie depuis le dossier ────────────────────────────────
export async function propositionFacture(dossierId: string) {
  const d = await prisma.dossier.findUnique({
    where: { id: dossierId },
    include: {
      paiementsDouane: true, paiementsCompagnie: true, reglementsClient: true, factures: true,
      clientCrm: true,
    },
  })
  if (!d) return null
  const entreprise = await getEntreprise() as Record<string, any>
  const paye = (arr: { statut: string; montant: unknown }[]) => arr.filter(p => ['paye', 'effectue'].includes(p.statut)).reduce((s, p) => s + Number(p.montant), 0)
  const droits = paye(d.paiementsDouane)
  const terminal = paye(d.paiementsCompagnie.filter(p => p.type === 'terminal'))
  const compagnie = paye(d.paiementsCompagnie.filter(p => p.type !== 'terminal'))
  const lignes: LigneFacture[] = [
    { libelle: `Honoraires de transit et de dédouanement — dossier ${d.numero}`, montant: Number(d.montantHonoraires ?? 0), nature: 'honoraires' },
    ...(droits ? [{ libelle: 'Droits et taxes de douane acquittés (débours)', montant: droits, nature: 'debours' as const }] : []),
    ...(compagnie ? [{ libelle: `Frais ${await nomCompagnie(d.compagnie)} (débours)`, montant: compagnie, nature: 'debours' as const }] : []),
    ...(terminal ? [{ libelle: 'Redevances portuaires / terminal (débours)', montant: terminal, nature: 'debours' as const }] : []),
  ]
  return {
    client: d.clientCrm ? { nom: d.clientCrm.nom, niu: d.clientCrm.niu, adresse: d.clientCrm.adresse, ville: d.clientCrm.ville } : { nom: d.client },
    lignes,
    tauxTVA: Number(entreprise.tauxTVA ?? 19.25),
    acomptes: d.reglementsClient.reduce((s, r) => s + Number(r.montant), 0),
    facturesExistantes: d.factures.filter(f => f.type !== 'proforma').map(f => ({ id: f.id, numero: f.numero, montant: Number(f.montant), type: f.type })),
  }
}

export function totaux(lignes: LigneFacture[], tauxTVA: number, acomptes = 0) {
  const honoraires = lignes.filter(l => l.nature === 'honoraires').reduce((s, l) => s + l.montant, 0)
  const debours = lignes.filter(l => l.nature === 'debours').reduce((s, l) => s + l.montant, 0)
  const tva = Math.round(honoraires * tauxTVA / 100)
  const ttc = honoraires + tva + debours
  return { honoraires, debours, tva, ttc, acomptes, net: Math.max(0, ttc - acomptes) }
}

const ligneValide = (l: any): l is LigneFacture =>
  l && typeof l.libelle === 'string' && l.libelle.trim() && Number.isFinite(Number(l.montant)) && Number(l.montant) >= 0 && ['honoraires', 'debours'].includes(l.nature)

/** Crée la facture client (validée) à partir des lignes saisies à l'étape « Facturation client ». */
export async function creerFactureClient(dossierId: string, meta: Record<string, unknown>) {
  const dossier = await prisma.dossier.findUnique({ where: { id: dossierId }, include: { reglementsClient: true } })
  if (!dossier) throw new AppError(404, 'NOT_FOUND', 'Dossier introuvable')
  const brutes = Array.isArray(meta.facture_lignes) ? meta.facture_lignes : []
  const lignes = brutes.filter(ligneValide).map(l => ({ libelle: String(l.libelle).trim(), montant: Math.round(Number(l.montant)), nature: l.nature }))
  if (lignes.length === 0 || lignes.every(l => l.montant === 0)) {
    throw new AppError(422, 'FACTURE_VIDE', 'La facture doit comporter au moins une ligne avec un montant.')
  }
  const taux = Number(meta.facture_tva_taux ?? 19.25)
  const t = totaux(lignes, Number.isFinite(taux) ? taux : 19.25, dossier.reglementsClient.reduce((s, r) => s + Number(r.montant), 0))
  const annee = new Date().getFullYear()
  const facture = await withUniqueRetry(async () => {
    const numero = await nextSequence(`FAC-${annee}-`, async pre =>
      (await prisma.facture.findFirst({ where: { numero: { startsWith: pre } }, orderBy: { numero: 'desc' }, select: { numero: true } }))?.numero)
    return prisma.facture.create({
      data: {
        dossierId, numero, type: 'validee', montant: t.ttc, montantTVA: t.tva, montantDebours: t.debours,
        compagnie: dossier.compagnie, dateFacture: new Date(), lignes: lignes as any,
        description: `Facture client — dossier ${dossier.numero} (${dossier.client})`,
      },
    })
  })
  return { facture, totaux: t }
}

/**
 * Facture client établie physiquement (papier), hors plateforme : on n'en conserve que les références
 * (n°, date, montant TTC) pour le suivi Finance, le compte rendu et l'encaissement. Aucun PDF n'est généré.
 */
export async function enregistrerFacturePhysique(dossierId: string, meta: Record<string, unknown>) {
  const dossier = await prisma.dossier.findUnique({ where: { id: dossierId } })
  if (!dossier) throw new AppError(404, 'NOT_FOUND', 'Dossier introuvable')
  const numero = String(meta.fc_numero ?? '').trim().toUpperCase()
  const montant = Math.round(Number(String(meta.fc_montant ?? '').replace(/\s/g, '').replace(',', '.')))
  if (!numero || !(montant > 0)) throw new AppError(422, 'FACTURE_INCOMPLETE', 'Indiquez le n° et le montant TTC de la facture établie.')
  const doublon = await prisma.facture.findUnique({ where: { numero }, select: { dossier: { select: { numero: true } } } })
  if (doublon) throw new AppError(409, 'FACTURE_DUPLIQUEE', `La facture n° ${numero} est déjà enregistrée (dossier ${doublon.dossier.numero}).`)
  const date = typeof meta.fc_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(meta.fc_date) ? new Date(`${meta.fc_date}T12:00:00`) : new Date()
  return prisma.facture.create({
    data: {
      dossierId, numero, type: 'validee', montant, compagnie: dossier.compagnie, dateFacture: date,
      description: `Facture client établie physiquement — dossier ${dossier.numero} (${dossier.client})`,
    },
  })
}

// ── Facture PDF ───────────────────────────────────────────────────────────────
export async function genererFacturePdf(factureId: string): Promise<{ buffer: Buffer; nomFichier: string } | null> {
  const f = await prisma.facture.findUnique({
    where: { id: factureId },
    include: { dossier: { include: { clientCrm: true, reglementsClient: true, di: { select: { numero: true } } } } },
  })
  if (!f) return null
  const d = f.dossier
  const entreprise = await getEntreprise() as Record<string, any>
  const raison = txt(entreprise.raisonSociale ?? 'FINITRANS')
  const brutes = Array.isArray(f.lignes) ? (f.lignes as unknown as LigneFacture[]) : []
  const lignes: LigneFacture[] = brutes.length ? brutes : [{ libelle: f.description, montant: Number(f.montant) - Number(f.montantTVA ?? 0) - Number(f.montantDebours ?? 0), nature: 'honoraires' }]
  const honoraires = lignes.filter(l => l.nature === 'honoraires').reduce((s, l) => s + Number(l.montant), 0)
  const tauxTVA = honoraires > 0 ? Math.round((Number(f.montantTVA ?? 0) / honoraires) * 10000) / 100 : Number(entreprise.tauxTVA ?? 19.25)
  const acomptes = d.reglementsClient.reduce((s, r) => s + Number(r.montant), 0)
  const ttc = Number(f.montant)
  const net = Math.max(0, ttc - acomptes)
  const compagnie = await nomCompagnie(d.compagnie)
  const empreinte = createHash('sha256').update(`${f.id}:${f.numero}:${ttc}`).digest('hex').slice(0, 10).toUpperCase()

  const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 30, left: 42, right: 42 }, info: { Title: `Facture ${f.numero}`, Author: raison, Creator: 'Plateforme FINITRANS' } })
  const morceaux: Buffer[] = []
  doc.on('data', (c: Buffer) => morceaux.push(c))
  const fin = new Promise<Buffer>(r => doc.on('end', () => r(Buffer.concat(morceaux))))
  const M = 42, L = 595.28 - 84

  // En-tête : logo + coordonnées / titre FACTURE
  dessinerLogo(doc, M, 34, 170)
  // Coordonnées de l'entreprise : seules les lignes renseignées sont imprimées
  const coordonnees = [
    [entreprise.formeJuridique, entreprise.capital ? `Capital ${nombre(entreprise.capital)} FCFA` : null],
    [entreprise.adresse, entreprise.telephone],
    [entreprise.email, entreprise.siteWeb],
    [entreprise.rccm ? `RCCM ${entreprise.rccm}` : null, entreprise.niu ? `NIU ${entreprise.niu}` : null],
  ].map(l => l.filter(Boolean).join(' · ')).filter(Boolean)
  doc.font('Helvetica').fontSize(7.4).fillColor(C.gris)
  coordonnees.forEach((l, i) => doc.text(txt(l), M, 112 + i * 10, { width: 270 }))
  doc.font('Helvetica-Bold').fontSize(30).fillColor(C.marine).text('FACTURE', 320, 36, { width: L - 278, align: 'right', characterSpacing: 2 })
  doc.font('Helvetica-Bold').fontSize(11).fillColor(C.orange).text(txt(f.numero), 320, 74, { width: L - 278, align: 'right' })
  doc.font('Helvetica').fontSize(8).fillColor(C.gris)
    .text(`Date : ${jour(f.dateFacture)}`, 320, 92, { width: L - 278, align: 'right' })
    .text(`Dossier : ${txt(d.numero)}`, 320, 103, { width: L - 278, align: 'right' })
  doc.save().rect(M, 160, L * 0.7, 2).fill(C.orange).restore()
  doc.save().rect(M + L * 0.7, 160, L * 0.3, 2).fill(C.bleu).restore()

  // Bloc client + références
  const y0 = 176
  doc.save().roundedRect(M, y0, L / 2 - 6, 98, 6).fill(C.fond).restore()
  doc.font('Helvetica-Bold').fontSize(7).fillColor(C.orange).text('FACTURÉ À', M + 14, y0 + 12, { characterSpacing: 1.2 })
  doc.font('Helvetica-Bold').fontSize(12).fillColor(C.marine).text(txt(d.clientCrm?.nom ?? d.client), M + 14, y0 + 26, { width: L / 2 - 34 })
  const lignesClient = [
    [d.clientCrm?.adresse, d.clientCrm?.ville].filter(Boolean).join(', '),
    [d.clientCrm?.niu ? `NIU ${d.clientCrm.niu}` : null, d.clientCrm?.rccm ? `RCCM ${d.clientCrm.rccm}` : null].filter(Boolean).join(' · '),
    [d.clientCrm?.telephone, d.clientCrm?.email].filter(Boolean).join(' · '),
  ].filter(Boolean)
  doc.font('Helvetica').fontSize(8).fillColor(C.encre)
  lignesClient.forEach(l => doc.text(txt(l), M + 14, doc.y + 2, { width: L / 2 - 34 }))
  const xr = M + L / 2 + 6, wr = L / 2 - 6
  doc.save().roundedRect(xr, y0, wr, 98, 6).fill(C.marine).restore()
  doc.font('Helvetica-Bold').fontSize(7).fillColor('#9FB3CF').text('RÉFÉRENCES DE L\'OPÉRATION', xr + 14, y0 + 12, { characterSpacing: 1.2 })
  const refs: [string, string][] = [
    ['Marchandise', d.marchandise], ['Compagnie', compagnie], ['Conteneur(s)', `${d.nombreConteneurs} TC (${d.tailleConteneur ?? 'taille non précisée'}) — ${d.conteneur}`],
    ['BL / Déclaration', [d.numeroBL, d.numDeclaration].filter(Boolean).join(' / ') || '—'], ['DI', d.di?.numero ?? d.numeroDI ?? '—'],
  ]
  refs.forEach(([k, v], i) => {
    doc.font('Helvetica').fontSize(7.2).fillColor('#9FB3CF').text(txt(k), xr + 14, y0 + 27 + i * 13, { width: 80 })
    doc.font('Helvetica-Bold').fontSize(7.6).fillColor('#FFFFFF').text(txt(v), xr + 90, y0 + 27 + i * 13, { width: wr - 104, lineBreak: false, ellipsis: true })
  })

  // Lignes
  let y = y0 + 116
  doc.save().roundedRect(M, y, L, 22, 3).fill(C.marine).restore()
  doc.font('Helvetica-Bold').fontSize(7.4).fillColor('#FFFFFF')
    .text('DÉSIGNATION', M + 12, y + 7.5, { characterSpacing: 0.6 })
    .text('NATURE', M + L - 220, y + 7.5, { width: 90, characterSpacing: 0.6 })
    .text('MONTANT (FCFA)', M + L - 130, y + 7.5, { width: 118, align: 'right', characterSpacing: 0.6 })
  y += 22
  lignes.forEach((l, i) => {
    doc.font('Helvetica').fontSize(8.6)
    const h = Math.max(22, doc.heightOfString(txt(l.libelle), { width: L - 250 }) + 12)
    if (i % 2 === 1) doc.save().rect(M, y, L, h).fill(C.fond).restore()
    doc.fillColor(C.encre).text(txt(l.libelle), M + 12, y + 6, { width: L - 250 })
    doc.font('Helvetica').fontSize(7.6).fillColor(l.nature === 'honoraires' ? C.orange : C.bleu)
      .text(l.nature === 'honoraires' ? 'Prestation (TVA)' : 'Débours (hors TVA)', M + L - 220, y + 7, { width: 100 })
    doc.font('Helvetica-Bold').fontSize(8.8).fillColor(C.encre).text(nombre(l.montant), M + L - 130, y + 6, { width: 118, align: 'right' })
    doc.save().moveTo(M, y + h).lineTo(M + L, y + h).lineWidth(0.4).strokeColor(C.trait).stroke().restore()
    y += h
  })

  // Totaux
  y += 12
  const xt = M + L - 250, wt = 250
  const ligneTotal = (label: string, valeur: string, fort = false, couleur: string = C.encre) => {
    doc.font(fort ? 'Helvetica-Bold' : 'Helvetica').fontSize(fort ? 9.5 : 8.6).fillColor(fort ? couleur : C.gris).text(txt(label), xt + 12, y, { width: 130 })
    doc.font('Helvetica-Bold').fontSize(fort ? 10 : 8.8).fillColor(couleur).text(valeur, xt + 120, y, { width: wt - 132, align: 'right' })
    y += fort ? 18 : 15
  }
  ligneTotal('Total prestations HT', fcfa(honoraires))
  ligneTotal(`TVA ${String(tauxTVA).replace('.', ',')} %`, fcfa(f.montantTVA ?? 0))
  ligneTotal('Débours refacturés', fcfa(f.montantDebours ?? 0))
  doc.save().rect(xt, y - 2, wt, 0.8).fill(C.trait).restore()
  y += 4
  ligneTotal('TOTAL TTC', fcfa(ttc), true, C.marine)
  if (acomptes > 0) ligneTotal('Acomptes reçus', `- ${fcfa(acomptes)}`, false, C.vert)
  doc.save().roundedRect(xt, y + 2, wt, 30, 6).fill(C.orange).restore()
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#FFFFFF').text('NET À PAYER', xt + 12, y + 12, { width: 110, characterSpacing: 1 })
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#FFFFFF').text(fcfa(net), xt + 110, y + 10, { width: wt - 122, align: 'right' })
  y += 44

  // Montant en lettres + conditions
  doc.font('Helvetica-Oblique').fontSize(8.2).fillColor(C.encre)
    .text(txt(`Arrêtée la présente facture à la somme de ${enLettres(ttc)} francs CFA toutes taxes comprises.`), M, Math.max(y, doc.y + 10), { width: L })
  y = doc.y + 14
  doc.save().roundedRect(M, y, L, 58, 6).lineWidth(0.8).strokeColor(C.trait).stroke().restore()
  doc.save().rect(M, y, 3, 58).fill(C.bleu).restore()
  doc.font('Helvetica-Bold').fontSize(8).fillColor(C.marine).text('Modalités de règlement', M + 14, y + 9)
  doc.font('Helvetica').fontSize(7.8).fillColor(C.gris)
    .text(txt(`Paiement à réception de facture${d.clientCrm?.delaiPaiementJours ? `, sous ${d.clientCrm.delaiPaiementJours} jours` : ''}, par virement, chèque ou espèces.`), M + 14, y + 22, { width: L - 28 })
    .text(txt([entreprise.banquePrincipale ? `Banque : ${entreprise.banquePrincipale}` : null, entreprise.rib ? `RIB : ${entreprise.rib}` : null].filter(Boolean).join('   ·   ') || 'Coordonnées bancaires communiquées sur demande.'), M + 14, y + 35, { width: L - 28 })

  // Signature
  y += 76
  doc.font('Helvetica-Bold').fontSize(8).fillColor(C.marine).text('Pour la Direction', M + L - 200, y, { width: 200, align: 'center' })
  doc.save().moveTo(M + L - 180, y + 52).lineTo(M + L - 20, y + 52).lineWidth(0.6).strokeColor(C.trait).stroke().restore()
  doc.font('Helvetica').fontSize(7).fillColor(C.gris).text('Signature et cachet', M + L - 200, y + 56, { width: 200, align: 'center' })

  // Pied de page (hors marge basse pour rester sur la page)
  doc.page.margins.bottom = 0
  const yp = 841.89 - 34
  doc.save().rect(M, yp - 8, L * 0.7, 0.8).fill(C.orange).restore()
  doc.save().rect(M + L * 0.7, yp - 8, L * 0.3, 0.8).fill(C.bleu).restore()
  doc.font('Helvetica').fontSize(6.8).fillColor(C.gris)
    .text(txt(`${raison} — Facture ${f.numero} — Dossier ${d.numero} — Empreinte ${empreinte}`), M, yp, { width: L, align: 'center', lineBreak: false })

  doc.end()
  return { buffer: await fin, nomFichier: `Facture-${f.numero}.pdf` }
}
