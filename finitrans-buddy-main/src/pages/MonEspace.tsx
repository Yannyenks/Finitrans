import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ListTodo, CalendarDays, UserCircle, Loader2, ArrowRight, CheckCircle2, Hand, AlertTriangle,
  Clock, ChevronRight, KeyRound, Plane, XCircle,
} from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, refreshSessionUser } from "@/lib/api";
import { STATUS_LABELS, useAuth } from "@/lib/permissions";
import { useLiensExternes, urlValide } from "@/lib/liens";
import { toast } from "@/hooks/use-toast";

/** Tâches qui demandent une saisie spécifique (résultat RVC, quittance, gate pass, règlement client) : à terminer depuis le dossier. */
const SAISIE_DEDIEE = new Set(["pvc", "paiement_client", "paiement_droits", "gate_pass", "facturation_compagnie", "facturation_terminal"]);

const CONGE_TYPES: Record<string, string> = {
  annuel: "Congé annuel", maladie: "Maladie", maternite: "Maternité", paternite: "Paternité",
  sans_solde: "Sans solde", exceptionnel: "Exceptionnel",
};
const CONGE_STATUT: Record<string, string> = {
  demande: "bg-amber-100 text-amber-700", approuve: "bg-green-100 text-green-700",
  refuse: "bg-red-100 text-red-700", annule: "bg-gray-100 text-gray-600",
};

type Tache = {
  id: string; etape: string; cle: string; label: string; statut: string; deadline: string | null;
  actionnable: boolean; enRetard: boolean;
  dossier: { id: string; numero: string; client: string; status: string; site: string; compagnie: string; priorite: string };
};

