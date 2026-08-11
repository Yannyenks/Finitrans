export type DossierStatus = 
  | "reception"
  | "codage"
  | "validation"
  | "paiement"
  | "bon_compagnie"
  | "operations_kribi"
  | "cloture";

export const STATUS_LABELS: Record<DossierStatus, string> = {
  reception: "Réception & Enregistrement",
  codage: "Codage & Déclaration",
  validation: "Validation Douanière",
  paiement: "Paiement Droits & Taxes",
  bon_compagnie: "Bon Compagnie",
  operations_kribi: "Opérations Kribi",
  cloture: "Contrôle & Clôture",
};

export const STATUS_COLORS: Record<DossierStatus, string> = {
  reception: "bg-blue-100 text-blue-700",
  codage: "bg-purple-100 text-purple-700",
  validation: "bg-amber-100 text-amber-700",
  paiement: "bg-orange-100 text-orange-700",
  bon_compagnie: "bg-cyan-100 text-cyan-700",
  operations_kribi: "bg-teal-100 text-teal-700",
  cloture: "bg-green-100 text-green-700",
};

export const STATUS_STEP: Record<DossierStatus, number> = {
  reception: 1,
  codage: 2,
  validation: 3,
  paiement: 4,
  bon_compagnie: 5,
  operations_kribi: 6,
  cloture: 7,
};

export const STATUS_RESPONSABLE: Record<DossierStatus, string> = {
  reception: "Mme YASMINE",
  codage: "Mme ODETTE",
  validation: "Mme ODETTE",
  paiement: "Mr WANDALA",
  bon_compagnie: "Mr WANDALA",
  operations_kribi: "Mr ALIOU",
  cloture: "Mr SOUDI",
};

export type Compagnie = "MSC" | "COSCO" | "MAERSK" | "CMA-CGM";

export type InvoiceStatus = "proforma" | "validee" | "reglee";

export interface Comment {
  id: string;
  dossierId: string;
  auteur: string;
  message: string;
  date: string;
}

export interface AuditEntry {
  id: string;
  dossierId: string;
  action: string;
  auteur: string;
  date: string;
  details?: string;
}

export interface Document {
  id: string;
  dossierId: string;
  nom: string;
  type: string;
  taille: string;
  uploadePar: string;
  dateUpload: string;
  etape: DossierStatus;
}

export interface Invoice {
  id: string;
  dossierId: string;
  numero: string;
  type: InvoiceStatus;
  montant: number;
  compagnie: string;
  date: string;
  datePaiement?: string;
  description: string;
}

export interface Transfer {
  id: string;
  dossierId: string;
  montant: number;
  de: string;
  vers: string;
  date: string;
  reference: string;
  effectuePar: string;
  statut: "effectue" | "en_attente" | "annule";
}

export interface GatePass {
  id: string;
  dossierId: string;
  numero: string;
  conteneur: string;
  chauffeur: string;
  telephone: string;
  destination: string;
  dateEmission: string;
  emetteur: string;
  statut: "emis" | "transmis" | "utilise";
}

export interface BonLivraison {
  id: string;
  dossierId: string;
  numero: string;
  description: string;
  montant: number;
  date: string;
  effectuePar: string;
  statut: "valide" | "en_attente" | "annule";
}

export interface Dossier {
  id: string;
  numero: string;
  client: string;
  compagnie: Compagnie;
  conteneur: string;
  marchandise: string;
  site: "Douala" | "Kribi";
  status: DossierStatus;
  responsable: string;
  dateCreation: string;
  dateArrivee: string;
  montantTaxes?: number;
  priorite: "haute" | "moyenne" | "basse";
  montantHonoraires?: number;
  montantRedevances?: number;
  dateLimiteSortie?: string;
  numeroDI?: string;
  montantDI?: number;
}

export interface Alert {
  id: string;
  type: "detention" | "paiement" | "blocage" | "document" | "charge" | "di_seuil";
  message: string;
  dossierId: string;
  dossierNumero: string;
  date: string;
  severity: "critical" | "warning" | "info";
  lu: boolean;
}

export interface AlertConfig {
  id: string;
  type: string;
  label: string;
  seuil: number;
  unite: string;
  actif: boolean;
}

// === Messagerie ===
export interface Message {
  id: string;
  conversationId: string;
  auteur: string;
  contenu: string;
  date: string;
  lu: boolean;
}

export interface Conversation {
  id: string;
  titre: string;
  dossierId?: string;
  participants: string[];
  dernierMessage: string;
  dateUpdate: string;
  type: "dossier" | "general" | "urgence";
}

// === Bons Kribi ===
export interface BonKribi {
  id: string;
  dossierId: string;
  dossierNumero: string;
  type: "douane" | "compagnie_pak" | "portuaire_pad";
  numero: string;
  description: string;
  montant?: number;
  date: string;
  responsable: string;
  statut: "emis" | "valide" | "utilise" | "expire";
}

// === Paiements séparés ===
export interface PaiementDouane {
  id: string;
  dossierId: string;
  dossierNumero: string;
  type: "droits" | "taxes" | "redevances" | "penalite";
  montant: number;
  date: string;
  statut: "paye" | "en_attente" | "en_retard";
  reference: string;
}

export interface PaiementCompagnie {
  id: string;
  dossierId: string;
  dossierNumero: string;
  compagnie: Compagnie;
  type: "surestaries" | "frais_portuaires" | "manutention" | "terminal";
  montant: number;
  date: string;
  statut: "paye" | "en_attente" | "en_retard";
  reference: string;
}

// === Timing dossier ===
export interface DossierTiming {
  dossierId: string;
  etape: DossierStatus;
  dateDebut: string;
  dateFin?: string;
  dureePrevueJours: number;
}

export interface Employee {
  name: string;
  role: string;
  site: "Douala" | "Kribi";
  email: string;
  telephone: string;
  profil: "dg" | "exploitation" | "operations" | "validation" | "administration" | "comptabilite" | "terrain_kribi";
  permissions: {
    dossier: "complet" | "partiel" | "lecture";
    validation: "complet" | "non" | "lecture";
    financier: "complet" | "partiel" | "non" | "lecture";
    rapports: "complet" | "non";
    administration: "complet" | "partiel" | "non";
  };
}

