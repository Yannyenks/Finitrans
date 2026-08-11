import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api, getStoredUser } from "@/lib/api";
import { MapPin, Ship, FileText, Send, Phone, Truck, Clock, ClipboardList, Shield, Anchor, Building, User, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { motion } from "framer-motion";
import { toast } from "@/hooks/use-toast";

const STATUS_LABELS: Record<string, string> = {
  reception: "Réception", soumission_sgs: "SGS", codage: "Codage", validation: "Validation",
  paiement: "Paiement", bon_compagnie: "Bon Cie", operations_kribi: "Kribi", cloture: "Clôturé",
};
const STATUS_COLORS: Record<string, string> = {
  reception: "bg-blue-100 text-blue-700", soumission_sgs: "bg-indigo-100 text-indigo-700",
  codage: "bg-purple-100 text-purple-700", validation: "bg-amber-100 text-amber-700",
  paiement: "bg-orange-100 text-orange-700", bon_compagnie: "bg-green-100 text-green-700",
  operations_kribi: "bg-teal-100 text-teal-700", cloture: "bg-gray-100 text-gray-600",
};

const Kribi = () => {
  const user = getStoredUser ? getStoredUser() : null;
  const compagnies: string[] = (user as any)?.compagniesAssignees ?? [];
  const [gpOpen, setGpOpen]     = useState(false);
  const [gpForm, setGpForm]     = useState({ chauffeur: "", telephone: "", destination: "", conteneur: "", dossierRef: "" });
  const [rapport, setRapport]   = useState("");

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["kribi-dashboard"],
    queryFn:  () => api.get<any>("/api/dashboard/kribi"),
  });

  const compagnieFilter = compagnies.length > 0 ? `&compagnie=${compagnies.join(",")}` : "";

  const { data: bonsData } = useQuery({
    queryKey: ["bons-kribi", compagnies],
    queryFn:  () => api.get<any>(`/api/kribi/bons?limit=100${compagnieFilter}`),
  });

  const { data: gpData } = useQuery({
    queryKey: ["gate-passes", compagnies],
    queryFn:  () => api.get<any>(`/api/kribi/gate-passes?limit=50${compagnieFilter}`),
  });

  const { data: empData } = useQuery({
    queryKey: ["employes-kribi"],
    queryFn:  () => api.get<any>("/api/employes?site=Kribi&actif=true"),
  });

  const submitRapport = useMutation({
    mutationFn: (texte: string) => api.post("/api/kribi/compte-rendus", {
      site: "Kribi", contenu: texte, date: new Date().toISOString(),
    }),
    onSuccess: () => { toast({ title: "Rapport envoyé" }); setRapport(""); },
    onError: () => toast({ title: "Erreur envoi", variant: "destructive" }),
  });

  const dossiers = dashboard?.dossiers ?? [];
  const bons     = bonsData?.data     ?? [];
  const gps      = gpData?.data       ?? [];
  const employes = empData?.data      ?? [];

  const handleCreateGP = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gpForm.chauffeur || !gpForm.telephone) {
      toast({ title: "Champs requis", description: "Chauffeur et téléphone obligatoires", variant: "destructive" });
      return;
    }
    toast({ title: "Gate-pass créé (simulation)", description: `${gpForm.chauffeur}` });
    setGpOpen(false);
    setGpForm({ chauffeur: "", telephone: "", destination: "" });
  };

  return (
    <AppLayout
      title="Module Kribi"
      subtitle={`Opérations terrain — PAK / PAD${compagnies.length > 0 ? ` | ${compagnies.map(c => c.replace("_","-")).join(", ")}` : ""}`}
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-secondary" /></div>
      ) : (
        <>
          {/* KPIs */}
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

          {/* Profils Kribi */}
          {employes.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {employes.map((emp: any, i: number) => (
                <motion.div key={emp.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} className="stat-card">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-display font-semibold text-foreground">{emp.nom}</h4>
                      <p className="text-xs text-muted-foreground">{emp.role}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          <Tabs defaultValue="dossiers">
            <TabsList className="mb-4">
              <TabsTrigger value="dossiers" className="gap-1.5"><ClipboardList className="w-3.5 h-3.5" /> Dossiers ({dossiers.length})</TabsTrigger>
              <TabsTrigger value="bons" className="gap-1.5"><FileText className="w-3.5 h-3.5" /> Bons ({bons.length})</TabsTrigger>
              <TabsTrigger value="gatepasses" className="gap-1.5"><Truck className="w-3.5 h-3.5" /> Gate-Pass ({gps.length})</TabsTrigger>
              <TabsTrigger value="rapport" className="gap-1.5"><Send className="w-3.5 h-3.5" /> Rapport</TabsTrigger>
            </TabsList>

            {/* Dossiers Kribi */}
            <TabsContent value="dossiers">
              <div className="max-w-2xl space-y-4">
                {dossiers.map((d: any, i: number) => {
                  const enRetard = d.dateLimiteSortie && new Date(d.dateLimiteSortie) < new Date() && d.status !== "cloture";
                  return (
                    <motion.div key={d.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                      className={`stat-card ${enRetard ? "border border-destructive/30 bg-destructive/5" : ""}`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <a href={`/dossiers/${d.id}`} className="text-sm font-display font-bold text-foreground hover:text-secondary">{d.numero}</a>
                            <span className={`status-badge ${enRetard ? "bg-red-100 text-red-700" : STATUS_COLORS[d.status] ?? ""}`}>
                              {enRetard ? "EN RETARD" : STATUS_LABELS[d.status] ?? d.status}
                            </span>
                          </div>
                          <p className="text-sm text-foreground">{d.client}</p>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="w-3 h-3" /> Kribi
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Ship className="w-3 h-3" />
                        <span className="font-mono">{d.conteneur}</span>
                        <span>•</span>
                        <span>Resp: {d.responsable?.nom ?? "—"}</span>
                        {d.dateLimiteSortie && (
                          <span className={`flex items-center gap-1 ${enRetard ? "text-destructive font-semibold" : ""}`}>
                            <Clock className="w-3 h-3" /> {new Date(d.dateLimiteSortie).toLocaleDateString("fr-FR")}
                          </span>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
                {dossiers.length === 0 && <p className="text-muted-foreground text-center py-10">Aucun dossier actif à Kribi</p>}
              </div>
            </TabsContent>

            {/* Bons */}
            <TabsContent value="bons">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {(["douane", "compagnie_pak", "portuaire_pad"] as const).map(type => {
                  const Icons = { douane: Shield, compagnie_pak: Anchor, portuaire_pad: Building };
                  const Labels = { douane: "Bon Douane", compagnie_pak: "Bon Compagnie (PAK)", portuaire_pad: "Bon Portuaire (PAD)" };
                  const Colors = { douane: "text-secondary", compagnie_pak: "text-accent", portuaire_pad: "text-warning" };
                  const Icon = Icons[type];
                  const typeBons = bons.filter((b: any) => b.type === type);
                  return (
                    <div key={type} className="stat-card">
                      <h4 className="font-display font-semibold text-foreground mb-3 flex items-center gap-2">
                        <Icon className={`w-4 h-4 ${Colors[type]}`} />
                        {Labels[type]} ({typeBons.length})
                      </h4>
                      <div className="space-y-2">
                        {typeBons.map((bon: any) => (
                          <div key={bon.id} className="p-2.5 rounded-lg bg-muted/50">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-semibold text-foreground">{bon.numero}</span>
                              <span className={`status-badge text-[10px] ${bon.statut === "utilise" ? "bg-green-100 text-green-700" : bon.statut === "valide" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                                {bon.statut}
                              </span>
                            </div>
                            <p className="text-[10px] text-muted-foreground">{bon.description}</p>
                            {bon.montant && <span className="text-[10px] font-medium text-foreground">{Number(bon.montant).toLocaleString("fr-FR")} FCFA</span>}
                          </div>
                        ))}
                        {typeBons.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Aucun bon</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </TabsContent>

            {/* Gate-Pass */}
            <TabsContent value="gatepasses">
              <div className="max-w-2xl space-y-4">
                <Dialog open={gpOpen} onOpenChange={setGpOpen}>
                  <DialogTrigger asChild>
                    <Button className="gap-2 bg-primary text-primary-foreground mb-2">
                      <FileText className="w-4 h-4" /> Nouveau Gate-Pass
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-card sm:max-w-md">
                    <DialogHeader><DialogTitle className="font-display">Nouveau Gate-Pass</DialogTitle></DialogHeader>
                    <form onSubmit={handleCreateGP} className="space-y-3 mt-2">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Nom du chauffeur *</Label>
                          <Input placeholder="Ex: Emmanuel NDJOCK" value={gpForm.chauffeur} onChange={e => setGpForm({...gpForm, chauffeur: e.target.value})} className="bg-muted/50" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Téléphone *</Label>
                          <Input placeholder="+237 6XX XXX XXX" value={gpForm.telephone} onChange={e => setGpForm({...gpForm, telephone: e.target.value})} className="bg-muted/50" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">N° Conteneur</Label>
                          <Input placeholder="Ex: MSCU7654321" value={gpForm.conteneur} onChange={e => setGpForm({...gpForm, conteneur: e.target.value})} className="bg-muted/50 font-mono text-sm" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Ref. Dossier</Label>
                          <Input placeholder="Ex: FT-2025-0047" value={gpForm.dossierRef} onChange={e => setGpForm({...gpForm, dossierRef: e.target.value})} className="bg-muted/50 font-mono text-sm" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Destination</Label>
                        <Input placeholder="Ex: Douala — Entrepôt client ACME" value={gpForm.destination} onChange={e => setGpForm({...gpForm, destination: e.target.value})} className="bg-muted/50" />
                      </div>
                      <div className="flex gap-2 justify-end pt-1">
                        <Button type="button" variant="outline" onClick={() => setGpOpen(false)}>Annuler</Button>
                        <Button type="submit" className="bg-primary text-primary-foreground">Créer le Gate-Pass</Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
                {gps.map((gp: any, i: number) => (
                  <motion.div key={gp.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} className="stat-card">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <span className="text-sm font-display font-bold text-foreground">{gp.numero}</span>
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">{gp.conteneur}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">{new Date(gp.dateEmission).toLocaleDateString("fr-FR")}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5"><Truck className="w-3.5 h-3.5" /> {gp.chauffeur}</div>
                      <div className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {gp.telephone}</div>
                      {gp.destination && <div className="flex items-center gap-1.5 col-span-2"><MapPin className="w-3.5 h-3.5" /> {gp.destination}</div>}
                    </div>
                  </motion.div>
                ))}
                {gps.length === 0 && <p className="text-muted-foreground text-center py-10">Aucun gate-pass</p>}
              </div>
            </TabsContent>

            {/* Rapport */}
            <TabsContent value="rapport">
              <div className="max-w-2xl">
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="stat-card">
                  <h3 className="font-display font-semibold text-foreground mb-1">Compte rendu journalier</h3>
                  <p className="text-sm text-muted-foreground mb-4">Résumé des opérations à Kribi</p>
                  <Textarea
                    placeholder="Décrivez les opérations réalisées aujourd'hui..."
                    value={rapport}
                    onChange={e => setRapport(e.target.value)}
                    className="bg-muted/50 h-40 mb-4"
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">Date: {new Date().toLocaleDateString("fr-FR")}</p>
                    <Button
                      onClick={() => rapport.trim() && submitRapport.mutate(rapport)}
                      disabled={!rapport.trim() || submitRapport.isPending}
                      className="gap-2 bg-primary text-primary-foreground"
                    >
                      <Send className="w-4 h-4" /> Envoyer à Douala
                    </Button>
                  </div>
                </motion.div>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </AppLayout>
  );
};

export default Kribi;
