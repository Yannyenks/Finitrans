import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, getStoredUser } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckSquare, Clock, ChevronRight, Search, FileText,
  Loader2, AlertTriangle, CheckCircle2, Package,
  Ship, Hash, BookOpen, ClipboardCheck,
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

interface CodageForm {
  numDeclaration: string;
  positionTarifaire: string;
  regime: string;
  valeurDouane: string;
  prSaisie: boolean;
  observations: string;
}

const CodagePanel = ({ dossier, onClose, onSuccess }: { dossier: any; onClose: () => void; onSuccess: () => void }) => {
  const qc = useQueryClient();
  const [form, setForm] = useState<CodageForm>({
    numDeclaration: dossier.numDeclaration ?? "",
    positionTarifaire: dossier.positionTarifaire ?? "",
    regime: dossier.regime ?? "IM4",
    valeurDouane: dossier.valeurDouane ?? "",
    prSaisie: dossier.prSaisie ?? false,
    observations: "",
  });

  const saveCodeage = useMutation({
    mutationFn: (payload: any) => api.patch(`/api/dossiers/${dossier.id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dossiers-codage"] });
      toast({ title: "Codage enregistré", description: `Dossier ${dossier.numero}` });
      onSuccess();
    },
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

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="stat-card border-secondary/20 bg-secondary/3 mt-3 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-display font-semibold text-foreground flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-secondary" />
          Fiche de codage — {dossier.numero}
        </h4>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">N° Déclaration douanière</Label>
          <Input placeholder="Ex: CM25-0047821" value={form.numDeclaration}
            onChange={e => setForm({ ...form, numDeclaration: e.target.value })}
            className="bg-card font-mono text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Position tarifaire (HS Code)</Label>
          <Input placeholder="Ex: 8544.42.90" value={form.positionTarifaire}
            onChange={e => setForm({ ...form, positionTarifaire: e.target.value })}
            className="bg-card font-mono text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Régime douanier</Label>
          <Select value={form.regime} onValueChange={v => setForm({ ...form, regime: v })}>
            <SelectTrigger className="bg-card"><SelectValue /></SelectTrigger>
            <SelectContent>
              {REGIMES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Valeur en douane (FCFA)</Label>
          <Input type="number" placeholder="Ex: 12 500 000" value={form.valeurDouane}
            onChange={e => setForm({ ...form, valeurDouane: e.target.value })}
            className="bg-card font-mono text-sm" />
        </div>
      </div>

      {/* PR Prise en charge */}
      <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/30">
        <button
          onClick={() => setForm({ ...form, prSaisie: !form.prSaisie })}
          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all flex-shrink-0 ${
            form.prSaisie ? "bg-secondary border-secondary" : "border-border"
          }`}
        >
          {form.prSaisie && <span className="text-white text-[9px] font-black">✓</span>}
        </button>
        <div>
          <p className="text-sm font-medium text-foreground">PR (Prise en charge) saisie</p>
          <p className="text-xs text-muted-foreground">Cocher une fois la prise en charge enregistrée dans le système douanier</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Observations</Label>
        <Input placeholder="Remarques ou informations complémentaires..."
          value={form.observations}
          onChange={e => setForm({ ...form, observations: e.target.value })}
          className="bg-card text-sm" />
      </div>

      <div className="flex gap-2 pt-1 border-t border-border">
        <Button variant="outline" onClick={() => saveCodeage.mutate({
          numDeclaration: form.numDeclaration,
          positionTarifaire: form.positionTarifaire,
          regime: form.regime,
          valeurDouane: form.valeurDouane ? parseFloat(form.valeurDouane) : undefined,
          prSaisie: form.prSaisie,
          notes: form.observations || undefined,
        })} disabled={saveCodeage.isPending} className="gap-1.5 text-sm">
          {saveCodeage.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Enregistrer brouillon
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