export const EMPLOYEES: Employee[] = [
  { name: "Mr DELBA", role: "Directeur Général", site: "Douala", email: "delba@finitrans.cm", telephone: "+237 6XX XXX XXX", profil: "dg", permissions: { dossier: "lecture", validation: "lecture", financier: "complet", rapports: "complet", administration: "complet" } },
  { name: "Mr SOUDI", role: "Resp. Exploitation", site: "Douala", email: "soudi@finitrans.cm", telephone: "+237 6XX XXX XXX", profil: "exploitation", permissions: { dossier: "complet", validation: "complet", financier: "lecture", rapports: "complet", administration: "partiel" } },
  { name: "Mr WANDALA", role: "Resp. Sorties (MSC/COSCO)", site: "Douala", email: "wandala@finitrans.cm", telephone: "+237 6XX XXX XXX", profil: "operations", permissions: { dossier: "partiel", validation: "non", financier: "partiel", rapports: "non", administration: "non" } },
  { name: "Mme ODETTE", role: "Resp. Validation", site: "Douala", email: "odette@finitrans.cm", telephone: "+237 6XX XXX XXX", profil: "validation", permissions: { dossier: "partiel", validation: "complet", financier: "non", rapports: "non", administration: "non" } },
  { name: "Mme YASMINE", role: "Service Administratif", site: "Douala", email: "yasmine@finitrans.cm", telephone: "+237 6XX XXX XXX", profil: "administration", permissions: { dossier: "complet", validation: "non", financier: "partiel", rapports: "non", administration: "non" } },
  { name: "Mr HONORÉ", role: "Comptable", site: "Douala", email: "honore@finitrans.cm", telephone: "+237 6XX XXX XXX", profil: "comptabilite", permissions: { dossier: "lecture", validation: "non", financier: "complet", rapports: "complet", administration: "non" } },
  { name: "Mr ALIOU", role: "Resp. Douanier", site: "Kribi", email: "aliou@finitrans.cm", telephone: "+237 6XX XXX XXX", profil: "terrain_kribi", permissions: { dossier: "partiel", validation: "non", financier: "non", rapports: "non", administration: "non" } },
  { name: "Mr RAPHAEL", role: "Resp. Douanier", site: "Kribi", email: "raphael@finitrans.cm", telephone: "+237 6XX XXX XXX", profil: "terrain_kribi", permissions: { dossier: "partiel", validation: "non", financier: "non", rapports: "non", administration: "non" } },
];

export const MOCK_DOSSIERS: Dossier[] = [
  {
    id: "1", numero: "DOS-2025-0042", client: "SARL Nkoulou Import", compagnie: "MSC",
    conteneur: "MSCU7654321", marchandise: "Matériaux de construction", site: "Douala",
    status: "paiement", responsable: "Mr WANDALA", dateCreation: "2025-03-15",
    dateArrivee: "2025-03-20", montantTaxes: 2450000, priorite: "haute",
    montantHonoraires: 350000, montantRedevances: 120000, dateLimiteSortie: "2025-04-05", numeroDI: "DI-2025-1042", montantDI: 5000000,
  },
  {
    id: "2", numero: "DOS-2025-0043", client: "Ets Mbarga & Fils", compagnie: "COSCO",
    conteneur: "COSU1234567", marchandise: "Équipements électroniques", site: "Douala",
    status: "codage", responsable: "Mme ODETTE", dateCreation: "2025-03-18",
    dateArrivee: "2025-03-25", montantTaxes: 1800000, priorite: "moyenne",
    montantHonoraires: 280000, montantRedevances: 95000, numeroDI: "DI-2025-1043", montantDI: 3000000,
  },
  {
    id: "3", numero: "DOS-2025-0044", client: "Global Trade Cameroun", compagnie: "MAERSK",
    conteneur: "MSKU9876543", marchandise: "Produits alimentaires", site: "Kribi",
    status: "operations_kribi", responsable: "Mr ALIOU", dateCreation: "2025-03-10",
    dateArrivee: "2025-03-14", montantTaxes: 980000, priorite: "haute",
    montantHonoraires: 200000, montantRedevances: 75000, dateLimiteSortie: "2025-03-28", numeroDI: "DI-2025-1044", montantDI: 1500000,
  },
  {
    id: "4", numero: "DOS-2025-0045", client: "Société Fotso Trading", compagnie: "CMA-CGM",
    conteneur: "CMAU5432109", marchandise: "Véhicules", site: "Douala",
    status: "validation", responsable: "Mme ODETTE", dateCreation: "2025-03-20",
    dateArrivee: "2025-03-28", montantTaxes: 5200000, priorite: "haute",
    montantHonoraires: 500000, montantRedevances: 180000, dateLimiteSortie: "2025-04-15", numeroDI: "DI-2025-1045", montantDI: 8000000,
  },
  {
    id: "5", numero: "DOS-2025-0046", client: "Import Express SARL", compagnie: "MSC",
    conteneur: "MSCU1112233", marchandise: "Textiles", site: "Douala",
    status: "reception", responsable: "Mme YASMINE", dateCreation: "2025-03-22",
    dateArrivee: "2025-04-01", priorite: "basse", numeroDI: "DI-2025-1046", montantDI: 2000000,
  },
  {
    id: "6", numero: "DOS-2025-0047", client: "Cameroon Agri Plus", compagnie: "COSCO",
    conteneur: "COSU4445566", marchandise: "Engrais agricoles", site: "Kribi",
    status: "bon_compagnie", responsable: "Mr WANDALA", dateCreation: "2025-03-12",
    dateArrivee: "2025-03-17", montantTaxes: 1350000, priorite: "moyenne",
    montantHonoraires: 250000, montantRedevances: 90000, dateLimiteSortie: "2025-04-02", numeroDI: "DI-2025-1047", montantDI: 2500000,
  },
  {
    id: "7", numero: "DOS-2025-0048", client: "Douala Pharma Import", compagnie: "MAERSK",
    conteneur: "MSKU7778899", marchandise: "Produits pharmaceutiques", site: "Douala",
    status: "cloture", responsable: "Mr SOUDI", dateCreation: "2025-03-01",
    dateArrivee: "2025-03-05", montantTaxes: 3100000, priorite: "moyenne",
    montantHonoraires: 400000, montantRedevances: 150000, numeroDI: "DI-2025-1048", montantDI: 4000000,
  },
  {
    id: "8", numero: "DOS-2025-0049", client: "Tech Solutions CM", compagnie: "CMA-CGM",
    conteneur: "CMAU6667788", marchandise: "Matériel informatique", site: "Douala",
    status: "paiement", responsable: "Mr WANDALA", dateCreation: "2025-03-19",
    dateArrivee: "2025-03-26", montantTaxes: 4100000, priorite: "haute",
    montantHonoraires: 450000, montantRedevances: 160000, dateLimiteSortie: "2025-04-10", numeroDI: "DI-2025-1049", montantDI: 6000000,
  },
  {
    id: "9", numero: "DOS-2025-0050", client: "Brasseries du Littoral", compagnie: "MSC",
    conteneur: "MSCU3334455", marchandise: "Équipements brassicoles", site: "Douala",
    status: "codage", responsable: "Mme ODETTE", dateCreation: "2025-03-24",
    dateArrivee: "2025-04-02", montantTaxes: 6800000, priorite: "haute",
    montantHonoraires: 600000, montantRedevances: 220000, numeroDI: "DI-2025-1050", montantDI: 10000000,
  },
  {
    id: "10", numero: "DOS-2025-0051", client: "Menuiserie Centrale SARL", compagnie: "MAERSK",
    conteneur: "MSKU5556677", marchandise: "Bois et panneaux", site: "Kribi",
    status: "reception", responsable: "Mme YASMINE", dateCreation: "2025-03-25",
    dateArrivee: "2025-04-05", priorite: "basse", numeroDI: "DI-2025-1051", montantDI: 1800000,
  },
  {
    id: "11", numero: "DOS-2025-0052", client: "Africa Motors", compagnie: "CMA-CGM",
    conteneur: "CMAU8889900", marchandise: "Pièces détachées auto", site: "Douala",
    status: "validation", responsable: "Mme ODETTE", dateCreation: "2025-03-21",
    dateArrivee: "2025-03-29", montantTaxes: 3500000, priorite: "moyenne",
    montantHonoraires: 380000, montantRedevances: 140000, dateLimiteSortie: "2025-04-12", numeroDI: "DI-2025-1052", montantDI: 5500000,
  },
  {
    id: "12", numero: "DOS-2025-0053", client: "Ciments du Cameroun", compagnie: "COSCO",
    conteneur: "COSU7778899", marchandise: "Clinker et additifs", site: "Douala",
    status: "cloture", responsable: "Mr SOUDI", dateCreation: "2025-02-28",
    dateArrivee: "2025-03-03", montantTaxes: 2200000, priorite: "basse",
    montantHonoraires: 300000, montantRedevances: 110000, numeroDI: "DI-2025-1053", montantDI: 3500000,
  },
];

