import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2, Clock, AlertTriangle, UserCheck, Calendar,
  ChevronDown, ChevronRight, FileText, Loader2, Edit3,
  XCircle, PlayCircle, AlertCircle, Receipt, Stamp, Upload,
  Paperclip, ExternalLink, Timer, Hand,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { notif } from "@/hooks/useNotification";
import { useSousEtapes, SousEtape, SousEtapeStatut } from "@/hooks/useSousEtapes";
import { api, getStoredUser, openDocument } from "@/lib/api";
import { isSupervisor } from "@/lib/permissions";
import { useLiensExternes, urlValide } from "@/lib/liens";
import { dateHeure, dureeEntre } from "@/lib/temps";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isAfter, differenceInDays } from "date-fns";
import { fr } from "date-fns/locale";

// ── Définition des champs par sous-étape ──────────────────────────────────────

export type FieldDef = {
  key:          string;
  label:        string;
  type:         "text" | "date" | "number" | "textarea";
  placeholder?: string;
  required?:    boolean;
};

export type SousEtapeConfig = {
  cle:                 string;
  label:               string;
  description:         string;
  partie?:             "A" | "B";
  partieLabel?:        string;
  hasPvcResult?:       boolean;
  hasModePaiement?:    boolean;
  hasImmatriculation?: boolean;
  /** Paiement à saisir en terminant la tâche (crée un paiement compagnie) */
  facture?:            { montant: string; numero: string; date: string; titre: string };
  outputLabel?:        string;
  fields?:             FieldDef[];
  /** Règlement du client à saisir en terminant la tâche (mode, client, référence…) */
  reglementClient?:    boolean;
  /** Sites où la sous-étape s'applique (toutes si absent) */
  sites?:              ("Douala" | "Kribi")[];
};

export const SOUS_ETAPES_CONFIG: Record<string, SousEtapeConfig[]> = {
  reception: [
    {
      cle: "bl", label: "BL", description: "Bill of Lading — réception et vérification du connaissement maritime",
      fields: [
        { key: "bl_numero",        label: "N° BL",               type: "text",   placeholder: "Ex : MSCU1234567890" },
        { key: "date_reception",   label: "Date de réception",   type: "date" },
        { key: "compagnie_emission",label: "Compagnie émettrice", type: "text",   placeholder: "Ex : MSC, CMA CGM…" },
        { key: "observations",     label: "Observations",        type: "textarea", placeholder: "État, anomalies constatées…" },
      ],
    },
    {
      cle: "facture_proforma", label: "Facture proforma", description: "Réception et contrôle de la facture proforma fournisseur",
      fields: [
        { key: "fp_reference",  label: "Référence facture",  type: "text",   placeholder: "Ex : INV-2025-0042" },
        { key: "fp_montant",    label: "Montant (XAF)",      type: "number", placeholder: "0" },
        { key: "fp_fournisseur",label: "Fournisseur",        type: "text",   placeholder: "Nom du fournisseur" },
        { key: "fp_date",       label: "Date facture",       type: "date" },
      ],
    },
    {
      cle: "saisie_pr", label: "Saisie du PR", description: "Saisie de la prise en charge / bon de commande dans le système",
      fields: [
        { key: "pr_numero", label: "N° Prise en charge / BC", type: "text", placeholder: "Ex : PR-2025-0087" },
        { key: "pr_date",   label: "Date de saisie",          type: "date" },
      ],
    },
    {
      cle: "paiement_client", label: "Paiement par le client", description: "Confirmation du règlement client avant engagement SGS — enregistré dans la fiche client (CRM)",
      reglementClient: true, outputLabel: "Reçu / preuve du règlement",
    },
    {
      cle: "di", label: "DI", description: "Création et liaison de la Déclaration d'Importation au dossier",
      fields: [
        { key: "di_numero", label: "N° DI", type: "text", placeholder: "Ex : DI-2025-0042" },
        { key: "di_date",   label: "Date d'émission", type: "date" },
      ],
    },
  ],
  soumission_sgs: [
    {
      cle: "ff_soumission", label: "FF et soumission des documents fournisseurs",
      description: "Fret Forwarding — compilation et transmission des documents fournisseurs à la SGS",
      fields: [
        { key: "ff_reference",    label: "Référence FF",       type: "text", placeholder: "Ex : FF-2025-0087" },
        { key: "ff_date_soum",    label: "Date de soumission", type: "date" },
        { key: "ff_docs_liste",   label: "Documents transmis", type: "textarea", placeholder: "Liste des documents joints…" },
      ],
    },
    {
      cle: "pvc", label: "Obtention du RVC",
      description: "Obtention du RVC délivré par la SGS — étape suivie par la Direction (M. Delba, M. Soudi)", hasPvcResult: true,
      fields: [
        { key: "pvc_numero",       label: "N° RVC",             type: "text", placeholder: "Ex : RVC-2025-0042" },
        { key: "pvc_date_reception",label: "Date de réception", type: "date" },
      ],
    },
  ],
  codage: [
    {
      cle: "etat_codage", label: "État de codage et validation",
      description: "Analyse documentaire exhaustive — contrôle de conformité et classement tarifaire (nomenclature SH)",
      fields: [
        { key: "codage_code_sh",   label: "Code SH / Position tarifaire", type: "text", placeholder: "Ex : 8471.30" },
        { key: "codage_agent",     label: "Agent codeur",                  type: "text", placeholder: "Nom de l'agent" },
        { key: "codage_date",      label: "Date de codage",                type: "date" },
        { key: "codage_observations", label: "Observations",               type: "textarea", placeholder: "Anomalies, réserves…" },
      ],
    },
    {
      cle: "declaration", label: "Déclaration",
      description: "Saisie, contrôle et dépôt de la déclaration en douane auprès des services douaniers",
      fields: [
        { key: "decl_numero",  label: "N° Déclaration",   type: "text", placeholder: "Ex : 2025-001234" },
        { key: "decl_date",    label: "Date de dépôt",    type: "date" },
        { key: "decl_bureau",  label: "Bureau de douane", type: "text", placeholder: "Ex : Douala Port" },
      ],
    },
    {
      cle: "regulation", label: "Régulation",
      description: "Conformité réglementaire — vérification des textes en vigueur et régimes douaniers",
      fields: [
        { key: "reg_regime",    label: "Régime douanier",       type: "text", placeholder: "Ex : Mise à la consommation" },
        { key: "reg_reference", label: "Référence réglementaire", type: "text", placeholder: "Ex : Art. 123 Code douanier" },
        { key: "reg_date",      label: "Date de régulation",    type: "date" },
      ],
    },
  ],
  validation: [
    {
      cle: "validation_docs", label: "Validation administrative des documents",
      description: "Examen, contrôle de cohérence et visa de l'ensemble des pièces constitutives du dossier",
      fields: [
        { key: "val_agent",   label: "Agent validateur",     type: "text", placeholder: "Nom et qualité" },
        { key: "val_date",    label: "Date de validation",   type: "date" },
        { key: "val_entite",  label: "Entité validatrice",   type: "text", placeholder: "Ex : Service douanier, agent DG…" },
        { key: "val_obs",     label: "Observations / réserves", type: "textarea", placeholder: "Documents manquants, corrections…" },
      ],
    },
  ],
  paiement: [
    {
      cle: "paiement_droits", label: "Paiement des droits et taxes",
      description: "Règlement des droits de douane, TVA et taxes diverses — émission de la quittance officielle",
      hasModePaiement: true, outputLabel: "Quittance de paiement",
      fields: [
        { key: "paiement_montant",   label: "Montant total (XAF)",  type: "number", placeholder: "0" },
        { key: "paiement_quittance", label: "N° Quittance",         type: "text",   placeholder: "Ex : QTT-2025-04821" },
        { key: "paiement_date",      label: "Date de paiement",     type: "date" },
      ],
    },
  ],
  bon_compagnie: [
    {
      cle: "facturation_compagnie", label: "Facturation & paiement",
      facture: { montant: "bc_montant", numero: "bc_facture_numero", date: "bc_date_paiement", titre: "Facture de la compagnie maritime" },
      description: "Règlement des frais de surestaries, THC et frais compagnie maritime", partie: "A", partieLabel: "Bon de Compagnie Maritime",
      fields: [
        { key: "bc_facture_numero", label: "N° Facture compagnie", type: "text",   placeholder: "Ex : MSC-INV-2025-0042" },
        { key: "bc_montant",        label: "Montant (XAF)",        type: "number", placeholder: "0" },
        { key: "bc_date_paiement",  label: "Date de paiement",     type: "date" },
      ],
    },
    {
      cle: "bon_a_delivrer", label: "Soumission & obtention du Bon à Délivrer",
      description: "Dépôt de la quittance compagnie et obtention du Bon à Délivrer (BAD) auprès de l'armateur", partie: "A", partieLabel: "Bon de Compagnie Maritime",
      fields: [
        { key: "bad_numero",     label: "N° BAD",               type: "text", placeholder: "Ex : BAD-2025-0087" },
        { key: "bad_date_obtention", label: "Date d'obtention", type: "date" },
      ],
    },
    {
      cle: "facturation_terminal", label: "Facturation & paiement (redevance portuaire)", sites: ["Douala"],
      facture: { montant: "term_montant", numero: "term_facture_numero", date: "term_date_paiement", titre: "Redevance portuaire (terminal)" },
      description: "Règlement des redevances portuaires auprès du terminal RTC de Douala (à Kribi : étape Opérations Kribi)", partie: "B", partieLabel: "Terminal Portuaire (RTC)",
      fields: [
        { key: "term_facture_numero", label: "N° Facture terminal", type: "text",   placeholder: "Ex : KCT-INV-2025-0042" },
        { key: "term_montant",        label: "Montant (XAF)",       type: "number", placeholder: "0" },
        { key: "term_date_paiement",  label: "Date de paiement",    type: "date" },
      ],
    },
    {
      cle: "bon_livraison", label: "Bon de livraison", sites: ["Douala"],
      description: "Obtention du bon de livraison terminal autorisant l'enlèvement physique de la marchandise", partie: "B", partieLabel: "Terminal Portuaire (RTC)",
      fields: [
        { key: "bl_term_numero",    label: "N° Bon de livraison",  type: "text", placeholder: "Ex : BL-T-2025-0042" },
        { key: "bl_term_date",      label: "Date d'obtention",     type: "date" },
        { key: "bl_term_observations", label: "Observations",      type: "textarea", placeholder: "État de la marchandise, réserves…" },
      ],
    },
    {
      cle: "gate_pass", label: "Gate Pass — Ticket de sortie", sites: ["Douala"],
      description: "Récupération du gate pass et enregistrement de l'immatriculation du véhicule", partie: "B", partieLabel: "Terminal Portuaire (RTC)",
      hasImmatriculation: true,
      fields: [
        { key: "gp_chauffeur",  label: "Nom du chauffeur",     type: "text", placeholder: "Ex : M. DUPONT Jean" },
        { key: "gp_heure_sort", label: "Heure de sortie",      type: "text", placeholder: "Ex : 14h30" },
        { key: "gp_observations",label: "Observations",        type: "textarea", placeholder: "Remarques particulières…" },
      ],
    },
  ],
  operations_kribi: [
    {
      cle: "facturation_terminal", label: "Facturation & paiement (redevance portuaire)",
      facture: { montant: "kct_montant", numero: "kct_facture_numero", date: "kct_date_paiement", titre: "Redevance portuaire KCT Kribi" },
      description: "Règlement des redevances portuaires auprès du terminal KCT de Kribi",
      fields: [
        { key: "kct_facture_numero", label: "N° Facture KCT",   type: "text",   placeholder: "Ex : KCT-INV-2025-0042" },
        { key: "kct_montant",        label: "Montant (XAF)",     type: "number", placeholder: "0" },
        { key: "kct_date_paiement",  label: "Date de paiement",  type: "date" },
      ],
    },
    {
      cle: "bon_livraison", label: "Bon de livraison",
      description: "Obtention du bon de livraison autorisant l'enlèvement de la marchandise au port de Kribi",
      fields: [
        { key: "kbl_numero", label: "N° Bon de livraison", type: "text", placeholder: "Ex : BL-KCT-2025-0042" },
        { key: "kbl_date",   label: "Date d'obtention",    type: "date" },
      ],
    },
    {
      cle: "gate_pass", label: "Gate Pass — Ticket de sortie",
      description: "Gate pass Kribi — enregistrement de l'immatriculation du véhicule de transport", hasImmatriculation: true,
      fields: [
        { key: "kgp_chauffeur",    label: "Nom du chauffeur",  type: "text", placeholder: "Ex : M. MARTIN" },
        { key: "kgp_heure_sort",   label: "Heure de sortie",   type: "text", placeholder: "Ex : 09h15" },
      ],
    },
  ],
  cloture: [
    {
      cle: "rapport_final", label: "Rapport de clôture du dossier",
      description: "Génération et export du rapport administratif complet — récapitulatif exhaustif de toutes les opérations",
      fields: [
        { key: "rapport_observations", label: "Observations finales", type: "textarea", placeholder: "Résumé des opérations, incidents, points d'attention…" },
        { key: "rapport_date",         label: "Date de clôture",      type: "date" },
      ],
    },
  ],
};

