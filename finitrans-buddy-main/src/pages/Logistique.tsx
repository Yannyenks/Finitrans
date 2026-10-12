import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, getStoredUser } from "@/lib/api";
import { motion } from "framer-motion";
import {
  Truck, Package, DollarSign, CheckCircle2, Clock,
  Plus, Search, Loader2, ChevronRight, MapPin, Landmark,
  FileText, RotateCcw, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

const STATUS_LABELS: Record<string, string> = {
  reception: "Réception", soumission_sgs: "SGS", codage: "Codage",
  validation: "Validation", paiement: "Paiement", bon_compagnie: "Bon Cie",
  operations_kribi: "Kribi", cloture: "Clôturé",
};
const STATUS_COLORS: Record<string, string> = {
  reception: "bg-blue-100 text-blue-700", soumission_sgs: "bg-indigo-100 text-indigo-700",
  codage: "bg-purple-100 text-purple-700", validation: "bg-amber-100 text-amber-700",
  paiement: "bg-orange-100 text-orange-700", bon_compagnie: "bg-green-100 text-green-700",
  operations_kribi: "bg-teal-100 text-teal-700", cloture: "bg-gray-100 text-gray-600",
};

const TYPES_PAIEMENT = [
  { value: "droits",       label: "Droits de douane" },
  { value: "taxes",        label: "Taxes" },
  { value: "redevances",   label: "Redevances" },
  { value: "penalite",     label: "Pénalité" },
];

// ── Dialog paiement droits/taxes ─────────────────────────────────────────────
const PaiementDialog = ({ dossier, open, onClose }: { dossier: any; open: boolean; onClose: () => void }) => {
  const qc = useQueryClient();
  const [form, setForm] = useState({ type: "droits", montant: "", reference: "", datePaiement: new Date().toISOString().split("T")[0] });

  const addPaiement = useMutation({
    mutationFn: () => api.post("/api/finance/paiements-douane", {
      dossierId:    dossier.id,
      type:         form.type,
      montant:      parseFloat(form.montant),
      reference:    form.reference.trim() || `QIT-${dossier.numero}-${Date.now().toString(36).toUpperCase()}`,
      datePaiement: new Date(form.datePaiement).toISOString(),
      statut:       "paye",
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dossiers-logistique"] });
      qc.invalidateQueries({ queryKey: ["paiements-douane"] });
      qc.invalidateQueries({ queryKey: ["paiements-douane-logistique"] });
      toast({ title: "Paiement enregistré", description: `${dossier.numero} — ${Number(form.montant).toLocaleString("fr-FR")} FCFA` });
      onClose();
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Landmark className="w-4 h-4 text-secondary" /> Paiement droits/taxes — {dossier?.numero}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="rounded-xl bg-muted/40 p-3 text-sm">
            <span className="text-muted-foreground">Client : </span><span className="font-semibold">{dossier?.client}</span>
            <span className="text-muted-foreground ml-3">Conteneur : </span><span className="font-mono font-semibold">{dossier?.conteneur}</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Type de paiement *</Label>
              <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                <SelectTrigger className="bg-muted/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES_PAIEMENT.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Montant (FCFA) *</Label>
              <Input type="number" value={form.montant} onChange={e => setForm({ ...form, montant: e.target.value })}
                placeholder="Ex: 1 250 000" className="bg-muted/50 font-mono" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">N° Quittance / Référence</Label>
              <Input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })}
                placeholder="Auto si vide" className="bg-muted/50 font-mono text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Date de paiement</Label>
              <Input type="date" value={form.datePaiement} onChange={e => setForm({ ...form, datePaiement: e.target.value })}
                className="bg-muted/50" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1 border-t border-border">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button onClick={() => addPaiement.mutate()} disabled={!form.montant || addPaiement.isPending}
              className="gap-2 bg-secondary text-secondary-foreground">
              {addPaiement.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Confirmer le paiement
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ── Dialog véhicule (dédouanement véhicules) ────────────────────────────────
const VEHICULE_STATUTS: Record<string, { label: string; cls: string; suivant?: string; action?: string }> = {
  en_attente: { label: "En attente", cls: "bg-amber-100 text-amber-700", suivant: "en_cours", action: "Démarrer le dédouanement" },
  en_cours:   { label: "Dédouanement en cours", cls: "bg-blue-100 text-blue-700", suivant: "cloture", action: "Marquer dédouané" },
  cloture:    { label: "Dédouané", cls: "bg-green-100 text-green-700" },
};

const VehiculeDialog = ({ dossiers, open, onClose }: { dossiers: any[]; open: boolean; onClose: () => void }) => {
  const qc = useQueryClient();
  const vide = { dossierId: "", marque: "", modele: "", annee: String(new Date().getFullYear()), numeroSerie: "", immatriculation: "", valeurCIF: "", notes: "" };
  const [form, setForm] = useState(vide);
  const add = useMutation({
    mutationFn: () => api.post("/api/vehicules", {
      dossierId: form.dossierId, marque: form.marque.trim(), modele: form.modele.trim(), annee: Number(form.annee),
      numeroSerie: form.numeroSerie.trim(), immatriculation: form.immatriculation.trim() || undefined,
      valeurCIF: Number(form.valeurCIF), notes: form.notes || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehicules-logistique"] });
      toast({ title: "Véhicule enregistré", description: `${form.marque} ${form.modele}` });
      setForm(vide);
      onClose();
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });
  const valide = form.dossierId && form.marque.trim().length >= 2 && form.modele.trim() && form.numeroSerie.trim().length >= 5 && Number(form.valeurCIF) > 0;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card sm:max-w-[480px]">
        <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><Truck className="w-4 h-4 text-secondary" /> Nouveau véhicule à dédouaner</DialogTitle></DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Dossier *</Label>
            <Select value={form.dossierId} onValueChange={v => setForm({ ...form, dossierId: v })}>
              <SelectTrigger className="bg-muted/50"><SelectValue placeholder="Choisir le dossier..." /></SelectTrigger>
              <SelectContent>{dossiers.map(d => <SelectItem key={d.id} value={d.id}>{d.numero} — {d.client}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Marque *</Label><Input value={form.marque} onChange={e => setForm({ ...form, marque: e.target.value })} className="bg-muted/50" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Modèle *</Label><Input value={form.modele} onChange={e => setForm({ ...form, modele: e.target.value })} className="bg-muted/50" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Année *</Label><Input type="number" value={form.annee} onChange={e => setForm({ ...form, annee: e.target.value })} className="bg-muted/50" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">N° de série (VIN) *</Label><Input value={form.numeroSerie} onChange={e => setForm({ ...form, numeroSerie: e.target.value.toUpperCase() })} className="bg-muted/50 font-mono text-sm" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Immatriculation</Label><Input value={form.immatriculation} onChange={e => setForm({ ...form, immatriculation: e.target.value.toUpperCase() })} className="bg-muted/50 font-mono text-sm" /></div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Valeur CIF (FCFA) *</Label><Input type="number" value={form.valeurCIF} onChange={e => setForm({ ...form, valeurCIF: e.target.value })} className="bg-muted/50 font-mono" /></div>
          <div className="space-y-1.5"><Label className="text-xs">Notes</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="bg-muted/50" /></div>
          <div className="flex justify-end gap-2 pt-1 border-t border-border">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button onClick={() => add.mutate()} disabled={!valide || add.isPending} className="gap-2 bg-secondary text-secondary-foreground">
              {add.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Enregistrer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ── Page principale ─────────────────────────────────────────────────────────
const Logistique = () => {
  const user = getStoredUser();
  const qc   = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch]       = useState("");
  const [paiementDossier, setPaiementDossier] = useState<any>(null);
  const [vehiculeOpen, setVehiculeOpen] = useState(false);

  const { data: dossiersData, isLoading } = useQuery({
    queryKey: ["dossiers-logistique"],
    queryFn:  () => api.get<any>("/api/dossiers?status=validation,paiement,bon_compagnie&limit=100"),
    refetchInterval: 30_000,
  });
  const { data: paiementsData } = useQuery({
    queryKey: ["paiements-douane-logistique"],
    queryFn:  () => api.get<any>("/api/finance/paiements-douane?limit=50"),
    staleTime: 60_000,
  });
  const { data: vehiculesData } = useQuery({
    queryKey: ["vehicules-logistique"],
    queryFn:  () => api.get<any>("/api/vehicules?limit=100"),
    staleTime: 30_000,
  });

  const majVehicule = useMutation({
    mutationFn: ({ id, statut }: { id: string; statut: string }) =>
      api.patch(`/api/vehicules/${id}`, { statut, ...(statut === "cloture" ? { dateFin: new Date().toISOString() } : {}) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vehicules-logistique"] }); toast({ title: "Véhicule mis à jour" }); },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const dossiers   = dossiersData?.data   ?? [];
  const paiements  = paiementsData?.data  ?? [];
  const vehicules  = vehiculesData?.data  ?? [];

  const filter = (list: any[]) =>
    list.filter(d =>
      !search ||
      d.numero?.toLowerCase().includes(search.toLowerCase()) ||
      d.client?.toLowerCase().includes(search.toLowerCase()),
    );

  const filteredDossiers = filter(dossiers);
  const enPaiement = filteredDossiers.filter(d => d.status === "paiement");
  const autresDoss = filteredDossiers.filter(d => d.status !== "paiement");

  return (
    <AppLayout title="Logistique" subtitle={`${user?.nom ?? ""} — Transport, dédouanement, droits et taxes`}>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Dossiers actifs",     value: dossiers.length,   color: "text-secondary",   icon: Package },
          { label: "En paiement",         value: enPaiement.length, color: "text-warning",     icon: Landmark },
          { label: "Paiements effectués", value: paiements.filter((p: any) => p.statut === "paye").length, color: "text-success", icon: CheckCircle2 },
          { label: "Véhicules suivis",    value: vehicules.length,  color: "text-accent",      icon: Truck },
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

      <Tabs defaultValue="paiements">
        <TabsList className="mb-4">
          <TabsTrigger value="paiements" className="gap-1.5">
            <Landmark className="w-3.5 h-3.5" /> Droits &amp; Taxes
            {enPaiement.length > 0 && (
              <span className="w-5 h-5 rounded-full bg-warning text-white text-[10px] font-bold flex items-center justify-center">
                {enPaiement.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="dossiers" className="gap-1.5"><Package className="w-3.5 h-3.5" /> Tous les dossiers ({filteredDossiers.length})</TabsTrigger>
          <TabsTrigger value="vehicules" className="gap-1.5"><Truck className="w-3.5 h-3.5" /> Véhicules ({vehicules.length})</TabsTrigger>
          <TabsTrigger value="historique" className="gap-1.5"><FileText className="w-3.5 h-3.5" /> Paiements ({paiements.length})</TabsTrigger>
        </TabsList>

        {/* ── Droits & Taxes ──────────────────────────────────── */}
        <TabsContent value="paiements">
          {isLoading ? <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-secondary" /></div> : (
            <div className="space-y-3 max-w-3xl">
              {enPaiement.map((d: any, i: number) => (
                <motion.div key={d.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }} className="stat-card border-warning/20 bg-warning/3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-display font-bold text-foreground">{d.numero}</span>
                        <span className="status-badge bg-orange-100 text-orange-700">Paiement requis</span>
                      </div>
                      <p className="text-sm text-foreground">{d.client}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        <span className="font-mono">{d.conteneur}</span>
                        <span>{d.compagnie?.replace("_","-")}</span>
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{d.site}</span>
                      </div>
                      {(d.montantTaxes || d.montantHonoraires) && (
                        <div className="flex gap-3 text-xs mt-2">
                          {d.montantTaxes && <span className="text-warning font-semibold">Taxes: {Number(d.montantTaxes).toLocaleString("fr-FR")} FCFA</span>}
                          {d.montantHonoraires && <span className="text-muted-foreground">Honoraires: {Number(d.montantHonoraires).toLocaleString("fr-FR")} FCFA</span>}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5 flex-shrink-0 ml-3">
                      <Button size="sm" onClick={() => setPaiementDossier(d)}
                        className="gap-1.5 bg-secondary text-secondary-foreground hover:opacity-90 text-xs h-8">
                        <Landmark className="w-3.5 h-3.5" /> Enregistrer paiement
                      </Button>
                      <Button size="sm" variant="outline"
                        onClick={() => navigate(`/dossiers/${d.id}`)}
                        className="gap-1.5 text-xs h-8">
                        <ChevronRight className="w-3.5 h-3.5" /> Terminer l'étape
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}
              {enPaiement.length === 0 && (
                <div className="text-center py-16 text-muted-foreground">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-success/50" />
                  <p className="font-medium">Aucun paiement en attente</p>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* ── Tous les dossiers ───────────────────────────────── */}
        <TabsContent value="dossiers">
          <div className="stat-card overflow-hidden p-0">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {["Dossier","Client","Conteneur","Compagnie","Site","Statut","Actions"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredDossiers.map((d: any, i: number) => (
                  <motion.tr key={d.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                    className="border-b border-border/50 hover:bg-muted/30">
                    <td className="px-4 py-3 text-sm font-semibold text-foreground">{d.numero}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{d.client}</td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{d.conteneur}</td>
                    <td className="px-4 py-3 text-sm font-medium">{d.compagnie?.replace("_","-")}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-3 h-3" />{d.site}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`status-badge ${STATUS_COLORS[d.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {STATUS_LABELS[d.status] ?? d.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {d.status === "paiement" && (
                        <Button size="sm" variant="outline" className="gap-1 text-xs h-7" onClick={() => setPaiementDossier(d)}>
                          <Landmark className="w-3 h-3" /> Payer
                        </Button>
                      )}
                    </td>
                  </motion.tr>
                ))}
                {filteredDossiers.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">Aucun dossier</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ── Véhicules ───────────────────────────────────────── */}
        <TabsContent value="vehicules">
          <div className="space-y-3 max-w-3xl">
            <Button size="sm" className="gap-1.5 bg-secondary text-secondary-foreground" onClick={() => setVehiculeOpen(true)}>
              <Plus className="w-3.5 h-3.5" /> Ajouter un véhicule
            </Button>
            {vehicules.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Truck className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="font-medium">Aucun véhicule enregistré</p>
              </div>
            ) : vehicules.map((v: any) => {
              const st = VEHICULE_STATUTS[v.statut] ?? VEHICULE_STATUTS.en_attente;
              return (
                <div key={v.id} className="stat-card">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4 text-secondary" />
                      <span className="font-semibold text-foreground">{v.marque} {v.modele} ({v.annee})</span>
                      {v.immatriculation && <span className="font-mono text-xs text-muted-foreground">{v.immatriculation}</span>}
                    </div>
                    <span className={`status-badge ${st.cls}`}>{st.label}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                    <span>VIN : <strong className="text-foreground font-mono">{v.numeroSerie}</strong></span>
                    <span>Dossier : <strong className="text-foreground">{v.dossier?.numero}</strong> · {v.dossier?.client}</span>
                    <span>Valeur CIF : <strong className="text-foreground">{Number(v.valeurCIF).toLocaleString("fr-FR")} FCFA</strong></span>
                  </div>
                  {st.suivant && (
                    <Button size="sm" variant="outline" className="h-7 text-xs mt-2 gap-1" disabled={majVehicule.isPending}
                      onClick={() => majVehicule.mutate({ id: v.id, statut: st.suivant! })}>
                      <CheckCircle2 className="w-3 h-3" /> {st.action}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* ── Historique paiements ────────────────────────────── */}
        <TabsContent value="historique">
          <div className="stat-card overflow-hidden p-0">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {["Référence","Dossier","Type","Montant","Statut","Date"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paiements.map((p: any, i: number) => (
                  <motion.tr key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                    className="border-b border-border/50 hover:bg-muted/30">
                    <td className="px-4 py-3 text-sm font-mono text-foreground">{p.reference}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{p.dossier?.numero ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-foreground capitalize">{p.type}</td>
                    <td className="px-4 py-3 text-sm font-display font-bold text-foreground">{Number(p.montant).toLocaleString("fr-FR")}</td>
                    <td className="px-4 py-3">
                      <span className={`status-badge ${p.statut === "paye" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                        {p.statut === "paye" ? "Payé" : "En attente"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {new Date(p.datePaiement).toLocaleDateString("fr-FR")}
                    </td>
                  </motion.tr>
                ))}
                {paiements.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">Aucun paiement enregistré</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {paiementDossier && (
        <PaiementDialog dossier={paiementDossier} open={!!paiementDossier} onClose={() => setPaiementDossier(null)} />
      )}
      <VehiculeDialog dossiers={dossiers} open={vehiculeOpen} onClose={() => setVehiculeOpen(false)} />
    </AppLayout>
  );
};

export default Logistique;