// === Bons de Livraison (BL) — opérations qui déduisent le montant DI ===
export const MOCK_BL: BonLivraison[] = [
  // Dossier 1 — DI: 5 000 000, consommé: 3 920 000, reste: 1 080 000 (21.6% → proche du seuil 20%)
  { id: "bl1", dossierId: "1", numero: "BL-2025-0101", description: "Frais de dédouanement — lot 1", montant: 1200000, date: "2025-03-17", effectuePar: "Mr WANDALA", statut: "valide" },
  { id: "bl2", dossierId: "1", numero: "BL-2025-0102", description: "Transport conteneur vers entrepôt", montant: 850000, date: "2025-03-19", effectuePar: "Mr WANDALA", statut: "valide" },
  { id: "bl3", dossierId: "1", numero: "BL-2025-0103", description: "Frais manutention portuaire", montant: 620000, date: "2025-03-20", effectuePar: "Mr WANDALA", statut: "valide" },
  { id: "bl4", dossierId: "1", numero: "BL-2025-0104", description: "Droits de douane — solde partiel", montant: 1250000, date: "2025-03-22", effectuePar: "Mr WANDALA", statut: "valide" },

  // Dossier 3 — DI: 1 500 000, consommé: 1 255 000, reste: 245 000 (16.3% → ALERTE !)
  { id: "bl5", dossierId: "3", numero: "BL-2025-0201", description: "Opérations Kribi — déchargement", montant: 450000, date: "2025-03-16", effectuePar: "Mr ALIOU", statut: "valide" },
  { id: "bl6", dossierId: "3", numero: "BL-2025-0202", description: "Transport Kribi-Douala", montant: 380000, date: "2025-03-18", effectuePar: "Mr ALIOU", statut: "valide" },
  { id: "bl7", dossierId: "3", numero: "BL-2025-0203", description: "Frais portuaires PAK", montant: 425000, date: "2025-03-20", effectuePar: "Mr RAPHAEL", statut: "valide" },

  // Dossier 4 — DI: 8 000 000, consommé: 2 100 000, reste: 5 900 000 (73.7%)
  { id: "bl8", dossierId: "4", numero: "BL-2025-0301", description: "Inspection véhicules", montant: 900000, date: "2025-03-25", effectuePar: "Mme ODETTE", statut: "valide" },
  { id: "bl9", dossierId: "4", numero: "BL-2025-0302", description: "Frais de stationnement", montant: 1200000, date: "2025-03-27", effectuePar: "Mr WANDALA", statut: "en_attente" },

  // Dossier 7 (clôturé) — DI: 4 000 000, consommé: 3 650 000, reste: 350 000 (8.75%)
  { id: "bl10", dossierId: "7", numero: "BL-2025-0401", description: "Droits pharmaceutiques", montant: 1800000, date: "2025-03-03", effectuePar: "Mr WANDALA", statut: "valide" },
  { id: "bl11", dossierId: "7", numero: "BL-2025-0402", description: "Frais d'analyse labo", montant: 950000, date: "2025-03-04", effectuePar: "Mme ODETTE", statut: "valide" },
  { id: "bl12", dossierId: "7", numero: "BL-2025-0403", description: "Honoraires et redevances", montant: 900000, date: "2025-03-05", effectuePar: "Mr SOUDI", statut: "valide" },

  // Dossier 8 — DI: 6 000 000, consommé: 4 710 000, reste: 1 290 000 (21.5%)
  { id: "bl13", dossierId: "8", numero: "BL-2025-0501", description: "Droits matériel informatique", montant: 2500000, date: "2025-03-22", effectuePar: "Mr WANDALA", statut: "valide" },
  { id: "bl14", dossierId: "8", numero: "BL-2025-0502", description: "Frais manutention", montant: 710000, date: "2025-03-24", effectuePar: "Mr WANDALA", statut: "valide" },
  { id: "bl15", dossierId: "8", numero: "BL-2025-0503", description: "Transport et livraison", montant: 1500000, date: "2025-03-25", effectuePar: "Mr WANDALA", statut: "en_attente" },

  // Dossier 6 — DI: 2 500 000, consommé: 1 690 000, reste: 810 000 (32.4%)
  { id: "bl16", dossierId: "6", numero: "BL-2025-0601", description: "Droits engrais agricoles", montant: 890000, date: "2025-03-15", effectuePar: "Mr WANDALA", statut: "valide" },
  { id: "bl17", dossierId: "6", numero: "BL-2025-0602", description: "Transport Kribi entrepôt", montant: 800000, date: "2025-03-17", effectuePar: "Mr ALIOU", statut: "valide" },

  // Dossier 12 (clôturé) — DI: 3 500 000, consommé: 2 610 000, reste: 890 000 (25.4%)
  { id: "bl18", dossierId: "12", numero: "BL-2025-0701", description: "Droits clinker", montant: 1400000, date: "2025-03-01", effectuePar: "Mr WANDALA", statut: "valide" },
  { id: "bl19", dossierId: "12", numero: "BL-2025-0702", description: "Frais portuaires", montant: 610000, date: "2025-03-02", effectuePar: "Mr WANDALA", statut: "valide" },
  { id: "bl20", dossierId: "12", numero: "BL-2025-0703", description: "Honoraires transit", montant: 600000, date: "2025-03-03", effectuePar: "Mr SOUDI", statut: "valide" },
];

