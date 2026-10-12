import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { STATUS_LABELS, fcfa, useAuth } from "@/lib/permissions";
import {
  PackageOpen, Ship, AlertTriangle, CheckCircle2, FileText, DollarSign, Loader2, ChevronRight,
  Search, Receipt, RotateCcw, Ban, Plus, Timer, ArrowRightLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

const STATUS_COLORS: Record<string, string> = {
  paiement: "bg-orange-100 text-orange-700",
  bon_compagnie: "bg-green-100 text-green-700",
  operations_kribi: "bg-teal-100 text-teal-700",
  cloture: "bg-gray-100 text-gray-600",
};
const erreur = (err: any) => toast({ title: "Erreur", description: err?.message, variant: "destructive" });
const today = () => new Date().toISOString().slice(0, 10);

/** Rafraîchit toutes les listes de la page après une action. */
function useRefresh() {
  const qc = useQueryClient();
  return () => ["sorties", "paiements-compagnie", "paiements-douane", "interchanges", "detentions", "factures"]
    .forEach(k => qc.invalidateQueries({ queryKey: [k] }));
}

const DossierSelect = ({ dossiers, value, onChange }: { dossiers: any[]; value: string; onChange: (v: string) => void }) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger className="bg-muted/50"><SelectValue placeholder="Choisir un dossier..." /></SelectTrigger>
    <SelectContent>
      {dossiers.map(d => <SelectItem key={d.id} value={d.id}>{d.numero} — {d.client} ({d.compagnie?.replace("_", "-")})</SelectItem>)}
    </SelectContent>
  </Select>
);

