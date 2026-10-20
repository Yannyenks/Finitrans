import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, downloadFile } from "@/lib/api";
import { useAuth, STATUS_LABELS } from "@/lib/permissions";
import {
  MapPin, Ship, FileText, Send, Phone, Truck, Clock, ClipboardList, Shield, Anchor,
  Building, User, Loader2, Plus, Download, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { motion } from "framer-motion";
import { toast } from "@/hooks/use-toast";

const STATUS_COLORS: Record<string, string> = {
  reception: "bg-blue-100 text-blue-700", soumission_sgs: "bg-indigo-100 text-indigo-700",
  codage: "bg-purple-100 text-purple-700", validation: "bg-amber-100 text-amber-700",
  paiement: "bg-orange-100 text-orange-700", bon_compagnie: "bg-green-100 text-green-700",
  operations_douala: "bg-cyan-100 text-cyan-700", operations_kribi: "bg-teal-100 text-teal-700", cloture: "bg-gray-100 text-gray-600",
};

const BON_TYPES = {
  douane:        { label: "Bon Douane",          icon: Shield,   color: "text-secondary" },
  compagnie_pak: { label: "Bon Compagnie (PAK)", icon: Anchor,   color: "text-accent" },
  portuaire_pad: { label: "Bon Portuaire (PAD)", icon: Building, color: "text-warning" },
} as const;
type BonType = keyof typeof BON_TYPES;

const BON_STATUT_SUIVANT: Record<string, { statut: string; label: string } | undefined> = {
  emis:   { statut: "valide", label: "Valider" },
  valide: { statut: "utilise", label: "Marquer utilisé" },
};

const GP_VIDE = { dossierId: "", chauffeur: "", telephone: "", destination: "", conteneur: "" };
const BON_VIDE = { dossierId: "", type: "douane" as BonType, numero: "", description: "", montant: "" };

const Kribi = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, can } = useAuth();
  const compagnies: string[] = user?.compagniesAssignees?.length && user.compagniesAssignees.length < 4 ? user.compagniesAssignees : [];
  const peutEcrire = can("permDossier", "partiel");

  const [gpOpen, setGpOpen]     = useState(false);
  const [gpForm, setGpForm]     = useState(GP_VIDE);
  const [bonOpen, setBonOpen]   = useState(false);
  const [bonForm, setBonForm]   = useState(BON_VIDE);
  const [rapport, setRapport]   = useState("");

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["kribi-dashboard"],
    queryFn:  () => api.get<any>("/api/dashboard/kribi"),
  });
  const { data: bonsData } = useQuery({
    queryKey: ["bons-kribi"],
    queryFn:  () => api.get<any>("/api/kribi/bons?limit=100"),
  });
  const { data: gpData } = useQuery({
    queryKey: ["gate-passes-kribi"],
    queryFn:  () => api.get<any>("/api/kribi/gate-passes?limit=50"),
  });
  const { data: crData } = useQuery({
    queryKey: ["comptes-rendus-kribi"],
    queryFn:  () => api.get<any>("/api/kribi/comptes-rendus?limit=10&site=Kribi"),
  });
  const { data: chauffeursRegistre = [] } = useQuery({
    queryKey: ["logistique-chauffeurs-actifs"],
    queryFn:  () => api.get<any[]>("/api/logistique/chauffeurs?actifs=true"),
    staleTime: 5 * 60_000,
  });
  const { data: empData } = useQuery({
    queryKey: ["employes-kribi"],
    queryFn:  () => api.get<any>("/api/employes?site=Kribi&actif=true"),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["kribi-dashboard"] });
    qc.invalidateQueries({ queryKey: ["bons-kribi"] });
    qc.invalidateQueries({ queryKey: ["gate-passes-kribi"] });
  };

  const createGP = useMutation({
    mutationFn: () => api.post<any>("/api/kribi/gate-passes", {
      dossierId: gpForm.dossierId, conteneur: gpForm.conteneur, chauffeur: gpForm.chauffeur,
      telephone: gpForm.telephone, destination: gpForm.destination,
    }),
    onSuccess: (gp) => {
      refresh();
      toast({ title: "Gate-pass émis", description: `${gp.numero} — ${gp.chauffeur}` });
      setGpOpen(false);
      setGpForm(GP_VIDE);
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const createBon = useMutation({
    mutationFn: () => api.post<any>("/api/kribi/bons", {
      dossierId: bonForm.dossierId, type: bonForm.type, numero: bonForm.numero.trim(),
      description: bonForm.description.trim(), montant: bonForm.montant ? Number(bonForm.montant) : undefined,
    }),
    onSuccess: (bon) => {
      refresh();
      toast({ title: "Bon enregistré", description: bon.numero });
      setBonOpen(false);
      setBonForm(BON_VIDE);
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const updateBon = useMutation({
    mutationFn: ({ id, statut }: { id: string; statut: string }) => api.patch(`/api/kribi/bons/${id}`, { statut }),
    onSuccess: () => { refresh(); toast({ title: "Bon mis à jour" }); },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const submitRapport = useMutation({
    mutationFn: (texte: string) => api.post("/api/kribi/comptes-rendus", {
      contenu: texte,
      date: new Date().toISOString(),
      gatePassEmis: dashboard?.gatePassJour ?? 0,
      bonsEmis: dashboard?.bonsJour ?? 0,
      dossiersTraites: dashboard?.dossiersActifs ?? 0,
    }),
    onSuccess: () => {
      toast({ title: "Compte rendu envoyé à Douala" });
      setRapport("");
      qc.invalidateQueries({ queryKey: ["comptes-rendus-kribi"] });
    },
    onError: (err: any) => toast({ title: "Erreur envoi", description: err.message, variant: "destructive" }),
  });

  const dossiers = dashboard?.dossiers ?? [];
  const bons     = bonsData?.data     ?? [];
  const gps      = gpData?.data       ?? [];
  const rapports = crData?.data       ?? [];
  const employes = empData?.data      ?? [];

  const choisirDossierGP = (id: string) => {
    const d = dossiers.find((x: any) => x.id === id);
    setGpForm(f => ({ ...f, dossierId: id, conteneur: d?.conteneur ?? f.conteneur }));
  };

  const handleCreateGP = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gpForm.dossierId || !gpForm.chauffeur || gpForm.telephone.replace(/\D/g, "").length < 8 || !gpForm.conteneur || !gpForm.destination) {
      toast({ title: "Champs requis", description: "Dossier, conteneur, chauffeur, téléphone (8 chiffres min.) et destination", variant: "destructive" });
      return;
    }
    createGP.mutate();
  };

  const handleCreateBon = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bonForm.dossierId || bonForm.numero.trim().length < 3 || bonForm.description.trim().length < 5) {
      toast({ title: "Champs requis", description: "Dossier, numéro (3 car. min.) et description (5 car. min.)", variant: "destructive" });
      return;
    }
    createBon.mutate();
  };

  const telechargerGP = (gp: any) =>
    downloadFile(`/api/exports/gate-pass/${gp.id}`, `gate-pass-${gp.numero}.txt`)
      .catch((err: Error) => toast({ title: "Téléchargement impossible", description: err.message, variant: "destructive" }));

  const DossierSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="bg-muted/50"><SelectValue placeholder="Choisir un dossier Kribi..." /></SelectTrigger>
      <SelectContent>
        {dossiers.map((d: any) => (
          <SelectItem key={d.id} value={d.id}>{d.numero} — {d.client} ({d.compagnie?.replace("_", "-")})</SelectItem>
        ))}
        {dossiers.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">Aucun dossier actif</div>}
      </SelectContent>
    </Select>
  );

  return (
    <AppLayout
      title="Module Kribi"
      subtitle={`Opérations terrain — PAK / PAD${compagnies.length > 0 ? ` | ${compagnies.map(c => c.replace("_", "-")).join(", ")}` : ""}`}
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-secondary" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: "Dossiers actifs",   value: dashboard?.dossiersActifs  ?? 0, color: "text-secondary" },
              { label: "En retard",         value: dashboard?.dossiersEnRetard ?? 0, color: "text-destructive" },
              { label: "Bons émis (auj.)",  value: dashboard?.bonsJour        ?? 0, color: "text-accent" },
              { label: "Gate-Pass (auj.)",  value: dashboard?.gatePassJour    ?? 0, color: "text-success" },
            ].map((s, i) => (
              <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} className="stat-card">
                <div className="text-2xl font-display font-bold text-foreground">{s.value}</div>
                <div className={`text-sm ${s.color}`}>{s.label}</div>
              </motion.div>
            ))}
          </div>

          {employes.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {employes.map((emp: any) => (
                <div key={emp.id} className="stat-card flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-display font-semibold text-foreground">{emp.nom}</h4>
                    <p className="text-xs text-muted-foreground">{emp.role}</p>
                    {emp.compagniesAssignees?.length > 0 && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">{emp.compagniesAssignees.join(", ").replace(/_/g, "-")}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <Tabs defaultValue="dossiers">
            <TabsList className="mb-4">
              <TabsTrigger value="dossiers" className="gap-1.5"><ClipboardList className="w-3.5 h-3.5" /> Dossiers ({dossiers.length})</TabsTrigger>
              <TabsTrigger value="bons" className="gap-1.5"><FileText className="w-3.5 h-3.5" /> Bons ({bons.length})</TabsTrigger>
              <TabsTrigger value="gatepasses" className="gap-1.5"><Truck className="w-3.5 h-3.5" /> Gate-Pass ({gps.length})</TabsTrigger>
              <TabsTrigger value="rapport" className="gap-1.5"><Send className="w-3.5 h-3.5" /> Compte rendu</TabsTrigger>
            </TabsList>

            <TabsContent value="dossiers">
              <div className="max-w-3xl space-y-3">
                {dossiers.map((d: any) => {
                  const enRetard = d.dateLimiteSortie && new Date(d.dateLimiteSortie) < new Date() && d.status !== "cloture";
                  return (
                    <button
                      key={d.id}
                      onClick={() => navigate(`/dossiers/${d.id}`)}
                      className={`stat-card w-full text-left hover:ring-1 hover:ring-secondary/30 transition ${enRetard ? "border border-destructive/30 bg-destructive/5" : ""}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-display font-bold text-foreground">{d.numero}</span>
                            <span className={`status-badge ${enRetard ? "bg-red-100 text-red-700" : STATUS_COLORS[d.status] ?? ""}`}>
                              {enRetard ? "EN RETARD" : STATUS_LABELS[d.status] ?? d.status}
                            </span>
                          </div>
                          <p className="text-sm text-foreground">{d.client}</p>
                        </div>
                        <span className="text-xs text-muted-foreground">{d.compagnie?.replace("_", "-")}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                        <Ship className="w-3 h-3" />
                        <span className="font-mono">{d.conteneur}</span>
                        <span>•</span>
                        <span>Resp : {d.responsable?.nom ?? "—"}</span>
                        {d.dateLimiteSortie && (
                          <span className={`flex items-center gap-1 ${enRetard ? "text-destructive font-semibold" : ""}`}>
                            <Clock className="w-3 h-3" /> {new Date(d.dateLimiteSortie).toLocaleDateString("fr-FR")}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
                {dossiers.length === 0 && <p className="text-muted-foreground text-center py-10">Aucun dossier actif à Kribi</p>}
              </div>
            </TabsContent>

            <TabsContent value="bons">
              {peutEcrire && (
                <Button className="gap-2 bg-primary text-primary-foreground mb-4" onClick={() => setBonOpen(true)}>
                  <Plus className="w-4 h-4" /> Nouveau bon
                </Button>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {(Object.keys(BON_TYPES) as BonType[]).map(type => {
                  const { label, icon: Icon, color } = BON_TYPES[type];
                  const typeBons = bons.filter((b: any) => b.type === type);
                  return (
                    <div key={type} className="stat-card">
                      <h4 className="font-display font-semibold text-foreground mb-3 flex items-center gap-2">
                        <Icon className={`w-4 h-4 ${color}`} /> {label} ({typeBons.length})
                      </h4>
                      <div className="space-y-2">
                        {typeBons.map((bon: any) => {
                          const suivant = BON_STATUT_SUIVANT[bon.statut];
                          return (
                            <div key={bon.id} className="p-2.5 rounded-lg bg-muted/50">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-semibold text-foreground">{bon.numero}</span>
                                <span className={`status-badge text-[10px] ${bon.statut === "utilise" ? "bg-green-100 text-green-700" : bon.statut === "valide" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                                  {bon.statut}
                                </span>
                              </div>
                              <p className="text-[10px] text-muted-foreground">{bon.dossier?.numero} — {bon.description}</p>
                              <div className="flex items-center justify-between mt-1">
                                {bon.montant ? <span className="text-[10px] font-medium text-foreground">{Number(bon.montant).toLocaleString("fr-FR")} FCFA</span> : <span />}
                                {suivant && peutEcrire && (
                                  <button
                                    className="text-[10px] text-secondary hover:underline flex items-center gap-1"
                                    disabled={updateBon.isPending}
                                    onClick={() => updateBon.mutate({ id: bon.id, statut: suivant.statut })}
                                  >
                                    <CheckCircle2 className="w-3 h-3" /> {suivant.label}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {typeBons.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Aucun bon</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="gatepasses">
              <div className="max-w-2xl space-y-4">
                {peutEcrire && (
                  <Button className="gap-2 bg-primary text-primary-foreground mb-2" onClick={() => setGpOpen(true)}>
                    <FileText className="w-4 h-4" /> Nouveau Gate-Pass
                  </Button>
                )}
                {gps.map((gp: any) => (
                  <div key={gp.id} className="stat-card">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <span className="text-sm font-display font-bold text-foreground">{gp.numero}</span>
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">{gp.conteneur} · {gp.dossier?.numero}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{new Date(gp.dateEmission).toLocaleDateString("fr-FR")}</span>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => telechargerGP(gp)}>
                          <Download className="w-3 h-3" /> Imprimer
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5"><Truck className="w-3.5 h-3.5" /> {gp.chauffeur}</div>
                      <div className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {gp.telephone}</div>
                      {gp.destination && <div className="flex items-center gap-1.5 col-span-2"><MapPin className="w-3.5 h-3.5" /> {gp.destination}</div>}
                    </div>
                  </div>
                ))}
                {gps.length === 0 && <p className="text-muted-foreground text-center py-10">Aucun gate-pass</p>}
              </div>
            </TabsContent>

            <TabsContent value="rapport">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl">
                <div className="stat-card">
                  <h3 className="font-display font-semibold text-foreground mb-1">Compte rendu journalier</h3>
                  <p className="text-sm text-muted-foreground mb-4">Résumé des opérations à Kribi, transmis à Douala</p>
                  <Textarea
                    placeholder="Décrivez les opérations réalisées aujourd'hui (10 caractères minimum)..."
                    value={rapport}
                    onChange={e => setRapport(e.target.value)}
                    className="bg-muted/50 h-40 mb-4"
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">Date : {new Date().toLocaleDateString("fr-FR")}</p>
                    <Button
                      onClick={() => submitRapport.mutate(rapport.trim())}
                      disabled={rapport.trim().length < 10 || submitRapport.isPending}
                      className="gap-2 bg-primary text-primary-foreground"
                    >
                      {submitRapport.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      Envoyer à Douala
                    </Button>
                  </div>
                </div>
                <div className="stat-card">
                  <h3 className="font-display font-semibold text-foreground mb-3">Derniers comptes rendus</h3>
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {rapports.map((r: any) => (
                      <div key={r.id} className="p-3 rounded-lg bg-muted/50">
                        <p className="text-xs text-muted-foreground mb-1">{new Date(r.date).toLocaleDateString("fr-FR")} — {r.auteur?.nom}</p>
                        <p className="text-sm text-foreground whitespace-pre-line">{r.contenu}</p>
                      </div>
                    ))}
                    {rapports.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Aucun compte rendu</p>}
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}

      <Dialog open={gpOpen} onOpenChange={setGpOpen}>
        <DialogContent className="bg-card sm:max-w-md">
          <DialogHeader><DialogTitle className="font-display">Nouveau Gate-Pass</DialogTitle></DialogHeader>
          <form onSubmit={handleCreateGP} className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Dossier *</Label>
              <DossierSelect value={gpForm.dossierId} onChange={choisirDossierGP} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Nom du chauffeur *</Label>
                <Input list="chauffeurs-registre" placeholder="Ex : Emmanuel NDJOCK" value={gpForm.chauffeur} className="bg-muted/50"
                  onChange={e => {
                    const ch = chauffeursRegistre.find((c: any) => c.nom === e.target.value);
                    setGpForm({ ...gpForm, chauffeur: e.target.value, telephone: ch?.telephone ?? gpForm.telephone });
                  }} />
                <datalist id="chauffeurs-registre">{chauffeursRegistre.map((c: any) => <option key={c.id} value={c.nom}>{c.telephone}</option>)}</datalist>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Téléphone *</Label>
                <Input placeholder="+237 6XX XXX XXX" value={gpForm.telephone} onChange={e => setGpForm({ ...gpForm, telephone: e.target.value })} className="bg-muted/50" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">N° Conteneur *</Label>
                <Input placeholder="Ex : MSCU7654321" value={gpForm.conteneur} onChange={e => setGpForm({ ...gpForm, conteneur: e.target.value })} className="bg-muted/50 font-mono text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Destination *</Label>
                <Input placeholder="Ex : Yaoundé" value={gpForm.destination} onChange={e => setGpForm({ ...gpForm, destination: e.target.value })} className="bg-muted/50" />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button type="button" variant="outline" onClick={() => setGpOpen(false)}>Annuler</Button>
              <Button type="submit" className="bg-primary text-primary-foreground gap-2" disabled={createGP.isPending}>
                {createGP.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Émettre le Gate-Pass
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={bonOpen} onOpenChange={setBonOpen}>
        <DialogContent className="bg-card sm:max-w-md">
          <DialogHeader><DialogTitle className="font-display">Nouveau bon</DialogTitle></DialogHeader>
          <form onSubmit={handleCreateBon} className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Dossier *</Label>
              <DossierSelect value={bonForm.dossierId} onChange={v => setBonForm({ ...bonForm, dossierId: v })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Type *</Label>
                <Select value={bonForm.type} onValueChange={(v: BonType) => setBonForm({ ...bonForm, type: v })}>
                  <SelectTrigger className="bg-muted/50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(BON_TYPES) as BonType[]).map(t => <SelectItem key={t} value={t}>{BON_TYPES[t].label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">N° du bon *</Label>
                <Input placeholder="Ex : BK-DOU-2026-0042" value={bonForm.numero} onChange={e => setBonForm({ ...bonForm, numero: e.target.value })} className="bg-muted/50 font-mono text-sm" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description *</Label>
              <Input placeholder="Ex : Bon de passage douane — visite" value={bonForm.description} onChange={e => setBonForm({ ...bonForm, description: e.target.value })} className="bg-muted/50" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Montant (FCFA, optionnel)</Label>
              <Input type="number" min={0} value={bonForm.montant} onChange={e => setBonForm({ ...bonForm, montant: e.target.value })} className="bg-muted/50 font-mono" />
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button type="button" variant="outline" onClick={() => setBonOpen(false)}>Annuler</Button>
              <Button type="submit" className="bg-primary text-primary-foreground gap-2" disabled={createBon.isPending}>
                {createBon.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Enregistrer le bon
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Kribi;