// === Helpers DI ===
export function getDISolde(dossierId: string): { montantDI: number; totalBL: number; solde: number; pourcentage: number } {
  const dossier = MOCK_DOSSIERS.find(d => d.id === dossierId);
  const montantDI = dossier?.montantDI || 0;
  const bls = MOCK_BL.filter(bl => bl.dossierId === dossierId && bl.statut === "valide");
  const totalBL = bls.reduce((sum, bl) => sum + bl.montant, 0);
  const solde = montantDI - totalBL;
  const pourcentage = montantDI > 0 ? (solde / montantDI) * 100 : 100;
  return { montantDI, totalBL, solde, pourcentage };
}

export function isDIAlerte(dossierId: string, seuil = 20): boolean {
  const { pourcentage } = getDISolde(dossierId);
  return pourcentage <= seuil;
}

export const MOCK_COMMENTS: Comment[] = [
  { id: "c1", dossierId: "1", auteur: "Mr WANDALA", message: "Paiement des droits en cours, justificatif attendu de la banque", date: "2025-03-22T10:30:00" },
  { id: "c2", dossierId: "1", auteur: "Mr SOUDI", message: "Client relancé pour le complément de fonds", date: "2025-03-22T14:15:00" },
  { id: "c3", dossierId: "1", auteur: "Mme YASMINE", message: "Transfert effectué ce matin, référence TX-2025-0089", date: "2025-03-23T09:00:00" },
  { id: "c4", dossierId: "2", auteur: "Mme ODETTE", message: "Codage en cours, quelques incohérences sur les HS codes à vérifier", date: "2025-03-20T11:00:00" },
  { id: "c5", dossierId: "3", auteur: "Mr ALIOU", message: "Gate-pass demandé au PAK, réponse prévue demain matin", date: "2025-03-21T16:00:00" },
  { id: "c6", dossierId: "4", auteur: "Mme ODETTE", message: "Déclaration validée, en attente signature électronique", date: "2025-03-25T08:30:00" },
  { id: "c7", dossierId: "8", auteur: "Mr WANDALA", message: "Facture compagnie reçue, montant conforme", date: "2025-03-24T13:45:00" },
];

export const MOCK_AUDIT: AuditEntry[] = [
  { id: "au1", dossierId: "1", action: "Création du dossier", auteur: "Mme YASMINE", date: "2025-03-15T08:00:00" },
  { id: "au2", dossierId: "1", action: "Passage à l'étape Codage", auteur: "Mme YASMINE", date: "2025-03-16T09:30:00", details: "Signature numérique validée" },
  { id: "au3", dossierId: "1", action: "Passage à l'étape Validation", auteur: "Mme ODETTE", date: "2025-03-17T14:00:00" },
  { id: "au4", dossierId: "1", action: "Passage à l'étape Paiement", auteur: "Mme ODETTE", date: "2025-03-19T10:00:00", details: "Déclaration douanière validée" },
  { id: "au5", dossierId: "1", action: "Document ajouté: Déclaration d'importation.pdf", auteur: "Mme YASMINE", date: "2025-03-15T08:15:00" },
  { id: "au6", dossierId: "1", action: "Document ajouté: Facture proforma.pdf", auteur: "Mme YASMINE", date: "2025-03-15T08:20:00" },
  { id: "au7", dossierId: "2", action: "Création du dossier", auteur: "Mme YASMINE", date: "2025-03-18T09:00:00" },
  { id: "au8", dossierId: "2", action: "Passage à l'étape Codage", auteur: "Mme YASMINE", date: "2025-03-19T10:00:00" },
  { id: "au9", dossierId: "3", action: "Création du dossier", auteur: "Mme YASMINE", date: "2025-03-10T07:30:00" },
  { id: "au10", dossierId: "4", action: "Création du dossier", auteur: "Mme YASMINE", date: "2025-03-20T08:00:00" },
];

