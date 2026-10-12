import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Radar, Users, AlertTriangle, CalendarCheck, Shuffle, Loader2, ChevronRight, CheckCircle2,
  Clock, UserX, Plane, XCircle,
} from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { PROFIL_LABELS, STATUS_LABELS } from "@/lib/permissions";
import { toast } from "@/hooks/use-toast";

const TACHE_COULEUR: Record<string, string> = {
  valide: "bg-success", en_cours: "bg-blue-500", rejete: "bg-destructive", todo: "bg-muted-foreground/30",
};

const Pipeline = () => {
  const navigate = useNavigate();
  const [filtre, setFiltre] = useState("tous");
  const [recherche, setRecherche] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["supervision-pipeline"],
    queryFn: () => api.get<any>("/api/supervision/pipeline"),
    refetchInterval: 60_000,
  });

  const dossiers: any[] = useMemo(() => {
    const all: any[] = data?.dossiers ?? [];
    const q = recherche.trim().toLowerCase();
    return all.filter(d => {
      if (q && !`${d.numero} ${d.client} ${d.responsable?.nom ?? ""}`.toLowerCase().includes(q)) return false;
      if (filtre === "bloques") return d.etape.nonAttribuees > 0;
      if (filtre === "sla") return d.etape.depasseSLA;
      if (filtre === "retard") return d.enRetardSortie;
      if (filtre === "prets") return d.etape.total > 0 && d.etape.validees === d.etape.total;
      return filtre === "tous" || d.status === filtre;
    });
  }, [data, filtre, recherche]);

  if (isLoading) return <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-secondary" /></div>;
  const r = data?.resume ?? {};

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { k: "tous", label: "Dossiers actifs", value: r.actifs, color: "text-secondary" },
          { k: "prets", label: "Prêts à avancer", value: r.pretsAAvancer, color: "text-success" },
          { k: "bloques", label: "Tâches sans titulaire", value: r.bloques, color: "text-accent" },
          { k: "sla", label: "SLA d'étape dépassé", value: r.depassementSLA, color: "text-amber-600" },
          { k: "retard", label: "Sortie en retard", value: r.enRetardSortie, color: "text-destructive" },
        ].map(c => (
          <button key={c.k} onClick={() => setFiltre(c.k)} className={`stat-card text-left transition ${filtre === c.k ? "ring-2 ring-secondary/40" : ""}`}>
            <div className="text-2xl font-display font-bold text-foreground">{c.value ?? 0}</div>
            <div className={`text-xs ${c.color}`}>{c.label}</div>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Input placeholder="Rechercher (n°, client, responsable)…" value={recherche} onChange={e => setRecherche(e.target.value)} className="w-72 bg-card" />
        {Object.entries(r.parEtape ?? {}).map(([etape, n]) => (
          <button key={etape} onClick={() => setFiltre(etape)} className={`text-xs px-2.5 py-1 rounded-full border ${filtre === etape ? "bg-secondary text-secondary-foreground border-secondary" : "border-border text-muted-foreground"}`}>
            {STATUS_LABELS[etape] ?? etape} ({n as number})
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {dossiers.map(d => (
          <div key={d.id} className="stat-card py-3">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-display font-bold text-foreground">{d.numero}</span>
                  <span className="text-sm text-foreground truncate">{d.client}</span>
                  <span className="status-badge bg-muted text-muted-foreground">{d.statusLabel}</span>
                  <span className="text-[11px] text-muted-foreground">{d.site} · {d.compagnie?.replace("_", "-")}</span>
                  {d.priorite === "haute" && <span className="status-badge bg-red-100 text-red-700">haute</span>}
                  {d.etape.depasseSLA && <span className="status-badge bg-amber-100 text-amber-700">SLA dépassé</span>}
                  {d.enRetardSortie && <span className="status-badge bg-red-100 text-red-700">sortie en retard</span>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Responsable de l'étape : <strong className="text-foreground">{d.responsable?.nom ?? "—"}</strong>
                  {d.etape.heuresEcoulees !== null && <> · depuis {d.etape.heuresEcoulees} h (SLA {d.etape.slaHeures} h)</>}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {d.etape.taches.map((t: any) => (
                    <span key={t.cle} title={`${t.label} — ${t.statut}`} className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full bg-muted/60 text-foreground">
                      <span className={`w-1.5 h-1.5 rounded-full ${TACHE_COULEUR[t.statut] ?? "bg-muted"}`} />
                      {t.label.length > 28 ? `${t.label.slice(0, 28)}…` : t.label}
                      <span className={t.responsable ? "text-muted-foreground" : "text-destructive font-semibold"}>
                        · {t.responsable?.nom ?? "non attribuée"}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-muted-foreground">{d.etape.validees}/{d.etape.total} tâches</p>
                <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden mt-1 ml-auto">
                  <div className="h-full bg-success" style={{ width: `${d.etape.total ? (d.etape.validees / d.etape.total) * 100 : 0}%` }} />
                </div>
                <Button size="sm" variant="outline" className="h-7 text-xs mt-2 gap-1" onClick={() => navigate(`/dossiers/${d.id}`)}>
                  Superviser <ChevronRight className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>
        ))}
        {dossiers.length === 0 && <p className="text-sm text-muted-foreground text-center py-10">Aucun dossier pour ce filtre</p>}
      </div>
    </div>
  );
};

const Charge = () => {
  const { data, isLoading } = useQuery({ queryKey: ["supervision-charge"], queryFn: () => api.get<any[]>("/api/supervision/charge") });
  if (isLoading) return <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-secondary" /></div>;
  const max = Math.max(1, ...(data ?? []).map(u => u.tachesOuvertes));
  return (
    <div className="stat-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground border-b border-border">
            <th className="py-2 pr-3">Employé</th><th className="py-2 pr-3">Rôle</th><th className="py-2 pr-3">Tâches ouvertes</th>
            <th className="py-2 pr-3">À traiter</th><th className="py-2 pr-3">En retard</th><th className="py-2 pr-3">Terminées (30 j)</th><th className="py-2">Présence</th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map(u => (
            <tr key={u.id} className="border-b border-border/40">
              <td className="py-2.5 pr-3 font-medium text-foreground">{u.nom}<div className="text-[11px] text-muted-foreground">{u.site}{u.compagnies?.length < 4 ? ` · ${u.compagnies.join(", ").replace(/_/g, "-")}` : ""}</div></td>
              <td className="py-2.5 pr-3 text-muted-foreground">{PROFIL_LABELS[u.profil] ?? u.profil}</td>
              <td className="py-2.5 pr-3">
                <div className="flex items-center gap-2">
                  <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-secondary" style={{ width: `${(u.tachesOuvertes / max) * 100}%` }} /></div>
                  {u.tachesOuvertes}
                </div>
              </td>
              <td className="py-2.5 pr-3">{u.tachesActionnables}</td>
              <td className={`py-2.5 pr-3 ${u.tachesEnRetard > 0 ? "text-destructive font-semibold" : ""}`}>{u.tachesEnRetard}</td>
              <td className="py-2.5 pr-3 text-success">{u.validees30j}</td>
              <td className="py-2.5">
                {u.enConge
                  ? <span className="status-badge bg-amber-100 text-amber-700 inline-flex items-center gap-1"><Plane className="w-3 h-3" /> congé jusqu'au {new Date(u.retourConge).toLocaleDateString("fr-FR")}</span>
                  : <span className="status-badge bg-green-100 text-green-700">présent</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const Blocages = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["supervision-alertes"], queryFn: () => api.get<any[]>("/api/supervision/alertes-process") });
  const { data: emp } = useQuery({ queryKey: ["employes-actifs"], queryFn: () => api.get<any>("/api/employes?limit=100&actif=true") });
  const attribuer = useMutation({
    mutationFn: ({ t, userId }: { t: any; userId: string }) => api.put(`/api/dossiers/${t.dossier.id}/sous-etapes/${t.etape}/${t.cle}`, { responsableId: userId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["supervision-alertes"] }); qc.invalidateQueries({ queryKey: ["supervision-pipeline"] }); toast({ title: "Tâche attribuée" }); },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });
  if (isLoading) return <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-secondary" /></div>;
  const MOTIF: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
    non_attribuee: { label: "Sans titulaire", cls: "bg-accent/10 text-accent", icon: UserX },
    en_retard: { label: "Délai dépassé", cls: "bg-amber-100 text-amber-700", icon: Clock },
    rejetee: { label: "Bloquée / rejetée", cls: "bg-red-100 text-red-700", icon: XCircle },
  };
  return (
    <div className="space-y-2">
      {(data ?? []).map(t => {
        const m = MOTIF[t.motif];
        return (
          <div key={t.id} className="stat-card py-3 flex items-center gap-3 flex-wrap">
            <span className={`status-badge inline-flex items-center gap-1 ${m.cls}`}><m.icon className="w-3 h-3" /> {m.label}</span>
            <div className="flex-1 min-w-[200px]">
              <p className="text-sm font-semibold text-foreground">{t.label}</p>
              <p className="text-xs text-muted-foreground">{t.dossier.numero} · {t.dossier.client} · {STATUS_LABELS[t.etape]}{t.responsable ? ` · ${t.responsable.nom}` : ""}</p>
            </div>
            <Select onValueChange={userId => attribuer.mutate({ t, userId })}>
              <SelectTrigger className="h-8 w-52 text-xs"><SelectValue placeholder={t.responsable ? "Réattribuer à…" : "Attribuer à…"} /></SelectTrigger>
              <SelectContent>
                {(emp?.data ?? []).map((u: any) => <SelectItem key={u.id} value={u.id}>{u.nom} — {PROFIL_LABELS[u.profil] ?? u.profil}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => navigate(`/dossiers/${t.dossier.id}`)}>Ouvrir</Button>
          </div>
        );
      })}
      {(data ?? []).length === 0 && (
        <div className="stat-card text-center py-10">
          <CheckCircle2 className="w-8 h-8 text-success mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Aucun blocage : toutes les tâches en cours ont un titulaire et sont dans les délais.</p>
        </div>
      )}
    </div>
  );
};

const CongesAValider = () => {
  const qc = useQueryClient();
  const [commentaires, setCommentaires] = useState<Record<string, string>>({});
  const { data, isLoading } = useQuery({ queryKey: ["conges-tous"], queryFn: () => api.get<any[]>("/api/rh/conges") });
  const decider = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "approuve" | "refuse" }) =>
      api.patch(`/api/rh/conges/${id}/decision`, { decision, commentaire: commentaires[id] || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["conges-tous"] }); qc.invalidateQueries({ queryKey: ["supervision-charge"] }); toast({ title: "Décision enregistrée" }); },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });
  if (isLoading) return <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-secondary" /></div>;
  const enAttente = (data ?? []).filter(c => c.statut === "demande");
  const traitees = (data ?? []).filter(c => c.statut !== "demande").slice(0, 30);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="stat-card">
        <h3 className="font-display font-semibold text-foreground mb-3">En attente de décision ({enAttente.length})</h3>
        <div className="space-y-3">
          {enAttente.map(c => (
            <div key={c.id} className="p-3 rounded-xl border border-border/60 space-y-2">
              <p className="text-sm font-semibold text-foreground">{c.user.nom} — {c.jours} jour(s) ({c.type.replace("_", " ")})</p>
              <p className="text-xs text-muted-foreground">du {new Date(c.dateDebut).toLocaleDateString("fr-FR")} au {new Date(c.dateFin).toLocaleDateString("fr-FR")}{c.motif ? ` · ${c.motif}` : ""}</p>
              <Input placeholder="Commentaire (optionnel)" value={commentaires[c.id] ?? ""} onChange={e => setCommentaires({ ...commentaires, [c.id]: e.target.value })} className="h-8 text-xs" />
              <div className="flex gap-2">
                <Button size="sm" className="h-8 text-xs bg-success text-white" disabled={decider.isPending} onClick={() => decider.mutate({ id: c.id, decision: "approuve" })}>Approuver</Button>
                <Button size="sm" variant="outline" className="h-8 text-xs text-destructive" disabled={decider.isPending} onClick={() => decider.mutate({ id: c.id, decision: "refuse" })}>Refuser</Button>
              </div>
            </div>
          ))}
          {enAttente.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Aucune demande en attente</p>}
        </div>
      </div>
      <div className="stat-card">
        <h3 className="font-display font-semibold text-foreground mb-3">Décisions récentes</h3>
        <div className="space-y-2 max-h-[480px] overflow-y-auto">
          {traitees.map(c => (
            <div key={c.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40 text-sm">
              <span>{c.user.nom} · {c.jours} j · {new Date(c.dateDebut).toLocaleDateString("fr-FR")}</span>
              <span className={`status-badge ${c.statut === "approuve" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>{c.statut}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const Reattribution = () => {
  const qc = useQueryClient();
  const [de, setDe] = useState("");
  const [vers, setVers] = useState("");
  const [dossiersAussi, setDossiersAussi] = useState(true);
  const { data: emp } = useQuery({ queryKey: ["employes-actifs"], queryFn: () => api.get<any>("/api/employes?limit=100&actif=true") });
  const users: any[] = emp?.data ?? [];
  const source = users.find(u => u.id === de);
  const transferer = useMutation({
    mutationFn: () => api.post<any>("/api/supervision/reattribuer", { deUserId: de, versUserId: vers, inclureResponsabiliteDossiers: dossiersAussi }),
    onSuccess: (r) => {
      ["supervision-pipeline", "supervision-charge", "supervision-alertes"].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
      toast({ title: "Transfert effectué", description: `${r.tachesTransferees} tâche(s) et ${r.dossiersTransferes} dossier(s) transférés` });
      setDe(""); setVers("");
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });
  return (
    <div className="stat-card max-w-xl space-y-4">
      <h3 className="font-display font-semibold text-foreground flex items-center gap-2"><Shuffle className="w-4 h-4 text-secondary" /> Transférer le travail d'un compte</h3>
      <p className="text-sm text-muted-foreground">En cas d'absence, de congé ou de départ : toutes les tâches ouvertes du compte source sont attribuées au compte cible.</p>
      <div className="space-y-1.5">
        <Label className="text-xs">De</Label>
        <Select value={de} onValueChange={setDe}>
          <SelectTrigger><SelectValue placeholder="Compte source…" /></SelectTrigger>
          <SelectContent>{users.map(u => <SelectItem key={u.id} value={u.id}>{u.nom} — {PROFIL_LABELS[u.profil] ?? u.profil}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Vers</Label>
        <Select value={vers} onValueChange={setVers}>
          <SelectTrigger><SelectValue placeholder="Compte cible…" /></SelectTrigger>
          <SelectContent>
            {users.filter(u => u.id !== de).sort((a, b) => Number(b.profil === source?.profil) - Number(a.profil === source?.profil)).map(u => (
              <SelectItem key={u.id} value={u.id}>{u.nom} — {PROFIL_LABELS[u.profil] ?? u.profil}{source && u.profil === source.profil ? " (même rôle)" : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={dossiersAussi} onCheckedChange={setDossiersAussi} id="dossiers-aussi" />
        <Label htmlFor="dossiers-aussi" className="text-sm">Transférer aussi la responsabilité des dossiers en cours</Label>
      </div>
      <Button className="bg-secondary text-secondary-foreground gap-2" disabled={!de || !vers || transferer.isPending} onClick={() => transferer.mutate()}>
        {transferer.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Transférer
      </Button>
    </div>
  );
};

const Supervision = () => {
  const [params, setParams] = useSearchParams();
  const onglet = params.get("onglet") ?? "pipeline";
  const { data: alertes } = useQuery({ queryKey: ["supervision-alertes"], queryFn: () => api.get<any[]>("/api/supervision/alertes-process") });
  const { data: conges } = useQuery({ queryKey: ["conges-tous"], queryFn: () => api.get<any[]>("/api/rh/conges") });
  const nbConges = (conges ?? []).filter(c => c.statut === "demande").length;
  return (
    <AppLayout title="Supervision des process" subtitle="Qui fait quoi, où ça bloque, et contrôle total sur chaque dossier">
      <Tabs value={onglet} onValueChange={v => setParams({ onglet: v })}>
        <TabsList className="mb-5 flex-wrap h-auto">
          <TabsTrigger value="pipeline" className="gap-1.5"><Radar className="w-3.5 h-3.5" /> Pipeline</TabsTrigger>
          <TabsTrigger value="charge" className="gap-1.5"><Users className="w-3.5 h-3.5" /> Charge de l'équipe</TabsTrigger>
          <TabsTrigger value="blocages" className="gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Blocages{alertes?.length ? ` (${alertes.length})` : ""}</TabsTrigger>
          <TabsTrigger value="conges" className="gap-1.5"><CalendarCheck className="w-3.5 h-3.5" /> Congés{nbConges ? ` (${nbConges})` : ""}</TabsTrigger>
          <TabsTrigger value="reattribution" className="gap-1.5"><Shuffle className="w-3.5 h-3.5" /> Réattribution</TabsTrigger>
        </TabsList>
        <TabsContent value="pipeline"><Pipeline /></TabsContent>
        <TabsContent value="charge"><Charge /></TabsContent>
        <TabsContent value="blocages"><Blocages /></TabsContent>
        <TabsContent value="conges"><CongesAValider /></TabsContent>
        <TabsContent value="reattribution"><Reattribution /></TabsContent>
      </Tabs>
    </AppLayout>
  );
};

export default Supervision;
