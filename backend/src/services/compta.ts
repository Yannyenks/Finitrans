/**
 * Comptabilité générale en partie double — référentiel SYSCOHADA révisé.
 * Plan comptable, journaux, exercices, écritures équilibrées, comptabilisation
 * automatique des opérations de transit, états financiers.
 */
import { Prisma, TypeCompte, TypeJournal } from '@prisma/client'
import { prisma } from '../config/prisma'
import { AppError } from '../utils/errors'
import { nextSequence, withUniqueRetry } from '../utils/sequence'

// ── Référentiel ─────────────────────────────────────────────────────────────

export const PLAN_COMPTABLE: [string, string, number, TypeCompte][] = [
  ['101000', 'Capital social', 1, 'passif'],
  ['111000', 'Réserve légale', 1, 'passif'],
  ['121000', 'Report à nouveau créditeur', 1, 'passif'],
  ['129000', 'Report à nouveau débiteur', 1, 'passif'],
  ['131000', 'Résultat net : bénéfice', 1, 'passif'],
  ['139000', 'Résultat net : perte', 1, 'passif'],
  ['162000', 'Emprunts auprès des établissements de crédit', 1, 'passif'],
  ['213000', 'Logiciels et sites internet', 2, 'actif'],
  ['244000', 'Matériel et mobilier de bureau', 2, 'actif'],
  ['245000', 'Matériel de transport', 2, 'actif'],
  ['284400', 'Amortissements du matériel et mobilier de bureau', 2, 'actif'],
  ['284500', 'Amortissements du matériel de transport', 2, 'actif'],
  ['401000', 'Fournisseurs', 4, 'passif'],
  ['408000', 'Fournisseurs, factures non parvenues', 4, 'passif'],
  ['411000', 'Clients', 4, 'actif'],
  ['419100', 'Clients, avances et acomptes reçus', 4, 'passif'],
  ['421000', 'Personnel, avances et acomptes', 4, 'actif'],
  ['422000', 'Personnel, rémunérations dues', 4, 'passif'],
  ['431000', 'Sécurité sociale (CNPS)', 4, 'passif'],
  ['442100', 'État, impôts retenus sur salaires', 4, 'passif'],
  ['443100', 'État, TVA facturée', 4, 'passif'],
  ['445100', 'État, TVA récupérable sur achats', 4, 'actif'],
  ['447000', 'État, autres impôts et taxes', 4, 'passif'],
  ['467100', 'Débours et avances pour compte de clients', 4, 'mixte'],
  ['471000', 'Comptes d\'attente', 4, 'mixte'],
  ['521100', 'Banque — compte principal', 5, 'actif'],
  ['521200', 'Banque — compte secondaire', 5, 'actif'],
  ['571000', 'Caisse', 5, 'actif'],
  ['585000', 'Virements de fonds', 5, 'mixte'],
  ['604000', 'Achats de matières et fournitures consommables', 6, 'charge'],
  ['605100', 'Eau', 6, 'charge'],
  ['605200', 'Électricité', 6, 'charge'],
  ['605500', 'Fournitures de bureau', 6, 'charge'],
  ['612000', 'Transports sur prestations', 6, 'charge'],
  ['618000', 'Autres frais de transport', 6, 'charge'],
  ['622000', 'Locations et charges locatives', 6, 'charge'],
  ['624000', 'Entretien, réparations et maintenance', 6, 'charge'],
  ['625000', 'Primes d\'assurance', 6, 'charge'],
  ['627000', 'Publicité, publications, relations publiques', 6, 'charge'],
  ['628000', 'Frais de télécommunications', 6, 'charge'],
  ['631000', 'Frais bancaires', 6, 'charge'],
  ['632000', 'Rémunérations d\'intermédiaires et de conseils', 6, 'charge'],
  ['638000', 'Autres charges externes', 6, 'charge'],
  ['641000', 'Impôts et taxes directs', 6, 'charge'],
  ['658000', 'Charges diverses', 6, 'charge'],
  ['661000', 'Rémunérations directes versées au personnel', 6, 'charge'],
  ['664000', 'Charges sociales', 6, 'charge'],
  ['671000', 'Intérêts des emprunts', 6, 'charge'],
  ['681000', 'Dotations aux amortissements d\'exploitation', 6, 'charge'],
  ['706000', 'Services vendus — honoraires de transit', 7, 'produit'],
  ['707000', 'Produits accessoires', 7, 'produit'],
  ['758000', 'Produits divers', 7, 'produit'],
  ['771000', 'Intérêts de prêts et créances', 7, 'produit'],
  ['891000', 'Impôts sur le résultat', 8, 'charge'],
]