export const MOCK_DOCUMENTS: Document[] = [
  { id: "d1", dossierId: "1", nom: "Déclaration d'importation", type: "PDF", taille: "245 Ko", uploadePar: "Mme YASMINE", dateUpload: "2025-03-15", etape: "reception" },
  { id: "d2", dossierId: "1", nom: "Facture proforma", type: "PDF", taille: "180 Ko", uploadePar: "Mme YASMINE", dateUpload: "2025-03-15", etape: "reception" },
  { id: "d3", dossierId: "1", nom: "Connaissement maritime", type: "PDF", taille: "320 Ko", uploadePar: "Mme YASMINE", dateUpload: "2025-03-15", etape: "reception" },
  { id: "d4", dossierId: "1", nom: "État de codage", type: "XLSX", taille: "95 Ko", uploadePar: "Mme ODETTE", dateUpload: "2025-03-17", etape: "codage" },
  { id: "d5", dossierId: "1", nom: "Déclaration douanière", type: "PDF", taille: "410 Ko", uploadePar: "Mme ODETTE", dateUpload: "2025-03-18", etape: "validation" },
  { id: "d6", dossierId: "2", nom: "Déclaration d'importation", type: "PDF", taille: "198 Ko", uploadePar: "Mme YASMINE", dateUpload: "2025-03-18", etape: "reception" },
  { id: "d7", dossierId: "2", nom: "Facture proforma", type: "PDF", taille: "155 Ko", uploadePar: "Mme YASMINE", dateUpload: "2025-03-18", etape: "reception" },
  { id: "d8", dossierId: "3", nom: "Bon douane PAK", type: "PDF", taille: "280 Ko", uploadePar: "Mr ALIOU", dateUpload: "2025-03-20", etape: "operations_kribi" },
  { id: "d9", dossierId: "3", nom: "Reçu portuaire", type: "JPG", taille: "1.2 Mo", uploadePar: "Mr ALIOU", dateUpload: "2025-03-21", etape: "operations_kribi" },
];

export const MOCK_INVOICES: Invoice[] = [
  { id: "inv1", dossierId: "1", numero: "FAC-2025-0101", type: "validee", montant: 2450000, compagnie: "MSC", date: "2025-03-18", description: "Droits et taxes douanières" },
  { id: "inv2", dossierId: "1", numero: "FAC-2025-0102", type: "reglee", montant: 350000, compagnie: "MSC", date: "2025-03-19", datePaiement: "2025-03-20", description: "Honoraires de transit" },
  { id: "inv3", dossierId: "2", numero: "FAC-2025-0103", type: "proforma", montant: 1800000, compagnie: "COSCO", date: "2025-03-20", description: "Droits et taxes estimés" },
  { id: "inv4", dossierId: "4", numero: "FAC-2025-0104", type: "validee", montant: 5200000, compagnie: "CMA-CGM", date: "2025-03-22", description: "Droits et taxes véhicules" },
  { id: "inv5", dossierId: "4", numero: "FAC-2025-0105", type: "proforma", montant: 500000, compagnie: "CMA-CGM", date: "2025-03-22", description: "Honoraires de transit" },
  { id: "inv6", dossierId: "7", numero: "FAC-2025-0090", type: "reglee", montant: 3100000, compagnie: "MAERSK", date: "2025-03-03", datePaiement: "2025-03-05", description: "Droits pharmaceutiques" },
  { id: "inv7", dossierId: "7", numero: "FAC-2025-0091", type: "reglee", montant: 400000, compagnie: "MAERSK", date: "2025-03-03", datePaiement: "2025-03-06", description: "Honoraires" },
  { id: "inv8", dossierId: "8", numero: "FAC-2025-0106", type: "validee", montant: 4100000, compagnie: "CMA-CGM", date: "2025-03-23", description: "Droits matériel informatique" },
  { id: "inv9", dossierId: "6", numero: "FAC-2025-0095", type: "reglee", montant: 1350000, compagnie: "COSCO", date: "2025-03-15", datePaiement: "2025-03-17", description: "Droits engrais" },
  { id: "inv10", dossierId: "9", numero: "FAC-2025-0107", type: "proforma", montant: 6800000, compagnie: "MSC", date: "2025-03-25", description: "Droits équipements brassicoles" },
];

export const MOCK_TRANSFERS: Transfer[] = [
  { id: "t1", dossierId: "1", montant: 2800000, de: "Compte principal", vers: "Compte taxes douanes", date: "2025-03-19", reference: "TX-2025-0089", effectuePar: "Mme YASMINE", statut: "effectue" },
  { id: "t2", dossierId: "4", montant: 5700000, de: "Compte principal", vers: "Compte taxes douanes", date: "2025-03-23", reference: "TX-2025-0090", effectuePar: "Mme YASMINE", statut: "en_attente" },
  { id: "t3", dossierId: "7", montant: 3500000, de: "Compte principal", vers: "Compte taxes douanes", date: "2025-03-04", reference: "TX-2025-0078", effectuePar: "Mme YASMINE", statut: "effectue" },
  { id: "t4", dossierId: "8", montant: 4550000, de: "Compte principal", vers: "Compte taxes douanes", date: "2025-03-24", reference: "TX-2025-0091", effectuePar: "Mme YASMINE", statut: "en_attente" },
  { id: "t5", dossierId: "6", montant: 1690000, de: "Compte principal", vers: "Compte taxes douanes", date: "2025-03-16", reference: "TX-2025-0085", effectuePar: "Mme YASMINE", statut: "effectue" },
];

export const MOCK_GATE_PASSES: GatePass[] = [
  { id: "gp1", dossierId: "3", numero: "GP-KRI-2025-0021", conteneur: "MSKU9876543", chauffeur: "Emmanuel NDJOCK", telephone: "+237 691234567", destination: "Douala — Entrepôt client", dateEmission: "2025-03-22", emetteur: "Mr ALIOU", statut: "transmis" },
  { id: "gp2", dossierId: "6", numero: "GP-KRI-2025-0022", conteneur: "COSU4445566", chauffeur: "Pierre MBIDA", telephone: "+237 677654321", destination: "Yaoundé — Zone industrielle", dateEmission: "2025-03-18", emetteur: "Mr RAPHAEL", statut: "utilise" },
];