// ── Pénalité ────────────────────────────────────────────────────────────────
const PenaliteDialog = ({ dossiers, initial, onClose }: { dossiers: any[]; initial?: any; onClose: () => void }) => {
  const refresh = useRefresh();
  const [form, setForm] = useState({ dossierId: initial?.id ?? "", montant: "", raison: "", type: "compagnie", dateEcheance: "" });
  const add = useMutation({
    mutationFn: () => api.post(`/api/dossiers/${form.dossierId}/penalites`, {
      montant: parseFloat(form.montant), raison: form.raison.trim(), type: form.type,
      dateEcheance: form.dateEcheance ? new Date(form.dateEcheance).toISOString() : undefined,
    }),
    onSuccess: () => { refresh(); toast({ title: "Pénalité enregistrée" }); onClose(); },
    onError: erreur,
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-card sm:max-w-[440px]">
        <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><Ban className="w-4 h-4 text-destructive" /> Nouvelle pénalité</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5"><Label className="text-xs">Dossier *</Label><DossierSelect dossiers={dossiers} value={form.dossierId} onChange={v => setForm({ ...form, dossierId: v })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Montant (FCFA) *</Label><Input type="number" value={form.montant} onChange={e => setForm({ ...form, montant: e.target.value })} className="bg-muted/50 font-mono" /></div>
            <div className="space-y-1.5">
              <Label className="text-xs">Imputée par</Label>
              <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                <SelectTrigger className="bg-muted/50"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="compagnie">Compagnie (surestaries)</SelectItem><SelectItem value="douane">Douane</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Raison *</Label><Textarea value={form.raison} onChange={e => setForm({ ...form, raison: e.target.value })} placeholder="Ex : dépassement de franchise de 7 jours" className="bg-muted/50 h-20" /></div>
          <div className="space-y-1.5"><Label className="text-xs">Échéance</Label><Input type="date" value={form.dateEcheance} onChange={e => setForm({ ...form, dateEcheance: e.target.value })} className="bg-muted/50" /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button onClick={() => add.mutate()} disabled={!form.dossierId || !(Number(form.montant) > 0) || form.raison.trim().length < 2 || add.isPending} className="bg-destructive text-destructive-foreground gap-2">
              {add.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Enregistrer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ── Paiement compagnie (bon / BAD) ──────────────────────────────────────────
const PaiementCompagnieDialog = ({ dossier, onClose }: { dossier: any; onClose: () => void }) => {
  const refresh = useRefresh();
  const [form, setForm] = useState({ reference: "", montant: "", type: "frais_portuaires", date: today() });
  const add = useMutation({
    mutationFn: () => api.post("/api/finance/paiements-compagnie", {
      dossierId: dossier.id, compagnie: dossier.compagnie, type: form.type, montant: parseFloat(form.montant),
      reference: form.reference.trim(), datePaiement: new Date(form.date).toISOString(), statut: "paye",
    }),
    onSuccess: () => { refresh(); toast({ title: "Paiement compagnie enregistré", description: form.reference }); onClose(); },
    onError: erreur,
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-card sm:max-w-[460px]">
        <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><Receipt className="w-4 h-4 text-secondary" /> Paiement compagnie — {dossier.numero}</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="rounded-xl bg-muted/40 p-3 text-sm">{dossier.compagnie?.replace("_", "-")} · {dossier.client} · <span className="font-mono">{dossier.conteneur}</span></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">N° facture / bon *</Label><Input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} className="bg-muted/50 font-mono text-sm" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Montant (FCFA) *</Label><Input type="number" value={form.montant} onChange={e => setForm({ ...form, montant: e.target.value })} className="bg-muted/50 font-mono" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nature</Label>
              <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                <SelectTrigger className="bg-muted/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="frais_portuaires">Frais compagnie / BAD</SelectItem>
                  <SelectItem value="terminal">Terminal</SelectItem>
                  <SelectItem value="manutention">Manutention</SelectItem>
                  <SelectItem value="surestaries">Surestaries</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Date</Label><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="bg-muted/50" /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button onClick={() => add.mutate()} disabled={!form.reference.trim() || !(Number(form.montant) > 0) || add.isPending} className="gap-2 bg-secondary text-secondary-foreground">
              {add.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Enregistrer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ── Interchange ─────────────────────────────────────────────────────────────
const InterchangeDialog = ({ dossier, onClose }: { dossier: any; onClose: () => void }) => {
  const refresh = useRefresh();
  const [form, setForm] = useState({ conteneur: dossier.conteneur ?? "", dateLimite: "", notes: "" });
  const add = useMutation({
    mutationFn: () => api.post("/api/interchanges", {
      dossierId: dossier.id, conteneur: form.conteneur.trim(), compagnie: dossier.compagnie,
      dateLimite: new Date(`${form.dateLimite}T23:59:59`).toISOString(), notes: form.notes || undefined,
    }),
    onSuccess: () => { refresh(); toast({ title: "Interchange émis" }); onClose(); },
    onError: erreur,
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-card sm:max-w-[420px]">
        <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><ArrowRightLeft className="w-4 h-4 text-secondary" /> Interchange — {dossier.numero}</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5"><Label className="text-xs">Conteneur *</Label><Input value={form.conteneur} onChange={e => setForm({ ...form, conteneur: e.target.value })} className="bg-muted/50 font-mono" /></div>
          <div className="space-y-1.5"><Label className="text-xs">Date limite de retour du vide *</Label><Input type="date" value={form.dateLimite} onChange={e => setForm({ ...form, dateLimite: e.target.value })} className="bg-muted/50" /></div>
          <div className="space-y-1.5"><Label className="text-xs">Notes</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="bg-muted/50" /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button onClick={() => add.mutate()} disabled={form.conteneur.trim().length < 3 || !form.dateLimite || add.isPending} className="gap-2 bg-secondary text-secondary-foreground">
              {add.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Émettre
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ── Détention ───────────────────────────────────────────────────────────────
const DetentionDialog = ({ dossier, onClose }: { dossier: any; onClose: () => void }) => {
  const refresh = useRefresh();
  const [form, setForm] = useState({ dateDebut: today(), tarif: "", notes: "" });
  const add = useMutation({
    mutationFn: () => api.post("/api/detentions", {
      dossierId: dossier.id, conteneur: dossier.conteneur, compagnie: dossier.compagnie,
      dateDebut: new Date(form.dateDebut).toISOString(), tarifJournalier: parseFloat(form.tarif), notes: form.notes || undefined,
    }),
    onSuccess: () => { refresh(); toast({ title: "Détention ouverte", description: "Le coût est calculé chaque jour." }); onClose(); },
    onError: erreur,
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-card sm:max-w-[420px]">
        <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><Timer className="w-4 h-4 text-destructive" /> Détention — {dossier.numero}</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Début *</Label><Input type="date" value={form.dateDebut} onChange={e => setForm({ ...form, dateDebut: e.target.value })} className="bg-muted/50" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Tarif / jour (FCFA) *</Label><Input type="number" value={form.tarif} onChange={e => setForm({ ...form, tarif: e.target.value })} className="bg-muted/50 font-mono" /></div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Notes</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="bg-muted/50" /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button onClick={() => add.mutate()} disabled={!form.dateDebut || !(Number(form.tarif) > 0) || add.isPending} className="gap-2 bg-destructive text-destructive-foreground">
              {add.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Ouvrir la détention
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ── Facturation client ──────────────────────────────────────────────────────
const FacturationDialog = ({ dossier, onClose }: { dossier: any; onClose: () => void }) => {
  const refresh = useRefresh();
  const [form, setForm] = useState({ numFacture: `FACT-${dossier.numero}`, montantHT: "", tva: "19.25", debours: "", notes: "", statut: "validee" });
  const ht = parseFloat(form.montantHT) || 0;
  const tva = Math.round(ht * (parseFloat(form.tva) || 0)) / 100;
  const debours = parseFloat(form.debours) || 0;
  const ttc = ht + tva + debours;
  const generer = useMutation({
    mutationFn: () => api.post(`/api/dossiers/${dossier.id}/factures`, {
      numero: form.numFacture.trim(), type: form.statut, montant: ttc, montantTVA: tva, montantDebours: debours,
      compagnie: dossier.compagnie, dateFacture: new Date().toISOString(),
      description: form.notes.trim() || `Prestations de transit — ${dossier.numero}`,
    }),
    onSuccess: () => { refresh(); toast({ title: "Facture enregistrée", description: `${form.numFacture} — ${fcfa(ttc)}` }); onClose(); },
    onError: erreur,
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-card sm:max-w-[480px]">
        <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><FileText className="w-4 h-4 text-secondary" /> Facturation — {dossier.numero}</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">N° facture *</Label><Input value={form.numFacture} onChange={e => setForm({ ...form, numFacture: e.target.value })} className="bg-muted/50 font-mono text-sm" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Honoraires HT (FCFA) *</Label><Input type="number" value={form.montantHT} onChange={e => setForm({ ...form, montantHT: e.target.value })} className="bg-muted/50 font-mono" /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">TVA (%)</Label><Input type="number" value={form.tva} onChange={e => setForm({ ...form, tva: e.target.value })} className="bg-muted/50 font-mono" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Débours refacturés</Label><Input type="number" value={form.debours} onChange={e => setForm({ ...form, debours: e.target.value })} className="bg-muted/50 font-mono" /></div>
            <div className="space-y-1.5">
              <Label className="text-xs">Statut</Label>
              <Select value={form.statut} onValueChange={v => setForm({ ...form, statut: v })}>
                <SelectTrigger className="bg-muted/50"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="proforma">Proforma</SelectItem><SelectItem value="validee">Validée</SelectItem><SelectItem value="reglee">Réglée</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          {ht > 0 && (
            <div className="rounded-xl bg-muted/50 p-3 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Honoraires HT</span><span>{fcfa(ht)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">TVA ({form.tva} %)</span><span>{fcfa(tva)}</span></div>
              {debours > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Débours</span><span>{fcfa(debours)}</span></div>}
              <div className="flex justify-between border-t border-border pt-1 font-semibold"><span>Total TTC</span><span className="text-secondary">{fcfa(ttc)}</span></div>
            </div>
          )}
          <div className="space-y-1.5"><Label className="text-xs">Prestations</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="bg-muted/50 h-16" /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button onClick={() => generer.mutate()} disabled={!form.numFacture.trim() || ht <= 0 || generer.isPending} className="gap-2 bg-primary text-primary-foreground">
              {generer.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Enregistrer la facture
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ── Page ────────────────────────────────────────────────────────────────────
type DialogState =
  | { type: "penalite"; dossier?: any } | { type: "paiement"; dossier: any } | { type: "interchange"; dossier: any }
  | { type: "detention"; dossier: any } | { type: "facture"; dossier: any } | null;

const GestionSorties = () => {
  const navigate = useNavigate();
  const refresh = useRefresh();
  const { user, can } = useAuth();
  const compagnies: string[] = user?.compagniesAssignees?.length && user.compagniesAssignees.length < 4 ? user.compagniesAssignees : [];
  const scope = compagnies.length ? `&compagnie=${compagnies.join(",")}` : "";
  const peutFinance = can("permFinancier", "partiel");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);

  const { data: actifs, isLoading } = useQuery({
    queryKey: ["sorties", "actifs", scope],
    queryFn: () => api.get<any>(`/api/dossiers?status=paiement,bon_compagnie,operations_kribi&limit=100${scope}`),
    refetchInterval: 30_000,
  });
  const { data: clotures } = useQuery({
    queryKey: ["sorties", "clotures", scope],
    queryFn: () => api.get<any>(`/api/dossiers?status=cloture&limit=100${scope}`),
  });
  const { data: interchanges } = useQuery({ queryKey: ["interchanges", scope], queryFn: () => api.get<any>(`/api/interchanges?limit=100${scope}`) });
  const { data: detentions } = useQuery({ queryKey: ["detentions", scope], queryFn: () => api.get<any>(`/api/detentions?limit=100${scope}`), enabled: can("permFinancier", "lecture") });
  const { data: penalitesCie } = useQuery({ queryKey: ["paiements-compagnie", "surestaries", scope], queryFn: () => api.get<any>(`/api/finance/paiements-compagnie?type=surestaries&limit=100${scope}`), enabled: can("permFinancier", "lecture") });
  const { data: factures } = useQuery({ queryKey: ["factures", scope], queryFn: () => api.get<any>(`/api/finance/factures?limit=100${scope}`), enabled: can("permFinancier", "lecture") });

  const majInterchange = useMutation({
    mutationFn: ({ id, statut }: { id: string; statut: string }) => api.patch(`/api/interchanges/${id}`, { statut, ...(statut === "retourne" ? { dateRetour: new Date().toISOString() } : {}) }),
    onSuccess: () => { refresh(); toast({ title: "Interchange mis à jour" }); },
    onError: erreur,
  });
  const resoudreDetention = useMutation({
    mutationFn: (id: string) => api.patch(`/api/detentions/${id}`, { statut: "resolue", dateFin: new Date().toISOString() }),
    onSuccess: () => { refresh(); toast({ title: "Détention clôturée" }); },
    onError: erreur,
  });

  const match = (d: any) => !search || `${d.numero} ${d.client} ${d.conteneur}`.toLowerCase().includes(search.toLowerCase());
  const dossiers: any[] = (actifs?.data ?? []).filter(match);
  const fermes: any[] = (clotures?.data ?? []).filter(match);
  const ics: any[] = interchanges?.data ?? [];
  const dets: any[] = detentions?.data ?? [];
  const facturesParDossier = useMemo(() => {
    const m = new Map<string, any[]>();
    (factures?.data ?? []).forEach((f: any) => m.set(f.dossierId, [...(m.get(f.dossierId) ?? []), f]));
    return m;
  }, [factures]);
  const now = new Date();
  const icEnRetard = ics.filter(i => i.enRetard).length;
  const detEnCours = dets.filter(d => d.statut === "en_cours");

  return (
    <AppLayout title="Gestion des Sorties" subtitle={`${user?.nom ?? ""} — ${compagnies.length ? compagnies.join(", ").replace(/_/g, "-") : "Toutes compagnies"}`}>
      {compagnies.length > 0 && (
        <div className="flex items-center gap-2 mb-5 p-3 rounded-xl bg-secondary/5 border border-secondary/15">
          <Ship className="w-4 h-4 text-secondary" />
          <span className="text-xs font-medium text-foreground">Compagnies assignées :</span>
          {compagnies.map(c => <span key={c} className="status-badge bg-secondary/15 text-secondary text-xs">{c.replace("_", "-")}</span>)}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Bons compagnie en cours", value: dossiers.filter(d => d.status === "bon_compagnie").length, color: "text-warning", icon: Receipt },
          { label: "Interchanges en retard", value: icEnRetard, color: "text-destructive", icon: ArrowRightLeft },
          { label: "Détentions en cours", value: detEnCours.length, color: "text-destructive", icon: Timer },
          { label: "Dossiers clôturés", value: fermes.length, color: "text-success", icon: CheckCircle2 },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <s.icon className={`w-5 h-5 ${s.color} mb-2`} />
            <div className={`text-2xl font-display font-black ${s.color}`}>{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="mb-4 relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Rechercher dossier, client, conteneur..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 bg-card" />
      </div>

      <Tabs defaultValue="sorties">
        <TabsList className="mb-4 flex-wrap h-auto">
          <TabsTrigger value="sorties" className="gap-1.5"><PackageOpen className="w-3.5 h-3.5" /> Dossiers en sortie ({dossiers.length})</TabsTrigger>
          <TabsTrigger value="interchanges" className="gap-1.5"><ArrowRightLeft className="w-3.5 h-3.5" /> Interchanges ({ics.length})</TabsTrigger>
          <TabsTrigger value="detentions" className="gap-1.5"><Timer className="w-3.5 h-3.5" /> Détentions ({detEnCours.length})</TabsTrigger>
          <TabsTrigger value="penalites" className="gap-1.5"><Ban className="w-3.5 h-3.5" /> Pénalités</TabsTrigger>
          <TabsTrigger value="facturation" className="gap-1.5"><FileText className="w-3.5 h-3.5" /> Facturation ({fermes.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="sorties">
          {isLoading ? <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-secondary" /></div> : (
            <div className="space-y-3 max-w-4xl">
              {dossiers.map(d => {
                const limit = d.dateLimiteSortie ? new Date(d.dateLimiteSortie) : null;
                const enRetard = !!limit && limit < now;
                const icDossier = ics.filter(i => i.dossierId === d.id);
                const detDossier = detEnCours.filter(x => x.dossierId === d.id);
                return (
                  <div key={d.id} className={`stat-card ${enRetard ? "border border-destructive/30 bg-destructive/5" : ""}`}>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-sm font-display font-bold text-foreground">{d.numero}</span>
                          <span className={`status-badge ${STATUS_COLORS[d.status] ?? ""}`}>{STATUS_LABELS[d.status]}</span>
                          {enRetard && <span className="status-badge bg-red-100 text-red-700 inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> sortie en retard</span>}
                        </div>
                        <p className="text-sm text-foreground">{d.client}</p>
                        <p className="text-xs font-mono text-muted-foreground mt-0.5">{d.conteneur} · {d.compagnie?.replace("_", "-")} · {d.site} · resp. {d.responsable?.nom ?? "—"}</p>
                      </div>
                      <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => navigate(`/dossiers/${d.id}`)}>
                        Mes tâches <ChevronRight className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                      <div className="bg-muted/50 rounded-lg p-2">
                        <p className="text-muted-foreground mb-0.5">Interchange</p>
                        <p className="font-semibold">{icDossier.length === 0 ? "Non émis" : icDossier.every(i => i.statut === "retourne") ? <span className="text-success">✓ Retourné</span> : icDossier.some(i => i.enRetard) ? <span className="text-destructive">En retard</span> : "Émis"}</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-2">
                        <p className="text-muted-foreground mb-0.5">Limite de sortie</p>
                        <p className="font-semibold">{limit ? limit.toLocaleDateString("fr-FR") : "—"}</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-2">
                        <p className="text-muted-foreground mb-0.5">Détention</p>
                        <p className={`font-semibold ${detDossier.length ? "text-destructive" : "text-success"}`}>{detDossier.length ? `${detDossier[0].joursDetention} j · ${fcfa(detDossier[0].montantTotal)}` : "Aucune"}</p>
                      </div>
                    </div>
                    {peutFinance && (
                      <div className="flex gap-2 flex-wrap">
                        <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7" onClick={() => setDialog({ type: "paiement", dossier: d })}><Receipt className="w-3 h-3" /> Paiement compagnie</Button>
                        <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7" onClick={() => setDialog({ type: "interchange", dossier: d })}><ArrowRightLeft className="w-3 h-3" /> Interchange</Button>
                        <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7" onClick={() => setDialog({ type: "detention", dossier: d })}><Timer className="w-3 h-3" /> Détention</Button>
                        <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7" onClick={() => setDialog({ type: "penalite", dossier: d })}><Ban className="w-3 h-3" /> Pénalité</Button>
                      </div>
                    )}
                  </div>
                );
              })}
              {dossiers.length === 0 && <p className="text-center py-10 text-muted-foreground">Aucun dossier en phase de sortie</p>}
            </div>
          )}
        </TabsContent>

        <TabsContent value="interchanges">
          <div className="stat-card p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground uppercase">
                <th className="px-4 py-3">Dossier</th><th className="px-4 py-3">Conteneur</th><th className="px-4 py-3">Compagnie</th><th className="px-4 py-3">Limite</th><th className="px-4 py-3">Statut</th><th className="px-4 py-3"></th>
              </tr></thead>
              <tbody>
                {ics.map(i => (
                  <tr key={i.id} className={`border-b border-border/50 ${i.enRetard ? "bg-destructive/5" : ""}`}>
                    <td className="px-4 py-3 font-semibold">{i.dossier?.numero}</td>
                    <td className="px-4 py-3 font-mono text-xs">{i.conteneur}</td>
                    <td className="px-4 py-3">{i.compagnie?.replace("_", "-")}</td>
                    <td className={`px-4 py-3 ${i.enRetard ? "text-destructive font-semibold" : ""}`}>{new Date(i.dateLimite).toLocaleDateString("fr-FR")}{i.enRetard ? ` (+${i.joursRetard} j)` : ""}</td>
                    <td className="px-4 py-3"><span className={`status-badge ${i.statut === "retourne" ? "bg-green-100 text-green-700" : i.statut === "en_litige" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{i.statut.replace("_", " ")}</span></td>
                    <td className="px-4 py-3 text-right">
                      {i.statut !== "retourne" && peutFinance && (
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={majInterchange.isPending} onClick={() => majInterchange.mutate({ id: i.id, statut: "retourne" })}><RotateCcw className="w-3 h-3" /> Retourné</Button>
                          {i.statut !== "en_litige" && <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => majInterchange.mutate({ id: i.id, statut: "en_litige" })}>Litige</Button>}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {ics.length === 0 && <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">Aucun interchange</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="detentions">
          <div className="space-y-3 max-w-3xl">
            {detEnCours.map(d => (
              <div key={d.id} className="stat-card border-destructive/20 flex items-center gap-4">
                <Timer className="w-5 h-5 text-destructive" />
                <div className="flex-1">
                  <p className="text-sm font-semibold">{d.dossier?.numero} — {d.dossier?.client}</p>
                  <p className="text-xs text-muted-foreground">{d.conteneur} · {d.compagnie?.replace("_", "-")} · depuis le {new Date(d.dateDebut).toLocaleDateString("fr-FR")} · {fcfa(d.tarifJournalier)}/jour</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-display font-bold text-destructive">{fcfa(d.montantTotal)}</p>
                  <p className="text-xs text-muted-foreground">{d.joursDetention} jour(s)</p>
                </div>
                {peutFinance && <Button size="sm" variant="outline" className="h-8 text-xs" disabled={resoudreDetention.isPending} onClick={() => resoudreDetention.mutate(d.id)}>Clôturer</Button>}
              </div>
            ))}
            {detEnCours.length === 0 && <div className="text-center py-10 text-muted-foreground"><CheckCircle2 className="w-8 h-8 text-success/50 mx-auto mb-2" />Aucune détention en cours</div>}
          </div>
        </TabsContent>

        <TabsContent value="penalites">
          <div className="space-y-3 max-w-3xl">
            {peutFinance && (
              <div className="flex justify-end"><Button size="sm" className="gap-1.5 bg-secondary text-secondary-foreground" onClick={() => setDialog({ type: "penalite" })}><Plus className="w-3.5 h-3.5" /> Nouvelle pénalité</Button></div>
            )}
            {(penalitesCie?.data ?? []).map((p: any) => (
              <div key={p.id} className="stat-card flex items-center gap-3 border-destructive/20">
                <Ban className="w-4 h-4 text-destructive" />
                <div className="flex-1">
                  <p className="text-sm font-semibold">{p.dossier?.numero} — {p.dossier?.client}</p>
                  <p className="text-xs text-muted-foreground">{p.reference} · {p.compagnie?.replace("_", "-")} · {new Date(p.datePaiement).toLocaleDateString("fr-FR")}</p>
                </div>
                <span className="font-display font-bold">{fcfa(p.montant)}</span>
                <span className={`status-badge ${p.statut === "paye" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>{p.statut.replace("_", " ")}</span>
              </div>
            ))}
            {(penalitesCie?.data ?? []).length === 0 && <div className="text-center py-10 text-muted-foreground"><CheckCircle2 className="w-8 h-8 text-success/50 mx-auto mb-2" />Aucune pénalité</div>}
          </div>
        </TabsContent>

        <TabsContent value="facturation">
          <div className="stat-card p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground uppercase">
                <th className="px-4 py-3">Dossier</th><th className="px-4 py-3">Client</th><th className="px-4 py-3">Compagnie</th><th className="px-4 py-3">Clôture</th><th className="px-4 py-3">Factures</th><th className="px-4 py-3"></th>
              </tr></thead>
              <tbody>
                {fermes.map(d => {
                  const fs = facturesParDossier.get(d.id) ?? [];
                  return (
                    <tr key={d.id} className="border-b border-border/50">
                      <td className="px-4 py-3 font-semibold">{d.numero}</td>
                      <td className="px-4 py-3">{d.client}</td>
                      <td className="px-4 py-3">{d.compagnie?.replace("_", "-")}</td>
                      <td className="px-4 py-3 text-muted-foreground">{new Date(d.updatedAt).toLocaleDateString("fr-FR")}</td>
                      <td className="px-4 py-3">
                        {fs.length ? fs.map(f => <span key={f.id} className="status-badge bg-green-100 text-green-700 mr-1">{f.numero} · {f.type}</span>) : <span className="status-badge bg-amber-100 text-amber-700">À facturer</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {peutFinance && <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7" onClick={() => setDialog({ type: "facture", dossier: d })}><DollarSign className="w-3 h-3" /> Facturer</Button>}
                      </td>
                    </tr>
                  );
                })}
                {fermes.length === 0 && <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">Aucun dossier clôturé</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {dialog?.type === "penalite" && <PenaliteDialog dossiers={dossiers} initial={dialog.dossier} onClose={() => setDialog(null)} />}
      {dialog?.type === "paiement" && <PaiementCompagnieDialog dossier={dialog.dossier} onClose={() => setDialog(null)} />}
      {dialog?.type === "interchange" && <InterchangeDialog dossier={dialog.dossier} onClose={() => setDialog(null)} />}
      {dialog?.type === "detention" && <DetentionDialog dossier={dialog.dossier} onClose={() => setDialog(null)} />}
      {dialog?.type === "facture" && <FacturationDialog dossier={dialog.dossier} onClose={() => setDialog(null)} />}
    </AppLayout>
  );
};

export default GestionSorties;