export const JOURNAUX: [string, string, TypeJournal][] = [
  ['ACH', 'Journal des achats', 'achats'],
  ['VTE', 'Journal des ventes', 'ventes'],
  ['BQ',  'Journal de banque', 'banque'],
  ['CAI', 'Journal de caisse', 'caisse'],
  ['OD',  'Opérations diverses', 'operations_diverses'],
  ['PAI', 'Journal de paie', 'paie'],
]

export const COMPTES = {
  CLIENTS: '411000', HONORAIRES: '706000', TVA_FACTUREE: '443100', DEBOURS: '467100',
  BANQUE: '521100', SALAIRES: '661000', PERSONNEL_DU: '422000',
} as const

let referentielPret = false

/** Crée le plan comptable et les journaux s'ils n'existent pas (idempotent). */
export async function ensureReferentiel() {
  if (referentielPret) return
  const nbComptes = await prisma.compteComptable.count()
  if (nbComptes === 0) {
    await prisma.compteComptable.createMany({
      data: PLAN_COMPTABLE.map(([numero, libelle, classe, type]) => ({ numero, libelle, classe, type, systeme: true })),
      skipDuplicates: true,
    })
  }
  const nbJournaux = await prisma.journalComptable.count()
  if (nbJournaux === 0) {
    await prisma.journalComptable.createMany({
      data: JOURNAUX.map(([code, libelle, type]) => ({ code, libelle, type })),
      skipDuplicates: true,
    })
  }
  referentielPret = true
}

export function resetReferentielCache() { referentielPret = false }

// ── Exercices ───────────────────────────────────────────────────────────────

/** Exercice ouvert contenant la date (créé automatiquement sur l'année civile si absent). */
export async function exercicePourDate(date: Date, tx: Prisma.TransactionClient = prisma) {
  let exercice = await tx.exerciceComptable.findFirst({
    where: { dateDebut: { lte: date }, dateFin: { gte: date } },
  })
  if (!exercice) {
    const annee = date.getUTCFullYear()
    exercice = await tx.exerciceComptable.upsert({
      where: { code: String(annee) },
      update: {},
      create: {
        code: String(annee),
        dateDebut: new Date(Date.UTC(annee, 0, 1)),
        dateFin: new Date(Date.UTC(annee, 11, 31, 23, 59, 59, 999)),
      },
    })
  }
  if (exercice.statut === 'cloture') {
    throw new AppError(422, 'EXERCICE_CLOTURE', `L'exercice ${exercice.code} est clôturé : aucune écriture ne peut y être enregistrée`)
  }
  return exercice
}

// ── Écritures ───────────────────────────────────────────────────────────────

export interface LigneInput {
  compte: string          // numéro de compte
  libelle?: string
  debit?: number
  credit?: number
  tiers?: string
}

