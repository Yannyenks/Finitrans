import { useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, getStoredUser, uploadFile } from "@/lib/api";
import {
  ArrowLeft, Ship, MapPin, Calendar, User, Package, FileText,
  MessageSquare, CheckCircle2, History, Send, ClipboardList,
  DollarSign, AlertTriangle, Loader2, ChevronRight, ChevronDown, Upload,
  Image as ImageIcon, Banknote, Plus, Code2, ShieldCheck, Landmark,
  Clock, AlertCircle, X, Container, Receipt,
} from "lucide-react";
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
import SousEtapesPanel, { SOUS_ETAPES_CONFIG } from "@/components/dossier/SousEtapesPanel";
import { useSousEtapes } from "@/hooks/useSousEtapes";

const STATUS_LABELS: Record<string, string> = {
  reception:        "Réception",
  soumission_sgs:   "Soumission SGS",
  codage:           "Codage",
  validation:       "Validation",
  paiement:         "Paiement",
  bon_compagnie:    "Bon Compagnie",
  operations_kribi: "Kribi",
  cloture:          "Clôturé",
};
const STATUS_COLORS: Record<string, string> = {
  reception:        "bg-blue-100 text-blue-700",
  soumission_sgs:   "bg-indigo-100 text-indigo-700",
  codage:           "bg-purple-100 text-purple-700",
  validation:       "bg-amber-100 text-amber-700",
  paiement:         "bg-orange-100 text-orange-700",
  bon_compagnie:    "bg-green-100 text-green-700",
  operations_kribi: "bg-teal-100 text-teal-700",
  cloture:          "bg-gray-100 text-gray-600",
};
const STATUS_ORDER = [
  "reception", "soumission_sgs", "codage", "validation",
  "paiement", "bon_compagnie", "operations_kribi", "cloture",
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
  operations_kribi: { icon: MapPin,        description: "Opérations de dédouanement et de livraison au port de Kribi",                               iconBg: "bg-teal-100",   iconText: "text-teal-700",   iconRing: "ring-teal-300",   borderActive: "border-teal-200/60",   bgActive: "from-teal-50/60"   },
  cloture:          { icon: CheckCircle2,  description: "Dossier clôturé — marchandise livrée au client, opérations terminées",                      iconBg: "bg-gray-100",   iconText: "text-gray-600",   iconRing: "ring-gray-300",   borderActive: "border-gray-200/60",   bgActive: "from-gray-50/60"   },
};