export const MOCK_ALERTS: Alert[] = [
  { id: "a1", type: "detention", message: "Détention imminente — conteneur MSCU7654321 (SARL Nkoulou). Sortie avant le 05/04!", dossierId: "1", dossierNumero: "DOS-2025-0042", date: "2025-03-25", severity: "critical", lu: false },
  { id: "a2", type: "paiement", message: "Paiement en retard — droits & taxes DOS-2025-0049 (4.1M FCFA)", dossierId: "8", dossierNumero: "DOS-2025-0049", date: "2025-03-26", severity: "warning", lu: false },
  { id: "a3", type: "blocage", message: "Dossier bloqué à l'étape Codage depuis 48h — Ets Mbarga & Fils", dossierId: "2", dossierNumero: "DOS-2025-0043", date: "2025-03-22", severity: "warning", lu: true },
  { id: "a4", type: "document", message: "Documents manquants — Gate-pass non uploadé pour opérations Kribi", dossierId: "3", dossierNumero: "DOS-2025-0044", date: "2025-03-23", severity: "info", lu: false },
  { id: "a5", type: "detention", message: "Détention conteneur CMAU6667788 — date limite 10/04 approche", dossierId: "8", dossierNumero: "DOS-2025-0049", date: "2025-03-28", severity: "critical", lu: false },
  { id: "a6", type: "charge", message: "Seuil de charge atteint — Mme ODETTE a 4 dossiers en attente de codage", dossierId: "", dossierNumero: "", date: "2025-03-26", severity: "warning", lu: true },
  { id: "a7", type: "paiement", message: "Facture proforma en attente depuis 5 jours — Brasseries du Littoral", dossierId: "9", dossierNumero: "DOS-2025-0050", date: "2025-03-29", severity: "info", lu: false },
  { id: "a8", type: "di_seuil", message: "⚠️ Solde DI critique (16.3%) — DOS-2025-0044 (Global Trade Cameroun). Reste 245 000 FCFA sur 1 500 000", dossierId: "3", dossierNumero: "DOS-2025-0044", date: "2025-03-21", severity: "critical", lu: false },
  { id: "a9", type: "di_seuil", message: "Solde DI bas (21.6%) — DOS-2025-0042 (SARL Nkoulou). Reste 1 080 000 FCFA sur 5 000 000", dossierId: "1", dossierNumero: "DOS-2025-0042", date: "2025-03-23", severity: "warning", lu: false },
  { id: "a10", type: "di_seuil", message: "Solde DI bas (21.5%) — DOS-2025-0049 (Tech Solutions CM). Reste 1 290 000 FCFA sur 6 000 000", dossierId: "8", dossierNumero: "DOS-2025-0049", date: "2025-03-26", severity: "warning", lu: false },
];

export const MOCK_ALERT_CONFIG: AlertConfig[] = [
  { id: "ac1", type: "detention", label: "Détention conteneur", seuil: 5, unite: "jours avant date limite", actif: true },
  { id: "ac2", type: "paiement", label: "Paiement en retard", seuil: 3, unite: "jours après échéance", actif: true },
  { id: "ac3", type: "blocage", label: "Dossier bloqué", seuil: 48, unite: "heures sans mouvement", actif: true },
  { id: "ac4", type: "document", label: "Documents manquants", seuil: 24, unite: "heures sans upload", actif: true },
  { id: "ac5", type: "charge", label: "Seuil de charge employé", seuil: 5, unite: "dossiers en attente", actif: true },
  { id: "ac6", type: "penalite", label: "Pénalité imminente", seuil: 3, unite: "jours avant pénalité", actif: false },
];

export const WEEKLY_STATS = [
  { jour: "Lun", dossiers: 4, clotures: 2 },
  { jour: "Mar", dossiers: 6, clotures: 3 },
  { jour: "Mer", dossiers: 3, clotures: 4 },
  { jour: "Jeu", dossiers: 7, clotures: 2 },
  { jour: "Ven", dossiers: 5, clotures: 5 },
  { jour: "Sam", dossiers: 2, clotures: 1 },
];

export const MONTHLY_STATS = [
  { mois: "Jan", dossiers: 18, clotures: 15, taxes: 28500000 },
  { mois: "Fév", dossiers: 22, clotures: 19, taxes: 35200000 },
  { mois: "Mar", dossiers: 26, clotures: 14, taxes: 42800000 },
];

export const EMPLOYEE_PERFORMANCE = EMPLOYEES.map(emp => {
  const dossiers = MOCK_DOSSIERS.filter(d => d.responsable === emp.name);
  const actifs = dossiers.filter(d => d.status !== "cloture").length;
  const clotures = dossiers.filter(d => d.status === "cloture").length;
  const enRetard = Math.floor(Math.random() * 2);
  const delaiMoyen = Math.floor(Math.random() * 48 + 12);
  return {
    ...emp,
    dossiersActifs: actifs,
    dossiersClotures: clotures,
    dossiersTotal: dossiers.length,
    enRetard,
    delaiMoyenHeures: delaiMoyen,
    tauxRetard: dossiers.length > 0 ? Math.round((enRetard / Math.max(dossiers.length, 1)) * 100) : 0,
    rendement: dossiers.length > 0 ? Math.round((clotures / Math.max(dossiers.length, 1)) * 100) : 0,
  };
});

// === Helper: dossier en retard ===
export function isDossierEnRetard(dossier: Dossier): boolean {
  if (!dossier.dateLimiteSortie) return false;
  return new Date(dossier.dateLimiteSortie) < new Date();
}

export function getRetardJours(dossier: Dossier): number {
  if (!dossier.dateLimiteSortie) return 0;
  const diff = new Date().getTime() - new Date(dossier.dateLimiteSortie).getTime();
  return diff > 0 ? Math.ceil(diff / (1000 * 60 * 60 * 24)) : 0;
}

// === Profils Kribi ===
export const KRIBI_PROFILES = {
  "Mr ALIOU": {
    role: "Responsable Douanier",
    responsabilites: ["Bons de douane", "Bons compagnie (PAK)", "Déclarations douanières", "Liaison avec les douanes"],
    bonsTypes: ["douane", "compagnie_pak"] as const,
  },
  "Mr RAPHAEL": {
    role: "Responsable Portuaire",
    responsabilites: ["Bons portuaires (PAD)", "Gate-Pass", "Réception conteneurs", "Rapport journalier"],
    bonsTypes: ["portuaire_pad"] as const,
  },
};

