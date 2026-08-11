import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, getStoredUser } from "@/lib/api";
import { motion } from "framer-motion";
import {
  PackageOpen, Ship, AlertTriangle, Clock, CheckCircle2,
  FileText, DollarSign, Loader2, ChevronRight, Search,
  Receipt, RotateCcw, Ban, Plus, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

const STATUS_LABELS: Record<string, string> = {
  paiement: "Paiement", bon_compagnie: "Bon Compagnie",
  operations_kribi: "Kribi", cloture: "Clôturé",
};
const STATUS_COLORS: Record<string, string> = {
  paiement: "bg-orange-100 text-orange-700",
  bon_compagnie: "bg-green-100 text-green-700",
  operations_kribi: "bg-teal-100 text-teal-700",
  cloture: "bg-gray-100 text-gray-600",
};

// ── Penalité dialog ────────────────────────────────────────────────────────────
const PenaliteDialog = ({ dossier, open, onClose }: { dossier: any; open: boolean; onClose: () => void }) => {
  const qc = useQueryClient();
  const [form, setForm] = useState({ montant: "", raison: "", dateEcheance: "" });

  const addPenalite = useMutation({
    mutationFn: () => api.post(`/api/dossiers/${dossier.id}/penalites`, {
      montant: parseFloat(form.montant),
      raison: form.raison,
      dateEcheance: form.dateEcheance ? new Date(form.dateEcheance).toISOString() : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dossiers-sorties"] });
      toast({ title: "Pénalité enregistrée", description: `${dossier.numero}` });
      setForm({ montant: "", raison: "", dateEcheance: "" });
      onClose();
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Ban className="w-4 h-4 text-destructive" />
            Pénalité — {dossier?.numero}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Montant (FCFA) *</Label>
            <Input type="number" value={form.montant} onChange={e => setForm({ ...form, montant: e.target.value })}
              placeholder="Ex: 250 000" className="bg-muted/50 font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Raison de la pénalité *</Label>
            <Textarea value={form.raison} onChange={e => setForm({ ...form, raison: e.target.value })}
              placeholder="Ex: Surestarie — dépassement du délai de franchise de 7 jours..."
              className="bg-muted/50 h-20" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Date d'échéance</Label>
            <Input type="date" value={form.dateEcheance} onChange={e => setForm({ ...form, dateEcheance: e.target.value })}
              className="bg-muted/50" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button onClick={() => addPenalite.mutate()} disabled={!form.montant || !form.raison || addPenalite.isPending}
              className="bg-destructive text-destructive-foreground gap-2">
              {addPenalite.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Enregistrer la pénalité
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ── Bon compagnie dialog ───────────────────────────────────────────────────────
const BonCompagnieDialog = ({ dossier, open, onClose }: { dossier: any; open: boolean; onClose: () => void }) => {
  const qc = useQueryClient();
  const [form, setForm] = useState({ numeroBon: "", montant: "", typePaiement: "virement", observations: "" });

  const createBon = useMutation({
    mutationFn: () => api.post(`/api/finance/paiements-compagnie`, {
      dossierId: dossier.id,
      compagnie: dossier.compagnie,
      type: "manutention",
      montant: parseFloat(form.montant),
      reference: form.numeroBon,
      notes: form.observations || undefined,
      datePaiement: new Date().toISOString(),
      statut: "paye",
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dossiers-sorties"] });
      qc.invalidateQueries({ queryKey: ["paiements-compagnie"] });
      toast({ title: "Bon compagnie enregistré", description: `Réf. ${form.numeroBon}` });
      onClose();
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const advanceStatus = useMutation({
    mutationFn: () => api.patch(`/api/dossiers/${dossier.id}/status`, { status: "cloture" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dossiers-sorties"] });
      toast({ title: "Dossier clôturé", description: dossier.numero });
      onClose();
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Receipt className="w-4 h-4 text-secondary" />
            Bon Compagnie — {dossier?.numero}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="rounded-xl bg-muted/40 p-3 text-sm">
            <span className="text-muted-foreground">Compagnie : </span>
            <span className="font-semibold text-foreground">{dossier?.compagnie?.replace("_", "-")}</span>
            <span className="text-muted-foreground ml-3">Client : </span>
            <span className="font-semibold text-foreground">{dossier?.client}</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">N° Bon / Référence *</Label>
              <Input value={form.numeroBon} onChange={e => setForm({ ...form, numeroBon: e.target.value })}
                placeholder="Ex: BON-MSC-2025-0041" className="bg-muted/50 font-mono text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Montant payé (FCFA)</Label>
              <Input type="number" value={form.montant} onChange={e => setForm({ ...form, montant: e.target.value })}
                placeholder="Ex: 180 000" className="bg-muted/50 font-mono" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Mode de paiement</Label>
            <Select value={form.typePaiement} onValueChange={v => setForm({ ...form, typePaiement: v })}>
              <SelectTrigger className="bg-muted/50"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="virement">Virement bancaire</SelectItem>
                <SelectItem value="cheque">Chèque</SelectItem>
                <SelectItem value="especes">Espèces</SelectItem>
                <SelectItem value="mobile">Mobile Money</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Observations</Label>
            <Input value={form.observations} onChange={e => setForm({ ...form, observations: e.target.value })}
              placeholder="Informations complémentaires..." className="bg-muted/50" />
          </div>
          <div className="flex justify-end gap-2 pt-1 border-t border-border">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button onClick={() => createBon.mutate()} disabled={!form.numeroBon || createBon.isPending}
              className="gap-2 bg-secondary text-secondary-foreground">
              {createBon.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Enregistrer le bon
            </Button>
            <Button onClick={() => advanceStatus.mutate()} disabled={advanceStatus.isPending}
              className="gap-2 bg-success text-white">
              {advanceStatus.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Clôturer le dossier
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ── Facturation dossier fini ───────────────────────────────────────────────────
const FacturationDialog = ({ dossier, open, onClose }: { dossier: any; open: boolean; onClose: () => void }) => {
  const [form, setForm] = useState({ numFacture: "", montantHT: "", tva: "19.25", notes: "" });

  const handleGenerate = () => {
    toast({
      title: "Facture générée",
      description: `${form.numFacture || `FACT-${dossier?.numero}`} — ${parseFloat(form.montantHT || "0").toLocaleString("fr-FR")} FCFA HT`,
    });
    onClose();
  };

  const montantHT = parseFloat(form.montantHT) || 0;
  const tvaRate   = parseFloat(form.tva) / 100;
  const montantTVA = montantHT * tvaRate;
  const montantTTC = montantHT + montantTVA;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <FileText className="w-4 h-4 text-secondary" />
            Facturation — {dossier?.numero}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">N° Facture</Label>
              <Input value={form.numFacture} onChange={e => setForm({ ...form, numFacture: e.target.value })}
                placeholder={`FACT-${dossier?.numero}`} className="bg-muted/50 font-mono text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Montant HT (FCFA) *</Label>
              <Input type="number" value={form.montantHT} onChange={e => setForm({ ...form, montantHT: e.target.value })}
                placeholder="Ex: 450 000" className="bg-muted/50 font-mono" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">TVA (%)</Label>
            <Input type="number" value={form.tva} onChange={e => setForm({ ...form, tva: e.target.value })}
              className="bg-muted/50 font-mono max-w-[120px]" />
          </div>
          {montantHT > 0 && (
            <div className="rounded-xl bg-muted/50 p-3 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Montant HT</span><span className="font-medium">{montantHT.toLocaleString("fr-FR")} FCFA</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">TVA ({form.tva}%)</span><span className="font-medium">{montantTVA.toLocaleString("fr-FR")} FCFA</span></div>
              <div className="flex justify-between border-t border-border pt-1"><span className="font-semibold text-foreground">Montant TTC</span><span className="font-display font-black text-secondary">{montantTTC.toLocaleString("fr-FR")} FCFA</span></div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Prestations / Notes</Label>
            <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              placeholder="Détail des prestations facturées..." className="bg-muted/50 h-20" />
          </div>
          <div className="flex justify-end gap-2 pt-1 border-t border-border">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button onClick={handleGenerate} disabled={!form.montantHT}
              className="gap-2 bg-primary text-primary-foreground">
              <FileText className="w-3.5 h-3.5" />
              Générer la facture
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ── Page principale ────────────────────────────────────────────────────────────
const GestionSorties = () => {
  const user = getStoredUser();
  const compagnies: string[] = user?.compagniesAssignees ?? [];
  const [search, setSearch] = useState("");
  const [penaliteDossier, setPenaliteDossier]   = useState<any>(null);
  const [bonDossier,       setBonDossier]        = useState<any>(null);
  const [factureDossier,   setFactureDossier]    = useState<any>(null);
  const qc = useQueryClient();

  const buildParams = (statuses: string) => {
    const p = new URLSearchParams({ limit: "100" });
    p.set("status", statuses);
    if (compagnies.length > 0) p.set("compagnie", compagnies.join(","));
    return p.toString();
  };

  const { data: bonData, isLoading } = useQuery({
    queryKey: ["dossiers-sorties", "bons", compagnies],
    queryFn:  () => api.get<any>(`/api/dossiers?${buildParams("paiement,bon_compagnie")}`),
    refetchInterval: 30_000,
  });
  const { data: sortiesData } = useQuery({
    queryKey: ["dossiers-sorties", "sorties", compagnies],
    queryFn:  () => api.get<any>(`/api/dossiers?${buildParams("bon_compagnie,operations_kribi")}`),
    refetchInterval: 30_000,
  });
  const { data: closedData } = useQuery({
    queryKey: ["dossiers-sorties", "closed", compagnies],
    queryFn:  () => api.get<any>(`/api/dossiers?${buildParams("cloture")}&limit=50`),
    staleTime: 60_000,
  });
  const { data: penalitesData } = useQuery({
    queryKey: ["penalites", compagnies],
    queryFn:  () => api.get<any>(`/api/dossiers?${buildParams("paiement,bon_compagnie,operations_kribi")}`),
    staleTime: 30_000,
  });

  const advanceStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/api/dossiers/${id}/status`, { status }),
    onSuccess: (_d, { status }) => {
      qc.invalidateQueries({ queryKey: ["dossiers-sorties"] });
      toast({ title: "Statut mis à jour", description: `→ ${STATUS_LABELS[status] ?? status}` });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const filter = (list: any[]) =>
    list.filter(d =>
      !search ||
      d.numero?.toLowerCase().includes(search.toLowerCase()) ||
      d.client?.toLowerCase().includes(search.toLowerCase()),
    );

  const bonsList    = filter(bonData?.data     ?? []);
  const sortiesList = filter(sortiesData?.data ?? []);
  const closedList  = filter(closedData?.data  ?? []);
  const penList     = filter(penalitesData?.data ?? []).filter((d: any) => d.penalites?.length > 0 || d.detentionJours > 0);

  const now = new Date();

  return (
    <AppLayout
      title="Gestion des Sorties"
      subtitle={`${user?.nom ?? ""} — ${compagnies.length > 0 ? compagnies.join(", ").replace(/_/g, "-") : "Toutes compagnies"}`}
    >
      {/* Compagnies assignées */}
      {compagnies.length > 0 && (
        <div className="flex items-center gap-2 mb-5 p-3 rounded-xl bg-secondary/5 border border-secondary/15">
          <Ship className="w-4 h-4 text-secondary" />
          <span className="text-xs font-medium text-foreground">Compagnies assignées :</span>
          {compagnies.map(c => (
            <span key={c} className="status-badge bg-secondary/15 text-secondary text-xs">
              {c.replace("_", "-")}
            </span>
          ))}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Bons en attente",   value: bonsList.filter(d => d.status === "bon_compagnie").length, color: "text-warning",     icon: Receipt },
          { label: "Sorties en cours",  value: sortiesList.length,                                         color: "text-secondary",   icon: PackageOpen },
          { label: "Pénalités actives", value: penList.length,                                              color: "text-destructive", icon: Ban },
          { label: "Clôturés",          value: closedList.length,                                           color: "text-success",     icon: CheckCircle2 },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }} className="stat-card">
            <s.icon className={`w-5 h-5 ${s.color} mb-2`} />
            <div className={`text-2xl font-display font-black ${s.color}`}>{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Rechercher dossier ou client..." value={search}
            onChange={e => setSearch(e.target.value)} className="pl-9 bg-card" />
        </div>
      </div>

      <Tabs defaultValue="bons">
        <TabsList className="mb-4">
          <TabsTrigger value="bons" className="gap-1.5"><Receipt className="w-3.5 h-3.5" /> Bons Compagnie ({bonsList.length})</TabsTrigger>
          <TabsTrigger value="sorties" className="gap-1.5"><PackageOpen className="w-3.5 h-3.5" /> Sorties ({sortiesList.length})</TabsTrigger>
          <TabsTrigger value="penalites" className="gap-1.5"><Ban className="w-3.5 h-3.5" /> Pénalités</TabsTrigger>
          <TabsTrigger value="facturation" className="gap-1.5"><FileText className="w-3.5 h-3.5" /> Facturation ({closedList.length})</TabsTrigger>
        </TabsList>

        {/* ── Bons compagnie ──────────────────────────────────── */}
        <TabsContent value="bons">
          {isLoading ? <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-secondary" /></div> : (
            <div className="stat-card overflow-hidden p-0">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Dossier</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Client</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Compagnie</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Conteneur</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Statut</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Limite sortie</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bonsList.map((d: any, i: number) => {
                    const limit = d.dateLimiteSortie ? new Date(d.dateLimiteSortie) : null;
                    const enRetard = limit && limit < now && d.status !== "cloture";
                    const proche   = limit && !enRetard && (limit.getTime() - now.getTime()) < 3 * 86400_000;
                    return (
                      <motion.tr key={d.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                        className={`border-b border-border/50 hover:bg-muted/30 ${enRetard ? "bg-destructive/5" : proche ? "bg-warning/5" : ""}`}>
                        <td className="px-4 py-3 text-sm font-semibold text-foreground">{d.numero}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{d.client}</td>
                        <td className="px-4 py-3 text-sm font-medium text-foreground">{d.compagnie?.replace("_","-")}</td>
                        <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{d.conteneur}</td>
                        <td className="px-4 py-3">
                          <span className={`status-badge ${STATUS_COLORS[d.status] ?? "bg-gray-100 text-gray-600"}`}>
                            {STATUS_LABELS[d.status] ?? d.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {limit ? (
                            <span className={`flex items-center gap-1 text-xs font-medium ${enRetard ? "text-destructive" : proche ? "text-warning" : "text-muted-foreground"}`}>
                              {(enRetard || proche) && <AlertTriangle className="w-3 h-3" />}
                              {limit.toLocaleDateString("fr-FR")}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button title="Bon compagnie"
                              onClick={() => setBonDossier(d)}
                              className="w-7 h-7 rounded-lg hover:bg-secondary/10 flex items-center justify-center text-muted-foreground hover:text-secondary">
                              <Receipt className="w-3.5 h-3.5" />
                            </button>
                            <button title="Ajouter pénalité"
                              onClick={() => setPenaliteDossier(d)}
                              className="w-7 h-7 rounded-lg hover:bg-destructive/10 flex items-center justify-center text-muted-foreground hover:text-destructive">
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                            {d.status === "paiement" && (
                              <button title="Passer à Bon Compagnie"
                                onClick={() => advanceStatus.mutate({ id: d.id, status: "bon_compagnie" })}
                                className="w-7 h-7 rounded-lg hover:bg-green-100 flex items-center justify-center text-muted-foreground hover:text-green-700">
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                  {bonsList.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">Aucun dossier en attente de bon</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ── Sorties / Interchanges ─────────────────────────── */}
        <TabsContent value="sorties">
          <div className="space-y-3 max-w-3xl">
            {sortiesList.map((d: any, i: number) => (
              <motion.div key={d.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }} className="stat-card">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-display font-bold text-foreground">{d.numero}</span>
                      <span className={`status-badge ${STATUS_COLORS[d.status]}`}>{STATUS_LABELS[d.status]}</span>
                    </div>
                    <p className="text-sm text-foreground">{d.client}</p>
                    <p className="text-xs font-mono text-muted-foreground mt-0.5">{d.conteneur}</p>
                  </div>
                  <span className="text-xs font-medium text-foreground bg-muted px-2 py-1 rounded-lg">
                    {d.compagnie?.replace("_", "-")}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="bg-muted/50 rounded-lg p-2">
                    <p className="text-muted-foreground mb-0.5">Interchange retour</p>
                    <p className={`font-semibold ${d.interchangeRetour ? "text-success" : "text-warning"}`}>
                      {d.interchangeRetour ? "✓ Effectué" : "En attente"}
                    </p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-2">
                    <p className="text-muted-foreground mb-0.5">Date limite sortie</p>
                    <p className="font-semibold text-foreground">
                      {d.dateLimiteSortie ? new Date(d.dateLimiteSortie).toLocaleDateString("fr-FR") : "—"}
                    </p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-2">
                    <p className="text-muted-foreground mb-0.5">Détention (jours)</p>
                    <p className={`font-semibold ${(d.detentionJours ?? 0) > 0 ? "text-destructive" : "text-success"}`}>
                      {d.detentionJours ?? 0} j
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7"
                    onClick={() => setPenaliteDossier(d)}>
                    <Ban className="w-3 h-3" /> Pénalité
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7"
                    onClick={() => toast({ title: "Interchange marqué retourné", description: d.numero })}>
                    <RotateCcw className="w-3 h-3" /> Interchange retourné
                  </Button>
                </div>
              </motion.div>
            ))}
            {sortiesList.length === 0 && <p className="text-center py-10 text-muted-foreground">Aucune sortie en cours</p>}
          </div>
        </TabsContent>

        {/* ── Pénalités ──────────────────────────────────────── */}
        <TabsContent value="penalites">
          <div className="space-y-3 max-w-3xl">
            <div className="flex justify-end mb-2">
              <Button size="sm" className="gap-1.5 bg-secondary text-secondary-foreground hover:opacity-90"
                onClick={() => setPenaliteDossier(bonsList[0] ?? null)}>
                <Plus className="w-3.5 h-3.5" /> Nouvelle pénalité
              </Button>
            </div>
            {penList.length === 0 && (
              <div className="text-center py-10 text-muted-foreground">
                <CheckCircle2 className="w-8 h-8 text-success/50 mx-auto mb-2" />
                <p>Aucune pénalité active</p>
              </div>
            )}
            {penList.map((d: any) => (
              <motion.div key={d.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="stat-card border-destructive/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-foreground">{d.numero} — {d.client}</span>
                  <span className="text-xs font-mono text-muted-foreground">{d.conteneur}</span>
                </div>
                {(d.penalites ?? []).map((p: any, pi: number) => (
                  <div key={pi} className="flex items-start gap-3 p-2.5 rounded-lg bg-destructive/5 border border-destructive/10 mb-2">
                    <Ban className="w-3.5 h-3.5 text-destructive mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-foreground">{Number(p.montant).toLocaleString("fr-FR")} FCFA</p>
                      <p className="text-xs text-muted-foreground">{p.raison}</p>
                    </div>
                    {p.dateEcheance && (
                      <span className="text-[10px] text-destructive font-medium flex-shrink-0">
                        Éch. {new Date(p.dateEcheance).toLocaleDateString("fr-FR")}
                      </span>
                    )}
                  </div>
                ))}
              </motion.div>
            ))}
          </div>
        </TabsContent>

        {/* ── Facturation dossiers finis ─────────────────────── */}
        <TabsContent value="facturation">
          <div className="stat-card overflow-hidden p-0">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Dossier</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Client</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Compagnie</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Date clôture</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Facture</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {closedList.map((d: any, i: number) => (
                  <motion.tr key={d.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                    className="border-b border-border/50 hover:bg-muted/30">
                    <td className="px-4 py-3 text-sm font-semibold text-foreground">{d.numero}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{d.client}</td>
                    <td className="px-4 py-3 text-sm font-medium">{d.compagnie?.replace("_","-")}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {d.updatedAt ? new Date(d.updatedAt).toLocaleDateString("fr-FR") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {d.factureNumero
                        ? <span className="status-badge bg-green-100 text-green-700">{d.factureNumero}</span>
                        : <span className="status-badge bg-amber-100 text-amber-700">À facturer</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7"
                        onClick={() => setFactureDossier(d)}>
                        <DollarSign className="w-3 h-3" /> Facturer
                      </Button>
                    </td>
                  </motion.tr>
                ))}
                {closedList.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">Aucun dossier clôturé</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      {penaliteDossier && (
        <PenaliteDialog dossier={penaliteDossier} open={!!penaliteDossier} onClose={() => setPenaliteDossier(null)} />
      )}
      {bonDossier && (
        <BonCompagnieDialog dossier={bonDossier} open={!!bonDossier} onClose={() => setBonDossier(null)} />
      )}
      {factureDossier && (
        <FacturationDialog dossier={factureDossier} open={!!factureDossier} onClose={() => setFactureDossier(null)} />
      )}
    </AppLayout>
  );
};

export default GestionSorties;