export interface EcritureInput {
  journal: string         // code journal
  date: Date
  libelle: string
  piece?: string
  dossierId?: string
  lignes: LigneInput[]
  sourceType?: string
  sourceId?: string
  contrepasseeDeId?: string
  statut?: 'brouillon' | 'validee'
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** Contrôles de partie double : au moins 2 lignes, montants positifs, débit = crédit. */
export function verifierEquilibre(lignes: LigneInput[]) {
  const actives = lignes.filter(l => (l.debit ?? 0) !== 0 || (l.credit ?? 0) !== 0)
  if (actives.length < 2) throw new AppError(422, 'ECRITURE_INVALIDE', 'Une écriture comporte au moins deux lignes non nulles')
  for (const l of actives) {
    const d = l.debit ?? 0, c = l.credit ?? 0
    if (d < 0 || c < 0) throw new AppError(422, 'ECRITURE_INVALIDE', 'Les montants doivent être positifs')
    if (d > 0 && c > 0) throw new AppError(422, 'ECRITURE_INVALIDE', `Ligne ${l.compte} : débit et crédit ne peuvent être saisis simultanément`)
  }
  const totalDebit  = r2(actives.reduce((s, l) => s + (l.debit ?? 0), 0))
  const totalCredit = r2(actives.reduce((s, l) => s + (l.credit ?? 0), 0))
  if (totalDebit !== totalCredit) {
    throw new AppError(422, 'ECRITURE_DESEQUILIBREE', `Écriture déséquilibrée : débit ${totalDebit} ≠ crédit ${totalCredit}`)
  }
  return { actives, totalDebit, totalCredit }
}

export async function creerEcriture(input: EcritureInput, userId: string) {
  await ensureReferentiel()
  const { actives } = verifierEquilibre(input.lignes)

  const journal = await prisma.journalComptable.findUnique({ where: { code: input.journal } })
  if (!journal || !journal.actif) throw new AppError(422, 'JOURNAL_INCONNU', `Journal ${input.journal} introuvable ou inactif`)

  const numeros = [...new Set(actives.map(l => l.compte))]
  const comptes = await prisma.compteComptable.findMany({ where: { numero: { in: numeros } } })
  const parNumero = new Map(comptes.map(c => [c.numero, c]))
  const inconnus = numeros.filter(n => !parNumero.get(n)?.actif)
  if (inconnus.length) throw new AppError(422, 'COMPTE_INCONNU', `Compte(s) introuvable(s) ou inactif(s) : ${inconnus.join(', ')}`)

  const exercice = await exercicePourDate(input.date)

  return withUniqueRetry(async () => {
    const numero = await nextSequence(`${journal.code}-${exercice.code}-`, async prefix =>
      (await prisma.ecritureComptable.findFirst({ where: { numero: { startsWith: prefix } }, orderBy: { numero: 'desc' }, select: { numero: true } }))?.numero, 5)
    const validee = input.statut === 'validee'
    return prisma.ecritureComptable.create({
      data: {
        numero, journalId: journal.id, exerciceId: exercice.id, date: input.date,
        libelle: input.libelle, piece: input.piece, dossierId: input.dossierId,
        sourceType: input.sourceType, sourceId: input.sourceId, contrepasseeDeId: input.contrepasseeDeId,
        statut: validee ? 'validee' : 'brouillon',
        valideeParId: validee ? userId : undefined, valideeAt: validee ? new Date() : undefined,
        createdById: userId,
        lignes: {
          create: actives.map((l, i) => ({
            compteId: parNumero.get(l.compte)!.id, libelle: l.libelle ?? input.libelle,
            debit: r2(l.debit ?? 0), credit: r2(l.credit ?? 0), tiers: l.tiers, ordre: i,
          })),
        },
      },
      include: ecritureInclude,
    })
  })
}

export const ecritureInclude = {
  journal: { select: { code: true, libelle: true } },
  exercice: { select: { code: true, statut: true } },
  dossier: { select: { id: true, numero: true, client: true } },
  createdBy: { select: { nom: true } },
  valideePar: { select: { nom: true } },
  lignes: { orderBy: { ordre: 'asc' }, include: { compte: { select: { numero: true, libelle: true } } } },
} satisfies Prisma.EcritureComptableInclude

// ── Comptabilisation automatique ───────────────────────────────────────────

export const SOURCES = ['FACTURE', 'FACTURE_REGLEMENT', 'PAIEMENT_DOUANE', 'PAIEMENT_COMPAGNIE'] as const
export type SourceAuto = typeof SOURCES[number]

async function dejaComptabilises(sourceType: string, ids: string[]) {
  if (ids.length === 0) return new Set<string>()
  const rows = await prisma.ecritureComptable.findMany({
    where: { sourceType, sourceId: { in: ids } }, select: { sourceId: true },
  })
  return new Set(rows.map(r => r.sourceId!))
}

/** Opérations métier non encore comptabilisées, par source. */
export async function operationsAComptabiliser(sources: readonly SourceAuto[] = SOURCES) {
  const out: Record<SourceAuto, { id: string; date: Date; montant: number; libelle: string; dossierId: string | null }[]> = {
    FACTURE: [], FACTURE_REGLEMENT: [], PAIEMENT_DOUANE: [], PAIEMENT_COMPAGNIE: [],
  }
  if (sources.includes('FACTURE') || sources.includes('FACTURE_REGLEMENT')) {
    const factures = await prisma.facture.findMany({
      where: { type: { in: ['validee', 'reglee'] } },
      include: { dossier: { select: { numero: true, client: true } } },
    })
    const faits = await dejaComptabilises('FACTURE', factures.map(f => f.id))
    const reglFaits = await dejaComptabilises('FACTURE_REGLEMENT', factures.map(f => f.id))
    for (const f of factures) {
      const libelle = `Facture ${f.numero} — ${f.dossier.client}`
      if (sources.includes('FACTURE') && !faits.has(f.id)) {
        out.FACTURE.push({ id: f.id, date: f.dateFacture, montant: Number(f.montant), libelle, dossierId: f.dossierId })
      }
      if (sources.includes('FACTURE_REGLEMENT') && f.type === 'reglee' && !reglFaits.has(f.id)) {
        out.FACTURE_REGLEMENT.push({ id: f.id, date: f.datePaiement ?? f.dateFacture, montant: Number(f.montant), libelle: `Règlement ${libelle}`, dossierId: f.dossierId })
      }
    }
  }
  if (sources.includes('PAIEMENT_DOUANE')) {
    const pd = await prisma.paiementDouane.findMany({
      where: { statut: 'paye' }, include: { dossier: { select: { numero: true, client: true } } },
    })
    const faits = await dejaComptabilises('PAIEMENT_DOUANE', pd.map(p => p.id))
    for (const p of pd) if (!faits.has(p.id)) {
      out.PAIEMENT_DOUANE.push({ id: p.id, date: p.datePaiement, montant: Number(p.montant), libelle: `Douane (${p.type}) ${p.reference} — ${p.dossier.numero}`, dossierId: p.dossierId })
    }
  }
  if (sources.includes('PAIEMENT_COMPAGNIE')) {
    const pc = await prisma.paiementCompagnie.findMany({
      where: { statut: 'paye' }, include: { dossier: { select: { numero: true, client: true } } },
    })
    const faits = await dejaComptabilises('PAIEMENT_COMPAGNIE', pc.map(p => p.id))
    for (const p of pc) if (!faits.has(p.id)) {
      out.PAIEMENT_COMPAGNIE.push({ id: p.id, date: p.datePaiement, montant: Number(p.montant), libelle: `${p.compagnie} (${p.type}) ${p.reference} — ${p.dossier.numero}`, dossierId: p.dossierId })
    }
  }
  return out
}

/** Génère les écritures (brouillon) des opérations non comptabilisées. */
export async function comptabiliser(sources: readonly SourceAuto[], userId: string) {
  await ensureReferentiel()
  const ops = await operationsAComptabiliser(sources)
  const creees: string[] = []
  const erreurs: { source: string; id: string; message: string }[] = []

  const run = async (source: SourceAuto, id: string, build: () => Promise<EcritureInput>) => {
    try {
      const e = await creerEcriture({ ...(await build()), sourceType: source, sourceId: id }, userId)
      creees.push(e.numero)
    } catch (err) {
      erreurs.push({ source, id, message: (err as Error).message })
    }
  }

  for (const op of ops.FACTURE) {
    await run('FACTURE', op.id, async () => {
      const f = await prisma.facture.findUniqueOrThrow({ where: { id: op.id }, include: { dossier: { select: { client: true } } } })
      const total = Number(f.montant)
      const tva = Number(f.montantTVA ?? 0)
      const debours = Number(f.montantDebours ?? 0)
      const ht = r2(total - tva - debours)
      return {
        journal: 'VTE', date: f.dateFacture, libelle: op.libelle, piece: f.numero, dossierId: f.dossierId,
        lignes: [
          { compte: COMPTES.CLIENTS, debit: total, tiers: f.dossier.client },
          { compte: COMPTES.HONORAIRES, credit: ht },
          { compte: COMPTES.TVA_FACTUREE, credit: tva },
          { compte: COMPTES.DEBOURS, credit: debours, tiers: f.dossier.client },
        ],
      }
    })
  }
  for (const op of ops.FACTURE_REGLEMENT) {
    await run('FACTURE_REGLEMENT', op.id, async () => ({
      journal: 'BQ', date: op.date, libelle: op.libelle, dossierId: op.dossierId ?? undefined,
      lignes: [
        { compte: COMPTES.BANQUE, debit: op.montant },
        { compte: COMPTES.CLIENTS, credit: op.montant },
      ],
    }))
  }
  for (const source of ['PAIEMENT_DOUANE', 'PAIEMENT_COMPAGNIE'] as const) {
    for (const op of ops[source]) {
      await run(source, op.id, async () => ({
        journal: 'BQ', date: op.date, libelle: op.libelle, dossierId: op.dossierId ?? undefined,
        lignes: [
          { compte: COMPTES.DEBOURS, debit: op.montant },
          { compte: COMPTES.BANQUE, credit: op.montant },
        ],
      }))
    }
  }
  return { creees, erreurs }
}

/** Écriture de paie mensuelle à partir des fiches RH (salaire de base + primes). */
export async function genererPaie(mois: string, userId: string) {
  await ensureReferentiel()
  const existante = await prisma.ecritureComptable.findUnique({
    where: { sourceType_sourceId: { sourceType: 'PAIE', sourceId: mois } },
  })
  if (existante) throw new AppError(409, 'PAIE_DEJA_GENEREE', `La paie de ${mois} est déjà comptabilisée (${existante.numero})`)

  const fiches = await prisma.ficheRH.findMany({
    where: { user: { actif: true } },
    include: { user: { select: { nom: true } } },
  })
  const lignesPersonnel = fiches
    .map(f => ({ nom: f.user.nom, brut: Number(f.salaireBase) + Number(f.primes) }))
    .filter(l => l.brut > 0)
  if (lignesPersonnel.length === 0) {
    throw new AppError(422, 'AUCUN_SALAIRE', 'Aucun salaire renseigné dans les fiches RH (Administration → RH)')
  }
  const total = lignesPersonnel.reduce((s, l) => s + l.brut, 0)
  const [annee, m] = mois.split('-').map(Number)
  const date = new Date(Date.UTC(annee, m, 0)) // dernier jour du mois

  return creerEcriture({
    journal: 'PAI', date, libelle: `Salaires ${mois}`, sourceType: 'PAIE', sourceId: mois,
    lignes: [
      { compte: COMPTES.SALAIRES, debit: total, libelle: `Rémunérations ${mois}` },
      ...lignesPersonnel.map(l => ({ compte: COMPTES.PERSONNEL_DU, credit: l.brut, tiers: l.nom, libelle: `Salaire ${mois} — ${l.nom}` })),
    ],
  }, userId)
}

// ── États ───────────────────────────────────────────────────────────────────

export interface FiltreEtat { from?: Date; to?: Date; statut?: 'validee' }

function whereEcriture(f: FiltreEtat): Prisma.EcritureComptableWhereInput {
  return {
    ...(f.from || f.to ? { date: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
    ...(f.statut ? { statut: f.statut } : {}),
  }
}

export async function balance(f: FiltreEtat) {
  await ensureReferentiel()
  const [sommes, comptes] = await Promise.all([
    prisma.ligneEcriture.groupBy({
      by: ['compteId'],
      where: { ecriture: whereEcriture(f) },
      _sum: { debit: true, credit: true },
    }),
    prisma.compteComptable.findMany({ orderBy: { numero: 'asc' } }),
  ])
  const parCompte = new Map(sommes.map(s => [s.compteId, s._sum]))
  const lignes = comptes
    .filter(c => parCompte.has(c.id))
    .map(c => {
      const s = parCompte.get(c.id)!
      const debit = Number(s.debit ?? 0), credit = Number(s.credit ?? 0)
      const solde = r2(debit - credit)
      return {
        compteId: c.id, numero: c.numero, libelle: c.libelle, classe: c.classe, type: c.type,
        debit: r2(debit), credit: r2(credit),
        soldeDebiteur: solde > 0 ? solde : 0, soldeCrediteur: solde < 0 ? -solde : 0,
      }
    })
  const totaux = lignes.reduce((t, l) => ({
    debit: r2(t.debit + l.debit), credit: r2(t.credit + l.credit),
    soldeDebiteur: r2(t.soldeDebiteur + l.soldeDebiteur), soldeCrediteur: r2(t.soldeCrediteur + l.soldeCrediteur),
  }), { debit: 0, credit: 0, soldeDebiteur: 0, soldeCrediteur: 0 })
  return { lignes, totaux, equilibree: totaux.debit === totaux.credit }
}

export async function grandLivre(compteNumero: string, f: FiltreEtat) {
  const compte = await prisma.compteComptable.findUnique({ where: { numero: compteNumero } })
  if (!compte) throw new AppError(404, 'NOT_FOUND', `Compte ${compteNumero} introuvable`)

  const ouverture = f.from
    ? await prisma.ligneEcriture.aggregate({
        where: { compteId: compte.id, ecriture: { date: { lt: f.from }, ...(f.statut ? { statut: f.statut } : {}) } },
        _sum: { debit: true, credit: true },
      })
    : null
  let solde = ouverture ? r2(Number(ouverture._sum.debit ?? 0) - Number(ouverture._sum.credit ?? 0)) : 0
  const soldeOuverture = solde

  const lignes = await prisma.ligneEcriture.findMany({
    where: { compteId: compte.id, ecriture: whereEcriture(f) },
    include: { ecriture: { select: { id: true, numero: true, date: true, libelle: true, piece: true, statut: true, journal: { select: { code: true } } } } },
    orderBy: [{ ecriture: { date: 'asc' } }, { ecriture: { numero: 'asc' } }],
  })
  const mouvements = lignes.map(l => {
    solde = r2(solde + Number(l.debit) - Number(l.credit))
    return {
      date: l.ecriture.date, ecritureId: l.ecriture.id, numero: l.ecriture.numero, journal: l.ecriture.journal.code,
      piece: l.ecriture.piece, libelle: l.libelle ?? l.ecriture.libelle, tiers: l.tiers, statut: l.ecriture.statut,
      debit: Number(l.debit), credit: Number(l.credit), solde,
    }
  })
  return {
    compte: { numero: compte.numero, libelle: compte.libelle, classe: compte.classe },
    soldeOuverture,
    mouvements,
    totalDebit: r2(mouvements.reduce((s, m) => s + m.debit, 0)),
    totalCredit: r2(mouvements.reduce((s, m) => s + m.credit, 0)),
    soldeFinal: solde,
  }
}

export async function compteDeResultat(f: FiltreEtat) {
  const b = await balance(f)
  const charges = b.lignes.filter(l => l.type === 'charge').map(l => ({ numero: l.numero, libelle: l.libelle, montant: r2(l.debit - l.credit) }))
  const produits = b.lignes.filter(l => l.type === 'produit').map(l => ({ numero: l.numero, libelle: l.libelle, montant: r2(l.credit - l.debit) }))
  const totalCharges = r2(charges.reduce((s, c) => s + c.montant, 0))
  const totalProduits = r2(produits.reduce((s, p) => s + p.montant, 0))
  return { charges, produits, totalCharges, totalProduits, resultat: r2(totalProduits - totalCharges) }
}

export async function bilan(date: Date, statut?: 'validee') {
  const b = await balance({ to: date, statut })
  const actif: { numero: string; libelle: string; montant: number; rubrique: string }[] = []
  const passif: { numero: string; libelle: string; montant: number; rubrique: string }[] = []
  let resultat = 0
  for (const l of b.lignes) {
    const solde = r2(l.debit - l.credit)
    if (l.type === 'charge' || l.type === 'produit') { resultat = r2(resultat - solde); continue }
    if (l.classe === 1) passif.push({ numero: l.numero, libelle: l.libelle, montant: -solde, rubrique: 'Capitaux propres et dettes financières' })
    else if (l.classe === 2 || l.classe === 3) actif.push({ numero: l.numero, libelle: l.libelle, montant: solde, rubrique: l.classe === 2 ? 'Actif immobilisé' : 'Stocks' })
    else if (solde >= 0) actif.push({ numero: l.numero, libelle: l.libelle, montant: solde, rubrique: l.classe === 5 ? 'Trésorerie — actif' : 'Actif circulant' })
    else passif.push({ numero: l.numero, libelle: l.libelle, montant: -solde, rubrique: l.classe === 5 ? 'Trésorerie — passif' : 'Passif circulant' })
  }
  const totalActif = r2(actif.reduce((s, a) => s + a.montant, 0))
  const totalPassifHorsResultat = r2(passif.reduce((s, p) => s + p.montant, 0))
  const totalPassif = r2(totalPassifHorsResultat + resultat)
  return { date, actif, passif, resultat, totalActif, totalPassif, equilibre: totalActif === totalPassif }
}

export async function tresorerie(annee: number) {
  const comptes = await prisma.compteComptable.findMany({ where: { classe: 5 }, select: { id: true, numero: true, libelle: true } })
  const ids = comptes.map(c => c.id)
  const debut = new Date(Date.UTC(annee, 0, 1)), fin = new Date(Date.UTC(annee, 11, 31, 23, 59, 59, 999))
  const [lignes, avant, soldes] = await Promise.all([
    prisma.ligneEcriture.findMany({
      where: { compteId: { in: ids }, ecriture: { date: { gte: debut, lte: fin } } },
      select: { debit: true, credit: true, ecriture: { select: { date: true } } },
    }),
    prisma.ligneEcriture.aggregate({ where: { compteId: { in: ids }, ecriture: { date: { lt: debut } } }, _sum: { debit: true, credit: true } }),
    prisma.ligneEcriture.groupBy({ by: ['compteId'], where: { compteId: { in: ids } }, _sum: { debit: true, credit: true } }),
  ])
  let cumul = r2(Number(avant._sum.debit ?? 0) - Number(avant._sum.credit ?? 0))
  const mois = Array.from({ length: 12 }, (_, i) => ({ mois: i + 1, encaissements: 0, decaissements: 0, solde: 0 }))
  for (const l of lignes) {
    const m = mois[l.ecriture.date.getUTCMonth()]
    m.encaissements = r2(m.encaissements + Number(l.debit))
    m.decaissements = r2(m.decaissements + Number(l.credit))
  }
  for (const m of mois) { cumul = r2(cumul + m.encaissements - m.decaissements); m.solde = cumul }
  const parCompte = new Map(soldes.map(s => [s.compteId, r2(Number(s._sum.debit ?? 0) - Number(s._sum.credit ?? 0))]))
  return {
    annee,
    mois,
    comptes: comptes.map(c => ({ numero: c.numero, libelle: c.libelle, solde: parCompte.get(c.id) ?? 0 })),
    soldeTotal: r2([...parCompte.values()].reduce((s, v) => s + v, 0)),
  }
}

/** Balance âgée des créances clients (factures validées non réglées). */
export async function creancesClients() {
  const now = Date.now()
  const factures = await prisma.facture.findMany({
    where: { type: 'validee' },
    include: { dossier: { select: { id: true, numero: true, client: true } } },
    orderBy: { dateFacture: 'asc' },
  })
  const tranches = { '0-30': 0, '31-60': 0, '61-90': 0, '+90': 0 }
  const parClient: Record<string, { client: string; total: number; factures: number; plusAncienne: Date }> = {}
  const detail = factures.map(f => {
    const age = Math.floor((now - f.dateFacture.getTime()) / 86_400_000)
    const tranche = age <= 30 ? '0-30' : age <= 60 ? '31-60' : age <= 90 ? '61-90' : '+90'
    const montant = Number(f.montant)
    tranches[tranche] = r2(tranches[tranche] + montant)
    const c = (parClient[f.dossier.client] ??= { client: f.dossier.client, total: 0, factures: 0, plusAncienne: f.dateFacture })
    c.total = r2(c.total + montant); c.factures++
    if (f.dateFacture < c.plusAncienne) c.plusAncienne = f.dateFacture
    return { id: f.id, numero: f.numero, dateFacture: f.dateFacture, montant, age, tranche, dossier: f.dossier }
  })
  return {
    total: r2(detail.reduce((s, d) => s + d.montant, 0)),
    tranches,
    parClient: Object.values(parClient).sort((a, b) => b.total - a.total),
    factures: detail,
  }
}

export function toCsv(rows: Record<string, unknown>[], sep = ';'): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const esc = (v: unknown) => {
    const s = v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? '')
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [headers.join(sep), ...rows.map(r => headers.map(h => esc(r[h])).join(sep))].join('\r\n')
}