/** Sous-étapes applicables à un site (la partie terminal de Kribi est traitée en « Opérations Kribi »). */
export function applicableConfigs(etape: string, site?: string): SousEtapeConfig[] {
  return (SOUS_ETAPES_CONFIG[etape] ?? []).filter(c => !c.sites || !site || c.sites.includes(site as "Douala" | "Kribi"));
}

// ── Icônes de statut ─────────────────────────────────────────────────────────
const StatutIcon = ({ statut, size = "w-4 h-4" }: { statut: SousEtapeStatut; size?: string }) => {
  if (statut === "valide")   return <CheckCircle2 className={`${size} text-success`} />;
  if (statut === "rejete")   return <XCircle      className={`${size} text-destructive`} />;
  if (statut === "en_cours") return <PlayCircle   className={`${size} text-blue-500`} />;
  return <Clock className={`${size} text-muted-foreground/40`} />;
};

const STATUT_LABELS: Record<SousEtapeStatut, string> = {
  todo:     "À faire",
  en_cours: "En cours",
  valide:   "Validé",
  rejete:   "Rejeté",
};

const STATUT_COLORS: Record<SousEtapeStatut, string> = {
  todo:     "bg-muted/60 text-muted-foreground",
  en_cours: "bg-blue-50 text-blue-700 border border-blue-200",
  valide:   "bg-success/10 text-success border border-success/20",
  rejete:   "bg-destructive/10 text-destructive border border-destructive/20",
};

