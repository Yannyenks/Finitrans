/**
 * Seed de test — données réalistes pour valider toutes les fonctionnalités
 * Usage: npm run db:seed:test
 *
 * Ce script s'exécute APRÈS db:seed (ne recrée pas les utilisateurs/dossiers).
 * Il ajoute :
 *   - DeclarationImportation liées aux dossiers existants
 *   - SousEtapeDossier avec assignations, deadlines, statuts variés, metadata
 *   - MouvementDI simulant des déductions partielles
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ── Helpers ──────────────────────────────────────────────────────────────────

const d = (iso: string) => new Date(iso)

// Aujourd'hui = 2026-08-11. Deadlines passées = retard intentionnel.
const PAST_1   = d('2026-08-01') // 10 jours de retard
const PAST_2   = d('2026-08-05') // 6 jours de retard
const TODAY    = d('2026-08-11')
const FUTURE_1 = d('2026-08-15')
const FUTURE_2 = d('2026-08-20')
const FUTURE_3 = d('2026-08-25')

async function main() {
  console.log('🌱 Seed de test — chargement des données existantes...')

  // ── Récupérer les utilisateurs ─────────────────────────────────────────────
  const users = await prisma.user.findMany({ select: { id: true, email: true, nom: true } })
  const u = Object.fromEntries(users.map(u => [u.email.split('@')[0], u.id]))

  const delba   = u['delba']
  const soudi   = u['soudi']
  const yaya    = u['yaya']
  const odette  = u['odette']
  const wandala = u['wandala']
  const rasoul  = u['rasoul']
  const yasmine = u['yasmine']
  const honore  = u['honore']
  const aliou   = u['aliou']
  const raphael = u['raphael']

  if (!delba || !soudi) {
    throw new Error('Utilisateurs non trouvés — exécutez d\'abord npm run db:seed')
  }

  // ── Récupérer les dossiers ─────────────────────────────────────────────────
  const dossiers = await prisma.dossier.findMany({
    select: { id: true, numero: true, client: true, compagnie: true, responsableId: true },
    orderBy: { numero: 'desc' },
  })
  const dos = Object.fromEntries(dossiers.map(d => [d.numero, d]))

  console.log(`  ${users.length} utilisateurs, ${dossiers.length} dossiers chargés`)

  // ── Nettoyage des données de test existantes ───────────────────────────────
  console.log('🧹 Nettoyage des données de test existantes...')
  await prisma.sousEtapeDossier.deleteMany()
  await prisma.mouvementDI.deleteMany()

  // Délier les DI des dossiers avant de les supprimer
  await prisma.dossier.updateMany({ data: { diId: null } })
  await prisma.declarationImportation.deleteMany()

  console.log('✅ Nettoyage terminé')

  // ============================================================
  // DÉCLARATIONS D'IMPORTATION
  // ============================================================

  console.log('🌱 Création des DI...')

  const [
    di42, di41, di40, di39, di38,
    di37, di36, di35, di34, di33,
  ] = await Promise.all([

    // DOS-2025-0042 — CAMRAIL (validation) — DI partielle utilisée
    prisma.declarationImportation.create({ data: {
      numero: 'DI-2025-1042', client: 'CAMRAIL SA',
      montant: 6_000_000, soldeActuel: 4_850_000, devise: 'XAF',
      dateEmission: d('2025-07-15'), statut: 'actif',
      compagnie: 'MSC', gestionnaireId: honore,
      seuilAlerte1: 20, seuilAlerte2: 10,
    }}),

    // DOS-2025-0041 — ORANGE (paiement)
    prisma.declarationImportation.create({ data: {
      numero: 'DI-2025-1041', client: 'ORANGE CAMEROUN',
      montant: 10_000_000, soldeActuel: 9_200_000, devise: 'XAF',
      dateEmission: d('2025-07-14'), statut: 'actif',
      compagnie: 'COSCO', gestionnaireId: honore,
      seuilAlerte1: 20, seuilAlerte2: 10,
    }}),

    // DOS-2025-0040 — SAC (bon_compagnie)
    prisma.declarationImportation.create({ data: {
      numero: 'DI-2025-1040', client: 'SOCIÉTÉ AGRICOLE DU CAMEROUN',
      montant: 3_000_000, soldeActuel: 2_750_000, devise: 'XAF',
      dateEmission: d('2025-07-13'), statut: 'actif',
      compagnie: 'MAERSK', gestionnaireId: yasmine,
      seuilAlerte1: 20, seuilAlerte2: 10,
    }}),

    // DOS-2025-0039 — MTN (codage) — solde < 20% → alerte
    prisma.declarationImportation.create({ data: {
      numero: 'DI-2025-1039', client: 'MTN CAMEROUN',
      montant: 15_000_000, soldeActuel: 2_800_000, devise: 'XAF',
      dateEmission: d('2025-07-16'), statut: 'actif',
      compagnie: 'CMA_CGM', gestionnaireId: honore,
      seuilAlerte1: 20, seuilAlerte2: 10,
      notes: 'Solde critique — moins de 20% restant. Demande de reconstitution envoyée au DG.',
    }}),

    // DOS-2025-0038 — CIMENCAM (operations_kribi)
    prisma.declarationImportation.create({ data: {
      numero: 'DI-2025-1038', client: 'CIMENCAM',
      montant: 8_500_000, soldeActuel: 7_200_000, devise: 'XAF',
      dateEmission: d('2025-07-10'), statut: 'actif',
      compagnie: 'MSC', gestionnaireId: yasmine,
      seuilAlerte1: 20, seuilAlerte2: 10,
    }}),

    // DOS-2025-0037 — CASTEL (reception)
    prisma.declarationImportation.create({ data: {
      numero: 'DI-2025-1037', client: 'GROUPE CASTEL CAMEROUN',
      montant: 4_500_000, soldeActuel: 4_500_000, devise: 'XAF',
      dateEmission: d('2025-07-17'), statut: 'actif',
      compagnie: 'COSCO', gestionnaireId: yasmine,
      seuilAlerte1: 20, seuilAlerte2: 10,
    }}),

    // DOS-2025-0036 — ALUCAM (cloture) — entièrement consommée
    prisma.declarationImportation.create({ data: {
      numero: 'DI-2025-1036', client: 'ALUCAM',
      montant: 12_000_000, soldeActuel: 0, devise: 'XAF',
      dateEmission: d('2025-07-01'), statut: 'cloture',
      compagnie: 'MAERSK', gestionnaireId: honore,
      seuilAlerte1: 20, seuilAlerte2: 10,
    }}),

    // DOS-2025-0035 — SEMC (bon_compagnie)
    prisma.declarationImportation.create({ data: {
      numero: 'DI-2025-1035', client: 'SOCIÉTÉ DES EAUX MINÉRALES DU CAMEROUN',
      montant: 7_000_000, soldeActuel: 6_350_000, devise: 'XAF',
      dateEmission: d('2025-07-12'), statut: 'actif',
      compagnie: 'CMA_CGM', gestionnaireId: yasmine,
      seuilAlerte1: 20, seuilAlerte2: 10,
    }}),

    // DOS-2025-0034 — FOVI (paiement) — véhicules, montant élevé
    prisma.declarationImportation.create({ data: {
      numero: 'DI-2025-1034', client: 'FOVI SA',
      montant: 22_000_000, soldeActuel: 18_500_000, devise: 'XAF',
      dateEmission: d('2025-07-11'), statut: 'actif',
      compagnie: 'MSC', gestionnaireId: honore,
      seuilAlerte1: 20, seuilAlerte2: 10,
    }}),

    // DOS-2025-0033 — GUINNESS (codage)
    prisma.declarationImportation.create({ data: {
      numero: 'DI-2025-1033', client: 'GUINNESS CAMEROUN',
      montant: 9_000_000, soldeActuel: 8_600_000, devise: 'XAF',
      dateEmission: d('2025-07-09'), statut: 'actif',
      compagnie: 'COSCO', gestionnaireId: yasmine,
      seuilAlerte1: 20, seuilAlerte2: 10,
    }}),
  ])

  // Lier les DI aux dossiers (diId)
  const links = [
    ['DOS-2025-0042', di42.id], ['DOS-2025-0041', di41.id], ['DOS-2025-0040', di40.id],
    ['DOS-2025-0039', di39.id], ['DOS-2025-0038', di38.id], ['DOS-2025-0037', di37.id],
    ['DOS-2025-0036', di36.id], ['DOS-2025-0035', di35.id], ['DOS-2025-0034', di34.id],
    ['DOS-2025-0033', di33.id],
  ] as [string, string][]

  await Promise.all(links.map(([numero, diId]) => {
    const d = dos[numero]
    if (!d) return null
    return prisma.dossier.update({ where: { id: d.id }, data: { diId } })
  }))

  console.log('✅ 10 DI créées et liées')

  // ── MouvementsDI ────────────────────────────────────────────────────────────
  await prisma.mouvementDI.createMany({ data: [
    // CAMRAIL — droits de douane payés
    { diId: di42.id, dossierId: dos['DOS-2025-0042']?.id, type: 'debit',
      montant: 750_000, motif: 'Honoraires transitaire FINITRANS', categorie: 'honoraires', createdBy: honore },
    { diId: di42.id, dossierId: dos['DOS-2025-0042']?.id, type: 'debit',
      montant: 400_000, motif: 'Frais manutention MSC', categorie: 'frais_divers', createdBy: honore },

    // ORANGE — TVA partielle
    { diId: di41.id, dossierId: dos['DOS-2025-0041']?.id, type: 'debit',
      montant: 800_000, motif: 'Droits de douane — équipements télécom', categorie: 'droits_douane', createdBy: honore },

    // MTN — plusieurs déductions (solde critique)
    { diId: di39.id, dossierId: dos['DOS-2025-0039']?.id, type: 'debit',
      montant: 4_500_000, motif: 'TVA équipements informatiques', categorie: 'tva', createdBy: honore },
    { diId: di39.id, dossierId: dos['DOS-2025-0039']?.id, type: 'debit',
      montant: 5_200_000, motif: 'Droits de douane — serveurs et matériel réseau', categorie: 'droits_douane', createdBy: honore },
    { diId: di39.id, dossierId: dos['DOS-2025-0039']?.id, type: 'debit',
      montant: 2_500_000, motif: 'Redevances informatiques', categorie: 'redevances', createdBy: honore },

    // CIMENCAM — redevances portuaires
    { diId: di38.id, dossierId: dos['DOS-2025-0038']?.id, type: 'debit',
      montant: 1_300_000, motif: 'Redevances portuaires KCT Kribi', categorie: 'redevances', createdBy: aliou },

    // ALUCAM — entièrement consommée (clôturée)
    { diId: di36.id, dossierId: dos['DOS-2025-0036']?.id, type: 'debit',
      montant: 9_500_000, motif: 'Droits d\'importation aluminium brut', categorie: 'droits_douane', createdBy: honore },
    { diId: di36.id, dossierId: dos['DOS-2025-0036']?.id, type: 'debit',
      montant: 2_500_000, motif: 'TVA + pénalités de retard', categorie: 'tva', createdBy: honore },
  ]})

  console.log('✅ Mouvements DI créés')

  // ============================================================
  // SOUS-ÉTAPES
  // ============================================================

  console.log('🌱 Création des sous-étapes...')

  const se: any[] = []

  // ── Helper ──────────────────────────────────────────────────────────────────
  const valide = (dossierId: string, etape: string, cle: string, responsableId: string, completedById: string, completedAt: Date, meta?: object) => ({
    dossierId, etape, cle, statut: 'valide' as const,
    responsableId, completedAt, completedById,
    metadata: meta ?? {},
  })

  const enCours = (dossierId: string, etape: string, cle: string, responsableId: string, deadline: Date | null, notes?: string, meta?: object) => ({
    dossierId, etape, cle, statut: 'en_cours' as const,
    responsableId, deadline, notes: notes ?? null,
    metadata: meta ?? {},
  })

  const todo = (dossierId: string, etape: string, cle: string, responsableId?: string, deadline?: Date, notes?: string) => ({
    dossierId, etape, cle, statut: 'todo' as const,
    responsableId: responsableId ?? null,
    deadline: deadline ?? null,
    notes: notes ?? null,
    metadata: {},
  })

  // ── DOS-2025-0042 CAMRAIL — status: validation ───────────────────────────
  // Toutes les étapes précédentes validées, validation en cours avec RETARD
  if (dos['DOS-2025-0042']) {
    const id = dos['DOS-2025-0042'].id
    const dt = d('2025-07-15')

    // reception — tout validé
    se.push(valide(id, 'reception', 'bl',               odette,  odette, dt, { bl_numero: 'MSCUDLA2025042', date_reception: '2025-07-15', compagnie_emission: 'MSC Mediterranean Shipping' }))
    se.push(valide(id, 'reception', 'facture_proforma',  odette,  odette, dt, { fp_reference: 'INV-CAM-2025-0099', fp_montant: '45000000', fp_fournisseur: 'ALSTOM TRANSPORT SA' }))
    se.push(valide(id, 'reception', 'saisie_pr',         odette,  odette, dt, { pr_numero: 'PR-2025-0087' }))
    se.push(valide(id, 'reception', 'paiement_client',   yaya,    yaya,   dt, { montant_paye: '6200000', date_paiement: '2025-07-15', reference_paiement: 'VIR-CAM-2025-0089' }))
    se.push(valide(id, 'reception', 'traitement_sgs',    soudi,   soudi,  d('2025-07-16'), { reference_sgs: 'SGS-DLA-2025-0312', date_soumission: '2025-07-15' }))
    se.push(valide(id, 'reception', 'di',                yasmine, yasmine,d('2025-07-16'), { numero_di: 'DI-2025-1042' }))

    // soumission_sgs — validé
    se.push(valide(id, 'soumission_sgs', 'ff_soumission', soudi, soudi, d('2025-07-16'), { reference_ff: 'FF-DLA-2025-0088', date_soumission: '2025-07-15' }))
    se.push(valide(id, 'soumission_sgs', 'pvc',           soudi, soudi, d('2025-07-17'), { pvc_resultat: 'succes', pvc_motif: 'PVC N°DLA-2025-0188 reçu — marchandise conforme', pvc_numero: 'DLA-2025-0188' }))

    // codage — tout validé
    se.push(valide(id, 'codage', 'etat_codage',  odette, odette, d('2025-07-18'), { code_sh: '8607.19.00', agent_codage: 'Mme ODETTE' }))
    se.push(valide(id, 'codage', 'declaration',  odette, odette, d('2025-07-18'), { num_declaration: 'DEC-2025-0421', date_declaration: '2025-07-18' }))
    se.push(valide(id, 'codage', 'regulation',   odette, odette, d('2025-07-19'), { regime: 'Mise à la consommation', reference_reglementaire: 'ART.12 CDN 2024' }))

    // validation — EN COURS avec RETARD (deadline dépassée)
    se.push(enCours(id, 'validation', 'validation_docs', odette, PAST_1,
      'Vérification de conformité en cours — DGD a demandé une correction du code tarifaire.',
      { validateur: '', date_validation: '', observations: 'Correction code tarifaire en attente' }
    ))
  }

  // ── DOS-2025-0041 ORANGE — status: paiement ─────────────────────────────
  if (dos['DOS-2025-0041']) {
    const id = dos['DOS-2025-0041'].id
    const dt = d('2025-07-14')

    se.push(valide(id, 'reception', 'bl',               soudi,   soudi,   dt, { bl_numero: 'COSUDLA2025041', date_reception: '2025-07-14', compagnie_emission: 'COSCO Shipping' }))
    se.push(valide(id, 'reception', 'facture_proforma',  yasmine, yasmine, dt, { fp_reference: 'INV-ORA-2025-0211', fp_montant: '82000000', fp_fournisseur: 'ERICSSON CAMEROUN' }))
    se.push(valide(id, 'reception', 'saisie_pr',         yasmine, yasmine, dt, { pr_numero: 'PR-2025-0086' }))
    se.push(valide(id, 'reception', 'paiement_client',   yaya,    yaya,    dt, { montant_paye: '10500000', date_paiement: '2025-07-13', reference_paiement: 'VIR-ORA-2025-0088' }))
    se.push(valide(id, 'reception', 'traitement_sgs',    soudi,   soudi,   d('2025-07-15'), { reference_sgs: 'SGS-DLA-2025-0311', date_soumission: '2025-07-14' }))
    se.push(valide(id, 'reception', 'di',                yasmine, yasmine, d('2025-07-15'), { numero_di: 'DI-2025-1041' }))

    se.push(valide(id, 'soumission_sgs', 'ff_soumission', soudi, soudi, d('2025-07-15'), { reference_ff: 'FF-DLA-2025-0087', date_soumission: '2025-07-14' }))
    se.push(valide(id, 'soumission_sgs', 'pvc',           soudi, soudi, d('2025-07-16'), { pvc_resultat: 'succes', pvc_motif: 'PVC N°DLA-2025-0185 — équipements conformes', pvc_numero: 'DLA-2025-0185' }))

    se.push(valide(id, 'codage', 'etat_codage',  odette, odette, d('2025-07-16'), { code_sh: '8525.60.00', agent_codage: 'Mme ODETTE' }))
    se.push(valide(id, 'codage', 'declaration',  odette, odette, d('2025-07-17'), { num_declaration: 'DEC-2025-0419', date_declaration: '2025-07-17' }))
    se.push(valide(id, 'codage', 'regulation',   odette, odette, d('2025-07-17'), { regime: 'Mise à la consommation', reference_reglementaire: 'ART.8 CDN 2024' }))

    se.push(valide(id, 'validation', 'validation_docs', odette, odette, d('2025-07-18'), { validateur: 'Service DGD Douala', date_validation: '2025-07-18', observations: 'Dossier validé sans réserve' }))

    // paiement — en cours, deadline future
    se.push(enCours(id, 'paiement', 'paiement_droits', yaya, FUTURE_2,
      'Virement initié auprès de la DGD. Attente confirmation quittance.',
      { mode_paiement: 'virement', reference: 'VIR-DGD-2025-0090' }
    ))
  }

  // ── DOS-2025-0039 MTN — status: codage ──────────────────────────────────
  if (dos['DOS-2025-0039']) {
    const id = dos['DOS-2025-0039'].id
    const dt = d('2025-07-16')

    se.push(valide(id, 'reception', 'bl',               soudi,   soudi,   dt, { bl_numero: 'CMADLA2025039', date_reception: '2025-07-16', compagnie_emission: 'CMA CGM' }))
    se.push(valide(id, 'reception', 'facture_proforma',  yasmine, yasmine, dt, { fp_reference: 'INV-MTN-2025-0178', fp_montant: '125000000', fp_fournisseur: 'HUAWEI TECHNOLOGIES' }))
    se.push(valide(id, 'reception', 'saisie_pr',         yasmine, yasmine, dt, { pr_numero: 'PR-2025-0090' }))
    se.push(valide(id, 'reception', 'paiement_client',   yaya,    yaya,    dt, { montant_paye: '15800000', date_paiement: '2025-07-15', reference_paiement: 'VIR-MTN-2025-0091' }))
    se.push(valide(id, 'reception', 'traitement_sgs',    soudi,   soudi,   d('2025-07-17'), { reference_sgs: 'SGS-DLA-2025-0315', date_soumission: '2025-07-16' }))
    se.push(valide(id, 'reception', 'di',                yasmine, yasmine, d('2025-07-17'), { numero_di: 'DI-2025-1039' }))

    se.push(valide(id, 'soumission_sgs', 'ff_soumission', soudi, soudi, d('2025-07-17'), { reference_ff: 'FF-DLA-2025-0091', date_soumission: '2025-07-16' }))
    se.push(valide(id, 'soumission_sgs', 'pvc',           soudi, soudi, d('2025-07-18'), { pvc_resultat: 'succes', pvc_motif: 'PVC N°DLA-2025-0191 reçu — conforme', pvc_numero: 'DLA-2025-0191' }))

    // codage — en cours, deadline future
    se.push(enCours(id, 'codage', 'etat_codage', odette, FUTURE_1,
      'Classification tarifaire complexe — consultation du tarif douanier en cours.',
      { code_sh: '8471.30.00', agent_codage: 'Mme ODETTE' }
    ))
    se.push(todo(id, 'codage', 'declaration', odette, FUTURE_1, 'À faire après validation du code SH'))
    se.push(todo(id, 'codage', 'regulation',  odette, FUTURE_2))
  }

  // ── DOS-2025-0038 CIMENCAM — status: operations_kribi ───────────────────
  if (dos['DOS-2025-0038']) {
    const id = dos['DOS-2025-0038'].id
    const dt = d('2025-07-10')

    se.push(valide(id, 'reception', 'bl',               aliou,   aliou,   dt, { bl_numero: 'MSCKRI2025038', date_reception: '2025-07-10', compagnie_emission: 'MSC' }))
    se.push(valide(id, 'reception', 'facture_proforma',  yasmine, yasmine, dt, { fp_reference: 'INV-CIM-2025-0067', fp_montant: '68000000', fp_fournisseur: 'FLSmidth A/S' }))
    se.push(valide(id, 'reception', 'saisie_pr',         yasmine, yasmine, dt, { pr_numero: 'PR-2025-0082' }))
    se.push(valide(id, 'reception', 'paiement_client',   yaya,    yaya,    dt, { montant_paye: '9200000', date_paiement: '2025-07-09', reference_paiement: 'VIR-CIM-2025-0081' }))
    se.push(valide(id, 'reception', 'traitement_sgs',    soudi,   soudi,   d('2025-07-11'), { reference_sgs: 'SGS-KRI-2025-0141', date_soumission: '2025-07-10' }))
    se.push(valide(id, 'reception', 'di',                yasmine, yasmine, d('2025-07-11'), { numero_di: 'DI-2025-1038' }))

    se.push(valide(id, 'soumission_sgs', 'ff_soumission', soudi,  soudi,   d('2025-07-11'), { reference_ff: 'FF-KRI-2025-0081', date_soumission: '2025-07-10' }))
    se.push(valide(id, 'soumission_sgs', 'pvc',           aliou,  aliou,   d('2025-07-12'), { pvc_resultat: 'succes', pvc_motif: 'PVC Kribi N°KRI-2025-0098 — machines conformes', pvc_numero: 'KRI-2025-0098' }))

    se.push(valide(id, 'codage', 'etat_codage',  odette, odette, d('2025-07-12'), { code_sh: '8474.20.00', agent_codage: 'Mme ODETTE' }))
    se.push(valide(id, 'codage', 'declaration',  odette, odette, d('2025-07-13'), { num_declaration: 'DEC-2025-0411', date_declaration: '2025-07-12' }))
    se.push(valide(id, 'codage', 'regulation',   odette, odette, d('2025-07-13'), { regime: 'Admission temporaire', reference_reglementaire: 'ART.45 CDN 2024' }))

    se.push(valide(id, 'validation', 'validation_docs', soudi, soudi, d('2025-07-13'), { validateur: 'Chef Service DGD Kribi', date_validation: '2025-07-13', observations: 'Validé' }))

    se.push(valide(id, 'paiement', 'paiement_droits', yaya, yaya, d('2025-07-13'), { mode_paiement: 'virement', reference: 'VIR-DGD-2025-0082' }))

    se.push(valide(id, 'bon_compagnie', 'facturation_compagnie', wandala, wandala, d('2025-07-13'), { num_facture: 'MSC-FAC-2025-0881', montant: '680000', date_paiement: '2025-07-13' }))
    se.push(valide(id, 'bon_compagnie', 'bon_a_delivrer',        wandala, wandala, d('2025-07-13'), { num_bad: 'BAD-MSC-2025-0112', date_obtention: '2025-07-13' }))
    se.push(valide(id, 'bon_compagnie', 'facturation_terminal',  aliou,   aliou,   d('2025-07-14'), { num_facture: 'KCT-2025-0288', montant: '285000' }))
    se.push(valide(id, 'bon_compagnie', 'bon_livraison',         aliou,   aliou,   d('2025-07-14'), { num_bl: 'BL-KCT-2025-0091', date_obtention: '2025-07-14' }))
    se.push(valide(id, 'bon_compagnie', 'gate_pass',             aliou,   aliou,   d('2025-07-14'), { immatriculation: 'LT 1234 A' }))

    // operations_kribi — EN COURS avec RETARD
    se.push(enCours(id, 'operations_kribi', 'facturation_terminal', aliou, PAST_2,
      'Facture terminale KCT reçue — paiement en attente de confirmation trésorerie FINITRANS.',
      { num_facture: 'KCT-2025-0289', montant: '320000' }
    ))
    se.push(todo(id, 'operations_kribi', 'bon_livraison', aliou, FUTURE_1))
    se.push(todo(id, 'operations_kribi', 'gate_pass'))
  }

  // ── DOS-2025-0037 CASTEL — status: reception (démarrage) ────────────────
  if (dos['DOS-2025-0037']) {
    const id = dos['DOS-2025-0037'].id

    se.push(enCours(id, 'reception', 'bl', wandala, FUTURE_1,
      'BL reçu par email — vérification des données en cours.',
      { bl_numero: 'COSUDLA2025037', date_reception: '2025-07-17', compagnie_emission: 'COSCO Shipping' }
    ))
    se.push(todo(id, 'reception', 'facture_proforma', yasmine, FUTURE_1, 'Attente envoi proforma par le fournisseur Castel Paris'))
    se.push(todo(id, 'reception', 'saisie_pr',        yasmine, FUTURE_2))
    se.push(todo(id, 'reception', 'paiement_client',  yaya))
    se.push(todo(id, 'reception', 'traitement_sgs',   soudi))
    se.push(todo(id, 'reception', 'di',               yasmine))
  }

  // ── DOS-2025-0036 ALUCAM — status: cloture (tout validé) ────────────────
  if (dos['DOS-2025-0036']) {
    const id = dos['DOS-2025-0036'].id
    const dt = d('2025-07-01')

    se.push(valide(id, 'reception', 'bl',               raphael, raphael, dt, { bl_numero: 'MSKUKRI2025036', date_reception: '2025-07-01', compagnie_emission: 'MAERSK' }))
    se.push(valide(id, 'reception', 'facture_proforma',  yasmine, yasmine, dt, { fp_reference: 'INV-ALU-2025-0041', fp_montant: '98000000', fp_fournisseur: 'RIO TINTO ALCAN' }))
    se.push(valide(id, 'reception', 'saisie_pr',         yasmine, yasmine, dt, { pr_numero: 'PR-2025-0071' }))
    se.push(valide(id, 'reception', 'paiement_client',   yaya,    yaya,    dt, { montant_paye: '12500000', date_paiement: '2025-06-30', reference_paiement: 'VIR-ALU-2025-0071' }))
    se.push(valide(id, 'reception', 'traitement_sgs',    soudi,   soudi,   d('2025-07-02'), { reference_sgs: 'SGS-KRI-2025-0121', date_soumission: '2025-07-01' }))
    se.push(valide(id, 'reception', 'di',                yasmine, yasmine, d('2025-07-02'), { numero_di: 'DI-2025-1036' }))

    se.push(valide(id, 'soumission_sgs', 'ff_soumission', soudi,   soudi,   d('2025-07-02'), { reference_ff: 'FF-KRI-2025-0071', date_soumission: '2025-07-01' }))
    se.push(valide(id, 'soumission_sgs', 'pvc',           raphael, raphael, d('2025-07-02'), { pvc_resultat: 'succes', pvc_motif: 'PVC conforme — aluminium lingots certifiés LME', pvc_numero: 'KRI-2025-0081' }))

    se.push(valide(id, 'codage', 'etat_codage',  odette,  odette,  d('2025-07-03'), { code_sh: '7601.10.00', agent_codage: 'Mme ODETTE' }))
    se.push(valide(id, 'codage', 'declaration',  odette,  odette,  d('2025-07-03'), { num_declaration: 'DEC-2025-0401', date_declaration: '2025-07-03' }))
    se.push(valide(id, 'codage', 'regulation',   odette,  odette,  d('2025-07-03'), { regime: 'Mise à la consommation', reference_reglementaire: 'ART.12 CDN 2024' }))

    se.push(valide(id, 'validation', 'validation_docs', soudi, soudi, d('2025-07-04'), { validateur: 'DGD Kribi', date_validation: '2025-07-04', observations: 'Validé — dossier complet' }))
    se.push(valide(id, 'paiement', 'paiement_droits', yaya, yaya, d('2025-07-04'), { mode_paiement: 'virement', reference: 'VIR-DGD-2025-0072' }))

    se.push(valide(id, 'bon_compagnie', 'facturation_compagnie', rasoul,  rasoul,  d('2025-07-04'), { num_facture: 'MRK-FAC-2025-0441', montant: '520000', date_paiement: '2025-07-04' }))
    se.push(valide(id, 'bon_compagnie', 'bon_a_delivrer',        rasoul,  rasoul,  d('2025-07-04'), { num_bad: 'BAD-MRK-2025-0091', date_obtention: '2025-07-04' }))
    se.push(valide(id, 'bon_compagnie', 'facturation_terminal',  raphael, raphael, d('2025-07-05'), { num_facture: 'KCT-2025-0271', montant: '320000' }))
    se.push(valide(id, 'bon_compagnie', 'bon_livraison',         raphael, raphael, d('2025-07-05'), { num_bl: 'BL-KCT-2025-0081', date_obtention: '2025-07-05' }))
    se.push(valide(id, 'bon_compagnie', 'gate_pass',             raphael, raphael, d('2025-07-05'), { immatriculation: 'CE 5678 B' }))

    se.push(valide(id, 'operations_kribi', 'facturation_terminal', raphael, raphael, d('2025-07-05'), { num_facture: 'KCT-2025-0272', montant: '185000' }))
    se.push(valide(id, 'operations_kribi', 'bon_livraison',        raphael, raphael, d('2025-07-05'), { num_bl: 'BL-KCT-2025-0082', date_obtention: '2025-07-05' }))
    se.push(valide(id, 'operations_kribi', 'gate_pass',            raphael, raphael, d('2025-07-05'), { immatriculation: 'CE 5678 B' }))

    se.push(valide(id, 'cloture', 'rapport_final', soudi, soudi, d('2025-07-05'), { observations: 'Dossier clôturé avec succès. Livraison confirmée à Edea le 05/07/2025.' }))
  }

  // ── DOS-2025-0040 SAC — status: bon_compagnie ──────────────────────────
  if (dos['DOS-2025-0040']) {
    const id = dos['DOS-2025-0040'].id
    const dt = d('2025-07-13')

    se.push(valide(id, 'reception', 'bl',               raphael, raphael, dt, { bl_numero: 'MSKUKRI2025040', date_reception: '2025-07-13', compagnie_emission: 'MAERSK' }))
    se.push(valide(id, 'reception', 'facture_proforma',  yasmine, yasmine, dt, { fp_reference: 'INV-SAC-2025-0155', fp_montant: '22000000', fp_fournisseur: 'YARA INTERNATIONAL' }))
    se.push(valide(id, 'reception', 'saisie_pr',         yasmine, yasmine, dt, { pr_numero: 'PR-2025-0084' }))
    se.push(valide(id, 'reception', 'paiement_client',   yaya,    yaya,    dt, { montant_paye: '3200000', date_paiement: '2025-07-12', reference_paiement: 'VIR-SAC-2025-0083' }))
    se.push(valide(id, 'reception', 'traitement_sgs',    soudi,   soudi,   d('2025-07-14'), { reference_sgs: 'SGS-KRI-2025-0151', date_soumission: '2025-07-13' }))
    se.push(valide(id, 'reception', 'di',                yasmine, yasmine, d('2025-07-14'), { numero_di: 'DI-2025-1040' }))

    se.push(valide(id, 'soumission_sgs', 'ff_soumission', soudi,   soudi,   d('2025-07-14'), { reference_ff: 'FF-KRI-2025-0084', date_soumission: '2025-07-13' }))
    se.push(valide(id, 'soumission_sgs', 'pvc',           raphael, raphael, d('2025-07-14'), { pvc_resultat: 'succes', pvc_motif: 'PVC engrais conforme aux normes phytosanitaires', pvc_numero: 'KRI-2025-0091' }))

    se.push(valide(id, 'codage', 'etat_codage',  odette, odette, d('2025-07-15'), { code_sh: '3102.10.00', agent_codage: 'Mme ODETTE' }))
    se.push(valide(id, 'codage', 'declaration',  odette, odette, d('2025-07-15'), { num_declaration: 'DEC-2025-0415', date_declaration: '2025-07-15' }))
    se.push(valide(id, 'codage', 'regulation',   odette, odette, d('2025-07-15'), { regime: 'Mise à la consommation', reference_reglementaire: 'ART.12 CDN 2024' }))

    se.push(valide(id, 'validation', 'validation_docs', soudi, soudi, d('2025-07-15'), { validateur: 'DGD Kribi', date_validation: '2025-07-15', observations: 'Validé sans réserve' }))
    se.push(valide(id, 'paiement', 'paiement_droits', yaya, yaya, d('2025-07-16'), { mode_paiement: 'virement', reference: 'VIR-DGD-2025-0084' }))

    se.push(valide(id, 'bon_compagnie', 'facturation_compagnie', rasoul, rasoul, d('2025-07-16'), { num_facture: 'MRK-FAC-2025-0451', montant: '195000', date_paiement: '2025-07-16' }))
    se.push(enCours(id, 'bon_compagnie', 'bon_a_delivrer', rasoul, FUTURE_1,
      'BAD demandé à MAERSK — délai d\'obtention 3 à 5 jours ouvrés.',
      { num_bad: '', date_obtention: '' }
    ))
    se.push(todo(id, 'bon_compagnie', 'facturation_terminal', raphael, FUTURE_1))
    se.push(todo(id, 'bon_compagnie', 'bon_livraison',        raphael, FUTURE_2))
    se.push(todo(id, 'bon_compagnie', 'gate_pass'))
  }

  // ── DOS-2025-0034 FOVI — status: paiement ───────────────────────────────
  if (dos['DOS-2025-0034']) {
    const id = dos['DOS-2025-0034'].id
    const dt = d('2025-07-11')

    se.push(valide(id, 'reception', 'bl',               soudi,   soudi,   dt, { bl_numero: 'MSCDLA2025034', date_reception: '2025-07-11', compagnie_emission: 'MSC' }))
    se.push(valide(id, 'reception', 'facture_proforma',  yasmine, yasmine, dt, { fp_reference: 'INV-FOV-2025-0133', fp_montant: '185000000', fp_fournisseur: 'TOYOTA MOTOR FRANCE' }))
    se.push(valide(id, 'reception', 'saisie_pr',         yasmine, yasmine, dt, { pr_numero: 'PR-2025-0080' }))
    se.push(valide(id, 'reception', 'paiement_client',   yaya,    yaya,    dt, { montant_paye: '23000000', date_paiement: '2025-07-10', reference_paiement: 'VIR-FOV-2025-0079' }))
    se.push(valide(id, 'reception', 'traitement_sgs',    soudi,   soudi,   d('2025-07-12'), { reference_sgs: 'SGS-DLA-2025-0308', date_soumission: '2025-07-11' }))
    se.push(valide(id, 'reception', 'di',                yasmine, yasmine, d('2025-07-12'), { numero_di: 'DI-2025-1034' }))

    se.push(valide(id, 'soumission_sgs', 'ff_soumission', soudi, soudi, d('2025-07-12'), { reference_ff: 'FF-DLA-2025-0080', date_soumission: '2025-07-11' }))
    se.push(valide(id, 'soumission_sgs', 'pvc',           soudi, soudi, d('2025-07-13'), { pvc_resultat: 'succes', pvc_motif: 'PVC véhicules N°DLA-2025-0181 — conformes aux normes CAM', pvc_numero: 'DLA-2025-0181' }))

    se.push(valide(id, 'codage', 'etat_codage',  odette, odette, d('2025-07-13'), { code_sh: '8703.22.00', agent_codage: 'Mme ODETTE' }))
    se.push(valide(id, 'codage', 'declaration',  odette, odette, d('2025-07-14'), { num_declaration: 'DEC-2025-0408', date_declaration: '2025-07-14' }))
    se.push(valide(id, 'codage', 'regulation',   odette, odette, d('2025-07-14'), { regime: 'Mise à la consommation', reference_reglementaire: 'ART.12 CDN 2024' }))

    se.push(valide(id, 'validation', 'validation_docs', odette, odette, d('2025-07-15'), { validateur: 'Service Véhicules DGD', date_validation: '2025-07-15', observations: 'Valeur en douane vérifiée — conforme' }))

    se.push(enCours(id, 'paiement', 'paiement_droits', yaya, FUTURE_2,
      'Virement de 18 500 000 FCFA initié. Confirmation quittance attendue sous 48h.',
      { mode_paiement: 'virement', reference: 'VIR-DGD-2025-0080' }
    ))
  }

  // ── DOS-2025-0033 GUINNESS — status: codage ─────────────────────────────
  if (dos['DOS-2025-0033']) {
    const id = dos['DOS-2025-0033'].id
    const dt = d('2025-07-09')

    se.push(valide(id, 'reception', 'bl',               soudi,   soudi,   dt, { bl_numero: 'COSUDLA2025033', date_reception: '2025-07-09', compagnie_emission: 'COSCO' }))
    se.push(valide(id, 'reception', 'facture_proforma',  yasmine, yasmine, dt, { fp_reference: 'INV-GUI-2025-0112', fp_montant: '72000000', fp_fournisseur: 'MALTEUROP GROUP' }))
    se.push(valide(id, 'reception', 'saisie_pr',         yasmine, yasmine, dt, { pr_numero: 'PR-2025-0077' }))
    se.push(valide(id, 'reception', 'paiement_client',   yaya,    yaya,    dt, { montant_paye: '9500000', date_paiement: '2025-07-08', reference_paiement: 'VIR-GUI-2025-0076' }))
    se.push(valide(id, 'reception', 'traitement_sgs',    soudi,   soudi,   d('2025-07-10'), { reference_sgs: 'SGS-DLA-2025-0305', date_soumission: '2025-07-09' }))
    se.push(valide(id, 'reception', 'di',                yasmine, yasmine, d('2025-07-10'), { numero_di: 'DI-2025-1033' }))

    se.push(valide(id, 'soumission_sgs', 'ff_soumission', soudi, soudi, d('2025-07-10'), { reference_ff: 'FF-DLA-2025-0077', date_soumission: '2025-07-09' }))
    se.push(valide(id, 'soumission_sgs', 'pvc',           soudi, soudi, d('2025-07-11'), { pvc_resultat: 'succes', pvc_motif: 'PVC céréales maltées N°DLA-2025-0178 — analyses conformes', pvc_numero: 'DLA-2025-0178' }))

    // codage — en cours, deadline demain (pression mais pas encore retard)
    se.push(enCours(id, 'codage', 'etat_codage', odette, d('2026-08-12'),
      'Nomenclature céréales maltées en cours de vérification — position SH en attente confirmation DGD.',
      { code_sh: '1107.10.00', agent_codage: 'Mme ODETTE' }
    ))
    se.push(todo(id, 'codage', 'declaration', odette, FUTURE_1))
    se.push(todo(id, 'codage', 'regulation',  odette, FUTURE_1))
  }

  // ── DOS-2025-0035 SEMC — status: bon_compagnie ──────────────────────────
  if (dos['DOS-2025-0035']) {
    const id = dos['DOS-2025-0035'].id
    const dt = d('2025-07-12')

    se.push(valide(id, 'reception', 'bl',               rasoul,  rasoul,  dt, { bl_numero: 'CMADLA2025035', date_reception: '2025-07-12', compagnie_emission: 'CMA CGM' }))
    se.push(valide(id, 'reception', 'facture_proforma',  yasmine, yasmine, dt, { fp_reference: 'INV-SEM-2025-0144', fp_montant: '42000000', fp_fournisseur: 'KRONES AG' }))
    se.push(valide(id, 'reception', 'saisie_pr',         yasmine, yasmine, dt, { pr_numero: 'PR-2025-0083' }))
    se.push(valide(id, 'reception', 'paiement_client',   yaya,    yaya,    dt, { montant_paye: '7200000', date_paiement: '2025-07-11', reference_paiement: 'VIR-SEM-2025-0081' }))
    se.push(valide(id, 'reception', 'traitement_sgs',    soudi,   soudi,   d('2025-07-13'), { reference_sgs: 'SGS-DLA-2025-0312', date_soumission: '2025-07-12' }))
    se.push(valide(id, 'reception', 'di',                yasmine, yasmine, d('2025-07-13'), { numero_di: 'DI-2025-1035' }))

    se.push(valide(id, 'soumission_sgs', 'ff_soumission', soudi,  soudi,  d('2025-07-13'), { reference_ff: 'FF-DLA-2025-0083', date_soumission: '2025-07-12' }))
    se.push(valide(id, 'soumission_sgs', 'pvc',           rasoul, rasoul, d('2025-07-14'), { pvc_resultat: 'succes', pvc_motif: 'PVC machines embouteillage N°DLA-2025-0183 — conforme', pvc_numero: 'DLA-2025-0183' }))

    se.push(valide(id, 'codage', 'etat_codage',  odette, odette, d('2025-07-14'), { code_sh: '8422.33.00', agent_codage: 'Mme ODETTE' }))
    se.push(valide(id, 'codage', 'declaration',  odette, odette, d('2025-07-15'), { num_declaration: 'DEC-2025-0413', date_declaration: '2025-07-15' }))
    se.push(valide(id, 'codage', 'regulation',   odette, odette, d('2025-07-15'), { regime: 'Mise à la consommation', reference_reglementaire: 'ART.12 CDN 2024' }))

    se.push(valide(id, 'validation', 'validation_docs', soudi, soudi, d('2025-07-15'), { validateur: 'DGD Douala Aéroport', date_validation: '2025-07-15', observations: 'Documents conformes' }))
    se.push(valide(id, 'paiement', 'paiement_droits', yaya, yaya, d('2025-07-16'), { mode_paiement: 'virement', reference: 'VIR-DGD-2025-0083' }))

    se.push(valide(id, 'bon_compagnie', 'facturation_compagnie', rasoul, rasoul, d('2025-07-16'), { num_facture: 'CMA-FAC-2025-0721', montant: '310000', date_paiement: '2025-07-16' }))
    se.push(enCours(id, 'bon_compagnie', 'bon_a_delivrer', rasoul, FUTURE_1,
      'BAD CMA CGM en attente — agent armateur contacté.',
      { num_bad: '', date_obtention: '' }
    ))
    se.push(todo(id, 'bon_compagnie', 'facturation_terminal', rasoul, FUTURE_1))
    se.push(todo(id, 'bon_compagnie', 'bon_livraison'))
    se.push(todo(id, 'bon_compagnie', 'gate_pass'))
  }

  // ── Insertion en masse ───────────────────────────────────────────────────
  await prisma.sousEtapeDossier.createMany({
    data: se.filter(Boolean),
    skipDuplicates: true,
  })

  console.log(`✅ ${se.length} sous-étapes créées`)

  // ── Résumé final ────────────────────────────────────────────────────────
  const retards = se.filter(s => s.statut !== 'valide' && s.deadline && s.deadline < TODAY)
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  🎉 Seed de test terminé')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`  DI créées et liées   : 10`)
  console.log(`  Sous-étapes totales  : ${se.length}`)
  console.log(`  → Validées           : ${se.filter(s => s.statut === 'valide').length}`)
  console.log(`  → En cours           : ${se.filter(s => s.statut === 'en_cours').length}`)
  console.log(`  → À faire            : ${se.filter(s => s.statut === 'todo').length}`)
  console.log(`  → En RETARD          : ${retards.length}`)
  console.log('')
  console.log('  Retards simulés :')
  retards.forEach(r => console.log(`    ⚠ ${r.etape}::${r.cle} (deadline ${r.deadline?.toISOString().slice(0, 10)})`))
  console.log('')
  console.log('  DI critique (< 20%) :')
  console.log('    📉 DI-2025-1039 — MTN (solde 2 800 000 / 15 000 000 = 18.7%)')
  console.log('    📉 DI-2025-1036 — ALUCAM (solde 0 — clôturée)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
