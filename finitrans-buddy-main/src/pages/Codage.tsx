import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, getStoredUser } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckSquare, Clock, ChevronRight, Search, FileText,
  Loader2, AlertTriangle, CheckCircle2, Package,
  Ship, Hash, BookOpen, ClipboardCheck, Plus, Trash2, Calculator,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";

const STATUS_LABELS: Record<string, string> = {
  reception: "Réception", soumission_sgs: "Soumission SGS",
  codage: "Codage", validation: "Validation",
  paiement: "Paiement", bon_compagnie: "Bon Cie",
  operations_kribi: "Kribi", cloture: "Clôturé",
};
const STATUS_COLORS: Record<string, string> = {
  reception: "bg-blue-100 text-blue-700", soumission_sgs: "bg-indigo-100 text-indigo-700",
  codage: "bg-purple-100 text-purple-700", validation: "bg-amber-100 text-amber-700",
  paiement: "bg-orange-100 text-orange-700", bon_compagnie: "bg-green-100 text-green-700",
  operations_kribi: "bg-teal-100 text-teal-700", cloture: "bg-gray-100 text-gray-600",
};

const REGIMES = [
  { value: "IM4", label: "IM4 — Mise à la consommation" },
  { value: "IM8", label: "IM8 — Importation temporaire" },
  { value: "IM7", label: "IM7 — Transit" },
  { value: "EC3", label: "EC3 — Entrepôt de stockage" },
];

interface DossierMeta {
  numDeclaration: string;
  regimeDouanier: string;
  prSaisie: boolean;
  observations: string;
}

interface NewPosition {
  codeDouanier: string;
  designation: string;
  valeurCIF: string;
  tauxDroits: string;
  tauxTVA: string;
}

const EMPTY_POS: NewPosition = { codeDouanier: "", designation: "", valeurCIF: "", tauxDroits: "20", tauxTVA: "19.25" };

