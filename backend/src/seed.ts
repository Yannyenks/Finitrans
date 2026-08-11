/**
 * Seed — Organigramme FINITRANS (données réelles)
 * Usage: npm run db:seed
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Nettoyage de la base...')

  // Suppression dans l'ordre des dépendances FK
  await prisma.message.deleteMany()
  await prisma.conversationParticipant.deleteMany()
  await prisma.conversation.deleteMany()
  await prisma.alerte.deleteMany()
  await prisma.auditEntry.deleteMany()
  await prisma.commentaire.deleteMany()
  await prisma.document.deleteMany()
  await prisma.dossierTiming.deleteMany()
  await prisma.gatePass.deleteMany()
  await prisma.bonLivraison.deleteMany()
  await prisma.virement.deleteMany()
  await prisma.facture.deleteMany()
  await prisma.bonKribi.deleteMany()
  await prisma.paiementDouane.deleteMany()
  await prisma.paiementCompagnie.deleteMany()
  await prisma.refreshToken.deleteMany()
  await prisma.mouvementDI.deleteMany()
  await prisma.dossier.updateMany({ data: { diId: null } })
  await prisma.declarationImportation.deleteMany()
  await prisma.compteRenduKribi.deleteMany()
  await prisma.dossier.deleteMany()
  await prisma.user.deleteMany()

  console.log('✅ Base nettoyée')
  console.log('🌱 Création des utilisateurs...')

  const password = await bcrypt.hash('finitrans2025', 12)

  // ============================================================
  // UTILISATEURS — Organigramme FINITRANS
  // ============================================================

  const [delba, soudi, yaya, odette, wandala, rasoul, yasmine, honore, aliou, raphael] =
    await Promise.all([

      // ── DOUALA ──────────────────────────────────────────────

      // 1. Mr DELBA — Directeur Général
      prisma.user.create({
        data: {
          email: 'delba@finitrans.cm',
          passwordHash: password,
          nom: 'Mr DELBA',
          role: 'Directeur Général',
          site: 'Douala',
          telephone: '+237 6XX XXX XXX',
          profil: 'dg',
          compagniesAssignees: ['MSC', 'COSCO', 'MAERSK', 'CMA_CGM'],
          // Accès total
          permDossier:        'complet',
          permValidation:     'complet',
          permFinancier:      'complet',
          permRapports:       'complet',
          permAdministration: 'complet',
        },
      }),

      // 2. Mr SOUDI — Responsable Exploitation
      prisma.user.create({
        data: {
          email: 'soudi@finitrans.cm',
          passwordHash: password,
          nom: 'Mr SOUDI',
          role: 'Responsable Exploitation',
          site: 'Douala',
          telephone: '+237 6XX XXX XXX',
          profil: 'exploitation',
          compagniesAssignees: ['MSC', 'COSCO', 'MAERSK', 'CMA_CGM'],
          // Planifie, contrôle, suit les dossiers douaniers
          permDossier:        'complet',
          permValidation:     'lecture',
          permFinancier:      'lecture',
          permRapports:       'complet',
          permAdministration: 'partiel',
        },
      }),

      // 3. Mr YAYA — Responsable Logistique
      prisma.user.create({
        data: {
          email: 'yaya@finitrans.cm',
          passwordHash: password,
          nom: 'Mr YAYA',
          role: 'Responsable Logistique',
          site: 'Douala',
          telephone: '+237 6XX XXX XXX',
          profil: 'logistique',
          compagniesAssignees: ['MSC', 'COSCO', 'MAERSK', 'CMA_CGM'],
          // Transport, dédouanement véhicules, paiements droits/taxes
          permDossier:        'partiel',
          permValidation:     'non',
          permFinancier:      'partiel',
          permRapports:       'non',
          permAdministration: 'non',
        },
      }),

      // 4. Mme ODETTE — Responsable Validation
      prisma.user.create({
        data: {
          email: 'odette@finitrans.cm',
          passwordHash: password,
          nom: 'Mme ODETTE',
          role: 'Responsable Validation',
          site: 'Douala',
          telephone: '+237 6XX XXX XXX',
          profil: 'validation',
          compagniesAssignees: ['MSC', 'COSCO', 'MAERSK', 'CMA_CGM'],
          // Codage, validation déclarations douane, saisie PR
          permDossier:        'partiel',
          permValidation:     'complet',
          permFinancier:      'non',
          permRapports:       'non',
          permAdministration: 'non',
        },
      }),

      // 5. Mr WANDALA — Responsable Gestion des Sorties (MSC & COSCO)
      prisma.user.create({
        data: {
          email: 'wandala@finitrans.cm',
          passwordHash: password,
          nom: 'Mr WANDALA',
          role: 'Responsable Gestion des Sorties',
          site: 'Douala',
          telephone: '+237 6XX XXX XXX',
          profil: 'gestion_sorties',
          compagniesAssignees: ['MSC', 'COSCO'],
          // Sorties conteneurs, interchanges, détentions, factures, bons compagnie
          permDossier:        'partiel',
          permValidation:     'non',
          permFinancier:      'partiel',
          permRapports:       'non',
          permAdministration: 'non',
        },
      }),

      // 6. Mr RASOUL — Responsable Gestion des Sorties (MAERSK & CMA-CGM)
      prisma.user.create({
        data: {
          email: 'rasoul@finitrans.cm',
          passwordHash: password,
          nom: 'Mr RASOUL',
          role: 'Responsable Gestion des Sorties',
          site: 'Douala',
          telephone: '+237 6XX XXX XXX',
          profil: 'gestion_sorties',
          compagniesAssignees: ['MAERSK', 'CMA_CGM'],
          // Idem Wandala mais pour MAERSK et CMA-CGM
          permDossier:        'partiel',
          permValidation:     'non',
          permFinancier:      'partiel',
          permRapports:       'non',
          permAdministration: 'non',
        },
      }),

      // 7. Mme YASMINE — Service Administratif
      prisma.user.create({
        data: {
          email: 'yasmine@finitrans.cm',
          passwordHash: password,
          nom: 'Mme YASMINE',
          role: 'Responsable Administrative',
          site: 'Douala',
          telephone: '+237 6XX XXX XXX',
          profil: 'administration',
          compagniesAssignees: ['MSC', 'COSCO', 'MAERSK', 'CMA_CGM'],
          // Enregistrement dossiers, transferts fonds, suivi DI, factures proforma
          permDossier:        'lecture',
          permValidation:     'non',
          permFinancier:      'partiel',
          permRapports:       'non',
          permAdministration: 'complet',
        },
      }),

      // 8. Mr HONORÉ — Comptable
      prisma.user.create({
        data: {
          email: 'honore@finitrans.cm',
          passwordHash: password,
          nom: 'Mr HONORÉ',
          role: 'Comptable',
          site: 'Douala',
          telephone: '+237 6XX XXX XXX',
          profil: 'comptabilite',
          compagniesAssignees: ['MSC', 'COSCO', 'MAERSK', 'CMA_CGM'],
          // Factures, journaux, bilans, analyse financière, OHADA
          permDossier:        'lecture',
          permValidation:     'non',
          permFinancier:      'complet',
          permRapports:       'complet',
          permAdministration: 'non',
        },
      }),

      // ── KRIBI ────────────────────────────────────────────────

      // 9. Mr ALIOU — Responsable Douanier Kribi (MSC & COSCO)
      prisma.user.create({
        data: {
          email: 'aliou@finitrans.cm',
          passwordHash: password,
          nom: 'Mr ALIOU',
          role: 'Responsable Douanier Kribi',
          site: 'Kribi',
          telephone: '+237 6XX XXX XXX',
          profil: 'terrain_kribi',
          compagniesAssignees: ['MSC', 'COSCO'],
          // Bon douane/PAK, redevances portuaires, gate-pass, visite douane
          permDossier:        'partiel',
          permValidation:     'non',
          permFinancier:      'partiel',
          permRapports:       'non',
          permAdministration: 'non',
        },
      }),

      // 10. Mr RAPHAEL — Responsable Douanier Kribi (MAERSK & CMA-CGM)
      prisma.user.create({
        data: {
          email: 'raphael@finitrans.cm',
          passwordHash: password,
          nom: 'Mr RAPHAEL',
          role: 'Responsable Douanier Kribi',
          site: 'Kribi',
          telephone: '+237 6XX XXX XXX',
          profil: 'terrain_kribi',
          compagniesAssignees: ['MAERSK', 'CMA_CGM'],
          // Idem Aliou mais pour MAERSK et CMA-CGM
          permDossier:        'partiel',
          permValidation:     'non',
          permFinancier:      'partiel',
          permRapports:       'non',
          permAdministration: 'non',
        },
      }),
    ])

  console.log('✅ 10 utilisateurs créés (organigramme complet)')

  // ============================================================
  // DOSSIERS — Données réalistes avec les vrais responsables
  // ============================================================

  const dossiers = await Promise.all([
    prisma.dossier.create({
      data: {
        numero: 'DOS-2025-0042', client: 'CAMRAIL SA', compagnie: 'MSC',
        conteneur: 'MSCU7654321', marchandise: 'Pièces détachées locomotives',
        site: 'Douala', status: 'validation', responsableId: odette.id,
        dateArrivee: new Date('2025-07-15'), montantTaxes: 4500000, montantHonoraires: 350000,
        dateLimiteSortie: new Date('2025-07-22'), priorite: 'haute',
        numeroDI: 'DI-2025-1042', montantDI: 6000000,
      },
    }),
    prisma.dossier.create({
      data: {
        numero: 'DOS-2025-0041', client: 'ORANGE CAMEROUN', compagnie: 'COSCO',
        conteneur: 'COSU1234567', marchandise: 'Équipements télécommunication',
        site: 'Douala', status: 'paiement', responsableId: yaya.id,
        dateArrivee: new Date('2025-07-14'), montantTaxes: 8200000, montantHonoraires: 620000,
        dateLimiteSortie: new Date('2025-07-21'), priorite: 'haute',
        numeroDI: 'DI-2025-1041', montantDI: 10000000,
      },
    }),
    prisma.dossier.create({
      data: {
        numero: 'DOS-2025-0040', client: 'SOCIÉTÉ AGRICOLE DU CAMEROUN', compagnie: 'MAERSK',
        conteneur: 'MSKU9876543', marchandise: 'Engrais et produits phytosanitaires',
        site: 'Kribi', status: 'bon_compagnie', responsableId: raphael.id,
        dateArrivee: new Date('2025-07-13'), montantTaxes: 2100000, montantHonoraires: 180000,
        dateLimiteSortie: new Date('2025-07-20'), priorite: 'moyenne',
        numeroDI: 'DI-2025-1040', montantDI: 3000000,
      },
    }),
    prisma.dossier.create({
      data: {
        numero: 'DOS-2025-0039', client: 'MTN CAMEROUN', compagnie: 'CMA_CGM',
        conteneur: 'CMAU5678901', marchandise: 'Matériel informatique et serveurs',
        site: 'Douala', status: 'codage', responsableId: odette.id,
        dateArrivee: new Date('2025-07-16'), montantTaxes: 12500000, montantHonoraires: 950000,
        dateLimiteSortie: new Date('2025-07-23'), priorite: 'haute',
        numeroDI: 'DI-2025-1039', montantDI: 15000000,
      },
    }),
    prisma.dossier.create({
      data: {
        numero: 'DOS-2025-0038', client: 'CIMENCAM', compagnie: 'MSC',
        conteneur: 'MSCU2345678', marchandise: 'Équipements industriels cimenterie',
        site: 'Kribi', status: 'operations_kribi', responsableId: aliou.id,
        dateArrivee: new Date('2025-07-10'), montantTaxes: 6800000, montantHonoraires: 520000,
        dateLimiteSortie: new Date('2025-07-18'), priorite: 'haute',
        numeroDI: 'DI-2025-1038', montantDI: 8500000,
      },
    }),
    prisma.dossier.create({
      data: {
        numero: 'DOS-2025-0037', client: 'GROUPE CASTEL CAMEROUN', compagnie: 'COSCO',
        conteneur: 'COSU3456789', marchandise: 'Matières premières brasserie',
        site: 'Douala', status: 'reception', responsableId: soudi.id,
        dateArrivee: new Date('2025-07-17'), montantTaxes: 3200000, montantHonoraires: 280000,
        dateLimiteSortie: new Date('2025-07-25'), priorite: 'moyenne',
        numeroDI: 'DI-2025-1037', montantDI: 4500000,
      },
    }),
    prisma.dossier.create({
      data: {
        numero: 'DOS-2025-0036', client: 'ALUCAM', compagnie: 'MAERSK',
        conteneur: 'MSKU4567890', marchandise: 'Matières premières aluminium',
        site: 'Kribi', status: 'cloture', responsableId: raphael.id,
        dateArrivee: new Date('2025-07-01'), montantTaxes: 9500000, montantHonoraires: 750000,
        priorite: 'basse', numeroDI: 'DI-2025-1036', montantDI: 12000000,
      },
    }),
    prisma.dossier.create({
      data: {
        numero: 'DOS-2025-0035', client: 'SOCIÉTÉ DES EAUX MINÉRALES DU CAMEROUN', compagnie: 'CMA_CGM',
        conteneur: 'CMAU9012345', marchandise: 'Équipements embouteillage',
        site: 'Douala', status: 'bon_compagnie', responsableId: rasoul.id,
        dateArrivee: new Date('2025-07-12'), montantTaxes: 5600000, montantHonoraires: 430000,
        dateLimiteSortie: new Date('2025-07-20'), priorite: 'moyenne',
        numeroDI: 'DI-2025-1035', montantDI: 7000000,
      },
    }),
    prisma.dossier.create({
      data: {
        numero: 'DOS-2025-0034', client: 'FOVI SA', compagnie: 'MSC',
        conteneur: 'MSCU3456789', marchandise: 'Véhicules utilitaires',
        site: 'Douala', status: 'paiement', responsableId: yaya.id,
        dateArrivee: new Date('2025-07-11'), montantTaxes: 18500000, montantHonoraires: 1400000,
        dateLimiteSortie: new Date('2025-07-19'), priorite: 'haute',
        numeroDI: 'DI-2025-1034', montantDI: 22000000,
      },
    }),
    prisma.dossier.create({
      data: {
        numero: 'DOS-2025-0033', client: 'GUINNESS CAMEROUN', compagnie: 'COSCO',
        conteneur: 'COSU4567890', marchandise: 'Céréales maltées import',
        site: 'Douala', status: 'codage', responsableId: wandala.id,
        dateArrivee: new Date('2025-07-09'), montantTaxes: 7200000, montantHonoraires: 560000,
        dateLimiteSortie: new Date('2025-07-17'), priorite: 'haute',
        numeroDI: 'DI-2025-1033', montantDI: 9000000,
      },
    }),
  ])

  console.log(`✅ ${dossiers.length} dossiers créés`)

  // ============================================================
  // FACTURES — Wandala & Rasoul (paiement/obtention bons compagnie)
  // ============================================================

  await prisma.facture.createMany({
    data: [
      { dossierId: dossiers[0].id, numero: 'FAC-2025-0101', type: 'validee',  montant: 4500000,  compagnie: 'MSC',     dateFacture: new Date('2025-07-15'), description: 'Droits d\'entrée — DOS-2025-0042' },
      { dossierId: dossiers[1].id, numero: 'FAC-2025-0102', type: 'proforma', montant: 8200000,  compagnie: 'COSCO',   dateFacture: new Date('2025-07-14'), description: 'Proforma taxes — DOS-2025-0041' },
      { dossierId: dossiers[4].id, numero: 'FAC-2025-0100', type: 'reglee',   montant: 6800000,  compagnie: 'MSC',     dateFacture: new Date('2025-07-10'), datePaiement: new Date('2025-07-12'), description: 'Facture réglée — DOS-2025-0038' },
      { dossierId: dossiers[7].id, numero: 'FAC-2025-0099', type: 'proforma', montant: 5600000,  compagnie: 'CMA_CGM', dateFacture: new Date('2025-07-12'), description: 'Proforma — DOS-2025-0035' },
      { dossierId: dossiers[8].id, numero: 'FAC-2025-0098', type: 'validee',  montant: 18500000, compagnie: 'MSC',     dateFacture: new Date('2025-07-11'), description: 'Taxes véhicules — DOS-2025-0034' },
    ],
  })

  // ============================================================
  // PAIEMENTS DOUANE — Yaya effectue les paiements droits/taxes
  // ============================================================

  await prisma.paiementDouane.createMany({
    data: [
      { dossierId: dossiers[6].id, type: 'droits',     montant: 7500000,  datePaiement: new Date('2025-07-05'), statut: 'paye',       reference: 'PAY-DOU-2025-001' },
      { dossierId: dossiers[0].id, type: 'taxes',      montant: 850000,   datePaiement: new Date('2025-07-17'), statut: 'en_attente', reference: 'PAY-DOU-2025-002' },
      { dossierId: dossiers[1].id, type: 'droits',     montant: 6400000,  datePaiement: new Date('2025-07-16'), statut: 'en_retard',  reference: 'PAY-DOU-2025-003' },
      { dossierId: dossiers[4].id, type: 'redevances', montant: 420000,   datePaiement: new Date('2025-07-11'), statut: 'paye',       reference: 'PAY-DOU-2025-004' },
      { dossierId: dossiers[8].id, type: 'droits',     montant: 14200000, datePaiement: new Date('2025-07-13'), statut: 'en_retard',  reference: 'PAY-DOU-2025-005' },
    ],
  })

  // ============================================================
  // PAIEMENTS COMPAGNIE — Wandala (MSC/COSCO) & Rasoul (MAERSK/CMA)
  // ============================================================

  await prisma.paiementCompagnie.createMany({
    data: [
      { dossierId: dossiers[0].id, compagnie: 'MSC',     type: 'surestaries',     montant: 350000,  datePaiement: new Date('2025-07-15'), statut: 'paye',       reference: 'PAY-CIE-2025-001' },
      { dossierId: dossiers[1].id, compagnie: 'COSCO',   type: 'frais_portuaires',montant: 280000,  datePaiement: new Date('2025-07-14'), statut: 'en_attente', reference: 'PAY-CIE-2025-002' },
      { dossierId: dossiers[2].id, compagnie: 'MAERSK',  type: 'manutention',     montant: 195000,  datePaiement: new Date('2025-07-13'), statut: 'paye',       reference: 'PAY-CIE-2025-003' },
      { dossierId: dossiers[3].id, compagnie: 'CMA_CGM', type: 'terminal',        montant: 420000,  datePaiement: new Date('2025-07-16'), statut: 'en_retard',  reference: 'PAY-CIE-2025-004' },
      { dossierId: dossiers[4].id, compagnie: 'MSC',     type: 'surestaries',     montant: 680000,  datePaiement: new Date('2025-07-10'), statut: 'paye',       reference: 'PAY-CIE-2025-005' },
      { dossierId: dossiers[7].id, compagnie: 'CMA_CGM', type: 'frais_portuaires',montant: 310000,  datePaiement: new Date('2025-07-12'), statut: 'en_attente', reference: 'PAY-CIE-2025-006' },
    ],
  })

  // ============================================================
  // VIREMENTS — Yasmine effectue les transferts de fonds
  // ============================================================

  await prisma.virement.createMany({
    data: [
      { dossierId: dossiers[0].id, montant: 4500000,  source: 'Compte FINITRANS SGC', destination: 'Compte Douanes Douala',  dateVirement: new Date('2025-07-15'), reference: 'TX-2025-0089', effectuePar: yasmine.id, statut: 'effectue' },
      { dossierId: dossiers[1].id, montant: 8200000,  source: 'Compte FINITRANS SGC', destination: 'Compte Douanes Douala',  dateVirement: new Date('2025-07-17'), reference: 'TX-2025-0090', effectuePar: yasmine.id, statut: 'en_attente' },
      { dossierId: dossiers[8].id, montant: 18500000, source: 'Compte FINITRANS UBC', destination: 'DGD Douala Véhicules',   dateVirement: new Date('2025-07-13'), reference: 'TX-2025-0088', effectuePar: yasmine.id, statut: 'en_attente' },
    ],
  })

  // ============================================================
  // BONS KRIBI — Aliou (MSC/COSCO) & Raphael (MAERSK/CMA)
  // ============================================================

  await prisma.bonKribi.createMany({
    data: [
      { dossierId: dossiers[4].id, type: 'douane',        numero: 'BK-DOU-2025-0021', description: 'Bon passage douane port de Kribi — MSC', responsableId: aliou.id,   statut: 'valide',  dateEmission: new Date('2025-07-12') },
      { dossierId: dossiers[4].id, type: 'portuaire_pad', numero: 'BK-PAD-2025-0015', description: 'Redevance portuaire PAD Kribi',           montant: 285000, responsableId: aliou.id, statut: 'utilise', dateEmission: new Date('2025-07-13') },
      { dossierId: dossiers[2].id, type: 'compagnie_pak', numero: 'BK-PAK-2025-0009', description: 'Bon compagnie PAK — MAERSK',               montant: 150000, responsableId: raphael.id, statut: 'emis', dateEmission: new Date('2025-07-14') },
      { dossierId: dossiers[2].id, type: 'douane',        numero: 'BK-DOU-2025-0022', description: 'Bon visite douane — MAERSK',               responsableId: raphael.id, statut: 'emis',   dateEmission: new Date('2025-07-14') },
      { dossierId: dossiers[6].id, type: 'portuaire_pad', numero: 'BK-PAD-2025-0010', description: 'PAD sortie conteneur MAERSK ALUCAM',       montant: 320000, responsableId: raphael.id, statut: 'utilise', dateEmission: new Date('2025-07-02') },
    ],
  })

  // ============================================================
  // GATE PASSES — Aliou & Raphael (saisie et transmission)
  // ============================================================

  await prisma.gatePass.createMany({
    data: [
      {
        dossierId: dossiers[4].id, numero: 'GP-KRI-2025-0021',
        conteneur: 'MSCU2345678', chauffeur: 'KAMTO Jean Pierre',
        telephone: '+237 677 123 456', destination: 'Yaoundé - Zone Industrielle',
        dateEmission: new Date('2025-07-14'), emetteurId: aliou.id, statut: 'utilise',
      },
      {
        dossierId: dossiers[6].id, numero: 'GP-KRI-2025-0020',
        conteneur: 'MSKU4567890', chauffeur: 'NDOUM Eric Serge',
        telephone: '+237 699 456 789', destination: 'Edea - Alucam',
        dateEmission: new Date('2025-07-03'), emetteurId: raphael.id, statut: 'utilise',
      },
      {
        dossierId: dossiers[2].id, numero: 'GP-KRI-2025-0022',
        conteneur: 'MSKU9876543', chauffeur: 'MBARGA Paul',
        telephone: '+237 655 789 012', destination: 'Ebolowa - Zone agricole',
        dateEmission: new Date('2025-07-15'), emetteurId: raphael.id, statut: 'emis',
      },
    ],
  })

  // ============================================================
  // COMMENTAIRES — Suivi interne
  // ============================================================

  await prisma.commentaire.createMany({
    data: [
      { dossierId: dossiers[0].id, auteurId: odette.id,   message: 'Déclaration en cours de validation. La DGD a demandé une correction sur le code tarifaire.' },
      { dossierId: dossiers[0].id, auteurId: soudi.id,    message: 'Dossier prioritaire CAMRAIL — relancer la douane si pas de retour avant 14h.' },
      { dossierId: dossiers[0].id, auteurId: wandala.id,  message: 'Bon de compagnie MSC en attente de la validation douanière. Contacté l\'agent.' },
      { dossierId: dossiers[1].id, auteurId: yaya.id,     message: 'Paiement des droits COSCO programmé pour demain matin. Virement initié par Yasmine.' },
      { dossierId: dossiers[4].id, auteurId: aliou.id,    message: 'Bon douane Kribi validé. Gate pass préparé pour le chauffeur KAMTO.' },
      { dossierId: dossiers[4].id, auteurId: soudi.id,    message: 'Attention : détention MSC commence dans 48h si non sorti.' },
      { dossierId: dossiers[8].id, auteurId: yaya.id,     message: 'Dossier véhicules — valeur en douane contestée. Attente réponse DGD sur rectification.' },
      { dossierId: dossiers[3].id, auteurId: rasoul.id,   message: 'Bon CMA-CGM obtenu. Transfert au service logistique pour coordination sortie.' },
    ],
  })

  // ============================================================
  // ALERTES — Temps réel
  // ============================================================

  await prisma.alerte.createMany({
    data: [
      { type: 'detention',  message: 'Rétention portuaire dépassée de 3 jours — CIMENCAM (MSC)',         dossierId: dossiers[4].id, severity: 'critical' },
      { type: 'paiement',   message: 'Paiement DI ORANGE CAMEROUN en retard de 24h',                    dossierId: dossiers[1].id, severity: 'critical' },
      { type: 'paiement',   message: 'Virement FOVI SA non confirmé — 18 500 000 FCFA en attente',      dossierId: dossiers[8].id, severity: 'warning' },
      { type: 'di_seuil',   message: 'Solde DI < 20% — MTN CAMEROUN (DOS-2025-0039)',                   dossierId: dossiers[3].id, severity: 'warning' },
      { type: 'document',   message: 'Manifeste manquant — GROUPE CASTEL (DOS-2025-0037)',               dossierId: dossiers[5].id, severity: 'info' },
      { type: 'detention',  message: 'Surestaries COSCO en augmentation — GUINNESS (DOS-2025-0033)',     dossierId: dossiers[9].id, severity: 'warning' },
    ],
  })

  // ============================================================
  // CONVERSATIONS — Messagerie interne
  // ============================================================

  const [conv1, conv2, conv3] = await Promise.all([
    prisma.conversation.create({
      data: {
        titre: 'Suivi DOS-2025-0042 — CAMRAIL',
        type: 'dossier', dossierId: dossiers[0].id, createdBy: soudi.id,
        participants: { create: [{ userId: soudi.id }, { userId: odette.id }, { userId: wandala.id }, { userId: delba.id }] },
      },
    }),
    prisma.conversation.create({
      data: {
        titre: 'Opérations Kribi — Juillet 2025',
        type: 'general', createdBy: delba.id,
        participants: { create: [{ userId: delba.id }, { userId: aliou.id }, { userId: raphael.id }, { userId: soudi.id }] },
      },
    }),
    prisma.conversation.create({
      data: {
        titre: 'URGENT — Détention CIMENCAM',
        type: 'urgence', dossierId: dossiers[4].id, createdBy: soudi.id,
        participants: { create: [{ userId: soudi.id }, { userId: aliou.id }, { userId: delba.id }, { userId: yaya.id }] },
      },
    }),
  ])

  await prisma.message.createMany({
    data: [
      { conversationId: conv1.id, auteurId: odette.id,  contenu: 'La DGD demande la liste de colisage corrigée. CAMRAIL doit envoyer ce soir.' },
      { conversationId: conv1.id, auteurId: wandala.id, contenu: 'J\'attends la validation pour déclencher le bon MSC. Délai max demain 10h.' },
      { conversationId: conv1.id, auteurId: soudi.id,   contenu: 'OK. Relancez CAMRAIL directement. Ce dossier est en haute priorité.' },
      { conversationId: conv2.id, auteurId: aliou.id,   contenu: 'Bon douane CIMENCAM validé. Gate pass prêt pour KAMTO.' },
      { conversationId: conv2.id, auteurId: raphael.id, contenu: 'ALUCAM clôturé hier. MAERSK a confirmé la sortie du conteneur.' },
      { conversationId: conv2.id, auteurId: delba.id,   contenu: 'Bon travail équipe Kribi. Pensez à mettre à jour les fiches de suivi.' },
      { conversationId: conv3.id, auteurId: soudi.id,   contenu: 'URGENT : la détention MSC CIMENCAM commence dans 2 jours. Que se passe-t-il ?' },
      { conversationId: conv3.id, auteurId: aliou.id,   contenu: 'Le bon PAD n\'est pas encore validé côté port. Je relance le responsable PAD.' },
      { conversationId: conv3.id, auteurId: yaya.id,    contenu: 'Le camion est disponible dès demain 7h. Tout est prêt côté logistique.' },
    ],
  })

  await Promise.all([
    prisma.conversation.update({ where: { id: conv1.id }, data: { dernierMessage: 'OK. Relancez CAMRAIL directement. Ce dossier est en haute priorité.' } }),
    prisma.conversation.update({ where: { id: conv2.id }, data: { dernierMessage: 'Bon travail équipe Kribi. Pensez à mettre à jour les fiches de suivi.' } }),
    prisma.conversation.update({ where: { id: conv3.id }, data: { dernierMessage: 'Le camion est disponible dès demain 7h. Tout est prêt côté logistique.' } }),
  ])

  // ============================================================
  // TIMINGS SLA — Suivi des étapes
  // ============================================================

  const sla: Record<string, number> = { reception: 1, codage: 2, validation: 3, paiement: 1, bon_compagnie: 1, operations_kribi: 2, cloture: 1 }

  await prisma.dossierTiming.createMany({
    data: [
      { dossierId: dossiers[0].id, etape: 'reception',  dateDebut: new Date('2025-07-15'), dateFin: new Date('2025-07-15'), dureePrevueJours: sla.reception },
      { dossierId: dossiers[0].id, etape: 'codage',     dateDebut: new Date('2025-07-15'), dateFin: new Date('2025-07-16'), dureePrevueJours: sla.codage },
      { dossierId: dossiers[0].id, etape: 'validation', dateDebut: new Date('2025-07-16'), dureePrevueJours: sla.validation },
      { dossierId: dossiers[1].id, etape: 'reception',  dateDebut: new Date('2025-07-14'), dateFin: new Date('2025-07-14'), dureePrevueJours: sla.reception },
      { dossierId: dossiers[1].id, etape: 'codage',     dateDebut: new Date('2025-07-14'), dateFin: new Date('2025-07-15'), dureePrevueJours: sla.codage },
      { dossierId: dossiers[1].id, etape: 'validation', dateDebut: new Date('2025-07-15'), dateFin: new Date('2025-07-16'), dureePrevueJours: sla.validation },
      { dossierId: dossiers[1].id, etape: 'paiement',   dateDebut: new Date('2025-07-16'), dureePrevueJours: sla.paiement },
      { dossierId: dossiers[4].id, etape: 'reception',  dateDebut: new Date('2025-07-10'), dateFin: new Date('2025-07-10'), dureePrevueJours: sla.reception },
      { dossierId: dossiers[4].id, etape: 'codage',     dateDebut: new Date('2025-07-10'), dateFin: new Date('2025-07-11'), dureePrevueJours: sla.codage },
      { dossierId: dossiers[4].id, etape: 'validation', dateDebut: new Date('2025-07-11'), dateFin: new Date('2025-07-12'), dureePrevueJours: sla.validation },
      { dossierId: dossiers[4].id, etape: 'paiement',   dateDebut: new Date('2025-07-12'), dateFin: new Date('2025-07-13'), dureePrevueJours: sla.paiement },
      { dossierId: dossiers[4].id, etape: 'bon_compagnie', dateDebut: new Date('2025-07-13'), dateFin: new Date('2025-07-13'), dureePrevueJours: sla.bon_compagnie },
      { dossierId: dossiers[4].id, etape: 'operations_kribi', dateDebut: new Date('2025-07-13'), dureePrevueJours: sla.operations_kribi },
      { dossierId: dossiers[6].id, etape: 'reception',  dateDebut: new Date('2025-07-01'), dateFin: new Date('2025-07-01'), dureePrevueJours: sla.reception },
      { dossierId: dossiers[6].id, etape: 'cloture',    dateDebut: new Date('2025-07-05'), dateFin: new Date('2025-07-05'), dureePrevueJours: sla.cloture },
    ],
  })

  // ============================================================
  // PARAMÈTRES GLOBAUX
  // ============================================================

  await Promise.all([
    prisma.parametre.upsert({ where: { cle: 'nom_entreprise' }, update: { valeur: 'FINITRANS' }, create: { cle: 'nom_entreprise', valeur: 'FINITRANS', description: 'Nom de l\'entreprise' } }),
    prisma.parametre.upsert({ where: { cle: 'devise' },         update: { valeur: 'FCFA' },      create: { cle: 'devise', valeur: 'FCFA', description: 'Devise utilisée' } }),
    prisma.parametre.upsert({ where: { cle: 'sla_jours' },      update: { valeur: sla },         create: { cle: 'sla_jours', valeur: sla, description: 'SLA par étape (jours)' } }),
    prisma.alerteConfig.upsert({ where: { type: 'retention_portuaire' }, update: {}, create: { type: 'retention_portuaire', label: 'Rétention portuaire',  seuil: 5,  unite: 'jours',  actif: true } }),
    prisma.alerteConfig.upsert({ where: { type: 'delai_paiement'      }, update: {}, create: { type: 'delai_paiement',      label: 'Délai paiement DI',    seuil: 48, unite: 'heures', actif: true } }),
    prisma.alerteConfig.upsert({ where: { type: 'blocage_douane'       }, update: {}, create: { type: 'blocage_douane',       label: 'Blocage douane',        seuil: 72, unite: 'heures', actif: true } }),
    prisma.alerteConfig.upsert({ where: { type: 'document_manquant'   }, update: {}, create: { type: 'document_manquant',   label: 'Document manquant',     seuil: 24, unite: 'heures', actif: true } }),
    prisma.alerteConfig.upsert({ where: { type: 'seuil_charges'       }, update: {}, create: { type: 'seuil_charges',       label: 'Seuil charges',         seuil: 85, unite: '%',      actif: true } }),
    prisma.alerteConfig.upsert({ where: { type: 'seuil_di'            }, update: {}, create: { type: 'seuil_di',            label: 'Seuil solde DI',        seuil: 20, unite: '%',      actif: true } }),
  ])

  console.log('')
  console.log('🎉 Seed terminé avec succès !')
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  ORGANIGRAMME FINITRANS — Comptes créés')
  console.log('  (mot de passe commun : finitrans2025)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  DOUALA')
  console.log('  delba@finitrans.cm    → DG                  [accès total]')
  console.log('  soudi@finitrans.cm    → Responsable Exploitation')
  console.log('  yaya@finitrans.cm     → Responsable Logistique')
  console.log('  odette@finitrans.cm   → Responsable Validation')
  console.log('  wandala@finitrans.cm  → Gestion Sorties (MSC, COSCO)')
  console.log('  rasoul@finitrans.cm   → Gestion Sorties (MAERSK, CMA)')
  console.log('  yasmine@finitrans.cm  → Service Administratif')
  console.log('  honore@finitrans.cm   → Comptable')
  console.log('')
  console.log('  KRIBI')
  console.log('  aliou@finitrans.cm    → Responsable Douanier (MSC, COSCO)')
  console.log('  raphael@finitrans.cm  → Responsable Douanier (MAERSK, CMA)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
