import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, getStoredUser, uploadFile } from "@/lib/api";
import { printDocument } from "@/lib/print";
import { motion } from "framer-motion";
import {
  FolderOpen, DollarSign, FileText, Banknote,
  Plus, Search, Loader2, Send, Download,
  CheckCircle, Clock, RefreshCw, ClipboardList,
  User, Receipt, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

// ── Types de virement ─────────────────────────────────────────────────────────
const VIRT_TYPES = [
  { value: "frais_transit",   label: "Frais de transit" },
  { value: "droits_douane",   label: "Droits de douane" },
  { value: "honoraires",      label: "Honoraires" },
  { value: "remboursement",   label: "Remboursement client" },
  { value: "autre",           label: "Autre" },
];

// ── Templates de documents administratifs ─────────────────────────────────────
const DOC_TEMPLATES = [
  { id: "lettre_mission",  label: "Lettre de mission",           icon: FileText },
  { id: "procuration",     label: "Procuration douanière",       icon: ClipboardList },
  { id: "attestation",     label: "Attestation de transit",      icon: CheckCircle },
  { id: "note_interne",    label: "Note interne",                icon: Send },
  { id: "rapport_activite",label: "Rapport d'activité mensuel",  icon: Receipt },
];

// ── Dialog virement ──────────────────────────────────────────────────────────
const VirementDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    beneficiaire: "", banque: "", compte: "", montant: "",
    type: "frais_transit", dossierId: "", motif: "",
    dateVirement: new Date().toISOString().split("T")[0],
  });

  const { data: dossiersData } = useQuery({
    queryKey: ["dossiers-virement-select"],
    queryFn:  () => api.get<any>("/api/dossiers?limit=200"),
    staleTime: 5 * 60_000,
    enabled:   open,
  });
  const allDossiers = dossiersData?.data ?? [];

  const createVirement = useMutation({
    mutationFn: () => api.post("/api/finance/virements", {
      beneficiaire:  form.beneficiaire,
      banque:        form.banque || undefined,
      compte:        form.compte || undefined,
      montant:       parseFloat(form.montant),
      type:          form.type,
      dossierId:     form.dossierId || undefined,
      motif:         form.motif,
      dateVirement:  new Date(form.dateVirement).toISOString(),
      statut:        "en_attente",
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["virements"] });
      qc.invalidateQueries({ queryKey: ["virements-admin"] });
      toast({ title: "Virement enregistré", description: `${form.beneficiaire} — ${Number(form.montant).toLocaleString("fr-FR")} FCFA` });
      onClose();
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-secondary" />
            Nouvelle opération de transfert de fonds
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Bénéficiaire *</Label>
              <Input value={form.beneficiaire} onChange={e => setForm({ ...form, beneficiaire: e.target.value })}
                placeholder="Nom du bénéficiaire" className="bg-muted/50" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Montant (FCFA) *</Label>
              <Input type="number" value={form.montant} onChange={e => setForm({ ...form, montant: e.target.value })}
                placeholder="Ex: 2 500 000" className="bg-muted/50 font-mono" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Type</Label>
              <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                <SelectTrigger className="bg-muted/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VIRT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Date de virement</Label>
              <Input type="date" value={form.dateVirement} onChange={e => setForm({ ...form, dateVirement: e.target.value })}
                className="bg-muted/50" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Banque</Label>
              <Input value={form.banque} onChange={e => setForm({ ...form, banque: e.target.value })}
                placeholder="Ex: Afriland First Bank" className="bg-muted/50" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">N° Compte</Label>
              <Input value={form.compte} onChange={e => setForm({ ...form, compte: e.target.value })}
                placeholder="IBAN / RIB" className="bg-muted/50 font-mono text-sm" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Dossier associé</Label>
            <Select value={form.dossierId} onValueChange={v => setForm({ ...form, dossierId: v })}>
              <SelectTrigger className="bg-muted/50"><SelectValue placeholder="Optionnel — associer à un dossier" /></SelectTrigger>
              <SelectContent>
                {allDossiers.slice(0, 50).map((d: any) => (
                  <SelectItem key={d.id} value={d.id}>{d.numero} — {d.client}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Motif *</Label>
            <Textarea value={form.motif} onChange={e => setForm({ ...form, motif: e.target.value })}
              placeholder="Objet du virement..." className="bg-muted/50 h-20" />
          </div>
          <div className="flex justify-end gap-2 pt-1 border-t border-border">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button onClick={() => createVirement.mutate()}
              disabled={!form.beneficiaire || !form.montant || !form.motif || createVirement.isPending}
              className="gap-2 bg-secondary text-secondary-foreground">
              {createVirement.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Enregistrer le virement
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ── Dialog facture proforma ───────────────────────────────────────────────────
const TAUX: Record<string, number> = { XAF: 1, EUR: 655.957, USD: 605 };

const ProformaDialog = ({ open, onClose, dossiers, entreprise }: { open: boolean; onClose: () => void; dossiers: any[]; entreprise?: any }) => {
  const qc = useQueryClient();
  const vide = {
    numero: `PRO-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`,
    dossierId: "", description: "", montant: "", devise: "XAF", validiteJours: "30",
  };
  const [form, setForm] = useState(vide);
  const dossier = dossiers.find(d => d.id === form.dossierId);
  const montantXAF = Math.round((parseFloat(form.montant) || 0) * (TAUX[form.devise] ?? 1));

  const texte = () => [
    `N° : ${form.numero}`, `Date : ${new Date().toLocaleDateString("fr-FR")}`,
    `Client : ${dossier?.client ?? ""}`, `Dossier : ${dossier?.numero ?? ""} — conteneur ${dossier?.conteneur ?? ""}`, "",
    `Prestations : ${form.description || "Prestations de transit et dédouanement"}`, "",
    `Montant : ${Number(form.montant || 0).toLocaleString("fr-FR")} ${form.devise}${form.devise !== "XAF" ? ` (≈ ${montantXAF.toLocaleString("fr-FR")} FCFA)` : ""}`,
    `Validité : ${form.validiteJours} jours`,
  ].join("\n");

  const generer = useMutation({
    mutationFn: () => api.post(`/api/dossiers/${form.dossierId}/factures`, {
      numero: form.numero.trim(), type: "proforma", montant: montantXAF, compagnie: dossier?.compagnie ?? "",
      dateFacture: new Date().toISOString(),
      description: form.description.trim() || `Proforma — prestations de transit (validité ${form.validiteJours} j)`,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["factures-compta"] });
      toast({ title: "Facture proforma enregistrée", description: `${form.numero} — ${montantXAF.toLocaleString("fr-FR")} FCFA` });
      try { printDocument("Facture proforma", texte(), entreprise); } catch { /* pop-up bloquée */ }
      setForm(vide);
      onClose();
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Receipt className="w-4 h-4 text-secondary" /> Nouvelle Facture Proforma
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">N° Proforma *</Label>
              <Input value={form.numero} onChange={e => setForm({ ...form, numero: e.target.value })} className="bg-muted/50 font-mono text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Dossier *</Label>
              <Select value={form.dossierId} onValueChange={v => setForm({ ...form, dossierId: v })}>
                <SelectTrigger className="bg-muted/50"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                <SelectContent>{dossiers.map(d => <SelectItem key={d.id} value={d.id}>{d.numero} — {d.client}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Description des services</Label>
            <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Prestation de dédouanement, transit maritime, frais portuaires..." className="bg-muted/50 h-20" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs font-medium">Montant *</Label>
              <Input type="number" value={form.montant} onChange={e => setForm({ ...form, montant: e.target.value })} className="bg-muted/50 font-mono" />
              {form.devise !== "XAF" && montantXAF > 0 && <p className="text-[11px] text-secondary">≈ {montantXAF.toLocaleString("fr-FR")} FCFA</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Devise</Label>
              <Select value={form.devise} onValueChange={v => setForm({ ...form, devise: v })}>
                <SelectTrigger className="bg-muted/50"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.keys(TAUX).map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Validité (jours)</Label>
            <Input type="number" value={form.validiteJours} onChange={e => setForm({ ...form, validiteJours: e.target.value })} className="bg-muted/50 font-mono max-w-[120px]" />
          </div>
          <div className="flex justify-end gap-2 pt-1 border-t border-border">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button onClick={() => generer.mutate()} disabled={!form.dossierId || !form.numero.trim() || montantXAF <= 0 || generer.isPending}
              className="gap-2 bg-primary text-primary-foreground">
              {generer.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Receipt className="w-3.5 h-3.5" />} Enregistrer et imprimer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ── Page principale ───────────────────────────────────────────────────────────
const Administratif = () => {
  const user     = getStoredUser();
  const navigate = useNavigate();
  const [search, setSearch]       = useState("");
  const [virOpen, setVirOpen]     = useState(false);
  const [proOpen, setProOpen]     = useState(false);
  const [docTemplate, setDocTemplate] = useState<string | null>(null);
  const [docContent, setDocContent]   = useState("");
  const [docDossier, setDocDossier]   = useState("");
  const qc = useQueryClient();

  const { data: entreprise } = useQuery({ queryKey: ["entreprise"], queryFn: () => api.get<any>("/api/admin/entreprise"), staleTime: 10 * 60_000 });

  const docLabel = DOC_TEMPLATES.find(t => t.id === docTemplate)?.label ?? "Document";
  const sauverDoc = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      const nom = `${docTemplate}-${new Date().toISOString().slice(0, 10)}-${Date.now().toString(36)}.txt`;
      fd.append("file", new File([`${docLabel}\n\n${docContent}`], nom, { type: "text/plain" }));
      return uploadFile(`/api/dossiers/${docDossier}/upload`, fd);
    },
    onSuccess: () => toast({ title: "Document classé dans le dossier", description: docLabel }),
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });
  const confirmerVirement = useMutation({
    mutationFn: (id: string) => api.patch(`/api/finance/virements/${id}`, { statut: "effectue" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["virements-admin"] }); toast({ title: "Virement confirmé" }); },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const { data: dossiersData, isLoading } = useQuery({
    queryKey: ["dossiers-admin", search],
    queryFn:  () => api.get<any>(`/api/dossiers?limit=100${search ? `&search=${encodeURIComponent(search)}` : ""}`),
    staleTime: 30_000,
  });
  const { data: virtsData } = useQuery({
    queryKey: ["virements-admin"],
    queryFn:  () => api.get<any>("/api/finance/virements?limit=50"),
    staleTime: 60_000,
  });
  const { data: diStats } = useQuery({
    queryKey: ["di-stats-admin"],
    queryFn:  () => api.get<any>("/api/di/stats/resume"),
    staleTime: 60_000,
  });

  const dossiers = dossiersData?.data ?? [];
  const virts    = virtsData?.data    ?? [];

  const dossiersActifs  = dossiers.filter((d: any) => d.status !== "cloture").length;
  const virtsEnAttente  = virts.filter((v: any) => v.statut === "en_attente").length;
  const virtsEffectues  = virts.filter((v: any) => v.statut === "effectue").length;

  return (
    <AppLayout
      title="Service Administratif"
      subtitle={`${user?.nom ?? ""} — Classement, virements, DI, documents`}
    >
      {/* ── KPIs ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Dossiers actifs",      value: dossiersActifs,                      color: "text-secondary",   icon: FolderOpen },
          { label: "Virements en attente", value: virtsEnAttente,                       color: "text-warning",     icon: Clock },
          { label: "Virements effectués",  value: virtsEffectues,                       color: "text-success",     icon: CheckCircle },
          { label: "DI en alerte",         value: diStats?.diEnAlerte ?? 0,             color: (diStats?.diEnAlerte ?? 0) > 0 ? "text-warning" : "text-success", icon: Banknote },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }} className="stat-card">
            <s.icon className={`w-5 h-5 ${s.color} mb-2`} />
            <div className={`text-2xl font-display font-black ${s.color}`}>{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </motion.div>
        ))}
      </div>

      {/* ── Actions rapides ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Nouveau virement",     icon: DollarSign,    color: "bg-secondary/10 text-secondary",   action: () => setVirOpen(true) },
          { label: "Facture proforma",     icon: Receipt,       color: "bg-accent/10 text-accent",         action: () => setProOpen(true) },
          { label: "Voir les DI",          icon: Banknote,      color: "bg-warning/10 text-warning",       action: () => navigate("/di") },
          { label: "Tous les dossiers",    icon: FolderOpen,    color: "bg-success/10 text-success",       action: () => navigate("/dossiers") },
        ].map((a, i) => (
          <motion.button key={a.label} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.06 }}
            onClick={a.action}
            className={`stat-card flex flex-col items-center gap-2 py-4 hover:scale-[1.02] transition-transform cursor-pointer ${a.color.split(" ")[0]}/5`}>
            <div className={`w-10 h-10 rounded-xl ${a.color.split(" ")[0]} flex items-center justify-center`}>
              <a.icon className={`w-5 h-5 ${a.color.split(" ")[1]}`} />
            </div>
            <span className="text-xs font-semibold text-foreground text-center leading-tight">{a.label}</span>
          </motion.button>
        ))}
      </div>

      <Tabs defaultValue="dossiers">
        <TabsList className="mb-4">
          <TabsTrigger value="dossiers"  className="gap-1.5"><FolderOpen    className="w-3.5 h-3.5" /> Suivi dossiers</TabsTrigger>
          <TabsTrigger value="virements" className="gap-1.5"><DollarSign    className="w-3.5 h-3.5" /> Virements ({virts.length})</TabsTrigger>
          <TabsTrigger value="documents" className="gap-1.5"><FileText      className="w-3.5 h-3.5" /> Documents</TabsTrigger>
        </TabsList>

        {/* ── Suivi dossiers & classement ──────────────────────── */}
        <TabsContent value="dossiers">
          <div className="mb-3">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Rechercher par numéro, client..." value={search}
                onChange={e => setSearch(e.target.value)} className="pl-9 bg-card" />
            </div>
          </div>
          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-7 h-7 animate-spin text-secondary" /></div>
          ) : (
            <div className="stat-card overflow-hidden p-0">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    {["N° Dossier","Client","Compagnie","Statut","Responsable","Créé le","Actions"].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dossiers.map((d: any, i: number) => (
                    <motion.tr key={d.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                      className="border-b border-border/50 hover:bg-muted/30">
                      <td className="px-4 py-3 text-sm font-semibold text-foreground">{d.numero}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{d.client}</td>
                      <td className="px-4 py-3 text-sm font-medium">{d.compagnie?.replace("_","-")}</td>
                      <td className="px-4 py-3">
                        <span className={`status-badge text-[10px] ${
                          d.status === "cloture" ? "bg-gray-100 text-gray-600" :
                          d.status === "paiement" ? "bg-orange-100 text-orange-700" :
                          "bg-blue-100 text-blue-700"
                        }`}>{d.status}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1"><User className="w-3 h-3" />{d.responsable?.nom ?? "—"}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {new Date(d.dateCreation).toLocaleDateString("fr-FR")}
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => navigate(`/dossiers/${d.id}`)}
                          className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-secondary">
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                  {dossiers.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">Aucun dossier trouvé</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ── Virements ─────────────────────────────────────────── */}
        <TabsContent value="virements">
          <div className="flex justify-end mb-3">
            <Button onClick={() => setVirOpen(true)} className="gap-1.5 bg-secondary text-secondary-foreground hover:opacity-90">
              <Plus className="w-4 h-4" /> Nouveau virement
            </Button>
          </div>
          <div className="stat-card overflow-hidden p-0">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {["Référence","Bénéficiaire","Type","Montant","Statut","Date","Dossier",""].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {virts.map((v: any, i: number) => (
                  <motion.tr key={v.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                    className="border-b border-border/50 hover:bg-muted/30">
                    <td className="px-4 py-3 text-sm font-mono text-foreground">{v.reference}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{v.destination ?? "—"}{v.motif && <div className="text-[11px] text-muted-foreground">{v.motif}</div>}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground capitalize">{v.type ?? "—"}</td>
                    <td className="px-4 py-3 text-sm font-display font-bold text-foreground">
                      {Number(v.montant).toLocaleString("fr-FR")}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`status-badge ${
                        v.statut === "effectue"  ? "bg-green-100 text-green-700" :
                        v.statut === "en_attente"? "bg-amber-100 text-amber-700" :
                        "bg-red-100 text-red-700"
                      }`}>
                        {v.statut === "effectue" ? "Effectué" : v.statut === "en_attente" ? "En attente" : "Annulé"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {new Date(v.dateVirement).toLocaleDateString("fr-FR")}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {v.dossier?.numero ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {v.statut === "en_attente" && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={confirmerVirement.isPending} onClick={() => confirmerVirement.mutate(v.id)}>
                          Confirmer
                        </Button>
                      )}
                    </td>
                  </motion.tr>
                ))}
                {virts.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-10 text-muted-foreground">Aucun virement enregistré</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ── Documents administratifs ──────────────────────────── */}
        <TabsContent value="documents">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Templates */}
            <div className="space-y-3">
              <h3 className="font-display font-semibold text-foreground text-sm">Modèles de documents</h3>
              {DOC_TEMPLATES.map((t, i) => (
                <motion.button key={t.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  onClick={() => { setDocTemplate(t.id); setDocContent(`[${t.label}]\n\nDouala, le ${new Date().toLocaleDateString("fr-FR")}\n\nObjet : ...\n\n`); }}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all hover:border-secondary/40 hover:bg-secondary/5 text-left ${
                    docTemplate === t.id ? "border-secondary/40 bg-secondary/5" : "border-border"
                  }`}>
                  <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                    <t.icon className="w-4 h-4 text-secondary" />
                  </div>
                  <span className="text-sm font-medium text-foreground">{t.label}</span>
                  <ArrowRight className="w-4 h-4 text-muted-foreground ml-auto" />
                </motion.button>
              ))}
            </div>

            {/* Éditeur */}
            <div className="space-y-3">
              <h3 className="font-display font-semibold text-foreground text-sm">
                {docTemplate ? DOC_TEMPLATES.find(t => t.id === docTemplate)?.label : "Éditeur de document"}
              </h3>
              <Textarea
                placeholder="Sélectionnez un modèle à gauche pour commencer la rédaction..."
                value={docContent}
                onChange={e => setDocContent(e.target.value)}
                className="bg-muted/50 h-[300px] font-mono text-sm resize-none"
              />
              {docTemplate && (
                <Select value={docDossier} onValueChange={setDocDossier}>
                  <SelectTrigger className="bg-card"><SelectValue placeholder="Dossier où classer le document..." /></SelectTrigger>
                  <SelectContent>{dossiers.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.numero} — {d.client}</SelectItem>)}</SelectContent>
                </Select>
              )}
              {docTemplate && (
                <div className="flex gap-2">
                  <Button className="gap-1.5 bg-primary text-primary-foreground" disabled={!docDossier || !docContent.trim() || sauverDoc.isPending}
                    onClick={() => sauverDoc.mutate()}>
                    {sauverDoc.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />} Classer dans le dossier
                  </Button>
                  <Button variant="outline" className="gap-1.5" disabled={!docContent.trim()}
                    onClick={() => { try { printDocument(docLabel, docContent, entreprise); } catch (e: any) { toast({ title: "Impression impossible", description: e.message, variant: "destructive" }); } }}>
                    <Download className="w-3.5 h-3.5" /> Imprimer
                  </Button>
                  <Button variant="outline" className="gap-1.5 ml-auto"
                    onClick={() => { setDocTemplate(null); setDocContent(""); }}>
                    Effacer
                  </Button>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <VirementDialog open={virOpen} onClose={() => setVirOpen(false)} />
      <ProformaDialog open={proOpen} onClose={() => setProOpen(false)} dossiers={dossiers} entreprise={entreprise} />
    </AppLayout>
  );
};

export default Administratif;