const CodagePanel = ({ dossier, onClose, onSuccess }: { dossier: any; onClose: () => void; onSuccess: () => void }) => {
  const qc = useQueryClient();

  // ── Champs globaux de la déclaration (stockés sur le Dossier)
  const [meta, setMeta] = useState<DossierMeta>({
    numDeclaration: dossier.numDeclaration ?? "",
    regimeDouanier: dossier.regimeDouanier ?? "IM4",
    prSaisie:       dossier.prSaisie       ?? false,
    observations:   dossier.notes          ?? "",
  });

  // ── Ajout d'une nouvelle position tarifaire
  const [showForm, setShowForm]   = useState(false);
  const [newPos,   setNewPos]     = useState<NewPosition>(EMPTY_POS);

  // Calcul prévisuel pour la nouvelle position
  const cifNum    = parseFloat(newPos.valeurCIF)   || 0;
  const droitsNum = parseFloat(newPos.tauxDroits)  || 0;
  const tvaNum    = parseFloat(newPos.tauxTVA)     || 0;
  const prevDroits = (cifNum * droitsNum) / 100;
  const prevTVA    = ((cifNum + prevDroits) * tvaNum) / 100;

  // ── Positions existantes pour ce dossier
  const { data: posData, refetch: refetchPos } = useQuery({
    queryKey: ["codage-positions", dossier.id],
    queryFn:  () => api.get<any>(`/api/codage?dossierId=${dossier.id}&limit=50`),
    staleTime: 10_000,
  });
  const positions: any[] = posData?.data ?? [];

  // Totaux
  const totalDroits = positions.reduce((s: number, p: any) => s + Number(p.montantDroits), 0);
  const totalTVA    = positions.reduce((s: number, p: any) => s + Number(p.montantTVA),    0);
  const totalGeneral = totalDroits + totalTVA;

  // ── Mutations
  const saveMeta = useMutation({
    mutationFn: () => api.patch(`/api/dossiers/${dossier.id}`, {
      numDeclaration: meta.numDeclaration || undefined,
      regimeDouanier: meta.regimeDouanier || undefined,
      prSaisie:       meta.prSaisie,
      notes:          meta.observations  || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dossiers-codage"] });
      toast({ title: "Déclaration enregistrée", description: dossier.numero });
      onSuccess();
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const addPosition = useMutation({
    mutationFn: () => api.post("/api/codage", {
      dossierId:    dossier.id,
      codeDouanier: newPos.codeDouanier,
      designation:  newPos.designation,
      valeurCIF:    cifNum,
      tauxDroits:   droitsNum,
      tauxTVA:      tvaNum,
    }),
    onSuccess: () => {
      refetchPos();
      setNewPos(EMPTY_POS);
      setShowForm(false);
      toast({ title: "Position tarifaire ajoutée" });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const deletePosition = useMutation({
    mutationFn: (id: string) => api.delete(`/api/codage/${id}`),
    onSuccess: () => { refetchPos(); toast({ title: "Position supprimée" }); },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const advanceStatus = useMutation({
    mutationFn: (newStatus: string) => api.patch(`/api/dossiers/${dossier.id}/status`, { status: newStatus }),
    onSuccess: (_d, newStatus) => {
      qc.invalidateQueries({ queryKey: ["dossiers-codage"] });
      toast({ title: "Étape avancée", description: `→ ${STATUS_LABELS[newStatus]}` });
      onClose();
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const nextStatusMap: Record<string, string> = {
    reception: "soumission_sgs", soumission_sgs: "codage",
    codage: "validation", validation: "paiement",
  };
  const nextStatus = nextStatusMap[dossier.status];

  const canAdd = !!newPos.codeDouanier && !!newPos.designation && cifNum > 0;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="stat-card border-secondary/20 bg-secondary/3 mt-3 space-y-5">

      {/* ── En-tête ─────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h4 className="font-display font-semibold text-foreground flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-secondary" />
          Fiche de codage — {dossier.numero}
        </h4>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
      </div>

      {/* ── Informations de la déclaration ──────────────── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">N° Déclaration douanière</Label>
          <Input placeholder="Ex: CM25-0047821" value={meta.numDeclaration}
            onChange={e => setMeta({ ...meta, numDeclaration: e.target.value })}
            className="bg-card font-mono text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Régime douanier</Label>
          <Select value={meta.regimeDouanier} onValueChange={v => setMeta({ ...meta, regimeDouanier: v })}>
            <SelectTrigger className="bg-card"><SelectValue /></SelectTrigger>
            <SelectContent>
              {REGIMES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* PR Prise en charge */}
      <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/30">
        <button
          onClick={() => setMeta({ ...meta, prSaisie: !meta.prSaisie })}
          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all flex-shrink-0 ${
            meta.prSaisie ? "bg-secondary border-secondary" : "border-border"
          }`}
        >
          {meta.prSaisie && <span className="text-white text-[9px] font-black">✓</span>}
        </button>
        <div>
          <p className="text-sm font-medium text-foreground">PR (Prise en charge) saisie</p>
          <p className="text-xs text-muted-foreground">Cocher une fois la prise en charge enregistrée dans le système douanier</p>
        </div>
      </div>

      {/* ── Positions tarifaires ─────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h5 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Hash className="w-3.5 h-3.5 text-secondary" />
            Positions tarifaires
            {positions.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-secondary/15 text-secondary text-[10px] font-bold">
                {positions.length}
              </span>
            )}
          </h5>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
            onClick={() => setShowForm(v => !v)}>
            <Plus className="w-3 h-3" />
            Ajouter une position
          </Button>
        </div>

        {/* Tableau des positions existantes */}
        {positions.length > 0 && (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr className="text-muted-foreground">
                  <th className="text-left px-3 py-2 font-medium">Code SH</th>
                  <th className="text-left px-3 py-2 font-medium">Désignation</th>
                  <th className="text-right px-3 py-2 font-medium">Valeur CIF</th>
                  <th className="text-right px-3 py-2 font-medium">Droits</th>
                  <th className="text-right px-3 py-2 font-medium">TVA</th>
                  <th className="w-8 px-2 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {positions.map((p: any, i: number) => (
                  <tr key={p.id} className={i % 2 === 0 ? "bg-card" : "bg-muted/20"}>
                    <td className="px-3 py-2 font-mono font-semibold text-secondary">{p.codeDouanier}</td>
                    <td className="px-3 py-2 text-foreground max-w-[180px] truncate">{p.designation}</td>
                    <td className="px-3 py-2 text-right font-mono">{Number(p.valeurCIF).toLocaleString("fr-FR")}</td>
                    <td className="px-3 py-2 text-right font-mono text-orange-600">{Number(p.montantDroits).toLocaleString("fr-FR")}</td>
                    <td className="px-3 py-2 text-right font-mono text-blue-600">{Number(p.montantTVA).toLocaleString("fr-FR")}</td>
                    <td className="px-2 py-2">
                      {p.statut === "brouillon" && (
                        <button
                          onClick={() => deletePosition.mutate(p.id)}
                          disabled={deletePosition.isPending}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/60 border-t border-border font-semibold">
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-xs text-foreground flex items-center gap-1">
                    <Calculator className="w-3 h-3 text-secondary" />
                    TOTAL ({positions.length} position{positions.length > 1 ? "s" : ""})
                  </td>
                  <td className="px-3 py-2 text-right text-xs font-mono text-orange-600">{totalDroits.toLocaleString("fr-FR")}</td>
                  <td className="px-3 py-2 text-right text-xs font-mono text-blue-600">{totalTVA.toLocaleString("fr-FR")}</td>
                  <td></td>
                </tr>
                <tr>
                  <td colSpan={4} className="px-3 py-1.5 text-xs text-muted-foreground">Total droits + TVA</td>
                  <td className="px-3 py-1.5 text-right text-sm font-display font-black text-foreground">{totalGeneral.toLocaleString("fr-FR")} FCFA</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {positions.length === 0 && !showForm && (
          <p className="text-xs text-muted-foreground text-center py-3 border border-dashed border-border rounded-xl">
            Aucune position tarifaire — cliquez "Ajouter une position"
          </p>
        )}

        {/* Formulaire d'ajout d'une nouvelle position */}
        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden">
              <div className="rounded-xl border border-secondary/30 bg-secondary/5 p-4 space-y-3">
                <p className="text-xs font-semibold text-secondary flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Nouvelle position tarifaire
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Code SH (HS Code) *</Label>
                    <Input placeholder="Ex: 8544.42.90" value={newPos.codeDouanier}
                      onChange={e => setNewPos({ ...newPos, codeDouanier: e.target.value })}
                      className="bg-card font-mono text-sm h-8" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Désignation de la marchandise *</Label>
                    <Input placeholder="Ex: Câbles électriques isolés" value={newPos.designation}
                      onChange={e => setNewPos({ ...newPos, designation: e.target.value })}
                      className="bg-card text-sm h-8" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Valeur CIF (FCFA) *</Label>
                    <Input type="number" min={1} placeholder="Ex: 12 500 000" value={newPos.valeurCIF}
                      onChange={e => setNewPos({ ...newPos, valeurCIF: e.target.value })}
                      className="bg-card font-mono text-sm h-8" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Taux droits %</Label>
                      <Input type="number" min={0} max={100} step={0.5} value={newPos.tauxDroits}
                        onChange={e => setNewPos({ ...newPos, tauxDroits: e.target.value })}
                        className="bg-card font-mono text-sm h-8" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Taux TVA %</Label>
                      <Input type="number" min={0} max={100} step={0.25} value={newPos.tauxTVA}
                        onChange={e => setNewPos({ ...newPos, tauxTVA: e.target.value })}
                        className="bg-card font-mono text-sm h-8" />
                    </div>
                  </div>
                </div>
                {/* Prévisualisation des montants */}
                {cifNum > 0 && (
                  <div className="flex items-center gap-4 text-xs bg-card rounded-lg px-3 py-2 border border-border">
                    <span className="text-muted-foreground">Droits :</span>
                    <span className="font-mono font-semibold text-orange-600">{prevDroits.toLocaleString("fr-FR")} FCFA</span>
                    <span className="text-muted-foreground">TVA :</span>
                    <span className="font-mono font-semibold text-blue-600">{prevTVA.toLocaleString("fr-FR")} FCFA</span>
                    <span className="text-muted-foreground ml-auto">Total :</span>
                    <span className="font-display font-black text-foreground">{(prevDroits + prevTVA).toLocaleString("fr-FR")} FCFA</span>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => { setShowForm(false); setNewPos(EMPTY_POS); }}>
                    Annuler
                  </Button>
                  <Button size="sm" className="text-xs h-8 gap-1 bg-secondary text-secondary-foreground"
                    onClick={() => addPosition.mutate()} disabled={!canAdd || addPosition.isPending}>
                    {addPosition.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    Ajouter cette position
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Observations */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Observations</Label>
        <Input placeholder="Remarques ou informations complémentaires..."
          value={meta.observations}
          onChange={e => setMeta({ ...meta, observations: e.target.value })}
          className="bg-card text-sm" />
      </div>

      {/* ── Actions ─────────────────────────────────────── */}
      <div className="flex gap-2 pt-1 border-t border-border">
        <Button variant="outline" onClick={() => saveMeta.mutate()} disabled={saveMeta.isPending} className="gap-1.5 text-sm">
          {saveMeta.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Enregistrer déclaration
        </Button>
        {nextStatus && (
          <Button
            onClick={() => advanceStatus.mutate(nextStatus)}
            disabled={advanceStatus.isPending}
            className="gap-1.5 bg-secondary text-secondary-foreground hover:opacity-90 text-sm"
          >
            {advanceStatus.isPending
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <ChevronRight className="w-3.5 h-3.5" />}
            Passer à : {STATUS_LABELS[nextStatus]}
          </Button>
        )}
      </div>
    </motion.div>
  );
};

const Codage = () => {
  const user = getStoredUser();
  const [search, setSearch] = useState("");
  const [openPanel, setOpenPanel] = useState<string | null>(null);

  const { data: enCours, isLoading: loadingCours } = useQuery({
    queryKey: ["dossiers-codage", "en-cours"],
    queryFn:  () => api.get<any>("/api/dossiers?status=reception,soumission_sgs,codage&limit=80"),
    refetchInterval: 30_000,
  });
  const { data: enValid } = useQuery({
    queryKey: ["dossiers-codage", "validation"],
    queryFn:  () => api.get<any>("/api/dossiers?status=validation&limit=80"),
    refetchInterval: 30_000,
  });
  const { data: valides } = useQuery({
    queryKey: ["dossiers-codage", "valides"],
    queryFn:  () => api.get<any>("/api/dossiers?status=paiement,bon_compagnie,cloture&limit=80"),
    staleTime: 60_000,
  });

  const filter = (list: any[]) =>
    list.filter(d =>
      !search ||
      d.numero?.toLowerCase().includes(search.toLowerCase()) ||
      d.client?.toLowerCase().includes(search.toLowerCase()) ||
      d.conteneur?.toLowerCase().includes(search.toLowerCase()),
    );

  const coursList = filter(enCours?.data ?? []);
  const validList = filter(enValid?.data ?? []);
  const finalList = filter(valides?.data ?? []);

  const DossierCard = ({ d }: { d: any }) => {
    const isOpen = openPanel === d.id;
    const enRetard = d.dateLimiteSortie && new Date(d.dateLimiteSortie) < new Date() && d.status !== "cloture";
    return (
      <motion.div key={d.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
        <div className={`stat-card ${enRetard ? "border-destructive/30 bg-destructive/5" : ""}`}>
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-sm font-display font-bold text-foreground">{d.numero}</span>
                <span className={`status-badge ${STATUS_COLORS[d.status] ?? "bg-gray-100 text-gray-600"}`}>
                  {STATUS_LABELS[d.status] ?? d.status}
                </span>
                {enRetard && <span className="status-badge bg-red-100 text-red-700">EN RETARD</span>}
                {d.prSaisie && <span className="status-badge bg-green-100 text-green-700">PR ✓</span>}
              </div>
              <p className="text-sm text-foreground">{d.client}</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1.5">
                <span className="flex items-center gap-1"><Ship className="w-3 h-3" />{d.compagnie?.replace("_","-")}</span>
                <span className="flex items-center gap-1 font-mono"><Package className="w-3 h-3" />{d.conteneur}</span>
                {d.positionTarifaire && <span className="flex items-center gap-1"><Hash className="w-3 h-3" />{d.positionTarifaire}</span>}
                {d.numDeclaration && <span className="flex items-center gap-1 text-secondary"><FileText className="w-3 h-3" />{d.numDeclaration}</span>}
              </div>
            </div>
            <Button size="sm" variant={isOpen ? "secondary" : "outline"}
              onClick={() => setOpenPanel(isOpen ? null : d.id)}
              className="gap-1.5 text-xs h-8 flex-shrink-0 ml-3">
              <ClipboardCheck className="w-3.5 h-3.5" />
              {isOpen ? "Fermer" : "Coder"}
            </Button>
          </div>
          <AnimatePresence>
            {isOpen && (
              <CodagePanel
                dossier={d}
                onClose={() => setOpenPanel(null)}
                onSuccess={() => setOpenPanel(null)}
              />
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    );
  };

  return (
    <AppLayout
      title="Codage & Validation"
      subtitle={`${user?.nom ?? ""} — États de codage, PR, validation des déclarations`}
    >
      {/* Search */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Rechercher dossier, client, conteneur..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-card" />
        </div>
      </div>

      {/* KPIs rapides */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "À coder",      value: coursList.length, color: "text-secondary",   icon: BookOpen },
          { label: "En validation",value: validList.length, color: "text-warning",     icon: Clock },
          { label: "Validés",      value: finalList.length, color: "text-success",     icon: CheckCircle2 },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }} className="stat-card">
            <div className="flex items-center gap-2 mb-1">
              <s.icon className={`w-4 h-4 ${s.color}`} />
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
            <div className={`text-2xl font-display font-black ${s.color}`}>{s.value}</div>
          </motion.div>
        ))}
      </div>

      <Tabs defaultValue="coder">
        <TabsList className="mb-4">
          <TabsTrigger value="coder" className="gap-1.5">
            <BookOpen className="w-3.5 h-3.5" /> À coder
            {coursList.length > 0 && (
              <span className="w-5 h-5 rounded-full bg-secondary text-secondary-foreground text-[10px] font-bold flex items-center justify-center">
                {coursList.length > 9 ? "9+" : coursList.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="validation" className="gap-1.5">
            <CheckSquare className="w-3.5 h-3.5" /> En validation ({validList.length})
          </TabsTrigger>
          <TabsTrigger value="valides" className="gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> Validés ({finalList.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="coder">
          {loadingCours ? (
            <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-secondary" /></div>
          ) : (
            <div className="space-y-3 max-w-3xl">
              {coursList.map(d => <DossierCard key={d.id} d={d} />)}
              {coursList.length === 0 && (
                <div className="text-center py-16 text-muted-foreground">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-success/50" />
                  <p className="font-medium">Tous les dossiers sont codés</p>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="validation">
          <div className="space-y-3 max-w-3xl">
            {validList.map(d => <DossierCard key={d.id} d={d} />)}
            {validList.length === 0 && <p className="text-center py-10 text-muted-foreground">Aucun dossier en validation</p>}
          </div>
        </TabsContent>

        <TabsContent value="valides">
          <div className="space-y-3 max-w-3xl">
            {finalList.map(d => (
              <motion.div key={d.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="stat-card opacity-80 flex items-center gap-3 py-3">
                <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
                <span className="text-sm font-semibold text-foreground">{d.numero}</span>
                <span className="text-sm text-muted-foreground">{d.client}</span>
                <span className={`status-badge ml-auto ${STATUS_COLORS[d.status]}`}>{STATUS_LABELS[d.status]}</span>
                {d.numDeclaration && <span className="text-xs font-mono text-muted-foreground">{d.numDeclaration}</span>}
              </motion.div>
            ))}
            {finalList.length === 0 && <p className="text-center py-10 text-muted-foreground">Aucun dossier finalisé</p>}
          </div>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
};

export default Codage;
