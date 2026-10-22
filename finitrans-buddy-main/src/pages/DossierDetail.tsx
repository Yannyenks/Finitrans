import { useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, downloadFile, getStoredUser, openDocument, uploadFile } from "@/lib/api";
import { can, isSupervisor } from "@/lib/permissions";
import {
  ArrowLeft, Ship, MapPin, Calendar, User, Package, FileText,
  MessageSquare, CheckCircle2, History, Send, ClipboardList,
  DollarSign, AlertTriangle, Loader2, ChevronRight, ChevronDown, Upload,
  Image as ImageIcon, Banknote, Plus, Code2, ShieldCheck, Landmark,
  Clock, AlertCircle, X, Container, Receipt, Pencil, Download, FileDown, Library, Lock, Share2, Trophy, Flag,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import EquipeParcours from "@/components/dossier/EquipeParcours";
import { ListeConteneurs, LigneConteneur, resumeConteneurs } from "@/components/ListeConteneurs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { motion } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import { notif } from "@/hooks/useNotification";
import DIBlock from "@/components/di/DIBlock";
import FactureDialog from "@/components/di/FactureDialog";
import SousEtapesPanel, { SOUS_ETAPES_CONFIG, applicableConfigs } from "@/components/dossier/SousEtapesPanel";
import { useSousEtapes } from "@/hooks/useSousEtapes";
import { dateHeure, delaiJHM, dureeEntre } from "@/lib/temps";
import { montant as montantDevise, tauxActuels } from "@/lib/devise";
import SuiviClientCarte from "@/components/dossier/SuiviClientCarte";

const STATUS_LABELS: Record<string, string> = {
  reception:        "Réception",
  soumission_sgs:   "Soumission SGS",
  codage:           "Codage",
  validation:       "Validation",
  paiement:         "Paiement",
  bon_compagnie:    "Bon compagnie (Douala)",
  operations_douala: "Douala", operations_kribi: "Kribi",
  cloture:          "Clôturé", facturation: "Facturation",
};
const STATUS_COLORS: Record<string, string> = {
  reception:        "bg-blue-100 text-blue-700",
  soumission_sgs:   "bg-indigo-100 text-indigo-700",
  codage:           "bg-purple-100 text-purple-700",
  validation:       "bg-amber-100 text-amber-700",
  paiement:         "bg-orange-100 text-orange-700",
  bon_compagnie:    "bg-green-100 text-green-700",
  operations_douala: "bg-cyan-100 text-cyan-700", operations_kribi: "bg-teal-100 text-teal-700",
  cloture:          "bg-gray-100 text-gray-600", facturation: "bg-violet-100 text-violet-700",
};
const STATUS_ORDER = [
  "reception", "soumission_sgs", "codage", "validation",
  "paiement", "bon_compagnie", "operations_kribi", "cloture", "facturation",
];

const STEP_CONFIG: Record<string, {
  icon: React.ElementType;
  description: string;
  iconBg: string; iconText: string; iconRing: string;
  borderActive: string; bgActive: string;
}> = {
  reception:        { icon: Package,       description: "Réception et enregistrement du dossier — vérification des documents d'arrivée",             iconBg: "bg-blue-100",   iconText: "text-blue-700",   iconRing: "ring-blue-300",   borderActive: "border-blue-200/60",   bgActive: "from-blue-50/60"   },
  soumission_sgs:   { icon: ClipboardList, description: "Soumission au Système de Gestion des Services — en attente d'approbation SGS",               iconBg: "bg-indigo-100", iconText: "text-indigo-700", iconRing: "ring-indigo-300", borderActive: "border-indigo-200/60", bgActive: "from-indigo-50/60" },
  codage:           { icon: Code2,         description: "Codage douanier et classification tarifaire de la marchandise importée",                     iconBg: "bg-purple-100", iconText: "text-purple-700", iconRing: "ring-purple-300", borderActive: "border-purple-200/60", bgActive: "from-purple-50/60" },
  validation:       { icon: ShieldCheck,   description: "Vérification des taxes, validation administrative et approbation du responsable",            iconBg: "bg-amber-100",  iconText: "text-amber-700",  iconRing: "ring-amber-300",  borderActive: "border-amber-200/60",  bgActive: "from-amber-50/60"  },
  paiement:         { icon: Landmark,      description: "Paiement des droits de douane et taxes réglementaires au Trésor Public",                     iconBg: "bg-orange-100", iconText: "text-orange-700", iconRing: "ring-orange-300", borderActive: "border-orange-200/60", bgActive: "from-orange-50/60" },
  bon_compagnie:    { icon: Ship,          description: "Obtention du bon de livraison auprès de la compagnie maritime concernée",                   iconBg: "bg-green-100",  iconText: "text-green-700",  iconRing: "ring-green-300",  borderActive: "border-green-200/60",  bgActive: "from-green-50/60"  },
  operations_douala: { icon: Ship,        description: "Opérations au terminal de Douala : redevance portuaire et bon à délivrer",                     iconBg: "bg-cyan-100",   iconText: "text-cyan-700",   iconRing: "ring-cyan-300",   borderActive: "border-cyan-200/60",   bgActive: "from-cyan-50/60"   },
  operations_kribi: { icon: MapPin,        description: "Opérations de dédouanement et de livraison au port de Kribi",                               iconBg: "bg-teal-100",   iconText: "text-teal-700",   iconRing: "ring-teal-300",   borderActive: "border-teal-200/60",   bgActive: "from-teal-50/60"   },
  cloture:          { icon: CheckCircle2,  description: "Dossier clôturé — marchandise livrée au client, opérations terminées",                      iconBg: "bg-gray-100",   iconText: "text-gray-600",   iconRing: "ring-gray-300",   borderActive: "border-gray-200/60",   bgActive: "from-gray-50/60"   },
  facturation:      { icon: Receipt,       description: "Facturation du dossier au client — facture aux couleurs FINITRANS et remise au client",              iconBg: "bg-violet-100", iconText: "text-violet-700", iconRing: "ring-violet-300", borderActive: "border-violet-200/60", bgActive: "from-violet-50/60" },
};

// ── SLA par étape (en heures) ─────────────────────────────────────────────────
const SLA_HOURS: Record<string, number> = {
  reception:        24,
  soumission_sgs:   48,
  codage:           24,
  validation:       48,
  paiement:         72,
  bon_compagnie:    48,
  operations_douala: 48, operations_kribi: 72,
  cloture:          24, facturation: 48,
};

const RETARD_MOTIFS = [
  "Coupure internet",
  "Coupure électrique",
  "Attente client",
  "Attente administration",
  "Attente SGS",
  "Problème technique interne",
  "Autre",
];

const getSLAStatus = (
  stepKey: string,
  timeline: any[],
  dossierCreatedAt: string,
  timings: any[] = [],
): { elapsedH: number; slaH: number; pct: number; status: "ok" | "warning" | "critical" } | null => {
  // Priorité au chronomètre réel de l'étape (début + durée cible paramétrée)
  const timing = [...timings].reverse().find((t: any) => t.etape === stepKey && !t.dateFin);
  if (timing) {
    const slaH = Math.max(1, Number(timing.dureePrevueJours ?? 1) * 24);
    const elapsedH = (Date.now() - new Date(timing.dateDebut).getTime()) / 3_600_000;
    const pct = Math.min(100, Math.round((elapsedH / slaH) * 100));
    return { elapsedH, slaH, pct, status: pct >= 100 ? "critical" : pct >= 80 ? "warning" : "ok" };
  }
  if (!(stepKey in SLA_HOURS)) return null;
  const slaH = SLA_HOURS[stepKey];
  const ev = timeline.find((e: any) => {
    const action = (e.action ?? e.label ?? e.type ?? "").toLowerCase();
    return action.includes(stepKey.replace(/_/g, " ")) || e.statut === stepKey || e.toStatus === stepKey;
  });
  const startDate = ev ? new Date(ev.date ?? ev.createdAt) : new Date(dossierCreatedAt);
  const elapsedH  = (Date.now() - startDate.getTime()) / 3_600_000;
  const pct       = Math.min(100, Math.round((elapsedH / slaH) * 100));
  const status    = pct >= 100 ? "critical" : pct >= 80 ? "warning" : "ok";
  return { elapsedH: Math.round(elapsedH), slaH, pct, status };
};

const TAUX_CHANGE = (): Record<string, number> => ({ XAF: 1, ...tauxActuels() });

const EVENT_LABELS: Record<string, string> = {
  ETAPE_DEBUT: "Début d'étape", ETAPE_FIN: "Fin d'étape", DOCUMENT: "Document joint",
  COMMENTAIRE: "Commentaire", PAIEMENT_DOUANE: "Paiement douane", PAIEMENT_COMPAGNIE: "Paiement compagnie",
  VIREMENT: "Virement", FACTURE: "Facture", ALERTE: "Alerte", BON_LIVRAISON: "Bon de livraison",
  BON_KRIBI: "Bon Kribi", GATE_PASS: "Gate pass", ETAT_CODAGE_CREE: "État de codage créé",
  ETAT_CODAGE_SOUMIS: "État de codage soumis", ETAT_CODAGE_VALIDE: "État de codage validé",
  ETAT_CODAGE_REJETE: "État de codage rejeté", DETENTION_DEBUT: "Début de détention",
  DETENTION_FIN: "Fin de détention", INTERCHANGE_EMIS: "Interchange émis",
  INTERCHANGE_RETOURNE: "Conteneur retourné", SGS_DEPOT: "Dépôt SGS", SGS_RESULTAT: "Résultat SGS",
};

// ── Formulaire création DI inline ─────────────────────────────────────────────
const CreateDIInline = ({
  dossier,
  onCreated,
  onCancel,
}: {
  dossier: any;
  onCreated: () => void;
  onCancel: () => void;
}) => {
  const qc = useQueryClient();
  const [montant,  setMontant]  = useState("");
  const [devise,   setDevise]   = useState<"XAF" | "EUR" | "USD">("XAF");
  const [diFile,   setDiFile]   = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [creating, setCreating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const montantXAF = montant ? Math.round(parseFloat(montant) * TAUX_CHANGE()[devise]) : 0;

  const handleCreate = async () => {
    const m = montantXAF;
    if (!m || m <= 0) {
      toast({ title: "Montant invalide", variant: "destructive" });
      return;
    }
    if (!diFile) {
      toast({
        title: "Document obligatoire",
        description: "Veuillez joindre le document DI avant de créer la déclaration.",
        variant: "destructive",
      });
      return;
    }
    setCreating(true);
    try {
      const di = await api.post<any>("/api/di", {
        numero:       `DI-${dossier.numero}`,
        client:       dossier.client,
        montant:      m,
        devise:       "XAF",
        compagnie:    dossier.compagnie,
        dateEmission: new Date().toISOString(),
      });
      await api.post(`/api/di/${di.id}/lier-dossier`, { dossierId: dossier.id });
      // Upload document obligatoire
      try {
        const fd = new FormData();
        fd.append("file", diFile);
        fd.append("categorie", "document_di");
        fd.append("motif", `Document DI — ${dossier.numero}`);
        await uploadFile(`/api/di/${di.id}/factures`, fd);
      } catch {
        toast({
          title: "Document non joint",
          description: "La DI a été créée mais le document n'a pas pu être uploadé.",
          variant: "destructive",
        });
      }
      qc.invalidateQueries({ queryKey: ["dossier", dossier.id] });
      toast({ title: "DI créée", description: `Enveloppe ${m.toLocaleString("fr-FR")} FCFA — document joint` });
      setMontant("");
      setDevise("XAF");
      onCreated();
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Définissez le montant enveloppe autorisé pour ce dossier. Le document DI est obligatoire.
      </p>

      <div className="space-y-1">
        <Label className="text-xs">Montant DI *</Label>
        <div className="flex gap-2 items-center">
          <Select value={devise} onValueChange={(v: any) => setDevise(v)}>
            <SelectTrigger className="bg-muted/40 h-9 text-sm w-24 flex-shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="XAF">FCFA</SelectItem>
              <SelectItem value="EUR">EUR €</SelectItem>
              <SelectItem value="USD">USD $</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="number" min={1}
            placeholder={devise === "XAF" ? "45 000 000" : devise === "EUR" ? "68 600" : "74 300"}
            value={montant}
            onChange={e => setMontant(e.target.value)}
            className="h-9 text-sm bg-muted/40 font-mono flex-1"
          />
        </div>
        {montant && devise !== "XAF" && montantXAF > 0 && (
          <p className="text-[11px] text-secondary font-medium">
            ≈ {montantXAF.toLocaleString("fr-FR")} FCFA
          </p>
        )}
      </div>

      {/* Zone upload document */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold flex items-center gap-1">
          <Upload className="w-3 h-3 text-secondary" />
          Document DI * <span className="text-[10px] text-red-500 font-normal">(obligatoire)</span>
        </Label>
        <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="hidden"
          onChange={e => setDiFile(e.target.files?.[0] ?? null)} />
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) setDiFile(f); }}
          className={`cursor-pointer rounded-lg border-2 border-dashed transition-all p-3 text-center ${
            diFile
              ? "border-success/40 bg-success/5"
              : dragOver
              ? "border-secondary bg-secondary/5"
              : "border-border hover:border-secondary/50"
          }`}
        >
          {diFile ? (
            <div className="flex items-center gap-2 justify-center">
              <FileText className="w-4 h-4 text-success flex-shrink-0" />
              <span className="text-xs font-semibold text-foreground truncate max-w-[200px]">{diFile.name}</span>
              <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
            </div>
          ) : (
            <div className="flex items-center gap-2 justify-center text-muted-foreground">
              <Upload className="w-4 h-4" />
              <span className="text-xs">Cliquer ou glisser le document DI</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <Button onClick={handleCreate} disabled={creating || !montant || montantXAF <= 0 || !diFile}
          className="flex-1 h-9 gap-1.5 bg-secondary text-secondary-foreground hover:opacity-90 text-sm">
          {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Créer la DI
        </Button>
        <Button variant="outline" onClick={onCancel} className="h-9 text-sm px-3">
          Annuler
        </Button>
      </div>
    </div>
  );
};

/** Conteneurs d'un dossier avec leur taille (liste détaillée, sinon n° séparés + taille commune). */
function conteneursDuDossier(dossier: any): { numero: string; taille: string }[] {
  if (Array.isArray(dossier.conteneurs) && dossier.conteneurs.length) {
    return dossier.conteneurs.map((c: any) => ({ numero: String(c.numero ?? ""), taille: String(c.taille ?? "") }));
  }
  return String(dossier.conteneur ?? "").split(/[,;\s]+/).filter(Boolean).map(numero => ({ numero, taille: dossier.tailleConteneur ?? "" }));
}

// ── Modification des informations du dossier ────────────────────────────────

const ModifierDossierDialog = ({ dossier, open, onClose }: { dossier: any; open: boolean; onClose: () => void }) => {
  const qc = useQueryClient();
  const initial = () => ({
    client: dossier.client ?? "", marchandise: dossier.marchandise ?? "", conteneur: dossier.conteneur ?? "",
    nombreConteneurs: String(dossier.nombreConteneurs ?? 1), tailleConteneur: dossier.tailleConteneur ?? "",
    fournisseur: dossier.fournisseur ?? "", numeroBL: dossier.numeroBL ?? "", numDeclaration: dossier.numDeclaration ?? "",
    regimeDouanier: dossier.regimeDouanier ?? "", priorite: dossier.priorite ?? "moyenne",
    dateLimiteSortie: dossier.dateLimiteSortie ? String(dossier.dateLimiteSortie).slice(0, 10) : "", notes: dossier.notes ?? "",
  });
  const [v, setV] = useState(initial);
  const [tcs, setTcs] = useState<LigneConteneur[]>(() => conteneursDuDossier(dossier).map(c => ({ numero: c.numero, taille: c.taille })));
  const champ = (k: keyof ReturnType<typeof initial>) => ({ value: v[k], onChange: (e: any) => setV(x => ({ ...x, [k]: e.target.value })) });
  const enregistrer = useMutation({
    mutationFn: () => {
      const corps: Record<string, unknown> = {
        client: v.client.trim(), marchandise: v.marchandise.trim(), priorite: v.priorite,
        conteneurs: tcs.map(c => ({ numero: c.numero.trim(), taille: c.taille })).filter(c => c.numero),
      };
      for (const k of ["fournisseur", "numeroBL", "numDeclaration", "regimeDouanier", "notes"] as const) if (v[k].trim() || dossier[k]) corps[k] = v[k].trim();
      if (v.dateLimiteSortie) corps.dateLimiteSortie = new Date(`${v.dateLimiteSortie}T23:59:00`).toISOString();
      return api.patch(`/api/dossiers/${dossier.id}`, corps);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dossier", dossier.id] });
      qc.invalidateQueries({ queryKey: ["dossier-audit", dossier.id] });
      toast({ title: "Dossier mis à jour" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Modifier le dossier {dossier.numero}</DialogTitle></DialogHeader>
        <form className="grid grid-cols-2 gap-3" onSubmit={e => { e.preventDefault(); if (!tcs.some(c => c.numero.trim())) { toast({ title: "Indiquez au moins un conteneur", variant: "destructive" }); return; } enregistrer.mutate(); }}>
          <div className="col-span-2"><Label htmlFor="md-client">Client *</Label><Input id="md-client" required minLength={2} {...champ("client")} /></div>
          <div><Label htmlFor="md-march">Marchandise *</Label><Input id="md-march" required minLength={2} {...champ("marchandise")} /></div>
          <div />
          <div className="col-span-2"><ListeConteneurs lignes={tcs} onChange={setTcs} /></div>
          <div><Label htmlFor="md-fourn">Fournisseur</Label><Input id="md-fourn" {...champ("fournisseur")} /></div>
          <div><Label htmlFor="md-bl">N° BL</Label><Input id="md-bl" {...champ("numeroBL")} /></div>
          <div><Label htmlFor="md-decl">N° déclaration</Label><Input id="md-decl" {...champ("numDeclaration")} /></div>
          <div><Label htmlFor="md-regime">Régime douanier</Label><Input id="md-regime" {...champ("regimeDouanier")} /></div>
          <div>
            <Label>Priorité</Label>
            <Select value={v.priorite} onValueChange={p => setV(x => ({ ...x, priorite: p }))}>
              <SelectTrigger aria-label="Priorité"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="haute">Haute</SelectItem><SelectItem value="moyenne">Moyenne</SelectItem><SelectItem value="basse">Basse</SelectItem></SelectContent>
            </Select>
          </div>
          <div><Label htmlFor="md-limite">Date limite de sortie</Label><Input id="md-limite" type="date" {...champ("dateLimiteSortie")} /></div>
          <div className="col-span-2"><Label htmlFor="md-notes">Notes</Label><Textarea id="md-notes" rows={3} {...champ("notes")} /></div>
          <div className="col-span-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={enregistrer.isPending}>{enregistrer.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}Enregistrer</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// ── Page ─────────────────────────────────────────────────────────────────────

const DossierDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = getStoredUser();
  const superviseur     = isSupervisor(user);
  const canReadFinance  = can(user, "permFinancier", "lecture");
  const canEditFinance  = can(user, "permFinancier", "partiel");
  const canRechargeFinance = can(user, "permFinancier", "complet");

  const [newComment, setNewComment]       = useState("");
  const [activeTab, setActiveTab]         = useState("commentaires");
  const [uploadEtape, setUploadEtape]     = useState("");
  const [selectedFile, setSelectedFile]   = useState<File | null>(null);
  const [showCreateDI, setShowCreateDI]   = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(() => new Set());
  const [inlineUploadStep, setInlineUploadStep] = useState<string | null>(null);
  const [inlineFile, setInlineFile]       = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showFactureDialog, setShowFactureDialog] = useState(false);
  const [showModifier, setShowModifier] = useState(false);
  const [crEnCours, setCrEnCours] = useState(false);
  const { query: sousEtapesQuery } = useSousEtapes(id ?? "");

  // Retard / SLA state
  const [retardDialog, setRetardDialog]   = useState(false);
  const [retardMotif, setRetardMotif]     = useState("");
  const [retardAutre, setRetardAutre]     = useState("");
  const [pendingAdvance, setPendingAdvance] = useState<string | null>(null);

  // Passation de responsable
  const [handoffDialog, setHandoffDialog]         = useState(false);
  const [handoffStatus, setHandoffStatus]         = useState<string | null>(null);
  const [handoffResponsableId, setHandoffResponsableId] = useState("");
  const [handoffNote, setHandoffNote]             = useState("");
  const [handoffRecherche, setHandoffRecherche]   = useState("");
  // Répartition tâche par tâche de l'étape suivante (clé de sous-étape → compte)
  const [handoffTaches, setHandoffTaches]         = useState<Record<string, string>>({});

  const toggleStep = (stepKey: string) =>
    setExpandedSteps(prev => { const s = new Set(prev); s.has(stepKey) ? s.delete(stepKey) : s.add(stepKey); return s; });

  const { data: dossier, isLoading } = useQuery({
    queryKey: ["dossier", id],
    queryFn:  () => api.get<any>(`/api/dossiers/${id}`),
    enabled:  !!id,
    refetchInterval: 20_000,
  });

  const { data: parcoursData } = useQuery({
    queryKey: ["dossier-parcours", id],
    queryFn:  () => api.get<any>(`/api/dossiers/${id}/parcours`),
    enabled:  !!id,
    refetchInterval: 30_000,
  });

  const { data: commentsData } = useQuery({
    queryKey: ["dossier-comments", id],
    queryFn:  () => api.get<any>(`/api/dossiers/${id}/commentaires`),
    enabled:  !!id,
  });

  const { data: auditData } = useQuery({
    queryKey: ["dossier-audit", id],
    queryFn:  () => api.get<any>(`/api/dossiers/${id}/audit`),
    enabled:  !!id,
  });

  const { data: docsData, refetch: refetchDocs } = useQuery({
    queryKey: ["dossier-docs", id],
    queryFn:  () => api.get<any[]>(`/api/dossiers/${id}/documents`),
    enabled:  !!id,
  });

  // Prochaine étape, responsable pressenti et droits de l'utilisateur (calculés par le serveur)
  const { data: nextStep } = useQuery({
    queryKey: ["dossier-next", id],
    queryFn:  () => api.get<any>(`/api/dossiers/${id}/next-step`),
    enabled:  !!id,
    refetchInterval: 20_000,
  });

  // Utilisateurs pour assignation sous-étapes
  const { data: usersData } = useQuery({
    queryKey: ["employes-list"],
    queryFn:  () => api.get<any>("/api/employes").catch(() => ({ data: [] })),
    staleTime: 5 * 60_000,
  });
  const usersList = (Array.isArray(usersData) ? usersData : (usersData?.data ?? []))
    .filter((u: any) => u.actif !== false)
    .map((u: any) => ({ id: u.id, nom: u.nom, profil: u.profil, role: u.role }));

  // Facture client émise à l'étape « Facturation client »
  const { data: facturesDossier } = useQuery({
    queryKey: ["dossier-factures", id],
    queryFn:  () => api.get<any[]>(`/api/dossiers/${id}/factures`),
    enabled:  !!id && canReadFinance,
  });
  const factureClient = (Array.isArray(facturesDossier) ? facturesDossier : []).filter((x: any) => x.type !== "proforma").slice(-1)[0];

  // DI data for FactureDialog (lazy — only when diId is known after dossier loads)
  const { data: diInfo } = useQuery({
    queryKey: ["di", dossier?.diId],
    queryFn:  () => api.get<any>(`/api/di/${dossier!.diId}`),
    enabled:  !!dossier?.diId && canReadFinance,
  });

  const addComment = useMutation({
    mutationFn: (message: string) => api.post(`/api/dossiers/${id}/commentaires`, { message }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dossier-comments", id] });
      setNewComment("");
      toast({ title: "Commentaire ajouté" });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const uploadDoc = useMutation({
    mutationFn: ({ file, etape }: { file: File; etape: string }) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("etape", etape);
      return uploadFile<any>(`/api/dossiers/${id}/upload`, fd);
    },
    onSuccess: () => {
      refetchDocs();
      qc.invalidateQueries({ queryKey: ["dossier-next", id] });
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast({ title: "Document uploadé avec succès" });
    },
    onError: (err: any) => {
      const isDuplicate = err.message?.includes("déjà été uploadé") || err.message?.includes("DOCUMENT_DUPLIQUE");
      toast({
        title: isDuplicate ? "Document déjà enregistré" : "Erreur upload",
        description: err.message ?? "Échec",
        variant: "destructive",
      });
    },
  });

  const advanceStatus = useMutation({
    mutationFn: ({ status, responsableId, note, taches }: { status: string; responsableId?: string; note?: string; taches?: Record<string, string> }) =>
      api.patch(`/api/dossiers/${id}/status`, {
        status, responsableId: responsableId || undefined, note: note || undefined,
        taches: taches && Object.keys(taches).length > 0 ? taches : undefined,
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["dossier", id] });
      qc.invalidateQueries({ queryKey: ["dossier-parcours", id] });
      qc.invalidateQueries({ queryKey: ["dossier-affectations", id] });
      qc.invalidateQueries({ queryKey: ["dossier-comments", id] });
      qc.invalidateQueries({ queryKey: ["dossiers"] });
      qc.invalidateQueries({ queryKey: ["dossier-next", id] });
      qc.invalidateQueries({ queryKey: ["sous-etapes", id] });
      qc.invalidateQueries({ queryKey: ["mes-taches"] });
      notif.dossierAvance(
        STATUS_LABELS[dossier?.status ?? ""] ?? dossier?.status ?? "",
        STATUS_LABELS[vars.status] ?? vars.status,
      );
    },
    onError: (err: any) => notif.erreur(err.message ?? "Échec avancement"),
  });

  // Finalisation du dossier — hook déclaré avant tout retour anticipé (ordre des hooks constant)
  const finaliser = useMutation({
    mutationFn: () => api.post<any>(`/api/dossiers/${id}/finaliser`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dossier", id] });
      qc.invalidateQueries({ queryKey: ["dossier-next", id] });
      toast({ title: "Dossier finalisé", description: "Facturation terminée : le dossier est clos." });
    },
    onError: (e: any) => toast({ title: "Finalisation impossible", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <AppLayout title="Chargement...">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-secondary" />
        </div>
      </AppLayout>
    );
  }

  if (!dossier) {
    return (
      <AppLayout title="Dossier introuvable">
        <div className="text-center py-20">
          <p className="text-muted-foreground mb-4">Ce dossier n'existe pas ou vous n'y avez pas accès.</p>
          <Button onClick={() => navigate("/dossiers")} variant="outline">Retour aux dossiers</Button>
        </div>
      </AppLayout>
    );
  }

  // Parcours propre au site : l'étape Kribi n'existe que pour les dossiers Kribi
  const parcours: string[] = dossier.parcoursEtapes ?? nextStep?.parcours ?? STATUS_ORDER;
  const finalise        = !!dossier.finaliseLe;
  const currentStepIdx  = finalise ? parcours.length : Math.max(0, parcours.indexOf(dossier.status));
  const pctParcours     = finalise || dossier.status === "cloture" && !parcours.includes("facturation") ? 100 : Math.min(100, Math.round((currentStepIdx / Math.max(1, parcours.length - 1)) * 100));
  // Facturation remplie mais dossier pas encore finalisé
  const pretAFinaliser  = !finalise && dossier.status === "facturation" && !!nextStep?.completion?.allDone;
  const nextStatus: string | null = nextStep ? nextStep.etapeSuivante : (parcours[currentStepIdx + 1] ?? null);

  // Implication de l'utilisateur : responsable du dossier ou titulaire d'une tâche
  const mesTaches = (sousEtapesQuery.data ?? []).filter(t => t.responsableId === user?.id);
  const impliqueEtapeCourante = dossier.responsableId === user?.id || mesTaches.some(t => t.etape === dossier.status);
  const canAdvance = superviseur || impliqueEtapeCourante;
  const canUpload  = superviseur || can(user, "permDossier", "partiel") || dossier.responsableId === user?.id || mesTaches.length > 0;
  const canModifier = superviseur || (can(user, "permDossier", "partiel") && (user?.profil === "administration" || dossier.responsableId === user?.id || mesTaches.length > 0));
  const ouvrirCompteRendu = async (telecharger = false) => {
    setCrEnCours(true);
    try {
      if (telecharger) await downloadFile(`/api/dossiers/${dossier.id}/compte-rendu?telecharger=1`, `Compte-rendu-${dossier.numero}.pdf`);
      else await openDocument(`/api/dossiers/${dossier.id}/compte-rendu`);
    } catch (e: any) {
      toast({ title: "Compte rendu indisponible", description: e.message, variant: "destructive" });
    } finally {
      setCrEnCours(false);
    }
  };
  const effectiveEtape  = uploadEtape || dossier.status;
  const docs: any[]     = docsData ?? [];

  // Map étape → timing (avec responsable) pour afficher qui a traité chaque étape
  const timingByStep: Record<string, any> = {};
  (dossier.timings ?? []).forEach((t: any) => { timingByStep[t.etape] = t; });
  const comments        = commentsData?.data ?? commentsData ?? [];
  const audit           = auditData?.data    ?? auditData    ?? [];
  const timeline        = parcoursData?.timeline ?? [];
  const finance         = parcoursData?.finance  ?? {};
  const diId            = dossier.diId as string | undefined;
  const conteneurs: any[] = conteneursDuDossier(dossier).map((c, i) => ({ id: `${i}`, numero: c.numero, type: c.taille, statut: dossier.status }));

  // Preuves obligatoires — docs de l'étape courante
  const currentStepDocs = docs.filter((d: any) => d.etape === dossier.status);
  const hasProofForCurrentStep = currentStepDocs.length > 0;

  const openHandoffDialog = (targetStatus: string) => {
    setHandoffStatus(targetStatus);
    setHandoffResponsableId(targetStatus === nextStatus && nextStep?.responsableSuggere?.id ? nextStep.responsableSuggere.id : "");
    setHandoffRecherche("");
    setHandoffNote("");
    setHandoffTaches({});
    setHandoffDialog(true);
  };

  const confirmHandoff = () => {
    if (!handoffStatus) return;
    advanceStatus.mutate({
      status: handoffStatus,
      responsableId: handoffResponsableId && handoffResponsableId !== "__auto__" ? handoffResponsableId : undefined,
      note: handoffNote || undefined,
      taches: Object.fromEntries(Object.entries(handoffTaches).filter(([, v]) => v && v !== "__meme__")),
    });
    setHandoffDialog(false);
    setHandoffStatus(null);
    setHandoffNote("");
  };

  const handleAdvanceClick = () => {
    if (!nextStatus) return;

    // Les superviseurs (DG / Exploitation) gardent le contrôle total et peuvent forcer
    if (!superviseur && nextStep && !nextStep.completion?.allDone) {
      notif.avancementBloque(STATUS_LABELS[dossier.status] ?? dossier.status);
      if (!expandedSteps.has(dossier.status))
        setExpandedSteps(prev => { const s = new Set(prev); s.add(dossier.status); return s; });
      return;
    }

    if (!hasProofForCurrentStep && !superviseur) {
      notif.erreur(`Veuillez joindre au moins un document de preuve pour l'étape "${STATUS_LABELS[dossier.status]}" avant de continuer.`);
      setInlineUploadStep(dossier.status);
      if (!expandedSteps.has(dossier.status))
        setExpandedSteps(prev => { const s = new Set(prev); s.add(dossier.status); return s; });
      return;
    }

    const sla = getSLAStatus(dossier.status, timeline, dossier.dateCreation, dossier.timings);
    if (sla && sla.status === "critical") {
      setPendingAdvance(nextStatus);
      setRetardDialog(true);
    } else {
      openHandoffDialog(nextStatus);
    }
  };

  const confirmRetardAdvance = () => {
    if (!pendingAdvance) return;
    const motifFinal = retardMotif === "Autre" ? retardAutre : retardMotif;
    if (!motifFinal.trim()) {
      toast({ title: "Veuillez sélectionner un motif de retard", variant: "destructive" });
      return;
    }
    setRetardDialog(false);
    setRetardMotif("");
    setRetardAutre("");
    // Ouvrir le dialog de passation après confirmation du retard
    openHandoffDialog(pendingAdvance);
    setPendingAdvance(null);
  };

  const totalCost = (Number(dossier.montantTaxes) || 0)
    + (Number(dossier.montantHonoraires) || 0)
    + (Number(dossier.montantRedevances) || 0);

  return (
    <AppLayout title={dossier.numero} subtitle={`${dossier.client} — ${dossier.marchandise ?? ""}`}>

      {/* ── Dialog Retard SLA ─────────────────────────────────── */}
      {retardDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card rounded-2xl p-6 w-full max-w-md shadow-2xl border border-border"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-foreground">Dépassement de délai</h3>
                  <p className="text-xs text-muted-foreground">Le SLA de l'étape a été dépassé</p>
                </div>
              </div>
              <button onClick={() => setRetardDialog(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
              <p className="text-sm text-red-700">
                L'étape <strong>"{STATUS_LABELS[dossier.status]}"</strong> a dépassé son délai cible de{" "}
                <strong>{getSLAStatus(dossier.status, timeline, dossier.dateCreation, dossier.timings)?.slaH ?? SLA_HOURS[dossier.status]}h</strong>. Veuillez indiquer le motif du retard avant de continuer.
              </p>
            </div>

            <div className="space-y-3 mb-5">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Motif du retard *</Label>
                <Select value={retardMotif} onValueChange={setRetardMotif}>
                  <SelectTrigger className="bg-muted/40 h-9 text-sm">
                    <SelectValue placeholder="Sélectionner un motif..." />
                  </SelectTrigger>
                  <SelectContent>
                    {RETARD_MOTIFS.map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {retardMotif === "Autre" && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Précisez</Label>
                  <Textarea
                    placeholder="Explication du retard..."
                    value={retardAutre}
                    onChange={e => setRetardAutre(e.target.value)}
                    className="bg-muted/40 h-20 text-sm resize-none"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={confirmRetardAdvance}
                disabled={!retardMotif || advanceStatus.isPending}
                className="flex-1 bg-secondary text-secondary-foreground gap-1.5"
              >
                {advanceStatus.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <ChevronRight className="w-4 h-4" />
                }
                Confirmer et avancer
              </Button>
              <Button variant="outline" onClick={() => setRetardDialog(false)} className="px-4">
                Annuler
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── Dialog Passation de responsable ──────────────────── */}
      {handoffDialog && handoffStatus && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card rounded-2xl p-6 w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl border border-border"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-secondary/15 flex items-center justify-center">
                  <User className="w-5 h-5 text-secondary" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-foreground">Passation du dossier</h3>
                  <p className="text-xs text-muted-foreground">
                    {STATUS_LABELS[dossier.status]} → <strong>{STATUS_LABELS[handoffStatus]}</strong>
                  </p>
                </div>
              </div>
              <button onClick={() => setHandoffDialog(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 mb-5">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Qui continue l'étape « {STATUS_LABELS[handoffStatus]} » ?</Label>
                <p className="text-[11px] text-muted-foreground">La personne choisie devient responsable du dossier et reçoit les tâches de cette étape.</p>
                <Input placeholder="Rechercher un employé…" value={handoffRecherche} onChange={e => setHandoffRecherche(e.target.value)} className="h-8 text-xs bg-muted/40" />
                <div className="max-h-56 overflow-y-auto rounded-lg border border-border divide-y divide-border/50" role="radiogroup" aria-label="Employé qui continue">
                  {usersList
                    .filter((u: any) => !handoffRecherche || `${u.nom} ${u.role ?? ""}`.toLowerCase().includes(handoffRecherche.toLowerCase()))
                    .sort((a: any, b: any) => Number(b.id === nextStep?.responsableSuggere?.id) - Number(a.id === nextStep?.responsableSuggere?.id))
                    .map((u: any) => {
                      const choisi = handoffResponsableId === u.id;
                      const suggere = u.id === nextStep?.responsableSuggere?.id && handoffStatus === nextStatus;
                      return (
                        <button key={u.id} type="button" role="radio" aria-checked={choisi}
                          onClick={() => setHandoffResponsableId(u.id)}
                          className={`w-full text-left px-3 py-2 flex items-center gap-2 text-sm transition-colors ${choisi ? "bg-secondary/10" : "hover:bg-muted/50"}`}>
                          <span className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${choisi ? "border-secondary bg-secondary" : "border-muted-foreground/40"}`} />
                          <span className="font-medium">{u.nom}</span>
                          <span className="text-[11px] text-muted-foreground truncate">{u.role ?? u.profil}</span>
                          {suggere && <span className="ml-auto text-[10px] font-semibold text-secondary bg-secondary/10 px-1.5 py-0.5 rounded-full">recommandé</span>}
                        </button>
                      );
                    })}
                </div>
              </div>
              {applicableConfigs(handoffStatus, dossier.site).length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Qui fait chaque tâche de « {STATUS_LABELS[handoffStatus]} » ?</Label>
                  <p className="text-[11px] text-muted-foreground">Par défaut, la personne choisie ci-dessus reçoit toutes les tâches. Vous pouvez en confier certaines à d'autres comptes.</p>
                  <div className="rounded-lg border border-border divide-y divide-border/50">
                    {applicableConfigs(handoffStatus, dossier.site).map(cfg => {
                      const actuelle = (sousEtapesQuery.data ?? []).find(t => t.etape === handoffStatus && t.cle === cfg.cle);
                      return (
                        <div key={cfg.cle} className="flex items-center gap-2 px-3 py-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">{cfg.label}</p>
                            {actuelle?.responsable && <p className="text-[10px] text-muted-foreground">Prévu : {actuelle.responsable.nom}</p>}
                          </div>
                          <Select value={handoffTaches[cfg.cle] ?? "__meme__"} onValueChange={v => setHandoffTaches(p => ({ ...p, [cfg.cle]: v }))}>
                            <SelectTrigger className="h-7 w-48 text-[11px] bg-muted/40" aria-label={`Responsable de ${cfg.label}`}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__meme__">Comme ci-dessus</SelectItem>
                              {usersList.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.nom}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Note de passation (optionnelle)</Label>
                <Textarea
                  placeholder={`Ex : Dossier transmis à ${STATUS_LABELS[handoffStatus]} le ${new Date().toLocaleDateString("fr-FR")} — documents complets`}
                  value={handoffNote}
                  onChange={e => setHandoffNote(e.target.value)}
                  className="bg-muted/40 h-24 text-sm resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={confirmHandoff}
                disabled={advanceStatus.isPending || !handoffResponsableId}
                className="flex-1 bg-secondary text-secondary-foreground gap-1.5"
              >
                {advanceStatus.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <ChevronRight className="w-4 h-4" />}
                Confirmer la passation
              </Button>
              <Button variant="outline" onClick={() => setHandoffDialog(false)} className="px-4">
                Annuler
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap mb-6">
        <button onClick={() => navigate("/dossiers")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Retour aux dossiers
        </button>
        <div className="flex flex-wrap gap-2">
          <div className="flex">
            <Button variant="outline" size="sm" className="gap-1.5 rounded-r-none" disabled={crEnCours} onClick={() => ouvrirCompteRendu()}
              title="Compte rendu complet de l'évolution du dossier, prêt à imprimer">
              {crEnCours ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />} Compte rendu PDF
            </Button>
            <Button variant="outline" size="sm" className="rounded-l-none border-l-0 px-2" disabled={crEnCours} onClick={() => ouvrirCompteRendu(true)}
              title="Télécharger le compte rendu" aria-label="Télécharger le compte rendu"><Download className="w-3.5 h-3.5" /></Button>
          </div>
          <Button size="sm" className="gap-1.5 bg-secondary text-secondary-foreground" onClick={() => document.getElementById("suivi-client")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
            <Share2 className="w-3.5 h-3.5" /> Suivi client
          </Button>
          {canModifier && <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowModifier(true)}><Pencil className="w-3.5 h-3.5" /> Modifier</Button>}
        </div>
      </div>
      {canModifier && showModifier && <ModifierDossierDialog dossier={dossier} open onClose={() => setShowModifier(false)} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Colonne principale ─────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2 space-y-6"
        >
          {(dossier.status === "cloture" || dossier.status === "facturation") && (
            <div className="relative overflow-hidden rounded-2xl border border-success/25 bg-gradient-to-r from-success/10 via-success/5 to-transparent p-5" data-testid="bandeau-cloture">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-success text-white shadow-sm">{finalise ? <Trophy className="w-5 h-5" /> : <Lock className="w-5 h-5" />}</div>
                <div className="min-w-0 flex-1">
                  <p className="font-display font-semibold text-foreground">
                    {finalise
                      ? `Dossier terminé — facturé et clos le ${new Date(dossier.finaliseLe).toLocaleDateString("fr-FR")}${factureClient ? ` (facture ${factureClient.numero})` : ""}`
                      : pretAFinaliser ? "Facturation remplie — le dossier peut être finalisé"
                      : dossier.status === "facturation" ? "Dossier clôturé — facturation client en cours" : "Dossier clôturé"}
                  </p>
                  <p className="text-xs text-muted-foreground">{pretAFinaliser
                    ? "Toutes les tâches de facturation sont remplies : finalisez pour clore définitivement le dossier."
                    : "Le compte rendu complet du parcours a été archivé dans la bibliothèque documentaire."}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {pretAFinaliser && (
                    <Button size="sm" className="gap-1.5 bg-secondary text-secondary-foreground" disabled={finaliser.isPending} onClick={() => finaliser.mutate()} data-testid="finaliser-dossier">
                      {finaliser.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Flag className="w-3.5 h-3.5" />} Finaliser le dossier
                    </Button>
                  )}
                  {factureClient && Array.isArray(factureClient.lignes) && factureClient.lignes.length > 0 && (
                    <Button size="sm" className="gap-1.5 bg-primary text-primary-foreground" onClick={() => openDocument(`/api/facturation/factures/${factureClient.id}/pdf`).catch((e: Error) => notif.erreur(e.message))}>
                      <FileDown className="w-3.5 h-3.5" /> Facture PDF
                    </Button>
                  )}
                  <Button size="sm" className="gap-1.5 bg-success text-white hover:bg-success/90" disabled={crEnCours} onClick={() => ouvrirCompteRendu()}>
                    <FileDown className="w-3.5 h-3.5" /> Ouvrir le compte rendu
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate(`/bibliotheque?dossier=${dossier.id}`)}>
                    <Library className="w-3.5 h-3.5" /> Bibliothèque
                  </Button>
                </div>
              </div>
            </div>
          )}
          {/* ══ Progression du dossier — Ultra Premium ═══════════════════ */}
          <div className="stat-card overflow-hidden">
            {/* En-tête */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2.5 mb-3">
              <div className="min-w-0">
                <h3 className="font-display font-semibold text-foreground">Progression du dossier</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {finalise
                    ? `Dossier terminé le ${new Date(dossier.finaliseLe).toLocaleDateString("fr-FR")} — 100 % accompli`
                    : `Étape ${currentStepIdx + 1} / ${parcours.length} — ${pctParcours}% accompli`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0">
                <span className={`status-badge ${STATUS_COLORS[dossier.status] ?? "bg-gray-100 text-gray-600"}`}>
                  {STATUS_LABELS[dossier.status] ?? dossier.status}
                </span>
                {superviseur && (
                  <Select value="" onValueChange={v => v && openHandoffDialog(v)}>
                    <SelectTrigger className="h-8 sm:h-7 text-xs w-[150px]" title="Direction : revenir à une étape antérieure ou passer à la suivante (étape validée)">
                      <SelectValue placeholder="Changer d'étape…" />
                    </SelectTrigger>
                    <SelectContent>
                      {parcours.filter(s => s !== dossier.status).map(s => (
                        <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {canAdvance && nextStatus && (
                  <div className="flex items-center gap-1.5">
                    {!hasProofForCurrentStep && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                        <AlertCircle className="w-2.5 h-2.5" /> Preuve requise
                      </span>
                    )}
                    <Button
                      size="sm"
                      onClick={handleAdvanceClick}
                      disabled={advanceStatus.isPending}
                      className="gap-1.5 bg-secondary text-secondary-foreground hover:opacity-90 text-xs h-8 sm:h-7 px-3"
                    >
                      {advanceStatus.isPending
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <ChevronRight className="w-3.5 h-3.5" />}
                      {STATUS_LABELS[nextStatus]}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Barre de progression globale */}
            <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-5">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-secondary via-accent to-success"
                initial={{ width: 0 }}
                animate={{ width: `${pctParcours}%` }}
                transition={{ duration: 1.4, ease: "easeOut", delay: 0.2 }}
              />
            </div>

            {/* Étapes */}
            <div className="space-y-2">
              {parcours.map((stepKey, i) => {
                const isCompleted    = i < currentStepIdx;
                const isCurrent      = i === currentStepIdx;
                const isPending      = i > currentStepIdx;
                const cfg            = STEP_CONFIG[stepKey];
                const StepIcon       = cfg?.icon ?? FileText;
                const stepDocs       = docs.filter((d: any) => d.etape === stepKey);
                const isExpanded     = isCurrent || expandedSteps.has(stepKey);
                const showUploadZone = inlineUploadStep === stepKey;

                return (
                  <motion.div
                    key={stepKey}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: isPending ? 0.45 : 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <div className={`rounded-xl border transition-colors overflow-hidden ${
                      isCurrent
                        ? `${cfg?.borderActive ?? "border-secondary/30"} bg-gradient-to-r ${cfg?.bgActive ?? "from-secondary/5"} to-transparent`
                        : isCompleted
                        ? "border-success/15 bg-success/[0.025]"
                        : "border-border/20"
                    }`}>
                      {/* Header ligne étape */}
                      <div
                        className={`flex items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-3 ${(isCompleted || isCurrent) ? "cursor-pointer select-none" : ""}`}
                        onClick={() => (isCompleted || isCurrent) && toggleStep(stepKey)}
                      >
                        {/* Cercle statut */}
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                          isCompleted
                            ? "bg-success text-success-foreground shadow-sm"
                            : isCurrent
                            ? `${cfg?.iconBg ?? "bg-secondary/20"} ${cfg?.iconText ?? "text-secondary"} ring-2 ${cfg?.iconRing ?? "ring-secondary/30"}`
                            : "bg-muted/50 text-muted-foreground"
                        }`}>
                          {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : <StepIcon className="w-4 h-4" />}
                        </div>

                        {/* Infos étape */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-sm font-semibold leading-tight ${isPending ? "text-muted-foreground" : "text-foreground"}`}>
                              {STATUS_LABELS[stepKey] ?? stepKey}
                            </span>
                            {isCurrent && (
                              <motion.span
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${cfg?.iconBg ?? "bg-secondary/10"} ${cfg?.iconText ?? "text-secondary"}`}
                                animate={{ opacity: [1, 0.45, 1] }}
                                transition={{ duration: 2.2, repeat: Infinity }}
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-current" /> En cours
                              </motion.span>
                            )}
                            {isCompleted && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-success/10 text-success">
                                ✓ Complété
                              </span>
                            )}
                            {stepDocs.length > 0 && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-600 border border-blue-100">
                                <FileText className="w-2.5 h-2.5" />
                                {stepDocs.length} preuve{stepDocs.length > 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                          {!isPending && cfg?.description && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug pr-4">{cfg.description}</p>
                          )}
                          {isCompleted && timingByStep[stepKey]?.responsable?.nom && (
                            <p className="text-[11px] text-success font-medium mt-0.5 flex items-center gap-1">
                              <User className="w-2.5 h-2.5" />
                              Traité par {timingByStep[stepKey].responsable.nom}
                            </p>
                          )}
                          {(isCompleted || isCurrent) && timingByStep[stepKey]?.dateDebut && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 font-mono" data-testid={`timing-${stepKey}`}>
                              Début {dateHeure(timingByStep[stepKey].dateDebut)}
                              {timingByStep[stepKey].dateFin
                                ? <> · Fin {dateHeure(timingByStep[stepKey].dateFin)} · Durée {dureeEntre(timingByStep[stepKey].dateDebut, timingByStep[stepKey].dateFin)}</>
                                : <> · En cours depuis {dureeEntre(timingByStep[stepKey].dateDebut)}</>}
                            </p>
                          )}
                          {isCurrent && (() => {
                            const sla = getSLAStatus(stepKey, timeline, dossier.dateCreation, dossier.timings);
                            if (!sla) return null;
                            return (
                              <p className={`sm:hidden text-[11px] font-semibold mt-1 flex items-center gap-1 ${sla.status === "critical" ? "text-red-600" : sla.status === "warning" ? "text-amber-600" : "text-success"}`}>
                                <Clock className="w-3 h-3" /> {delaiJHM(sla.elapsedH * 60)} / {delaiJHM(sla.slaH * 60)}{sla.status === "critical" && " · Retard"}
                              </p>
                            );
                          })()}
                          {isCurrent && dossier.responsable?.nom && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                              <User className="w-2.5 h-2.5" />
                              Responsable : {dossier.responsable.nom}
                            </p>
                          )}
                        </div>

                        {/* SLA indicateur */}
                        {isCurrent && (() => {
                          const sla = getSLAStatus(stepKey, timeline, dossier.dateCreation, dossier.timings);
                          if (!sla) return null;
                          return (
                            <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0 mx-2">
                              <Clock className={`w-3 h-3 flex-shrink-0 ${
                                sla.status === "critical" ? "text-red-500" :
                                sla.status === "warning"  ? "text-amber-500" :
                                "text-green-500"
                              }`} />
                              <span className={`text-[10px] font-medium whitespace-nowrap ${
                                sla.status === "critical" ? "text-red-600" :
                                sla.status === "warning"  ? "text-amber-600" :
                                "text-muted-foreground"
                              }`}>
                                {delaiJHM(sla.elapsedH * 60)} / {delaiJHM(sla.slaH * 60)}
                              </span>
                              <div className="w-10 h-1 rounded-full bg-muted overflow-hidden hidden sm:block">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    sla.status === "critical" ? "bg-red-500" :
                                    sla.status === "warning"  ? "bg-amber-500" :
                                    "bg-green-500"
                                  }`}
                                  style={{ width: `${sla.pct}%` }}
                                />
                              </div>
                              {sla.status === "critical" && (
                                <span className="text-[9px] text-red-600 font-bold bg-red-50 px-1.5 py-0.5 rounded-full border border-red-200 whitespace-nowrap">
                                  Retard
                                </span>
                              )}
                            </div>
                          );
                        })()}

                        {/* Actions droite */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {(isCompleted || isCurrent) && canUpload && (
                            <button
                              title="Ajouter une preuve"
                              className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-secondary transition-colors"
                              onClick={e => {
                                e.stopPropagation();
                                setInlineUploadStep(prev => prev === stepKey ? null : stepKey);
                                if (!expandedSteps.has(stepKey) && !isCurrent)
                                  setExpandedSteps(prev => { const s = new Set(prev); s.add(stepKey); return s; });
                              }}
                            >
                              <Upload className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {(isCompleted || isCurrent) && (
                            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                          )}
                        </div>
                      </div>

                      {/* Contenu expansé — documents + upload */}
                      {isExpanded && (
                        <div className="px-4 pb-4 border-t border-border/10 pt-3 space-y-2.5">
                          {stepDocs.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {stepDocs.map((doc: any) => {
                                const isPdf = doc.type?.includes("pdf");
                                const isImg = doc.type?.startsWith("image/");
                                return (
                                  <button
                                    type="button"
                                    key={doc.id}
                                    className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/40 hover:bg-muted transition-colors group text-left"
                                    onClick={e => { e.stopPropagation(); openDocument(doc.url).catch((err: Error) => notif.erreur(err.message)); }}
                                  >
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isPdf ? "bg-red-100" : isImg ? "bg-blue-100" : "bg-muted"}`}>
                                      {isPdf ? <FileText className="w-3.5 h-3.5 text-red-600" /> : isImg ? <ImageIcon className="w-3.5 h-3.5 text-blue-600" /> : <FileText className="w-3.5 h-3.5 text-muted-foreground" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-medium text-foreground truncate group-hover:text-secondary transition-colors">{doc.nom}</p>
                                      <p className="text-[10px] text-muted-foreground">
                                        {doc.taille} · {new Date(doc.createdAt).toLocaleDateString("fr-FR")}
                                        {doc.uploader?.nom ? ` · ${doc.uploader.nom}` : ""}
                                      </p>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {/* Sous-étapes */}
                          {(isCompleted || isCurrent) && SOUS_ETAPES_CONFIG[stepKey]?.length > 0 && (
                            <SousEtapesPanel
                              etape={stepKey}
                              dossierId={id!}
                              users={usersList}
                              site={dossier.site}
                            />
                          )}

                          {/* Zone upload inline */}
                          {showUploadZone && (
                            <motion.div
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="rounded-lg border border-dashed border-secondary/40 bg-secondary/5 p-3"
                            >
                              <p className="text-[11px] font-semibold text-secondary mb-2 flex items-center gap-1.5">
                                <Upload className="w-3 h-3" /> Preuve — {STATUS_LABELS[stepKey]}
                              </p>
                              <div className="flex gap-2 items-center">
                                <Input
                                  type="file"
                                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                                  onChange={e => setInlineFile(e.target.files?.[0] ?? null)}
                                  className="bg-card h-8 text-xs file:text-[10px] file:font-medium file:border-0 file:bg-transparent flex-1"
                                />
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    if (inlineFile) {
                                      uploadDoc.mutate({ file: inlineFile, etape: stepKey });
                                      setInlineFile(null);
                                      setInlineUploadStep(null);
                                    }
                                  }}
                                  disabled={!inlineFile || uploadDoc.isPending}
                                  className="h-8 gap-1 bg-secondary text-secondary-foreground text-xs px-3 flex-shrink-0"
                                >
                                  {uploadDoc.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                                  Envoyer
                                </Button>
                              </div>
                            </motion.div>
                          )}

                          {stepDocs.length === 0 && !showUploadZone && (
                            <p className="text-[11px] text-muted-foreground/60 text-center py-1">
                              {isCompleted
                                ? "Aucune preuve — cliquez sur ↑ pour en ajouter une"
                                : "Cliquez sur ↑ pour joindre un document de preuve"}
                            </p>
                          )}

                          {/* Bouton avancer — visible dans le contenu de l'étape courante */}
                          {isCurrent && canAdvance && nextStatus && !superviseur && nextStep && !nextStep.peutAvancer && nextStep.raisons?.length > 0 && (
                            <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-[11px] text-amber-800 space-y-0.5">
                              <p className="font-semibold">Avant de passer à « {STATUS_LABELS[nextStatus]} » :</p>
                              {nextStep.raisons.map((r: string) => <p key={r}>• {r}</p>)}
                            </div>
                          )}
                          {isCurrent && canAdvance && nextStatus && (
                            <div className="pt-2 border-t border-border/10 mt-2">
                              <Button
                                size="sm"
                                onClick={handleAdvanceClick}
                                disabled={advanceStatus.isPending}
                                className="w-full gap-2 bg-secondary text-secondary-foreground hover:opacity-90 text-sm h-9"
                              >
                                {advanceStatus.isPending
                                  ? <Loader2 className="w-4 h-4 animate-spin" />
                                  : <ChevronRight className="w-4 h-4" />}
                                Passer à : {STATUS_LABELS[nextStatus]}
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* ── DI — Déclaration d'Importation ─────────────────
              Si le dossier a une DI : DIBlock (avec jauge, solde,
              prévisions, mouvements, ajustement).
              Sinon : invitation à définir le montant DI.         */}
          {canReadFinance && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07 }}>
              {diId ? (
                <DIBlock
                  diId={diId}
                  canEdit={canEditFinance}
                  canRecharge={canRechargeFinance}
                />
              ) : (
                <div className="stat-card">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center">
                        <Banknote className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-display font-semibold text-foreground">
                          Déclaration d'Importation
                        </p>
                        <p className="text-xs text-muted-foreground">Aucun montant DI défini pour ce dossier</p>
                      </div>
                    </div>
                    {canEditFinance && !showCreateDI && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-xs h-8"
                        onClick={() => setShowCreateDI(true)}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Définir montant DI
                      </Button>
                    )}
                  </div>
                  {showCreateDI && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="border-t border-border pt-3"
                    >
                      <CreateDIInline
                        dossier={dossier}
                        onCreated={() => setShowCreateDI(false)}
                        onCancel={() => setShowCreateDI(false)}
                      />
                    </motion.div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {/* ── Facture du dossier ─────────────────────────────── */}
          {canEditFinance && diId && diInfo && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <div className="stat-card">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-secondary/15 flex items-center justify-center">
                      <Receipt className="w-4 h-4 text-secondary" />
                    </div>
                    <div>
                      <p className="text-sm font-display font-semibold text-foreground">Factures du dossier</p>
                      <p className="text-xs text-muted-foreground">
                        Solde DI disponible :{" "}
                        <span className={`font-semibold ${(diInfo.soldeNum ?? 0) <= (diInfo.montantNum ?? 0) * 0.2 ? "text-warning" : "text-success"}`}>
                          {montantDevise(diInfo.soldeNum ?? 0)}
                        </span>
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setShowFactureDialog(true)}
                    className="gap-1.5 bg-secondary text-secondary-foreground hover:opacity-90 text-xs h-8"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Nouvelle facture
                  </Button>
                </div>

                <p className="text-[11px] text-muted-foreground mt-3 bg-muted/40 rounded-lg px-3 py-2 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                  Le montant saisi sera déduit du solde de la DI. Un document justificatif (facture PDF ou image) est obligatoire pour toute déduction.
                </p>
              </div>

              <FactureDialog
                open={showFactureDialog}
                onClose={() => {
                  setShowFactureDialog(false);
                  qc.invalidateQueries({ queryKey: ["di", diId] });
                }}
                diId={diId}
                dossierId={id!}
                diNumero={diInfo.numero ?? "—"}
                soldeActuel={diInfo.soldeNum ?? 0}
                devise={diInfo.devise ?? "XAF"}
              />
            </motion.div>
          )}

          {/* Parcours / timeline events */}
          {timeline.length > 0 && (
            <div className="stat-card">
              <h3 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
                <History className="w-4 h-4 text-secondary" />
                Parcours du dossier ({timeline.length} événements)
              </h3>
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {timeline.map((evt: any, idx: number) => (
                  <div key={`${evt.type}-${idx}`} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="w-2 h-2 rounded-full bg-secondary mt-1.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{EVENT_LABELS[evt.type] ?? evt.label ?? evt.action ?? evt.type}{evt.etape ? ` — ${STATUS_LABELS[evt.etape] ?? evt.etape}` : ""}</p>
                      {(evt.details || evt.message || evt.nom || evt.reference || evt.numero) && (
                        <p className="text-xs text-secondary mt-0.5">{evt.details ?? evt.message ?? evt.nom ?? evt.reference ?? evt.numero}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {[evt.responsable, evt.auteur?.nom ?? evt.auteur, evt.uploadePar, evt.emetteur, evt.effectuePar].find((x: any) => typeof x === "string") ?? ""} • {new Date(evt.date ?? evt.createdAt).toLocaleString("fr-FR")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Onglets : commentaires / documents / historique */}
          <div className="stat-card">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-4">
                <TabsTrigger value="commentaires" className="gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" /> Commentaires ({comments.length})
                </TabsTrigger>
                <TabsTrigger value="documents" className="gap-1.5">
                  <Upload className="w-3.5 h-3.5" /> Documents ({docs.length})
                </TabsTrigger>
                <TabsTrigger value="historique" className="gap-1.5">
                  <History className="w-3.5 h-3.5" /> Historique ({audit.length})
                </TabsTrigger>
              </TabsList>

              {/* Commentaires */}
              <TabsContent value="commentaires">
                <div className="space-y-3 mb-4 max-h-80 overflow-y-auto">
                  {comments.map((c: any) => (
                    <div key={c.id} className="p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                          <span className="text-[9px] font-bold text-primary-foreground">
                            {(c.auteur?.nom ?? c.auteur ?? "?").split(" ").pop()?.charAt(0)}
                          </span>
                        </div>
                        <span className="text-sm font-medium text-foreground">{c.auteur?.nom ?? c.auteur ?? "?"}</span>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {new Date(c.createdAt ?? c.date).toLocaleString("fr-FR")}
                        </span>
                      </div>
                      <p className="text-sm text-foreground ml-8">{c.message}</p>
                    </div>
                  ))}
                  {comments.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">Aucun commentaire</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Ajouter un commentaire..."
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    className="bg-muted/50 h-20"
                  />
                  <Button
                    onClick={() => newComment.trim() && addComment.mutate(newComment)}
                    disabled={addComment.isPending}
                    className="self-end gap-1.5 bg-primary text-primary-foreground"
                    size="sm"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </TabsContent>

              {/* Documents */}
              <TabsContent value="documents">
                {canUpload && (
                  <div className="mb-4 p-4 rounded-lg border border-dashed border-border bg-muted/30">
                    <p className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
                      <Upload className="w-3.5 h-3.5" /> Ajouter un scan ou document
                    </p>
                    <div className="flex gap-3 items-end flex-wrap">
                      <div className="space-y-1 min-w-[130px]">
                        <Label className="text-xs">Étape</Label>
                        <Select value={effectiveEtape} onValueChange={setUploadEtape}>
                          <SelectTrigger className="bg-card h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {parcours.map(s => (
                              <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1 flex-1 min-w-[180px]">
                        <Label className="text-xs">Fichier (PDF, image, max 10 Mo)</Label>
                        <Input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                          onChange={e => setSelectedFile(e.target.files?.[0] ?? null)}
                          className="bg-card h-9 text-sm file:text-xs file:font-medium file:border-0 file:bg-transparent"
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={() => selectedFile && uploadDoc.mutate({ file: selectedFile, etape: effectiveEtape })}
                        disabled={!selectedFile || uploadDoc.isPending}
                        className="gap-1.5 bg-primary text-primary-foreground h-9"
                      >
                        {uploadDoc.isPending
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Upload className="w-3.5 h-3.5" />
                        }
                        Envoyer
                      </Button>
                    </div>
                  </div>
                )}
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {docs.map((doc: any) => {
                    const isPdf = doc.type?.includes("pdf");
                    const isImg = doc.type?.startsWith("image/");
                    return (
                      <button
                        type="button"
                        key={doc.id}
                        onClick={() => openDocument(doc.url).catch((err: Error) => notif.erreur(err.message))}
                        className="w-full text-left flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group"
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          isPdf ? "bg-red-100" : isImg ? "bg-blue-100" : "bg-muted"
                        }`}>
                          {isPdf
                            ? <FileText className="w-4 h-4 text-red-600" />
                            : isImg
                            ? <ImageIcon className="w-4 h-4 text-blue-600" />
                            : <FileText className="w-4 h-4 text-muted-foreground" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate group-hover:text-secondary">
                            {doc.nom}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {STATUS_LABELS[doc.etape] ?? doc.etape} • {doc.taille}
                            {doc.uploader?.nom ? ` • ${doc.uploader.nom}` : ""}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {new Date(doc.createdAt).toLocaleDateString("fr-FR")}
                        </span>
                      </button>
                    );
                  })}
                  {docs.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">Aucun document joint</p>
                  )}
                </div>
              </TabsContent>

              {/* Historique audit */}
              <TabsContent value="historique">
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {audit.map((a: any) => (
                    <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                      <History className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm text-foreground">{a.action}</p>
                        {a.details && <p className="text-xs text-secondary mt-0.5">{a.details}</p>}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {a.auteur?.nom ?? a.auteur ?? ""} •{" "}
                          {new Date(a.createdAt ?? a.date).toLocaleString("fr-FR")}
                        </p>
                      </div>
                    </div>
                  ))}
                  {audit.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">Aucune entrée</p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </motion.div>

        {/* ── Sidebar ────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="space-y-6"
        >
          {/* Suivi client : lien partagé + messages (en tête de colonne) */}
          <SuiviClientCarte dossierId={dossier.id} numero={dossier.numero} client={dossier.client} />

          <EquipeParcours dossierId={dossier.id} employes={usersList} />

          {/* Informations */}
          <div className="stat-card space-y-4">
            <h3 className="font-display font-semibold text-foreground">Informations</h3>
            {[
              { icon: Package,       label: "Marchandise",   value: dossier.marchandise },
              { icon: Ship,          label: "Compagnie",     value: dossier.compagnie?.replace("_", "-") },
              { icon: Package,       label: "Conteneurs",    value: `${dossier.nombreConteneurs ?? 1} — ${resumeConteneurs(conteneursDuDossier(dossier)) || "taille non précisée"}` },
              { icon: FileText,      label: "N° de BL",      value: dossier.numeroBL },
              { icon: MapPin,        label: "Site",          value: dossier.site },
              { icon: User,          label: "Responsable",   value: dossier.responsable?.nom ?? "—" },
              { icon: Package,       label: "Fournisseur",   value: dossier.fournisseur },
              { icon: Calendar,      label: "Création",      value: new Date(dossier.dateCreation).toLocaleDateString("fr-FR") },
              { icon: Calendar,      label: "Arrivée",       value: new Date(dossier.dateArrivee).toLocaleDateString("fr-FR") },
              ...(dossier.dateLimiteSortie ? [{
                icon: AlertTriangle,
                label: "Limite sortie",
                value: new Date(dossier.dateLimiteSortie).toLocaleDateString("fr-FR"),
              }] : []),
            ].filter(item => item.value).map((item) => (
              <div key={item.label} className="flex items-start gap-3">
                <item.icon className="w-4 h-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="text-sm font-medium text-foreground">{item.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Synthèse financière */}
          <div className="stat-card">
            <h3 className="font-display font-semibold text-foreground mb-3 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-secondary" /> Synthèse financière
            </h3>
            <div className="space-y-2">
              {dossier.montantTaxes && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Droits & Taxes</span>
                  <span className="font-medium">{montantDevise(Number(dossier.montantTaxes))}</span>
                </div>
              )}
              {dossier.montantHonoraires && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Honoraires</span>
                  <span className="font-medium">{montantDevise(Number(dossier.montantHonoraires))}</span>
                </div>
              )}
              {dossier.montantRedevances && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Redevances</span>
                  <span className="font-medium">{montantDevise(Number(dossier.montantRedevances))}</span>
                </div>
              )}
              {finance.totalPaiementsDouane > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Paiements douane</span>
                  <span className="font-medium text-success">
                    {montantDevise(Number(finance.totalPaiementsDouane))}
                  </span>
                </div>
              )}
              {totalCost > 0 && (
                <>
                  <div className="border-t border-border my-2" />
                  <div className="flex justify-between text-sm font-display font-bold">
                    <span className="text-foreground">Total estimé</span>
                    <span className="text-secondary">{montantDevise(totalCost)}</span>
                  </div>
                </>
              )}
              {totalCost === 0 && !dossier.montantTaxes && (
                <p className="text-xs text-muted-foreground">Aucun montant financier renseigné</p>
              )}
            </div>
          </div>

          {/* Priorité */}
          <div className="stat-card">
            <h3 className="font-display font-semibold text-foreground mb-3">Priorité</h3>
            <span className={`status-badge text-sm ${
              dossier.priorite === "haute"   ? "bg-red-100 text-red-700" :
              dossier.priorite === "moyenne" ? "bg-amber-100 text-amber-700" :
              "bg-green-100 text-green-700"
            }`}>
              {dossier.priorite
                ? dossier.priorite.charAt(0).toUpperCase() + dossier.priorite.slice(1)
                : "—"}
            </span>
          </div>

          {/* Conteneurs */}
          <div className="stat-card">
            <h3 className="font-display font-semibold text-foreground mb-3 flex items-center gap-2">
              <Container className="w-4 h-4 text-secondary" />
              Conteneurs ({dossier.nombreConteneurs ?? conteneurs.length})
              {conteneurs.some(c => c.type) && <span className="ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full bg-secondary/10 text-secondary">{resumeConteneurs(conteneursDuDossier(dossier))}</span>}
            </h3>
            {conteneurs.length === 0 ? (
              <p className="text-xs text-muted-foreground">Aucun conteneur renseigné</p>
            ) : (
              <div className="space-y-2">
                {conteneurs.map((c: any, i: number) => (
                  <div key={c.id ?? i}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-md bg-secondary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-[10px] font-bold text-secondary">{i + 1}</span>
                      </div>
                      <div>
                        <p className="text-xs font-mono font-semibold text-foreground">{c.numero ?? c.conteneur ?? c}</p>
                        {c.type && <p className="text-[10px] text-muted-foreground">{c.type}</p>}
                      </div>
                    </div>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      c.statut === "cloture" ? "bg-gray-100 text-gray-600" :
                      c.statut === "sorti"   ? "bg-green-100 text-green-700" :
                      "bg-blue-100 text-blue-700"
                    }`}>
                      {c.statut ?? "En cours"}
                    </span>
                  </div>
                ))}
                {conteneurs.length > 1 && (
                  <p className="text-[10px] text-muted-foreground text-center mt-1">
                    {conteneurs.length} conteneur{conteneurs.length > 1 ? "s" : ""} au total
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Notes */}
          {dossier.notes && (
            <div className="stat-card">
              <h3 className="font-display font-semibold text-foreground mb-2">Notes</h3>
              <p className="text-sm text-muted-foreground">{dossier.notes}</p>
            </div>
          )}
        </motion.div>
      </div>
    </AppLayout>
  );
};

export default DossierDetail;