// === Mock Conversations ===
export const MOCK_CONVERSATIONS: Conversation[] = [
  { id: "conv1", titre: "Dossier DOS-2025-0042 — Urgence paiement", dossierId: "1", participants: ["Mr WANDALA", "Mme YASMINE", "Mr SOUDI"], dernierMessage: "Le client a confirmé le virement", dateUpdate: "2025-03-23T14:30:00", type: "dossier" },
  { id: "conv2", titre: "Opérations Kribi — Coordination", dossierId: "3", participants: ["Mr ALIOU", "Mr RAPHAEL", "Mr SOUDI"], dernierMessage: "Gate-pass transmis au chauffeur", dateUpdate: "2025-03-22T16:45:00", type: "dossier" },
  { id: "conv3", titre: "Réunion hebdomadaire", participants: ["Mr DELBA", "Mr SOUDI", "Mme ODETTE", "Mr WANDALA"], dernierMessage: "RDV confirmé à 10h lundi", dateUpdate: "2025-03-24T09:00:00", type: "general" },
  { id: "conv4", titre: "⚠ Blocage DOS-2025-0043", dossierId: "2", participants: ["Mme ODETTE", "Mr SOUDI"], dernierMessage: "Incohérence HS codes, vérification en cours", dateUpdate: "2025-03-21T11:00:00", type: "urgence" },
  { id: "conv5", titre: "Suivi Véhicules DOS-2025-0045", dossierId: "4", participants: ["Mme ODETTE", "Mr WANDALA", "Mr SOUDI"], dernierMessage: "Inspection programmée demain matin", dateUpdate: "2025-03-25T17:00:00", type: "dossier" },
];

export const MOCK_MESSAGES: Message[] = [
  { id: "m1", conversationId: "conv1", auteur: "Mr WANDALA", contenu: "Le paiement des droits est en cours mais la banque demande un justificatif supplémentaire", date: "2025-03-22T10:30:00", lu: true },
  { id: "m2", conversationId: "conv1", auteur: "Mme YASMINE", contenu: "J'ai effectué le transfert TX-2025-0089 ce matin. En attente de confirmation", date: "2025-03-23T09:00:00", lu: true },
  { id: "m3", conversationId: "conv1", auteur: "Mr SOUDI", contenu: "Le client a confirmé le virement, on peut avancer", date: "2025-03-23T14:30:00", lu: false },
  { id: "m4", conversationId: "conv2", auteur: "Mr ALIOU", contenu: "Bon de douane PAK validé, en attente du gate-pass", date: "2025-03-21T10:00:00", lu: true },
  { id: "m5", conversationId: "conv2", auteur: "Mr RAPHAEL", contenu: "Gate-pass émis GP-KRI-2025-0021, transmis au chauffeur Emmanuel NDJOCK", date: "2025-03-22T16:45:00", lu: true },
  { id: "m6", conversationId: "conv3", auteur: "Mr DELBA", contenu: "Préparez le point sur les dossiers en retard pour lundi", date: "2025-03-24T09:00:00", lu: false },
  { id: "m7", conversationId: "conv4", auteur: "Mme ODETTE", contenu: "Les HS codes du lot 3 ne correspondent pas à la facture, je vérifie avec le client", date: "2025-03-20T11:00:00", lu: true },
  { id: "m8", conversationId: "conv4", auteur: "Mr SOUDI", contenu: "OK tiens-moi informé, ce dossier est bloqué depuis 48h déjà", date: "2025-03-21T11:00:00", lu: true },
  { id: "m9", conversationId: "conv5", auteur: "Mme ODETTE", contenu: "Déclaration validée pour les véhicules, en attente signature", date: "2025-03-25T08:30:00", lu: true },
  { id: "m10", conversationId: "conv5", auteur: "Mr WANDALA", contenu: "Inspection programmée demain matin au parc auto", date: "2025-03-25T17:00:00", lu: false },
];

// === Mock Bons Kribi ===
export const MOCK_BONS_KRIBI: BonKribi[] = [
  // Bons Douane (Mr ALIOU)
  { id: "bk1", dossierId: "3", dossierNumero: "DOS-2025-0044", type: "douane", numero: "BD-KRI-2025-001", description: "Bon de douane — dédouanement produits alimentaires", montant: 450000, date: "2025-03-16", responsable: "Mr ALIOU", statut: "valide" },
  { id: "bk2", dossierId: "6", dossierNumero: "DOS-2025-0047", type: "douane", numero: "BD-KRI-2025-002", description: "Bon de douane — engrais agricoles", montant: 380000, date: "2025-03-15", responsable: "Mr ALIOU", statut: "utilise" },
  { id: "bk3", dossierId: "10", dossierNumero: "DOS-2025-0051", type: "douane", numero: "BD-KRI-2025-003", description: "Bon de douane — bois et panneaux", date: "2025-03-26", responsable: "Mr ALIOU", statut: "emis" },
  // Bons Compagnie PAK (Mr ALIOU)
  { id: "bk4", dossierId: "3", dossierNumero: "DOS-2025-0044", type: "compagnie_pak", numero: "BC-PAK-2025-001", description: "Bon compagnie PAK — MAERSK livraison", montant: 280000, date: "2025-03-17", responsable: "Mr ALIOU", statut: "valide" },
  { id: "bk5", dossierId: "6", dossierNumero: "DOS-2025-0047", type: "compagnie_pak", numero: "BC-PAK-2025-002", description: "Bon compagnie PAK — COSCO sortie conteneur", montant: 320000, date: "2025-03-16", responsable: "Mr ALIOU", statut: "utilise" },
  // Bons Portuaires PAD (Mr RAPHAEL)
  { id: "bk6", dossierId: "3", dossierNumero: "DOS-2025-0044", type: "portuaire_pad", numero: "BP-PAD-2025-001", description: "Bon portuaire PAD — manutention et stockage", montant: 195000, date: "2025-03-18", responsable: "Mr RAPHAEL", statut: "valide" },
  { id: "bk7", dossierId: "6", dossierNumero: "DOS-2025-0047", type: "portuaire_pad", numero: "BP-PAD-2025-002", description: "Bon portuaire PAD — frais de stationnement", montant: 150000, date: "2025-03-17", responsable: "Mr RAPHAEL", statut: "utilise" },
  { id: "bk8", dossierId: "10", dossierNumero: "DOS-2025-0051", type: "portuaire_pad", numero: "BP-PAD-2025-003", description: "Bon portuaire PAD — réception conteneur", date: "2025-03-27", responsable: "Mr RAPHAEL", statut: "emis" },
];