// ── Dialogue PVC ─────────────────────────────────────────────────────────────
const PvcDialog = ({
  onConfirm, onCancel, loading,
}: {
  onConfirm: (data: { resultat: "succes" | "rejet"; motif: string }) => void;
  onCancel:  () => void;
  loading:   boolean;
}) => {
  const [resultat, setResultat] = useState<"succes" | "rejet">("succes");
  const [motif,    setMotif]    = useState("");

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card rounded-2xl p-6 w-full max-w-md shadow-2xl border border-border"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center">
            <Stamp className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="font-display font-bold text-foreground">Résultat du RVC</h3>
            <p className="text-xs text-muted-foreground">Procès-Verbal de Constatation SGS</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {(["succes", "rejet"] as const).map(r => (
              <button
                key={r}
                onClick={() => setResultat(r)}
                className={`flex items-center gap-2 justify-center p-3 rounded-xl border-2 transition-all font-semibold text-sm ${
                  resultat === r
                    ? r === "succes"
                      ? "border-success bg-success/10 text-success"
                      : "border-destructive bg-destructive/10 text-destructive"
                    : "border-border text-muted-foreground hover:border-muted-foreground/40"
                }`}
              >
                {r === "succes" ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {r === "succes" ? "Succès" : "Rejet"}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Motif / observations * <span className="text-destructive">(obligatoire)</span></Label>
            <Textarea
              value={motif}
              onChange={e => setMotif(e.target.value)}
              placeholder={resultat === "succes" ? "Ex : RVC N°2025-0847 reçu — marchandise conforme à la déclaration" : "Ex : Non-conformité documentaire — facture proforma incomplète"}
              className="bg-muted/40 text-sm h-20 resize-none"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              onClick={() => onConfirm({ resultat, motif })}
              disabled={!motif.trim() || loading}
              className={`flex-1 gap-1.5 ${resultat === "succes" ? "bg-success text-white" : "bg-destructive text-white"}`}
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Enregistrer le résultat
            </Button>
            <Button variant="outline" onClick={onCancel} className="px-4">Annuler</Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// ── Dialogue Paiement des droits & taxes (crée le paiement douane) ────────────
const PaiementDialog = ({
  onConfirm, onCancel, loading, meta,
}: {
  onConfirm: (data: Record<string, string>) => void;
  onCancel:  () => void;
  loading:   boolean;
  meta:      Record<string, string>;
}) => {
  const [mode,      setMode]      = useState(meta.mode_paiement ?? "virement");
  const [reference, setReference] = useState(meta.paiement_quittance ?? meta.reference ?? "");
  const [montant,   setMontant]   = useState(meta.paiement_montant ?? "");
  const [datePaie,  setDatePaie]  = useState(meta.paiement_date ?? new Date().toISOString().slice(0, 10));
  const montantOk = Number(String(montant).replace(/\s/g, "")) > 0;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-card rounded-2xl p-6 w-full max-w-md shadow-2xl border border-border max-h-[92vh] overflow-y-auto">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center"><Receipt className="w-5 h-5 text-orange-600" /></div>
          <div>
            <h3 className="font-display font-bold text-foreground">Paiement des droits & taxes</h3>
            <p className="text-xs text-muted-foreground">Le paiement est enregistré automatiquement en Finance et en comptabilité</p>
          </div>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Montant payé (FCFA) *</Label>
              <Input type="number" min={1} value={montant} onChange={e => setMontant(e.target.value)} className="bg-muted/40 font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Date</Label>
              <Input type="date" value={datePaie} onChange={e => setDatePaie(e.target.value)} className="bg-muted/40" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Mode de règlement *</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger className="bg-muted/40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="virement">Virement bancaire</SelectItem>
                <SelectItem value="cash">Cash / espèces</SelectItem>
                <SelectItem value="autres">Autres (avec justificatifs)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {mode === "autres" && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> Joignez le justificatif en preuve de paiement.
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">N° de quittance / référence *</Label>
            <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="Ex : QTT-2026-00987" className="bg-muted/40" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              onClick={() => onConfirm({ mode_paiement: mode, reference, paiement_quittance: reference, paiement_montant: String(montant), paiement_date: datePaie })}
              disabled={!reference.trim() || !montantOk || loading}
              className="flex-1 gap-1.5 bg-secondary text-secondary-foreground">
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Valider le paiement
            </Button>
            <Button variant="outline" onClick={onCancel} className="px-4">Annuler</Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// ── Dialogue Paiement par le client (crée le règlement client, rattaché au CRM) ─
export const MODES_REGLEMENT: { value: string; label: string; aide?: string }[] = [
  { value: "virement",     label: "Virement bancaire" },
  { value: "cheque",       label: "Chèque",       aide: "Indiquez le n° de chèque et la banque tirée." },
  { value: "especes",      label: "Espèces",      aide: "Joignez le reçu de caisse en preuve." },
  { value: "traite",       label: "Traite",       aide: "Indiquez le n° de la traite, la banque et l'échéance." },
  { value: "mobile_money", label: "Mobile money" },
  { value: "autre",        label: "Autre" },
];
export const LIBELLE_MODE: Record<string, string> = Object.fromEntries(MODES_REGLEMENT.map(m => [m.value, m.label]));

const ReglementClientDialog = ({
  onConfirm, onCancel, loading, meta, clientParDefaut,
}: {
  onConfirm:       (data: Record<string, string>) => void;
  onCancel:        () => void;
  loading:         boolean;
  meta:            Record<string, string>;
  clientParDefaut: string;
}) => {
  const [mode,      setMode]      = useState(meta.reglement_mode ?? "virement");
  const [client,    setClient]    = useState(meta.reglement_client ?? clientParDefaut ?? "");
  const [payeur,    setPayeur]    = useState(meta.reglement_payeur ?? "");
  const [montant,   setMontant]   = useState(meta.reglement_montant ?? "");
  const [dateRegl,  setDateRegl]  = useState(meta.reglement_date ?? new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState(meta.reglement_reference ?? "");
  const [banque,    setBanque]    = useState(meta.reglement_banque ?? "");
  const [echeance,  setEcheance]  = useState(meta.reglement_echeance ?? "");
  const [obs,       setObs]       = useState(meta.reglement_observations ?? "");
  const montantOk = Number(String(montant).replace(/\s/g, "")) > 0;
  const avecBanque = mode === "cheque" || mode === "traite" || mode === "virement";
  const aide = MODES_REGLEMENT.find(m => m.value === mode)?.aide;
  const refLabel = mode === "cheque" ? "N° de chèque" : mode === "traite" ? "N° de traite" : mode === "especes" ? "N° de reçu" : mode === "mobile_money" ? "ID de transaction" : "Référence du virement";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-card rounded-2xl p-6 w-full max-w-lg shadow-2xl border border-border max-h-[92vh] overflow-y-auto" role="dialog" aria-label="Paiement par le client">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center"><Receipt className="w-5 h-5 text-emerald-700" /></div>
          <div>
            <h3 className="font-display font-bold text-foreground">Paiement par le client</h3>
            <p className="text-xs text-muted-foreground">Le règlement est enregistré dans la fiche du client (CRM)</p>
          </div>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2 sm:col-span-1">
              <Label className="text-xs font-semibold">Client *</Label>
              <Input value={client} onChange={e => setClient(e.target.value)} placeholder="Nom du client" className="bg-muted/40" />
            </div>
            <div className="space-y-1.5 col-span-2 sm:col-span-1">
              <Label className="text-xs font-semibold">Payé par (si différent)</Label>
              <Input value={payeur} onChange={e => setPayeur(e.target.value)} placeholder="Ex : maison mère, transitaire…" className="bg-muted/40" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Mode de règlement *</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger className="bg-muted/40" aria-label="Mode de règlement"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MODES_REGLEMENT.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {aide && <p className="text-[11px] text-muted-foreground">{aide}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Montant reçu (FCFA) *</Label>
              <Input type="number" min={1} value={montant} onChange={e => setMontant(e.target.value)} className="bg-muted/40 font-mono" aria-label="Montant reçu" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Date du règlement</Label>
              <Input type="date" value={dateRegl} onChange={e => setDateRegl(e.target.value)} className="bg-muted/40" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{refLabel}</Label>
              <Input value={reference} onChange={e => setReference(e.target.value)} className="bg-muted/40 font-mono" />
            </div>
            {avecBanque && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Banque</Label>
                <Input value={banque} onChange={e => setBanque(e.target.value)} placeholder="Ex : Afriland, SGC, UBA…" className="bg-muted/40" />
              </div>
            )}
          </div>
          {(mode === "traite" || mode === "cheque") && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Échéance {mode === "traite" ? "*" : "(chèque post-daté)"}</Label>
              <Input type="date" value={echeance} onChange={e => setEcheance(e.target.value)} className="bg-muted/40" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Observations</Label>
            <Textarea value={obs} onChange={e => setObs(e.target.value)} className="bg-muted/40 h-16 resize-none text-sm" placeholder="Acompte, solde, conditions particulières…" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              onClick={() => onConfirm({
                reglement_client: client.trim(), reglement_payeur: payeur.trim(), reglement_mode: mode,
                reglement_montant: String(montant), reglement_date: dateRegl, reglement_reference: reference.trim(),
                reglement_banque: avecBanque ? banque.trim() : "", reglement_echeance: (mode === "traite" || mode === "cheque") ? echeance : "",
                reglement_observations: obs.trim(),
              })}
              disabled={!client.trim() || !montantOk || (mode === "traite" && !echeance) || loading}
              className="flex-1 gap-1.5 bg-secondary text-secondary-foreground">
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Enregistrer le règlement
            </Button>
            <Button variant="outline" onClick={onCancel} className="px-4">Annuler</Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// ── Revue : toutes les informations enregistrées sur la tâche ─────────────────
const LIBELLES_META: Record<string, string> = {
  mode_paiement: "Mode de paiement", reference: "Référence", paiement_quittance: "N° de quittance",
  paiement_montant: "Montant payé", paiement_date: "Date de paiement",
  pvc_resultat: "Résultat RVC", pvc_motif: "Motif / observations",
  immatriculation: "Immatriculation", gp_chauffeur: "Chauffeur", gp_telephone: "Téléphone du chauffeur", gp_destination: "Destination",
  gate_pass_numero: "N° gate pass", preuve_nom: "Preuve jointe",
  reglement_client: "Client", reglement_payeur: "Payé par", reglement_mode: "Mode de règlement", reglement_montant: "Montant reçu",
  reglement_date: "Date du règlement", reglement_reference: "Référence", reglement_banque: "Banque", reglement_echeance: "Échéance",
  reglement_observations: "Observations",
  pc_montant: "Montant reçu", pc_date: "Date de paiement", pc_reference: "Référence", pc_mode: "Mode de règlement",
  enregistrement_type: "Enregistrement créé",
};
const META_CACHEES = new Set(["preuve_url", "preuve_doc_id", "enregistrement_id"]);
const ENREGISTREMENTS: Record<string, string> = {
  paiement_douane: "Paiement douane (Finance)", paiement_compagnie: "Paiement compagnie (Finance)",
  gate_pass: "Gate pass", reglement_client: "Règlement client (CRM)",
};

function valeurLisible(cle: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  const s = String(v);
  if (cle === "reglement_mode" || cle === "pc_mode") return LIBELLE_MODE[s] ?? s;
  if (cle === "mode_paiement") return s === "cash" ? "Cash / espèces" : s === "autres" ? "Autres" : s === "virement" ? "Virement" : s;
  if (cle === "pvc_resultat") return s === "succes" ? "Succès" : "Rejet";
  if (cle === "enregistrement_type") return ENREGISTREMENTS[s] ?? s;
  if (/montant/.test(cle) && Number.isFinite(Number(s.replace(/\s/g, "")))) return `${Number(s.replace(/\s/g, "")).toLocaleString("fr-FR")} FCFA`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T00:00:00`).toLocaleDateString("fr-FR");
  return s;
}

const RevueInformations = ({ config, data }: { config: SousEtapeConfig; data?: SousEtape }) => {
  const meta = (data?.metadata ?? {}) as Record<string, unknown>;
  const libelles: Record<string, string> = { ...LIBELLES_META };
  (config.fields ?? []).forEach(f => { libelles[f.key] = f.label; });
  // Ordre de lecture : champs de l'étape, puis saisies des formulaires, puis le reste
  const ordre = [...(config.fields ?? []).map(f => f.key), ...Object.keys(LIBELLES_META)];
  const rang = (k: string) => { const i = ordre.indexOf(k); return i < 0 ? ordre.length : i; };
  const lignes = Object.entries(meta)
    .filter(([k, v]) => !META_CACHEES.has(k) && valeurLisible(k, v) !== "")
    .sort(([a], [b]) => rang(a) - rang(b))
    .map(([k, v]) => ({ k, label: libelles[k] ?? k.replace(/_/g, " "), valeur: valeurLisible(k, v) }));
  const temps: { label: string; valeur: string }[] = [];
  if (data?.startedAt)   temps.push({ label: "Début", valeur: dateHeure(data.startedAt) });
  if (data?.completedAt) temps.push({ label: "Terminée", valeur: dateHeure(data.completedAt) });
  if (data?.startedAt && data?.completedAt) temps.push({ label: "Durée de traitement", valeur: dureeEntre(data.startedAt, data.completedAt) });
  if (data?.completedBy) temps.push({ label: "Validée par", valeur: data.completedBy.nom });
  if (data?.notes)       temps.push({ label: "Notes", valeur: data.notes });
  if (lignes.length === 0 && temps.length === 0) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-card p-3 space-y-2" data-testid={`revue-${config.cle}`}>
      <p className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
        <FileText className="w-3 h-3 text-secondary" /> Informations enregistrées
      </p>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
        {[...lignes, ...temps].map(l => (
          <div key={l.label + l.valeur} className="min-w-0">
            <dt className="text-[10px] text-muted-foreground">{l.label}</dt>
            <dd className="text-xs text-foreground font-medium break-words">{l.valeur}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

// ── Dialogue Facture compagnie / terminal (crée le paiement compagnie) ────────
const FactureCieDialog = ({
  champs, titre, onConfirm, onCancel, loading, meta,
}: {
  champs:    { montant: string; numero: string; date: string };
  titre:     string;
  onConfirm: (data: Record<string, string>) => void;
  onCancel:  () => void;
  loading:   boolean;
  meta:      Record<string, string>;
}) => {
  const [numero,  setNumero]  = useState(meta[champs.numero] ?? "");
  const [montant, setMontant] = useState(meta[champs.montant] ?? "");
  const [datePaie, setDatePaie] = useState(meta[champs.date] ?? new Date().toISOString().slice(0, 10));
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-card rounded-2xl p-6 w-full max-w-md shadow-2xl border border-border">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center"><Receipt className="w-5 h-5 text-green-700" /></div>
          <div>
            <h3 className="font-display font-bold text-foreground">{titre}</h3>
            <p className="text-xs text-muted-foreground">Le paiement est enregistré automatiquement en Finance</p>
          </div>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label className="text-xs font-semibold">N° de facture</Label><Input value={numero} onChange={e => setNumero(e.target.value)} className="bg-muted/40 font-mono" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs font-semibold">Montant payé (FCFA) *</Label><Input type="number" min={1} value={montant} onChange={e => setMontant(e.target.value)} className="bg-muted/40 font-mono" /></div>
            <div className="space-y-1.5"><Label className="text-xs font-semibold">Date de paiement</Label><Input type="date" value={datePaie} onChange={e => setDatePaie(e.target.value)} className="bg-muted/40" /></div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button onClick={() => onConfirm({ [champs.numero]: numero, [champs.montant]: String(montant), [champs.date]: datePaie })}
              disabled={!(Number(montant) > 0) || loading} className="flex-1 gap-1.5 bg-secondary text-secondary-foreground">
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Valider le paiement
            </Button>
            <Button variant="outline" onClick={onCancel} className="px-4">Annuler</Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// ── Dialogue Gate Pass (crée le ticket de sortie) ─────────────────────────────
const GatePassDialog = ({
  onConfirm, onCancel, loading, meta,
}: {
  onConfirm: (data: Record<string, string>, notes?: string) => void;
  onCancel:  () => void;
  loading:   boolean;
  meta:      Record<string, string>;
}) => {
  const { data: chauffeurs = [] } = useQuery({
    queryKey: ["logistique-chauffeurs-actifs"],
    queryFn:  () => api.get<any[]>("/api/logistique/chauffeurs?actifs=true"),
    staleTime: 5 * 60_000,
  });
  const [immat, setImmat] = useState(meta.immatriculation ?? "");
  const [chauffeur, setChauffeur] = useState(meta.gp_chauffeur ?? meta.kgp_chauffeur ?? "");
  const [telephone, setTelephone] = useState(meta.gp_telephone ?? "");
  const [destination, setDestination] = useState(meta.gp_destination ?? "");
  const [notes, setNotes] = useState("");
  const choisirChauffeur = (v: string) => {
    setChauffeur(v);
    const c = chauffeurs.find((x: any) => x.nom === v);
    if (c) setTelephone(c.telephone);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-card rounded-2xl p-6 w-full max-w-md shadow-2xl border border-border max-h-[92vh] overflow-y-auto">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-teal-100 flex items-center justify-center"><FileText className="w-5 h-5 text-teal-600" /></div>
          <div>
            <h3 className="font-display font-bold text-foreground">Gate Pass — Ticket de sortie</h3>
            <p className="text-xs text-muted-foreground">Le ticket est enregistré et imprimable depuis la plateforme</p>
          </div>
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Immatriculation du véhicule *</Label>
            <Input value={immat} onChange={e => setImmat(e.target.value.toUpperCase())} placeholder="Ex : LT 1234 A" className="bg-muted/40 font-mono uppercase tracking-widest" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Chauffeur *</Label>
              <Input list="gp-chauffeurs" value={chauffeur} onChange={e => choisirChauffeur(e.target.value)} className="bg-muted/40" />
              <datalist id="gp-chauffeurs">{chauffeurs.map((c: any) => <option key={c.id} value={c.nom}>{c.telephone}</option>)}</datalist>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Téléphone *</Label>
              <Input value={telephone} onChange={e => setTelephone(e.target.value)} className="bg-muted/40" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Destination *</Label>
            <Input value={destination} onChange={e => setDestination(e.target.value)} placeholder="Ex : Yaoundé — entrepôt client" className="bg-muted/40" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Observations</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} className="bg-muted/40 text-sm h-14 resize-none" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              onClick={() => onConfirm({ immatriculation: immat, gp_chauffeur: chauffeur, gp_telephone: telephone, gp_destination: destination }, notes)}
              disabled={!immat.trim() || chauffeur.trim().length < 2 || telephone.replace(/\D/g, "").length < 8 || destination.trim().length < 2 || loading}
              className="flex-1 gap-1.5 bg-secondary text-secondary-foreground">
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Enregistrer le Gate Pass
            </Button>
            <Button variant="outline" onClick={onCancel} className="px-4">Annuler</Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// ── Section informations de l'étape ──────────────────────────────────────────
const StepInfoSection = ({
  config, meta, onSave, isPending,
}: {
  config:    SousEtapeConfig;
  meta:      Record<string, string>;
  onSave:    (patch: Record<string, unknown>) => void;
  isPending: boolean;
}) => {
  const fields = config.fields ?? [];
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    fields.forEach(f => { init[f.key] = (meta[f.key] as string) ?? ""; });
    return init;
  });
  const [dirty, setDirty] = useState(false);
  if (fields.length === 0) return null;

  const set = (key: string, val: string) => {
    setValues(v => ({ ...v, [key]: val }));
    setDirty(true);
  };

  const handleSave = () => {
    const patch: Record<string, unknown> = {};
    fields.forEach(f => { patch[f.key] = values[f.key] || null; });
    onSave(patch);
    setDirty(false);
  };

  return (
    <div className="rounded-xl border border-secondary/15 bg-secondary/[0.03] p-3 space-y-2.5">
      <p className="text-[11px] font-semibold text-secondary flex items-center gap-1.5">
        <FileText className="w-3 h-3" /> Informations de l'étape
      </p>
      <div className="grid grid-cols-2 gap-2">
        {fields.map(f => (
          <div key={f.key} className={f.type === "textarea" ? "col-span-2 space-y-1" : "space-y-1"}>
            <Label className="text-[10px] font-medium text-muted-foreground">
              {f.label}{f.required && <span className="text-destructive ml-0.5">*</span>}
            </Label>
            {f.type === "textarea" ? (
              <Textarea
                value={values[f.key]}
                onChange={e => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                className="text-xs bg-card h-14 resize-none"
              />
            ) : (
              <Input
                type={f.type}
                value={values[f.key]}
                onChange={e => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                className="h-7 text-xs bg-card"
              />
            )}
          </div>
        ))}
      </div>
      {dirty && (
        <Button
          size="sm"
          className="h-7 text-xs gap-1 bg-secondary text-secondary-foreground"
          disabled={isPending}
          onClick={handleSave}
        >
          {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
          Sauvegarder les informations
        </Button>
      )}
    </div>
  );
};

// ── Section preuve ────────────────────────────────────────────────────────────
const PreuveSection = ({
  etape, cle, dossierId, meta, canEdit,
}: {
  etape:     string;
  cle:       string;
  dossierId: string;
  meta:      Record<string, string>;
  canEdit:   boolean;
}) => {
  const { uploadPreuve } = useSousEtapes(dossierId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const preuveUrl = meta.preuve_url as string | undefined;
  const preuveNom = meta.preuve_nom as string | undefined;

  // get config label for notifications
  const cfgAll = Object.values(SOUS_ETAPES_CONFIG).flat();
  const cfgLabel = cfgAll.find(c => c.cle === cle)?.label ?? cle;

  const handleFile = (f: File) => {
    uploadPreuve.mutate(
      { etape, cle, file: f },
      {
        onSuccess: () => notif.preuveJointe(cfgLabel, f.name),
        onError:   (e: any) => notif.erreur(e?.message ?? "Le fichier n'a pas pu être envoyé. Réessayez."),
      }
    );
  };

  return (
    <div className="rounded-xl border border-border/40 bg-muted/20 p-3 space-y-2">
      <p className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
        <Paperclip className="w-3 h-3" /> Preuve / justificatif
      </p>

      {preuveUrl ? (
        <div className="flex items-center gap-2 text-xs">
          <FileText className="w-4 h-4 text-success flex-shrink-0" />
          <span className="flex-1 truncate text-foreground font-medium">{preuveNom ?? "Fichier joint"}</span>
          <button
            type="button"
            onClick={() => openDocument(preuveUrl).catch((e: Error) => notif.erreur(e.message))}
            className="flex items-center gap-1 text-secondary hover:underline font-medium"
          >
            <ExternalLink className="w-3 h-3" /> Ouvrir
          </button>
          {canEdit && (
            <button
              className="text-[10px] text-muted-foreground hover:text-secondary underline"
              onClick={() => fileRef.current?.click()}
            >
              Remplacer
            </button>
          )}
        </div>
      ) : canEdit ? (
        <div
          className={`border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-all text-xs ${
            dragging ? "border-secondary bg-secondary/5" : "border-border hover:border-secondary/50 hover:bg-muted/30"
          }`}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
        >
          {uploadPreuve.isPending ? (
            <div className="flex items-center justify-center gap-2 text-secondary">
              <Loader2 className="w-4 h-4 animate-spin" /> Envoi en cours…
            </div>
          ) : (
            <>
              <Upload className="w-4 h-4 text-muted-foreground/50 mx-auto mb-1" />
              <p className="text-muted-foreground">Glisser ou cliquer pour joindre une preuve</p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">PDF, JPG, PNG</p>
            </>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground/60 italic">Aucune preuve jointe</p>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />
    </div>
  );
};

// ── Section timing du responsable ────────────────────────────────────────────
const TimingSection = ({
  data, onSave, isPending,
}: {
  data:      SousEtape | undefined;
  onSave:    (deadline: string | null) => void;
  isPending: boolean;
}) => {
  const [dl, setDl] = useState(data?.deadline ? data.deadline.slice(0, 10) : "");
  const [editing, setEditing] = useState(false);

  const isRetard = data?.deadline && data.statut !== "valide" && isAfter(new Date(), new Date(data.deadline));
  const daysLeft = data?.deadline && data.statut !== "valide"
    ? differenceInDays(new Date(data.deadline), new Date())
    : null;

  return (
    <div className="rounded-xl border border-border/40 bg-muted/20 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
          <Timer className="w-3 h-3" /> Mon délai cible
        </p>
        {!editing && (
          <button
            className="text-[10px] text-secondary hover:underline"
            onClick={() => setEditing(true)}
          >
            {data?.deadline ? "Modifier" : "Définir"}
          </button>
        )}
      </div>

      {data?.deadline && !editing ? (
        <div className={`flex items-center gap-2 text-xs font-medium ${isRetard ? "text-amber-600" : daysLeft !== null && daysLeft <= 2 ? "text-orange-500" : "text-foreground"}`}>
          <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
          {format(new Date(data.deadline), "dd MMM yyyy HH:mm", { locale: fr })}
          {daysLeft !== null && !isRetard && (
            <span className="text-muted-foreground font-normal">
              — {daysLeft <= 0 ? "aujourd'hui" : `${daysLeft}j restant${daysLeft > 1 ? "s" : ""}`}
            </span>
          )}
          {isRetard && (
            <span className="text-amber-600 font-semibold flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Retard
            </span>
          )}
        </div>
      ) : !editing ? (
        <p className="text-[11px] text-muted-foreground/60 italic">Aucun délai défini</p>
      ) : null}

      {editing && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={dl}
            onChange={e => setDl(e.target.value)}
            className="h-7 text-xs bg-card flex-1"
          />
          <Button
            size="sm"
            className="h-7 text-xs gap-1 bg-secondary text-secondary-foreground px-3"
            disabled={isPending}
            onClick={() => { onSave(dl ? new Date(dl).toISOString() : null); setEditing(false); }}
          >
            {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "OK"}
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => setEditing(false)}>
            ✕
          </Button>
        </div>
      )}
    </div>
  );
};

// ── Carte sous-étape ─────────────────────────────────────────────────────────
const SousEtapeCard = ({
  etape,
  config,
  data,
  users,
  canManage,
  dossierId,
  peutPrendre,
  peutAssigner,
  clientDossier,
}: {
  etape:      string;
  config:     SousEtapeConfig;
  data:       SousEtape | undefined;
  users:      { id: string; nom: string; profil: string }[];
  canManage:  boolean;
  dossierId:  string;
  peutPrendre: boolean;
  /** Direction, responsable du dossier ou intervenant de l'étape : peut désigner qui fait la tâche */
  peutAssigner: boolean;
  clientDossier: string;
}) => {
  const currentUser  = getStoredUser();
  const { update, prendre } = useSousEtapes(dossierId);
  const lien = useLiensExternes()[`${etape}.${config.cle}`];
  const isResponsable = data?.responsableId === currentUser?.id;
  const canEdit      = canManage || isResponsable;

  const [expanded,     setExpanded]     = useState(false);
  const [showAssign,   setShowAssign]   = useState(false);
  const [assignee,     setAssignee]     = useState(data?.responsableId ?? "__none__");
  const [deadline,     setDeadline]     = useState(data?.deadline ? data.deadline.slice(0, 10) : "");
  const [showPvc,      setShowPvc]      = useState(false);
  const [showPaiement, setShowPaiement] = useState(false);
  const [showGatePass, setShowGatePass] = useState(false);
  const [showFacture,  setShowFacture]  = useState(false);
  const [showReglement, setShowReglement] = useState(false);
  const [notes,        setNotes]        = useState(data?.notes ?? "");

  const statut    = data?.statut ?? "todo";
  const isPending = update.isPending || prendre.isPending;
  const onErr = { onError: (e: any) => notif.erreur(e?.message ?? "Opération impossible") };
  const isRetard  = data?.deadline && data.statut !== "valide" && isAfter(new Date(), new Date(data.deadline));
  const meta      = (data?.metadata ?? {}) as Record<string, string>;

  const handleValidate = () => {
    if (config.hasPvcResult)        { setShowPvc(true);      return; }
    if (config.hasModePaiement)     { setShowPaiement(true); return; }
    if (config.hasImmatriculation)  { setShowGatePass(true); return; }
    if (config.facture)             { setShowFacture(true);  return; }
    if (config.reglementClient)     { setShowReglement(true); return; }
    update.mutate(
      { etape, cle: config.cle, data: { statut: "valide" } },
      { onSuccess: () => notif.sousEtapeValidee(config.label), ...onErr }
    );
  };

  return (
    <>
      {showPvc && (
        <PvcDialog
          loading={isPending}
          onCancel={() => setShowPvc(false)}
          onConfirm={({ resultat, motif }) => {
            const newStatut = resultat === "succes" ? "valide" : "rejete";
            update.mutate(
              { etape, cle: config.cle, data: { statut: newStatut, metadata: { pvc_resultat: resultat, pvc_motif: motif } } },
              { onSuccess: () => {
                  setShowPvc(false);
                  if (newStatut === "valide") notif.sousEtapeValidee(config.label);
                  else notif.sousEtapeRejetee(config.label);
                }
              }
            );
          }}
        />
      )}
      {showPaiement && (
        <PaiementDialog
          loading={isPending}
          meta={meta}
          onCancel={() => setShowPaiement(false)}
          onConfirm={metadata => {
            update.mutate(
              { etape, cle: config.cle, data: { statut: "valide", metadata } },
              { onSuccess: () => { setShowPaiement(false); notif.sousEtapeValidee(config.label); }, ...onErr }
            );
          }}
        />
      )}
      {showGatePass && (
        <GatePassDialog
          loading={isPending}
          meta={meta}
          onCancel={() => setShowGatePass(false)}
          onConfirm={(metadata, n) => {
            update.mutate(
              { etape, cle: config.cle, data: { statut: "valide", metadata, notes: n || undefined } },
              { onSuccess: () => { setShowGatePass(false); notif.sousEtapeValidee(config.label); }, ...onErr }
            );
          }}
        />
      )}
      {showReglement && (
        <ReglementClientDialog
          loading={isPending}
          meta={meta}
          clientParDefaut={clientDossier}
          onCancel={() => setShowReglement(false)}
          onConfirm={metadata => {
            update.mutate(
              { etape, cle: config.cle, data: { statut: "valide", metadata } },
              { onSuccess: () => { setShowReglement(false); notif.sousEtapeValidee(config.label); }, ...onErr }
            );
          }}
        />
      )}
      {showFacture && config.facture && (
        <FactureCieDialog
          loading={isPending}
          meta={meta}
          champs={config.facture}
          titre={config.facture.titre}
          onCancel={() => setShowFacture(false)}
          onConfirm={metadata => {
            update.mutate(
              { etape, cle: config.cle, data: { statut: "valide", metadata } },
              { onSuccess: () => { setShowFacture(false); notif.sousEtapeValidee(config.label); }, ...onErr }
            );
          }}
        />
      )}

      <div className={`rounded-xl border transition-all ${
        statut === "valide"   ? "border-success/20 bg-success/[0.03]" :
        statut === "rejete"   ? "border-destructive/20 bg-destructive/[0.03]" :
        statut === "en_cours" ? "border-blue-200/60 bg-blue-50/30" :
        "border-border/50 bg-muted/20"
      } ${isRetard ? "ring-1 ring-amber-300" : ""}`}>

        {/* Header */}
        <div
          className="flex items-center gap-3 p-3 cursor-pointer select-none"
          onClick={() => setExpanded(e => !e)}
        >
          <StatutIcon statut={statut} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-sm font-semibold leading-tight ${statut === "todo" ? "text-muted-foreground" : "text-foreground"}`}>
                {config.label}
              </span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUT_COLORS[statut]}`}>
                {STATUT_LABELS[statut]}
              </span>
              {isRetard && (
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                  <AlertTriangle className="w-2.5 h-2.5" /> Retard
                </span>
              )}
              {isResponsable && (
                <span className="text-[10px] font-semibold text-secondary bg-secondary/10 border border-secondary/20 px-1.5 py-0.5 rounded-full">
                  Votre étape
                </span>
              )}
              {!isResponsable && data?.responsable && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <UserCheck className="w-2.5 h-2.5" />
                  {data.responsable.nom}
                </span>
              )}
              {data?.deadline && (
                <span className={`text-[10px] flex items-center gap-1 ${isRetard ? "text-amber-600" : "text-muted-foreground"}`}>
                  <Calendar className="w-2.5 h-2.5" />
                  {format(new Date(data.deadline), "dd MMM yyyy HH:mm", { locale: fr })}
                </span>
              )}
              {meta.preuve_url && (
                <span className="text-[10px] text-success flex items-center gap-1">
                  <Paperclip className="w-2.5 h-2.5" /> Preuve jointe
                </span>
              )}
            </div>

            {/* Métadonnées PVC */}
            {meta.pvc_resultat && (
              <p className={`text-[10px] mt-0.5 font-medium ${meta.pvc_resultat === "succes" ? "text-success" : "text-destructive"}`}>
                RVC : {meta.pvc_resultat === "succes" ? "Succès" : "Rejet"} — {meta.pvc_motif}
              </p>
            )}
            {meta.mode_paiement && (
              <p className="text-[10px] mt-0.5 text-muted-foreground">
                Mode : {meta.mode_paiement === "virement" ? "Virement" : meta.mode_paiement === "cash" ? "Cash" : "Autres"}{meta.reference ? ` · Réf : ${meta.reference}` : ""}
              </p>
            )}
            {meta.enregistrement_type && (
              <p className="text-[10px] mt-0.5 text-success font-medium">
                ✓ {meta.enregistrement_type === "paiement_douane" ? "Paiement douane enregistré en Finance"
                  : meta.enregistrement_type === "paiement_compagnie" ? "Paiement compagnie enregistré en Finance"
                  : meta.enregistrement_type === "reglement_client" ? "Règlement client enregistré (CRM)"
                  : `Gate pass ${meta.gate_pass_numero ?? ""} enregistré`}
              </p>
            )}
            {meta.immatriculation && (
              <p className="text-[10px] mt-0.5 text-muted-foreground font-mono">
                Immat : {meta.immatriculation}
              </p>
            )}
            {/* Chronométrage précis de la tâche */}
            {(data?.startedAt || data?.completedAt) && (
              <p className="text-[10px] mt-0.5 text-muted-foreground font-mono" data-testid={`chrono-${config.cle}`}>
                {data?.startedAt && <>Début {dateHeure(data.startedAt)}</>}
                {data?.completedAt
                  ? <> · Fin {dateHeure(data.completedAt)}{data?.startedAt && <> · <span className="text-success font-semibold">{dureeEntre(data.startedAt, data.completedAt)}</span></>}</>
                  : data?.startedAt && <> · en cours depuis {dureeEntre(data.startedAt)}</>}
              </p>
            )}
          </div>

          {/* Actions rapides */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {statut !== "valide" && (canManage || peutAssigner) && (
              <button
                title="Assigner"
                className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-secondary transition-colors"
                onClick={e => { e.stopPropagation(); setShowAssign(v => !v); if (!expanded) setExpanded(true); }}
              >
                <UserCheck className="w-3.5 h-3.5" />
              </button>
            )}
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
          </div>
        </div>

        {/* Corps expandé */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              key="expanded-body"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="px-3 pb-3 pt-2 border-t border-border/10 space-y-3">

                {/* Description */}
                <p className="text-[11px] text-muted-foreground leading-relaxed">{config.description}</p>

                {/* Redirection vers le site externe de l'étape (ex. portail de soumission) */}
                {lien && urlValide(lien.url) && (
                  <a href={lien.url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground hover:opacity-90">
                    <ExternalLink className="w-3.5 h-3.5" /> {lien.label}
                  </a>
                )}

                {/* Output attendu */}
                {config.outputLabel && (
                  <div className="flex items-center gap-1.5 text-[11px] bg-secondary/5 border border-secondary/15 rounded-lg px-2.5 py-1.5 text-secondary">
                    <FileText className="w-3 h-3 flex-shrink-0" />
                    <span><strong>Document attendu :</strong> {config.outputLabel}</span>
                  </div>
                )}

                {/* Revue : tout ce qui a été saisi sur la tâche */}
                <RevueInformations config={config} data={data} />

                {/* Informations de l'étape (responsable ou canManage) */}
                {canEdit && (
                  <StepInfoSection
                    key={data?.updatedAt}
                    config={config}
                    meta={meta}
                    isPending={isPending}
                    onSave={patch => update.mutate(
                      { etape, cle: config.cle, data: { metadata: patch } },
                      { onSuccess: () => notif.infoSauvegardee(config.label) }
                    )}
                  />
                )}

                {/* Timing — responsable peut définir son propre délai */}
                {isResponsable && statut !== "valide" && (
                  <TimingSection
                    key={data?.deadline ?? "no-dl"}
                    data={data}
                    isPending={isPending}
                    onSave={dl => update.mutate(
                      { etape, cle: config.cle, data: { deadline: dl } },
                      { onSuccess: () => dl
                          ? notif.delaiDefini(config.label, format(new Date(dl), "dd MMM yyyy", { locale: fr }))
                          : notif.infoSauvegardee(config.label)
                      }
                    )}
                  />
                )}

                {/* Preuve upload */}
                {canEdit && (
                  <PreuveSection
                    etape={etape}
                    cle={config.cle}
                    dossierId={dossierId}
                    meta={meta}
                    canEdit={canEdit}
                  />
                )}

                {/* Panel Assignation (DG/Exploitation seulement) */}
                {showAssign && (canManage || peutAssigner) && statut !== "valide" && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-secondary/20 bg-secondary/5 p-3 space-y-2.5"
                  >
                    <p className="text-[11px] font-semibold text-secondary flex items-center gap-1.5">
                      <UserCheck className="w-3 h-3" /> {canManage ? "Assignation du responsable" : "Passer le relais : qui fait cette tâche ?"}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-medium text-muted-foreground">Responsable</Label>
                        <Select value={assignee} onValueChange={setAssignee}>
                          <SelectTrigger className="h-8 text-xs bg-card">
                            <SelectValue placeholder="Choisir..." />
                          </SelectTrigger>
                          <SelectContent>
                            {canManage && <SelectItem value="__none__">— Aucun —</SelectItem>}
                            {users.map(u => (
                              <SelectItem key={u.id} value={u.id}>{u.nom}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-medium text-muted-foreground">Délai cible</Label>
                        <Input
                          type="date"
                          value={deadline}
                          onChange={e => setDeadline(e.target.value)}
                          className="h-8 text-xs bg-card"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-medium text-muted-foreground">Note interne (optionnel)</Label>
                      <Input
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder="Instructions ou précisions pour le responsable..."
                        className="h-8 text-xs bg-card"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 h-7 text-xs bg-secondary text-secondary-foreground gap-1"
                        disabled={isPending || (!canManage && (!assignee || assignee === "__none__"))}
                        onClick={() => {
                          const newResp = (assignee && assignee !== "__none__") ? assignee : null;
                          const respNom = users.find(u => u.id === newResp)?.nom ?? "";
                          update.mutate(
                            { etape, cle: config.cle, data: {
                              responsableId: newResp,
                              deadline: deadline ? new Date(deadline).toISOString() : null,
                              notes: notes || null,
                              // Direction : la tâche passe « en cours » ; passage de relais : seule l'assignation change
                              ...(canManage ? { statut: statut === "todo" ? "en_cours" as const : statut } : {}),
                            }},
                            { onSuccess: () => {
                                setShowAssign(false);
                                if (newResp && respNom) notif.responsableAssigne(config.label, respNom);
                                else if (deadline) notif.delaiDefini(config.label, format(new Date(deadline), "dd MMM yyyy", { locale: fr }));
                                else notif.infoSauvegardee(config.label);
                              }
                            }
                          );
                        }}
                      >
                        {isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                        Enregistrer
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs px-3" onClick={() => setShowAssign(false)}>
                        Annuler
                      </Button>
                    </div>
                  </motion.div>
                )}

                {/* Boutons de progression — chaque titulaire termine lui-même sa tâche */}
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  {/* Tâche non attribuée relevant de mon profil : je la prends en charge */}
                  {!data?.responsableId && peutPrendre && !canManage && statut !== "valide" && (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                      disabled={isPending}
                      onClick={() => prendre.mutate(
                        { etape, cle: config.cle },
                        { onSuccess: () => notif.sousEtapeDemarree(config.label), ...onErr }
                      )}>
                      {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Hand className="w-3 h-3" />}
                      Prendre en charge
                    </Button>
                  )}

                  {statut === "todo" && isResponsable && (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                      disabled={isPending}
                      onClick={() => update.mutate(
                        { etape, cle: config.cle, data: { statut: "en_cours" } },
                        { onSuccess: () => notif.sousEtapeDemarree(config.label), ...onErr }
                      )}>
                      {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <PlayCircle className="w-3 h-3" />}
                      Démarrer
                    </Button>
                  )}

                  {/* Le titulaire (ou la Direction) termine la tâche */}
                  {(statut === "todo" || statut === "en_cours") && canEdit && (
                    <Button size="sm"
                      className="h-7 text-xs gap-1 bg-success text-white hover:bg-success/90"
                      disabled={isPending}
                      onClick={handleValidate}
                    >
                      {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                      {canManage && !isResponsable ? "Valider (Direction)" : "Terminer la tâche"}
                    </Button>
                  )}

                  {/* Le titulaire peut signaler un blocage */}
                  {statut === "en_cours" && isResponsable && !config.hasPvcResult && (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-destructive"
                      disabled={isPending}
                      onClick={() => update.mutate(
                        { etape, cle: config.cle, data: { statut: "rejete" } },
                        { onSuccess: () => notif.sousEtapeRejetee(config.label), ...onErr }
                      )}>
                      <XCircle className="w-3 h-3" />
                      Signaler un blocage
                    </Button>
                  )}

                  {/* Correction d'une tâche validée : titulaire ou Direction */}
                  {statut === "valide" && canEdit && (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-muted-foreground"
                      disabled={isPending}
                      onClick={() => update.mutate(
                        { etape, cle: config.cle, data: { statut: "en_cours" } },
                        { onSuccess: () => notif.sousEtapeRevisee(config.label), ...onErr }
                      )}>
                      <Edit3 className="w-3 h-3" />
                      Réviser
                    </Button>
                  )}

                  {/* Relancer une tâche rejetée */}
                  {statut === "rejete" && canEdit && (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                      disabled={isPending}
                      onClick={() => update.mutate(
                        { etape, cle: config.cle, data: { statut: "en_cours" } },
                        { onSuccess: () => notif.sousEtapeRelancee(config.label), ...onErr }
                      )}>
                      <ChevronRight className="w-3 h-3" />
                      Relancer
                    </Button>
                  )}

                  {data?.completedBy && statut === "valide" && (
                    <p className="text-[10px] text-muted-foreground ml-auto">
                      Validé par {data.completedBy.nom}
                      {data.completedAt ? ` · ${format(new Date(data.completedAt), "dd MMM yyyy", { locale: fr })}` : ""}
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};

// ── Panel principal ───────────────────────────────────────────────────────────
// Clés de session pour ne pas re-alerter sur le même retard
const _alreadyNotified = new Set<string>()

export default function SousEtapesPanel({
  etape,
  dossierId,
  users,
  site,
}: {
  etape:     string;
  dossierId: string;
  users:     { id: string; nom: string; profil: string }[];
  site?:     string;
}) {
  const user       = getStoredUser();
  const canManage  = isSupervisor(user);
  const { query, byEtape } = useSousEtapes(dossierId);
  // Dossier déjà chargé par la page (responsable, client)
  const dossierInfo = useQueryClient().getQueryData<any>(["dossier", dossierId]);

  // Qui traite quoi (Administration → Attribution des étapes)
  const { data: attribution } = useQuery({
    queryKey: ["roles-attribution"],
    queryFn:  () => api.get<any>("/api/roles/attribution"),
    staleTime: 5 * 60_000,
  });
  const profilDe = (cle: string): string | undefined =>
    attribution?.etapes?.find((e: any) => e.etape === etape)?.sousEtapes?.find((x: any) => x.cle === cle)?.profil;

  // Détection des retards à chaque chargement des données
  useEffect(() => {
    if (!query.data) return;
    const now = new Date();
    const retards = query.data.filter(s =>
      s.etape === etape &&
      s.deadline &&
      s.statut !== "valide" &&
      isAfter(now, new Date(s.deadline))
    );
    const nouvRetards = retards.filter(s => {
      const key = `${dossierId}::${s.etape}::${s.cle}`
      if (_alreadyNotified.has(key)) return false
      _alreadyNotified.add(key)
      return true
    });
    if (nouvRetards.length === 1) {
      const cfg = SOUS_ETAPES_CONFIG[etape]?.find(c => c.cle === nouvRetards[0].cle);
      notif.retardUnique(cfg?.label ?? nouvRetards[0].cle);
    } else if (nouvRetards.length > 1) {
      notif.retardMultiple(nouvRetards.length);
    }
  }, [query.data, etape, dossierId]);

  const configs = applicableConfigs(etape, site);
  const rows    = byEtape(etape);
  const isDone  = configs.length > 0 && configs.every(c => rows.find(r => r.cle === c.cle)?.statut === "valide");

  if (configs.length === 0) return null;

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Chargement des sous-étapes...
      </div>
    );
  }

  const parties    = [...new Set(configs.map(c => c.partieLabel).filter(Boolean))] as string[];
  const hasParties = parties.length > 0;

  const renderConfig = (cfg: SousEtapeConfig) => {
    const rowData = rows.find(r => r.cle === cfg.cle);
    return (
      <SousEtapeCard
        key={cfg.cle}
        etape={etape}
        config={cfg}
        data={rowData}
        users={users}
        canManage={canManage}
        dossierId={dossierId}
        peutPrendre={!!user && profilDe(cfg.cle) === user.profil}
        peutAssigner={canManage || (!!user && (dossierInfo?.responsableId === user.id || rows.some(r => r.responsableId === user.id)))}
        clientDossier={dossierInfo?.client ?? ""}
      />
    );
  };

  return (
    <div className="space-y-2.5 mt-3 pt-3 border-t border-border/10">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Sous-étapes ({configs.filter(c => rows.find(r => r.cle === c.cle)?.statut === "valide").length}/{configs.length} validées)
        </p>
        {isDone && (
          <span className="text-[10px] font-bold text-success bg-success/10 border border-success/20 px-2 py-0.5 rounded-full flex items-center gap-1">
            <CheckCircle2 className="w-2.5 h-2.5" /> Toutes validées
          </span>
        )}
        {!isDone && rows.some(r => r.responsableId === user?.id && r.statut !== "valide") && (
          <span className="text-[10px] text-secondary bg-secondary/10 border border-secondary/20 px-2 py-0.5 rounded-full flex items-center gap-1">
            <AlertCircle className="w-2.5 h-2.5" /> Des tâches vous attendent
          </span>
        )}
      </div>

      {hasParties ? (
        parties.map(partieLabel => {
          const partieConfigs = configs.filter(c => c.partieLabel === partieLabel);
          const lettre        = partieConfigs[0]?.partie;
          return (
            <div key={partieLabel} className="space-y-1.5">
              <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                <div className="w-5 h-5 rounded-md bg-secondary/20 text-secondary flex items-center justify-center text-[9px] font-black">{lettre}</div>
                {partieLabel}
              </div>
              {partieConfigs.map(renderConfig)}
            </div>
          );
        })
      ) : (
        configs.map(renderConfig)
      )}
    </div>
  );
}
