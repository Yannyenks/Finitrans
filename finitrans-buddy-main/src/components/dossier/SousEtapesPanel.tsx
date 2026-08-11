import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2, Clock, AlertTriangle, UserCheck, Calendar,
  ChevronDown, ChevronRight, FileText, Loader2, Edit3,
  XCircle, PlayCircle, AlertCircle, Receipt, Stamp, Upload,
  Paperclip, ExternalLink, Timer,
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
import { getStoredUser } from "@/lib/api";
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
  outputLabel?:        string;
  fields?:             FieldDef[];
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
      cle: "paiement_client", label: "Paiement par le client", description: "Confirmation du règlement client avant engagement SGS",
      fields: [
        { key: "pc_montant",    label: "Montant reçu (XAF)",   type: "number", placeholder: "0" },
        { key: "pc_date",       label: "Date de paiement",      type: "date" },
        { key: "pc_reference",  label: "Référence / N° virement", type: "text", placeholder: "Ex : VIR-2025-00421" },
        { key: "pc_mode",       label: "Mode de règlement",     type: "text", placeholder: "Virement, Chèque, Espèces…" },
      ],
    },
    {
      cle: "traitement_sgs", label: "Traitement SGS", description: "Soumission et traitement du dossier par la Société Générale de Surveillance",
      fields: [
        { key: "sgs_reference",  label: "Référence SGS",       type: "text", placeholder: "Ex : SGS-CM-2025-0042" },
        { key: "sgs_date_soum",  label: "Date de soumission",  type: "date" },
        { key: "sgs_date_retour",label: "Date de retour prévu",type: "date" },
      ],
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
      cle: "pvc", label: "Obtention du PVC",
      description: "Réception du Procès-Verbal de Constatation délivré par la SGS", hasPvcResult: true,
      fields: [
        { key: "pvc_numero",       label: "N° PVC",             type: "text", placeholder: "Ex : PVC-2025-0042" },
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
      cle: "facturation_terminal", label: "Facturation & paiement (redevance portuaire)",
      description: "Règlement des redevances portuaires auprès du terminal (KCT Kribi ou RTC Douala)", partie: "B", partieLabel: "Terminal Portuaire (KCT / RTC)",
      fields: [
        { key: "term_facture_numero", label: "N° Facture terminal", type: "text",   placeholder: "Ex : KCT-INV-2025-0042" },
        { key: "term_montant",        label: "Montant (XAF)",       type: "number", placeholder: "0" },
        { key: "term_date_paiement",  label: "Date de paiement",    type: "date" },
      ],
    },
    {
      cle: "bon_livraison", label: "Bon de livraison",
      description: "Obtention du bon de livraison terminal autorisant l'enlèvement physique de la marchandise", partie: "B", partieLabel: "Terminal Portuaire (KCT / RTC)",
      fields: [
        { key: "bl_term_numero",    label: "N° Bon de livraison",  type: "text", placeholder: "Ex : BL-T-2025-0042" },
        { key: "bl_term_date",      label: "Date d'obtention",     type: "date" },
        { key: "bl_term_observations", label: "Observations",      type: "textarea", placeholder: "État de la marchandise, réserves…" },
      ],
    },
    {
      cle: "gate_pass", label: "Gate Pass — Ticket de sortie",
      description: "Récupération du gate pass et enregistrement de l'immatriculation du véhicule", partie: "B", partieLabel: "Terminal Portuaire (KCT / RTC)",
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
            <h3 className="font-display font-bold text-foreground">Résultat du PVC</h3>
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
              placeholder={resultat === "succes" ? "Ex : PVC N°2025-0847 reçu — marchandise conforme à la déclaration" : "Ex : Non-conformité documentaire — facture proforma incomplète"}
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

// ── Dialogue Mode de Paiement ────────────────────────────────────────────────
const PaiementDialog = ({
  onConfirm, onCancel, loading,
}: {
  onConfirm: (data: { mode: string; reference: string }) => void;
  onCancel:  () => void;
  loading:   boolean;
}) => {
  const [mode,      setMode]      = useState("virement");
  const [reference, setReference] = useState("");

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card rounded-2xl p-6 w-full max-w-md shadow-2xl border border-border"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center">
            <Receipt className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h3 className="font-display font-bold text-foreground">Paiement des droits & taxes</h3>
            <p className="text-xs text-muted-foreground">Quittance de paiement au Trésor Public</p>
          </div>
        </div>

        <div className="space-y-4">
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
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              Un document justificatif doit être joint en preuve de paiement.
            </motion.div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              {mode === "virement" ? "N° de virement / référence bancaire *" :
               mode === "cash"     ? "N° de quittance *" :
               "Référence / description du mode de paiement *"}
            </Label>
            <Input
              value={reference}
              onChange={e => setReference(e.target.value)}
              placeholder={
                mode === "virement" ? "Ex : VIR-2025-004821" :
                mode === "cash"     ? "Ex : QTT-2025-00987" :
                "Ex : Compensation créance client N°..."
              }
              className="bg-muted/40"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              onClick={() => onConfirm({ mode, reference })}
              disabled={!reference.trim() || loading}
              className="flex-1 gap-1.5 bg-secondary text-secondary-foreground"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Valider le paiement
            </Button>
            <Button variant="outline" onClick={onCancel} className="px-4">Annuler</Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// ── Dialogue Gate Pass ────────────────────────────────────────────────────────
const GatePassDialog = ({
  onConfirm, onCancel, loading,
}: {
  onConfirm: (data: { immatriculation: string; notes?: string }) => void;
  onCancel:  () => void;
  loading:   boolean;
}) => {
  const [immat, setImmat] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card rounded-2xl p-6 w-full max-w-md shadow-2xl border border-border"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-teal-100 flex items-center justify-center">
            <FileText className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <h3 className="font-display font-bold text-foreground">Gate Pass — Ticket de sortie</h3>
            <p className="text-xs text-muted-foreground">Enregistrement du véhicule de transport</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Immatriculation du véhicule *</Label>
            <Input
              value={immat}
              onChange={e => setImmat(e.target.value.toUpperCase())}
              placeholder="Ex : LT 1234 A"
              className="bg-muted/40 font-mono uppercase text-base tracking-widest"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Observations (optionnel)</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ex : Camion plateau — chauffeur M. DUPONT — heure de sortie 14h30"
              className="bg-muted/40 text-sm h-16 resize-none"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              onClick={() => onConfirm({ immatriculation: immat, notes })}
              disabled={!immat.trim() || loading}
              className="flex-1 gap-1.5 bg-secondary text-secondary-foreground"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Enregistrer le Gate Pass
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
  if (fields.length === 0) return null;

  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    fields.forEach(f => { init[f.key] = (meta[f.key] as string) ?? ""; });
    return init;
  });
  const [dirty, setDirty] = useState(false);

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
        onError:   () => notif.erreur("Le fichier n'a pas pu être envoyé. Réessayez."),
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
          <a
            href={preuveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-secondary hover:underline font-medium"
          >
            <ExternalLink className="w-3 h-3" /> Ouvrir
          </a>
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
          {format(new Date(data.deadline), "dd MMM yyyy", { locale: fr })}
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
}: {
  etape:      string;
  config:     SousEtapeConfig;
  data:       SousEtape | undefined;
  users:      { id: string; nom: string; profil: string }[];
  canManage:  boolean;
  dossierId:  string;
}) => {
  const currentUser  = getStoredUser();
  const { update }   = useSousEtapes(dossierId);
  const isResponsable = data?.responsableId === currentUser?.id;
  const canEdit      = canManage || isResponsable;

  const [expanded,     setExpanded]     = useState(false);
  const [showAssign,   setShowAssign]   = useState(false);
  const [assignee,     setAssignee]     = useState(data?.responsableId ?? "__none__");
  const [deadline,     setDeadline]     = useState(data?.deadline ? data.deadline.slice(0, 10) : "");
  const [showPvc,      setShowPvc]      = useState(false);
  const [showPaiement, setShowPaiement] = useState(false);
  const [showGatePass, setShowGatePass] = useState(false);
  const [notes,        setNotes]        = useState(data?.notes ?? "");

  const statut    = data?.statut ?? "todo";
  const isPending = update.isPending;
  const isRetard  = data?.deadline && data.statut !== "valide" && isAfter(new Date(), new Date(data.deadline));
  const meta      = (data?.metadata ?? {}) as Record<string, string>;

  const handleValidate = () => {
    if (config.hasPvcResult)        { setShowPvc(true);      return; }
    if (config.hasModePaiement)     { setShowPaiement(true); return; }
    if (config.hasImmatriculation)  { setShowGatePass(true); return; }
    update.mutate(
      { etape, cle: config.cle, data: { statut: "valide" } },
      { onSuccess: () => notif.sousEtapeValidee(config.label) }
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
          onCancel={() => setShowPaiement(false)}
          onConfirm={({ mode, reference }) => {
            update.mutate(
              { etape, cle: config.cle, data: { statut: "valide", metadata: { mode_paiement: mode, reference } } },
              { onSuccess: () => { setShowPaiement(false); notif.sousEtapeValidee(config.label); } }
            );
          }}
        />
      )}
      {showGatePass && (
        <GatePassDialog
          loading={isPending}
          onCancel={() => setShowGatePass(false)}
          onConfirm={({ immatriculation, notes: n }) => {
            update.mutate(
              { etape, cle: config.cle, data: { statut: "valide", metadata: { immatriculation }, notes: n || undefined } },
              { onSuccess: () => { setShowGatePass(false); notif.sousEtapeValidee(config.label); } }
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
                  {format(new Date(data.deadline), "dd MMM yyyy", { locale: fr })}
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
                PVC : {meta.pvc_resultat === "succes" ? "Succès" : "Rejet"} — {meta.pvc_motif}
              </p>
            )}
            {meta.mode_paiement && (
              <p className="text-[10px] mt-0.5 text-muted-foreground">
                Mode : {meta.mode_paiement === "virement" ? "Virement" : meta.mode_paiement === "cash" ? "Cash" : "Autres"}{meta.reference ? ` · Réf : ${meta.reference}` : ""}
              </p>
            )}
            {meta.immatriculation && (
              <p className="text-[10px] mt-0.5 text-muted-foreground font-mono">
                Immat : {meta.immatriculation}
              </p>
            )}
          </div>

          {/* Actions rapides */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {statut !== "valide" && canManage && (
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

                {/* Output attendu */}
                {config.outputLabel && (
                  <div className="flex items-center gap-1.5 text-[11px] bg-secondary/5 border border-secondary/15 rounded-lg px-2.5 py-1.5 text-secondary">
                    <FileText className="w-3 h-3 flex-shrink-0" />
                    <span><strong>Document attendu :</strong> {config.outputLabel}</span>
                  </div>
                )}

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
                {isResponsable && !canManage && statut !== "valide" && (
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
                {showAssign && canManage && statut !== "valide" && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-secondary/20 bg-secondary/5 p-3 space-y-2.5"
                  >
                    <p className="text-[11px] font-semibold text-secondary flex items-center gap-1.5">
                      <UserCheck className="w-3 h-3" /> Assignation du responsable
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-medium text-muted-foreground">Responsable</Label>
                        <Select value={assignee} onValueChange={setAssignee}>
                          <SelectTrigger className="h-8 text-xs bg-card">
                            <SelectValue placeholder="Choisir..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— Aucun —</SelectItem>
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
                        disabled={isPending}
                        onClick={() => {
                          const newResp = (assignee && assignee !== "__none__") ? assignee : null;
                          const respNom = users.find(u => u.id === newResp)?.nom ?? "";
                          update.mutate(
                            { etape, cle: config.cle, data: {
                              responsableId: newResp,
                              deadline: deadline ? new Date(deadline).toISOString() : null,
                              notes: notes || null,
                              statut: statut === "todo" ? "en_cours" : statut,
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

                {/* Boutons de progression */}
                <div className="flex items-center gap-2 pt-1">
                  {/* Responsable: peut Démarrer sa propre étape */}
                  {statut === "todo" && isResponsable && !canManage && (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                      disabled={isPending}
                      onClick={() => update.mutate(
                        { etape, cle: config.cle, data: { statut: "en_cours" } },
                        { onSuccess: () => notif.sousEtapeDemarree(config.label) }
                      )}>
                      {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <PlayCircle className="w-3 h-3" />}
                      Démarrer
                    </Button>
                  )}

                  {/* DG/Exploitation: peut Valider directement */}
                  {(statut === "todo" || statut === "en_cours") && canManage && (
                    <Button size="sm"
                      className="h-7 text-xs gap-1 bg-success text-white hover:bg-success/90"
                      disabled={isPending}
                      onClick={handleValidate}
                    >
                      {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                      Valider
                    </Button>
                  )}

                  {/* Responsable en cours: info sur qui valide */}
                  {statut === "en_cours" && isResponsable && !canManage && (
                    <span className="text-[10px] text-muted-foreground italic flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Validation par le DG / Exploitation
                    </span>
                  )}

                  {/* DG/Exploitation: peut Réviser une étape validée */}
                  {statut === "valide" && canManage && (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-muted-foreground"
                      disabled={isPending}
                      onClick={() => update.mutate(
                        { etape, cle: config.cle, data: { statut: "en_cours" } },
                        { onSuccess: () => notif.sousEtapeRevisee(config.label) }
                      )}>
                      <Edit3 className="w-3 h-3" />
                      Réviser
                    </Button>
                  )}

                  {/* Responsable ou DG/Exploitation: peut Relancer une étape rejetée */}
                  {statut === "rejete" && (canManage || isResponsable) && (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                      disabled={isPending}
                      onClick={() => update.mutate(
                        { etape, cle: config.cle, data: { statut: "en_cours" } },
                        { onSuccess: () => notif.sousEtapeRelancee(config.label) }
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
}: {
  etape:     string;
  dossierId: string;
  users:     { id: string; nom: string; profil: string }[];
}) {
  const user       = getStoredUser();
  const canManage  = user?.profil === "dg" || user?.profil === "exploitation";
  const { query, byEtape, allValidated } = useSousEtapes(dossierId);

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

  const configs = SOUS_ETAPES_CONFIG[etape] ?? [];
  const rows    = byEtape(etape);
  const isDone  = allValidated(etape, configs.length);

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
      />
    );
  };

  return (
    <div className="space-y-2.5 mt-3 pt-3 border-t border-border/10">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Sous-étapes ({rows.filter(r => r.statut === "valide").length}/{configs.length} validées)
        </p>
        {isDone && (
          <span className="text-[10px] font-bold text-success bg-success/10 border border-success/20 px-2 py-0.5 rounded-full flex items-center gap-1">
            <CheckCircle2 className="w-2.5 h-2.5" /> Toutes validées
          </span>
        )}
        {!isDone && !canManage && (
          <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
            <AlertCircle className="w-2.5 h-2.5" /> En attente validation DG / Exploitation
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