const TacheRow = ({ t, action }: { t: Tache; action?: React.ReactNode }) => {
  const navigate = useNavigate();
  const lien = useLiensExternes()[`${t.etape}.${t.cle}`];
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border ${t.enRetard ? "border-amber-300 bg-amber-50/50" : "border-border/60 bg-card"}`}>
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${t.statut === "en_cours" ? "bg-blue-500" : t.statut === "rejete" ? "bg-destructive" : "bg-muted-foreground/40"}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{t.label}</p>
        <p className="text-xs text-muted-foreground truncate">
          {t.dossier.numero} · {t.dossier.client} · {STATUS_LABELS[t.etape] ?? t.etape}
          {t.dossier.priorite === "haute" && <span className="ml-1 text-destructive font-semibold">· priorité haute</span>}
        </p>
      </div>
      {t.deadline && (
        <span className={`text-[11px] flex items-center gap-1 ${t.enRetard ? "text-amber-700 font-semibold" : "text-muted-foreground"}`}>
          <Clock className="w-3 h-3" /> {new Date(t.deadline).toLocaleDateString("fr-FR")}
        </span>
      )}
      {lien && urlValide(lien.url) && (
        <a href={lien.url} target="_blank" rel="noopener noreferrer" className="h-8 px-3 rounded-md text-xs font-semibold bg-secondary/10 text-secondary inline-flex items-center gap-1 hover:bg-secondary/20">
          {lien.label} ↗
        </a>
      )}
      {action}
      <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => navigate(`/dossiers/${t.dossier.id}`)}>
        Ouvrir <ChevronRight className="w-3 h-3" />
      </Button>
    </div>
  );
};

const OngletTaches = () => {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["mes-taches"],
    queryFn:  () => api.get<any>("/api/employe/mes-taches"),
    refetchInterval: 60_000,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["mes-taches"] });
    qc.invalidateQueries({ queryKey: ["dossiers"] });
  };

  const terminer = useMutation({
    mutationFn: (t: Tache) => api.put(`/api/dossiers/${t.dossier.id}/sous-etapes/${t.etape}/${t.cle}`, { statut: "valide" }),
    onSuccess: (_d, t) => { refresh(); qc.invalidateQueries({ queryKey: ["sous-etapes", t.dossier.id] }); toast({ title: "Tâche terminée", description: t.label }); },
    onError: (e: any) => toast({ title: "Impossible", description: e.message, variant: "destructive" }),
  });
  const prendre = useMutation({
    mutationFn: (t: Tache) => api.post(`/api/dossiers/${t.dossier.id}/sous-etapes/${t.etape}/${t.cle}/prendre`),
    onSuccess: (_d, t) => { refresh(); toast({ title: "Tâche prise en charge", description: t.label }); },
    onError: (e: any) => toast({ title: "Impossible", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-secondary" /></div>;

  const taches: Tache[] = data?.taches ?? [];
  const maintenant = taches.filter(t => t.actionnable);
  const aVenir = taches.filter(t => !t.actionnable);
  const aPrendre: Tache[] = data?.aPrendre ?? [];
  const pretes: any[] = data?.pretesAAvancer ?? [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "À traiter maintenant", value: data?.resume?.actionnables ?? 0, color: "text-secondary" },
          { label: "En retard",            value: data?.resume?.enRetard ?? 0,     color: "text-destructive" },
          { label: "À prendre en charge",  value: aPrendre.length,                 color: "text-accent" },
          { label: "Étapes à clôturer",    value: pretes.length,                   color: "text-success" },
        ].map(k => (
          <div key={k.label} className="stat-card">
            <div className="text-2xl font-display font-bold text-foreground">{k.value}</div>
            <div className={`text-sm ${k.color}`}>{k.label}</div>
          </div>
        ))}
      </div>

      {pretes.length > 0 && (
        <div className="stat-card border border-success/30">
          <h3 className="font-display font-semibold text-foreground mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-success" /> Étapes terminées — à passer à l'étape suivante
          </h3>
          <div className="space-y-2">
            {pretes.map(d => (
              <div key={d.id} className="flex items-center gap-3 p-3 rounded-xl bg-success/5 border border-success/20">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{d.numero} — {d.client}</p>
                  <p className="text-xs text-muted-foreground">
                    {STATUS_LABELS[d.status]} terminée{d.etapeSuivante ? ` → ${STATUS_LABELS[d.etapeSuivante]}` : " — dossier à clôturer"}
                  </p>
                </div>
                <Button size="sm" className="h-8 text-xs gap-1 bg-success text-white" onClick={() => navigate(`/dossiers/${d.id}`)}>
                  Passer l'étape <ArrowRight className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="stat-card">
        <h3 className="font-display font-semibold text-foreground mb-3 flex items-center gap-2">
          <ListTodo className="w-4 h-4 text-secondary" /> À traiter maintenant ({maintenant.length})
        </h3>
        <div className="space-y-2">
          {maintenant.map(t => (
            <TacheRow key={t.id} t={t} action={!SAISIE_DEDIEE.has(t.cle) && (
              <Button size="sm" className="h-8 text-xs gap-1 bg-success text-white" disabled={terminer.isPending} onClick={() => terminer.mutate(t)}>
                <CheckCircle2 className="w-3 h-3" /> Terminer
              </Button>
            )} />
          ))}
          {maintenant.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Aucune tâche en attente sur les étapes en cours 🎉</p>}
        </div>
      </div>

      {aPrendre.length > 0 && (
        <div className="stat-card">
          <h3 className="font-display font-semibold text-foreground mb-1 flex items-center gap-2">
            <Hand className="w-4 h-4 text-accent" /> Tâches de votre profil sans titulaire ({aPrendre.length})
          </h3>
          <p className="text-xs text-muted-foreground mb-3">Positionnez-vous pour les traiter.</p>
          <div className="space-y-2">
            {aPrendre.map(t => (
              <TacheRow key={t.id} t={t} action={
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1" disabled={prendre.isPending} onClick={() => prendre.mutate(t)}>
                  <Hand className="w-3 h-3" /> Prendre en charge
                </Button>
              } />
            ))}
          </div>
        </div>
      )}

      <div className="stat-card">
        <h3 className="font-display font-semibold text-foreground mb-1 flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" /> À venir ({aVenir.length})
        </h3>
        <p className="text-xs text-muted-foreground mb-3">Tâches qui vous sont attribuées sur les étapes suivantes des dossiers.</p>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {aVenir.map(t => <TacheRow key={t.id} t={t} />)}
          {aVenir.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Rien à venir</p>}
        </div>
      </div>
    </div>
  );
};

const OngletConges = () => {
  const qc = useQueryClient();
  const [form, setForm] = useState({ type: "annuel", dateDebut: "", dateFin: "", motif: "" });
  const { data, isLoading } = useQuery({ queryKey: ["mes-conges"], queryFn: () => api.get<any>("/api/rh/mes-conges") });

  const demander = useMutation({
    mutationFn: () => api.post("/api/rh/conges", {
      type: form.type,
      dateDebut: new Date(`${form.dateDebut}T00:00:00`).toISOString(),
      dateFin: new Date(`${form.dateFin}T23:59:59`).toISOString(),
      motif: form.motif || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mes-conges"] });
      toast({ title: "Demande envoyée à la Direction" });
      setForm({ type: "annuel", dateDebut: "", dateFin: "", motif: "" });
    },
    onError: (e: any) => toast({ title: "Demande refusée", description: e.message, variant: "destructive" }),
  });
  const annuler = useMutation({
    mutationFn: (id: string) => api.patch(`/api/rh/conges/${id}/annuler`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["mes-conges"] }); toast({ title: "Demande annulée" }); },
    onError: (e: any) => toast({ title: "Impossible", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-secondary" /></div>;
  const solde = data?.solde;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="stat-card space-y-4">
        <h3 className="font-display font-semibold text-foreground flex items-center gap-2"><Plane className="w-4 h-4 text-secondary" /> Nouvelle demande</h3>
        {solde && (
          <div className="rounded-xl bg-secondary/5 border border-secondary/20 p-3 text-sm">
            Solde congé annuel {solde.annee} : <strong>{solde.restant}</strong> / {solde.droits} jours
          </div>
        )}
        <div className="space-y-1.5">
          <Label className="text-xs">Type</Label>
          <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
            <SelectTrigger className="bg-muted/50"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(CONGE_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label className="text-xs">Du</Label><Input type="date" value={form.dateDebut} onChange={e => setForm({ ...form, dateDebut: e.target.value })} className="bg-muted/50" /></div>
          <div className="space-y-1.5"><Label className="text-xs">Au</Label><Input type="date" value={form.dateFin} onChange={e => setForm({ ...form, dateFin: e.target.value })} className="bg-muted/50" /></div>
        </div>
        <div className="space-y-1.5"><Label className="text-xs">Motif (optionnel)</Label><Textarea value={form.motif} onChange={e => setForm({ ...form, motif: e.target.value })} className="bg-muted/50 h-20" /></div>
        <Button className="w-full bg-secondary text-secondary-foreground gap-2" disabled={!form.dateDebut || !form.dateFin || demander.isPending} onClick={() => demander.mutate()}>
          {demander.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Envoyer la demande
        </Button>
      </div>
      <div className="stat-card lg:col-span-2">
        <h3 className="font-display font-semibold text-foreground mb-3">Mes demandes</h3>
        <div className="space-y-2">
          {(data?.conges ?? []).map((c: any) => (
            <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl border border-border/60">
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">{CONGE_TYPES[c.type]} — {c.jours} jour(s)</p>
                <p className="text-xs text-muted-foreground">
                  du {new Date(c.dateDebut).toLocaleDateString("fr-FR")} au {new Date(c.dateFin).toLocaleDateString("fr-FR")}
                  {c.decidePar ? ` · décidé par ${c.decidePar.nom}` : ""}{c.commentaireDecision ? ` : ${c.commentaireDecision}` : ""}
                </p>
              </div>
              <span className={`status-badge ${CONGE_STATUT[c.statut]}`}>{c.statut}</span>
              {(c.statut === "demande" || (c.statut === "approuve" && new Date(c.dateDebut) > new Date())) && (
                <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive gap-1" onClick={() => annuler.mutate(c.id)}>
                  <XCircle className="w-3 h-3" /> Annuler
                </Button>
              )}
            </div>
          ))}
          {(data?.conges ?? []).length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Aucune demande</p>}
        </div>
      </div>
    </div>
  );
};

const OngletProfil = () => {
  const { user, modules } = useAuth();
  const [tel, setTel] = useState(user?.telephone ?? "");
  const [pwd, setPwd] = useState({ currentPassword: "", newPassword: "", confirm: "" });

  const majProfil = useMutation({
    mutationFn: () => api.patch("/api/auth/me", { telephone: tel }),
    onSuccess: () => { refreshSessionUser(); toast({ title: "Profil mis à jour" }); },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });
  const majMdp = useMutation({
    mutationFn: () => api.patch("/api/auth/me/password", { currentPassword: pwd.currentPassword, newPassword: pwd.newPassword }),
    onSuccess: () => { toast({ title: "Mot de passe modifié", description: "Vos autres sessions ont été fermées." }); setPwd({ currentPassword: "", newPassword: "", confirm: "" }); },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl">
      <div className="stat-card space-y-3">
        <h3 className="font-display font-semibold text-foreground flex items-center gap-2"><UserCircle className="w-4 h-4 text-secondary" /> Mon profil</h3>
        {[
          ["Nom", user?.nom], ["Email", user?.email], ["Rôle", user?.profilLabel ?? user?.profil],
          ["Site", user?.site], ["Compagnies", user?.compagniesAssignees?.join(", ").replace(/_/g, "-")],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between text-sm border-b border-border/40 pb-2"><span className="text-muted-foreground">{k}</span><span className="font-medium text-foreground">{v || "—"}</span></div>
        ))}
        <div className="space-y-1.5">
          <Label className="text-xs">Téléphone</Label>
          <div className="flex gap-2">
            <Input value={tel} onChange={e => setTel(e.target.value)} className="bg-muted/50" />
            <Button variant="outline" disabled={majProfil.isPending} onClick={() => majProfil.mutate()}>Enregistrer</Button>
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Modules de votre rôle</p>
          <div className="flex flex-wrap gap-1.5">
            {modules.map(m => <span key={m} className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{m.replace(/_/g, " ")}</span>)}
          </div>
        </div>
      </div>
      <div className="stat-card space-y-3">
        <h3 className="font-display font-semibold text-foreground flex items-center gap-2"><KeyRound className="w-4 h-4 text-secondary" /> Changer mon mot de passe</h3>
        <div className="space-y-1.5"><Label className="text-xs">Mot de passe actuel</Label><Input type="password" value={pwd.currentPassword} onChange={e => setPwd({ ...pwd, currentPassword: e.target.value })} className="bg-muted/50" autoComplete="current-password" /></div>
        <div className="space-y-1.5"><Label className="text-xs">Nouveau mot de passe (8 caractères min.)</Label><Input type="password" value={pwd.newPassword} onChange={e => setPwd({ ...pwd, newPassword: e.target.value })} className="bg-muted/50" autoComplete="new-password" /></div>
        <div className="space-y-1.5"><Label className="text-xs">Confirmation</Label><Input type="password" value={pwd.confirm} onChange={e => setPwd({ ...pwd, confirm: e.target.value })} className="bg-muted/50" autoComplete="new-password" /></div>
        {pwd.confirm && pwd.confirm !== pwd.newPassword && (
          <p className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Les mots de passe ne correspondent pas</p>
        )}
        <Button className="w-full bg-secondary text-secondary-foreground" disabled={!pwd.currentPassword || pwd.newPassword.length < 8 || pwd.newPassword !== pwd.confirm || majMdp.isPending} onClick={() => majMdp.mutate()}>
          Modifier le mot de passe
        </Button>
      </div>
    </div>
  );
};

const MonEspace = () => {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const onglet = params.get("onglet") ?? "taches";
  return (
    <AppLayout title="Mon espace" subtitle={`${user?.nom ?? ""} — ${user?.profilLabel ?? ""}`}>
      <Tabs value={onglet} onValueChange={v => setParams({ onglet: v })}>
        <TabsList className="mb-5">
          <TabsTrigger value="taches" className="gap-1.5"><ListTodo className="w-3.5 h-3.5" /> Mes tâches</TabsTrigger>
          <TabsTrigger value="conges" className="gap-1.5"><CalendarDays className="w-3.5 h-3.5" /> Mes congés</TabsTrigger>
          <TabsTrigger value="profil" className="gap-1.5"><UserCircle className="w-3.5 h-3.5" /> Mon profil</TabsTrigger>
        </TabsList>
        <TabsContent value="taches"><OngletTaches /></TabsContent>
        <TabsContent value="conges"><OngletConges /></TabsContent>
        <TabsContent value="profil"><OngletProfil /></TabsContent>
      </Tabs>
    </AppLayout>
  );
};

export default MonEspace;