// === Mock Paiements séparés ===
export const MOCK_PAIEMENTS_DOUANE: PaiementDouane[] = [
  { id: "pd1", dossierId: "1", dossierNumero: "DOS-2025-0042", type: "droits", montant: 2450000, date: "2025-03-19", statut: "en_attente", reference: "DD-2025-0042-01" },
  { id: "pd2", dossierId: "4", dossierNumero: "DOS-2025-0045", type: "droits", montant: 5200000, date: "2025-03-22", statut: "en_attente", reference: "DD-2025-0045-01" },
  { id: "pd3", dossierId: "7", dossierNumero: "DOS-2025-0048", type: "droits", montant: 3100000, date: "2025-03-03", statut: "paye", reference: "DD-2025-0048-01" },
  { id: "pd4", dossierId: "8", dossierNumero: "DOS-2025-0049", type: "droits", montant: 4100000, date: "2025-03-23", statut: "en_retard", reference: "DD-2025-0049-01" },
  { id: "pd5", dossierId: "6", dossierNumero: "DOS-2025-0047", type: "droits", montant: 1350000, date: "2025-03-15", statut: "paye", reference: "DD-2025-0047-01" },
  { id: "pd6", dossierId: "9", dossierNumero: "DOS-2025-0050", type: "taxes", montant: 6800000, date: "2025-03-25", statut: "en_attente", reference: "DD-2025-0050-01" },
  { id: "pd7", dossierId: "1", dossierNumero: "DOS-2025-0042", type: "redevances", montant: 120000, date: "2025-03-20", statut: "paye", reference: "RD-2025-0042-01" },
  { id: "pd8", dossierId: "12", dossierNumero: "DOS-2025-0053", type: "droits", montant: 2200000, date: "2025-03-01", statut: "paye", reference: "DD-2025-0053-01" },
];

export const MOCK_PAIEMENTS_COMPAGNIE: PaiementCompagnie[] = [
  { id: "pc1", dossierId: "1", dossierNumero: "DOS-2025-0042", compagnie: "MSC", type: "surestaries", montant: 350000, date: "2025-03-21", statut: "paye", reference: "MSC-SUR-0042" },
  { id: "pc2", dossierId: "1", dossierNumero: "DOS-2025-0042", compagnie: "MSC", type: "manutention", montant: 180000, date: "2025-03-20", statut: "paye", reference: "MSC-MAN-0042" },
  { id: "pc3", dossierId: "4", dossierNumero: "DOS-2025-0045", compagnie: "CMA-CGM", type: "surestaries", montant: 500000, date: "2025-03-27", statut: "en_attente", reference: "CMA-SUR-0045" },
  { id: "pc4", dossierId: "4", dossierNumero: "DOS-2025-0045", compagnie: "CMA-CGM", type: "terminal", montant: 280000, date: "2025-03-26", statut: "en_attente", reference: "CMA-TER-0045" },
  { id: "pc5", dossierId: "7", dossierNumero: "DOS-2025-0048", compagnie: "MAERSK", type: "frais_portuaires", montant: 400000, date: "2025-03-04", statut: "paye", reference: "MAE-PORT-0048" },
  { id: "pc6", dossierId: "8", dossierNumero: "DOS-2025-0049", compagnie: "CMA-CGM", type: "surestaries", montant: 450000, date: "2025-03-25", statut: "en_retard", reference: "CMA-SUR-0049" },
  { id: "pc7", dossierId: "6", dossierNumero: "DOS-2025-0047", compagnie: "COSCO", type: "frais_portuaires", montant: 250000, date: "2025-03-16", statut: "paye", reference: "COS-PORT-0047" },
  { id: "pc8", dossierId: "3", dossierNumero: "DOS-2025-0044", compagnie: "MAERSK", type: "manutention", montant: 195000, date: "2025-03-18", statut: "paye", reference: "MAE-MAN-0044" },
];

// === Mock Timing Dossiers ===
export const MOCK_TIMING: DossierTiming[] = [
  // Dossier 1 — actuellement à paiement
  { dossierId: "1", etape: "reception", dateDebut: "2025-03-15", dateFin: "2025-03-16", dureePrevueJours: 1 },
  { dossierId: "1", etape: "codage", dateDebut: "2025-03-16", dateFin: "2025-03-17", dureePrevueJours: 2 },
  { dossierId: "1", etape: "validation", dateDebut: "2025-03-17", dateFin: "2025-03-19", dureePrevueJours: 2 },
  { dossierId: "1", etape: "paiement", dateDebut: "2025-03-19", dureePrevueJours: 3 },
  // Dossier 3 — à operations_kribi
  { dossierId: "3", etape: "reception", dateDebut: "2025-03-10", dateFin: "2025-03-11", dureePrevueJours: 1 },
  { dossierId: "3", etape: "codage", dateDebut: "2025-03-11", dateFin: "2025-03-12", dureePrevueJours: 2 },
  { dossierId: "3", etape: "validation", dateDebut: "2025-03-12", dateFin: "2025-03-13", dureePrevueJours: 2 },
  { dossierId: "3", etape: "paiement", dateDebut: "2025-03-13", dateFin: "2025-03-14", dureePrevueJours: 3 },
  { dossierId: "3", etape: "bon_compagnie", dateDebut: "2025-03-14", dateFin: "2025-03-15", dureePrevueJours: 2 },
  { dossierId: "3", etape: "operations_kribi", dateDebut: "2025-03-15", dureePrevueJours: 3 },
  // Dossier 7 — clôturé
  { dossierId: "7", etape: "reception", dateDebut: "2025-03-01", dateFin: "2025-03-01", dureePrevueJours: 1 },
  { dossierId: "7", etape: "codage", dateDebut: "2025-03-01", dateFin: "2025-03-02", dureePrevueJours: 2 },
  { dossierId: "7", etape: "validation", dateDebut: "2025-03-02", dateFin: "2025-03-03", dureePrevueJours: 2 },
  { dossierId: "7", etape: "paiement", dateDebut: "2025-03-03", dateFin: "2025-03-04", dureePrevueJours: 3 },
  { dossierId: "7", etape: "bon_compagnie", dateDebut: "2025-03-04", dateFin: "2025-03-04", dureePrevueJours: 2 },
  { dossierId: "7", etape: "operations_kribi", dateDebut: "2025-03-04", dateFin: "2025-03-05", dureePrevueJours: 3 },
  { dossierId: "7", etape: "cloture", dateDebut: "2025-03-05", dateFin: "2025-03-05", dureePrevueJours: 1 },
];