// ── SLA par étape (en heures) ─────────────────────────────────────────────────
const SLA_HOURS: Record<string, number> = {
  reception:        24,
  soumission_sgs:   48,
  codage:           24,
  validation:       48,
  paiement:         72,
  bon_compagnie:    48,
  operations_kribi: 72,
  cloture:          24,
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
): { elapsedH: number; slaH: number; pct: number; status: "ok" | "warning" | "critical" } | null => {
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
  const [diFile,   setDiFile]   = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [creating, setCreating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleCreate = async () => {
    const m = parseFloat(montant);
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

      <div className="flex gap-2 items-end">
        <div className="flex-1 space-y-1">
          <Label className="text-xs">Montant DI (FCFA) *</Label>
          <Input
            type="number" min={1}
            placeholder="Ex : 45 000 000"
            value={montant}
            onChange={e => setMontant(e.target.value)}
            className="h-9 text-sm bg-muted/40 font-mono"
          />
        </div>
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
        <Button onClick={handleCreate} disabled={creating || !montant || !diFile}
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

// ── Page ─────────────────────────────────────────────────────────────────────

const DossierDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = getStoredUser();
  const canAdvance      = user?.permDossier   === "complet" || user?.permDossier   === "partiel";
  const canReadFinance  = user?.permFinancier !== "non";
  const canEditFinance  = user?.permFinancier === "complet" || user?.permFinancier === "partiel";
  const canRechargeFinance = user?.permFinancier === "complet";

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
  const { allValidated } = useSousEtapes(id ?? "");

  // Retard / SLA state
  const [retardDialog, setRetardDialog]   = useState(false);
  const [retardMotif, setRetardMotif]     = useState("");
  const [retardAutre, setRetardAutre]     = useState("");
  const [pendingAdvance, setPendingAdvance] = useState<string | null>(null);

  const toggleStep = (stepKey: string) =>
    setExpandedSteps(prev => { const s = new Set(prev); s.has(stepKey) ? s.delete(stepKey) : s.add(stepKey); return s; });

  const { data: dossier, isLoading } = useQuery({
    queryKey: ["dossier", id],
    queryFn:  () => api.get<any>(`/api/dossiers/${id}`),
    enabled:  !!id,
  });

  const { data: parcoursData } = useQuery({
    queryKey: ["dossier-parcours", id],
    queryFn:  () => api.get<any>(`/api/dossiers/${id}/parcours`),
    enabled:  !!id,
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

  const { data: conteneursData } = useQuery({
    queryKey: ["dossier-conteneurs", id],
    queryFn:  () => api.get<any[]>(`/api/dossiers/${id}/conteneurs`).catch(() => []),
    enabled:  !!id,
  });

  // Utilisateurs pour assignation sous-étapes
  const { data: usersData } = useQuery({
    queryKey: ["employes-list"],
    queryFn:  () => api.get<any>("/api/employes").catch(() => ({ data: [] })),
    staleTime: 5 * 60_000,
  });
  const usersList = (Array.isArray(usersData) ? usersData : (usersData?.data ?? [])).map(
    (u: any) => ({ id: u.id, nom: u.nom, profil: u.profil })
  );

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
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast({ title: "Document uploadé avec succès" });
    },
    onError: (err: any) =>
      toast({ title: "Erreur upload", description: err.message ?? "Échec", variant: "destructive" }),
  });

  const advanceStatus = useMutation({
    mutationFn: (newStatus: string) =>
      api.patch(`/api/dossiers/${id}/status`, { status: newStatus }),
    onSuccess: (_data, newStatus) => {
      qc.invalidateQueries({ queryKey: ["dossier", id] });
      qc.invalidateQueries({ queryKey: ["dossier-parcours", id] });
      qc.invalidateQueries({ queryKey: ["dossiers"] });
      notif.dossierAvance(
        STATUS_LABELS[dossier?.status ?? ""] ?? dossier?.status ?? "",
        STATUS_LABELS[newStatus] ?? newStatus,
      );
    },
    onError: (err: any) => notif.erreur(err.message ?? "Échec avancement"),
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

  const currentStepIdx  = STATUS_ORDER.indexOf(dossier.status);
  const nextStatus      = STATUS_ORDER[currentStepIdx + 1] ?? null;
  const effectiveEtape  = uploadEtape || dossier.status;
  const docs: any[]     = docsData ?? [];
  const comments        = commentsData?.data ?? commentsData ?? [];
  const audit           = auditData?.data    ?? auditData    ?? [];
  const timeline        = parcoursData?.timeline ?? [];
  const finance         = parcoursData?.finance  ?? {};
  const diId            = dossier.diId as string | undefined;
  const conteneurs: any[] = Array.isArray(conteneursData) ? conteneursData
    : dossier.conteneur ? [{ id: "main", numero: dossier.conteneur, statut: dossier.status }]
    : [];

  // Preuves obligatoires — docs de l'étape courante
  const currentStepDocs = docs.filter((d: any) => d.etape === dossier.status);
  const hasProofForCurrentStep = currentStepDocs.length > 0;

  const handleAdvanceClick = () => {
    if (!nextStatus) return;

    // Vérifier que toutes les sous-étapes de l'étape courante sont validées
    const stepConfigs = SOUS_ETAPES_CONFIG[dossier.status] ?? [];
    if (stepConfigs.length > 0 && !allValidated(dossier.status, stepConfigs.length)) {
      notif.avancementBloque(STATUS_LABELS[dossier.status] ?? dossier.status);
      if (!expandedSteps.has(dossier.status))
        setExpandedSteps(prev => { const s = new Set(prev); s.add(dossier.status); return s; });
      return;
    }

    if (!hasProofForCurrentStep) {
      notif.erreur(`Veuillez joindre au moins un document de preuve pour l'étape "${STATUS_LABELS[dossier.status]}" avant de continuer.`);
      setInlineUploadStep(dossier.status);
      if (!expandedSteps.has(dossier.status))
        setExpandedSteps(prev => { const s = new Set(prev); s.add(dossier.status); return s; });
      return;
    }
    const sla = getSLAStatus(dossier.status, timeline, dossier.dateCreation);
    if (sla && sla.status === "critical") {
      setPendingAdvance(nextStatus);
      setRetardDialog(true);
    } else {
      advanceStatus.mutate(nextStatus);
    }
  };

  const confirmRetardAdvance = () => {
    if (!pendingAdvance) return;
    const motifFinal = retardMotif === "Autre" ? retardAutre : retardMotif;
    if (!motifFinal.trim()) {
      toast({ title: "Veuillez sélectionner un motif de retard", variant: "destructive" });
      return;
    }
    advanceStatus.mutate(pendingAdvance);
    setRetardDialog(false);
    setRetardMotif("");
    setRetardAutre("");
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
                <strong>{SLA_HOURS[dossier.status]}h</strong>. Veuillez indiquer le motif du retard avant de continuer.
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

      <button onClick={() => navigate("/dossiers")}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Retour aux dossiers
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Colonne principale ─────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2 space-y-6"
        >
          {/* ══ Progression du dossier — Ultra Premium ═══════════════════ */}
          <div className="stat-card overflow-hidden">
            {/* En-tête */}
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-display font-semibold text-foreground">Progression du dossier</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {dossier.status === "cloture"
                    ? "Dossier clôturé avec succès"
                    : `Étape ${currentStepIdx + 1} / ${STATUS_ORDER.length} — ${Math.round((currentStepIdx / (STATUS_ORDER.length - 1)) * 100)}% accompli`}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`status-badge ${STATUS_COLORS[dossier.status] ?? "bg-gray-100 text-gray-600"}`}>
                  {STATUS_LABELS[dossier.status] ?? dossier.status}
                </span>
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
                      className="gap-1.5 bg-secondary text-secondary-foreground hover:opacity-90 text-xs h-7 px-3"
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
                animate={{ width: `${dossier.status === "cloture" ? 100 : Math.round((currentStepIdx / (STATUS_ORDER.length - 1)) * 100)}%` }}
                transition={{ duration: 1.4, ease: "easeOut", delay: 0.2 }}
              />
            </div>

            {/* Étapes */}
            <div className="space-y-2">
              {STATUS_ORDER.map((stepKey, i) => {
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
                        className={`flex items-center gap-3 px-4 py-3 ${(isCompleted || isCurrent) ? "cursor-pointer select-none" : ""}`}
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
                        </div>

                        {/* SLA indicateur */}
                        {isCurrent && (() => {
                          const sla = getSLAStatus(stepKey, timeline, dossier.dateCreation);
                          if (!sla) return null;
                          return (
                            <div className="flex items-center gap-1.5 flex-shrink-0 mx-2">
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
                                {sla.elapsedH}h / {sla.slaH}h
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
                          {(isCompleted || isCurrent) && canAdvance && (
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
                                  <a
                                    key={doc.id}
                                    href={`${doc.url}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/40 hover:bg-muted transition-colors group"
                                    onClick={e => e.stopPropagation()}
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
                                  </a>
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
                          {(diInfo.soldeNum ?? 0).toLocaleString("fr-FR")} {diInfo.devise ?? "XAF"}
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
                {timeline.map((evt: any) => (
                  <div key={evt.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="w-2 h-2 rounded-full bg-secondary mt-1.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{evt.label ?? evt.action ?? evt.type}</p>
                      {evt.details && <p className="text-xs text-secondary mt-0.5">{evt.details}</p>}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {evt.auteur?.nom ?? ""} • {new Date(evt.date ?? evt.createdAt).toLocaleString("fr-FR")}
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
                {canAdvance && (
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
                            {STATUS_ORDER.map(s => (
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
                      <a
                        key={doc.id}
                        href={`${doc.url}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group"
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
                      </a>
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
          {/* Informations */}
          <div className="stat-card space-y-4">
            <h3 className="font-display font-semibold text-foreground">Informations</h3>
            {[
              { icon: Package,       label: "Marchandise",   value: dossier.marchandise },
              { icon: Ship,          label: "Compagnie",     value: dossier.compagnie?.replace("_", "-") },
              { icon: FileText,      label: "Conteneur",     value: dossier.conteneur },
              { icon: MapPin,        label: "Site",          value: dossier.site },
              { icon: User,          label: "Responsable",   value: dossier.responsable?.nom ?? "—" },
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
                  <span className="font-medium">{Number(dossier.montantTaxes).toLocaleString("fr-FR")} FCFA</span>
                </div>
              )}
              {dossier.montantHonoraires && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Honoraires</span>
                  <span className="font-medium">{Number(dossier.montantHonoraires).toLocaleString("fr-FR")} FCFA</span>
                </div>
              )}
              {dossier.montantRedevances && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Redevances</span>
                  <span className="font-medium">{Number(dossier.montantRedevances).toLocaleString("fr-FR")} FCFA</span>
                </div>
              )}
              {finance.totalPaiementsDouane > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Paiements douane</span>
                  <span className="font-medium text-success">
                    {Number(finance.totalPaiementsDouane).toLocaleString("fr-FR")} FCFA
                  </span>
                </div>
              )}
              {totalCost > 0 && (
                <>
                  <div className="border-t border-border my-2" />
                  <div className="flex justify-between text-sm font-display font-bold">
                    <span className="text-foreground">Total estimé</span>
                    <span className="text-secondary">{totalCost.toLocaleString("fr-FR")} FCFA</span>
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
              Conteneurs ({conteneurs.length})
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
