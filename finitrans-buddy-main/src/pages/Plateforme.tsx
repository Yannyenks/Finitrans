import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, DatabaseBackup, Inbox, Loader2, Mail, Plus } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import Sauvegardes from "@/components/Sauvegardes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/permissions";

type Plan = "starter" | "business" | "enterprise";
type Statut = "essai" | "actif" | "impaye" | "suspendu" | "annule";

interface EspaceClient {
  id: string; slug: string; nom: string; pays: string; devise: string; actif: boolean; createdAt: string;
  utilisateursActifs: number; dossiers: number;
  abonnement: { plan: Plan; libelle: string; statut: Statut; finEssai: string | null; maxUtilisateurs: number | null };
}

interface DemandeDemo {
  id: string; nom: string; entreprise: string; email: string; telephone: string | null; pays: string | null;
  taille: string | null; message: string | null; langue: string; traitee: boolean; createdAt: string;
}

const STATUTS: Record<Statut, { libelle: string; classe: string }> = {
  essai:    { libelle: "Essai",     classe: "bg-sky-100 text-sky-800" },
  actif:    { libelle: "Actif",     classe: "bg-emerald-100 text-emerald-800" },
  impaye:   { libelle: "Impayé",    classe: "bg-amber-100 text-amber-900" },
  suspendu: { libelle: "Suspendu",  classe: "bg-red-100 text-red-800" },
  annule:   { libelle: "Annulé",    classe: "bg-muted text-muted-foreground" },
};

const dateCourte = (d: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const erreur = (e: unknown) => toast({ title: "Action refusée", description: e instanceof Error ? e.message : String(e), variant: "destructive" });

function NouvelEspace() {
  const qc = useQueryClient();
  const [ouvert, setOuvert] = useState(false);
  const vide = { entreprise: "", nom: "", email: "", password: "", pays: "CM", plan: "business" as Plan, statut: "essai" as "essai" | "actif" };
  const [f, setF] = useState(vide);
  const creer = useMutation({
    mutationFn: () => api.post("/api/plateforme/organisations", f),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plateforme-organisations"] });
      toast({ title: "Espace créé", description: `${f.entreprise} — le dirigeant peut se connecter avec ${f.email}.` });
      setF(vide); setOuvert(false);
    },
    onError: erreur,
  });
  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild><Button className="gap-1.5"><Plus className="h-4 w-4" />Ouvrir un espace</Button></DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Ouvrir l'espace d'une entreprise</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1.5"><Label>Entreprise</Label><Input value={f.entreprise} onChange={e => setF({ ...f, entreprise: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Dirigeant</Label><Input value={f.nom} onChange={e => setF({ ...f, nom: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Pays (ISO)</Label><Input maxLength={2} value={f.pays} onChange={e => setF({ ...f, pays: e.target.value.toUpperCase() })} /></div>
          <div className="sm:col-span-2 space-y-1.5"><Label>Email du dirigeant</Label><Input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></div>
          <div className="sm:col-span-2 space-y-1.5"><Label>Mot de passe provisoire (10 caractères min.)</Label><Input type="text" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Offre</Label>
            <Select value={f.plan} onValueChange={v => setF({ ...f, plan: v as Plan })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="starter">Starter</SelectItem><SelectItem value="business">Business</SelectItem><SelectItem value="enterprise">Enterprise</SelectItem></SelectContent>
            </Select></div>
          <div className="space-y-1.5"><Label>Démarrage</Label>
            <Select value={f.statut} onValueChange={v => setF({ ...f, statut: v as "essai" | "actif" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="essai">Essai de 14 jours</SelectItem><SelectItem value="actif">Abonnement actif</SelectItem></SelectContent>
            </Select></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOuvert(false)}>Annuler</Button>
          <Button onClick={() => creer.mutate()} disabled={creer.isPending || f.password.length < 10 || !f.email || f.entreprise.length < 2 || f.nom.length < 2}>
            {creer.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Créer l'espace
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Espaces() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ["plateforme-organisations"],
    queryFn: () => api.get<{ organisations: EspaceClient[] }>("/api/plateforme/organisations"),
  });
  const modifier = useMutation({
    mutationFn: ({ id, ...corps }: { id: string } & Record<string, unknown>) => api.patch(`/api/plateforme/organisations/${id}`, corps),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["plateforme-organisations"] }); toast({ title: "Espace mis à jour" }); },
    onError: erreur,
  });

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (error) return <p role="alert" className="stat-card text-sm text-destructive">{(error as Error).message}</p>;
  const orgs = data?.organisations ?? [];
  const actifs = orgs.filter(o => o.actif && ["actif", "essai"].includes(o.abonnement.statut)).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{orgs.length} espace(s) · {actifs} en service</p>
        <NouvelEspace />
      </div>
      <div className="stat-card overflow-x-auto p-0">
        <table className="w-full min-w-[920px] text-sm">
          <thead className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-semibold">Entreprise</th><th className="px-4 py-3 font-semibold">Offre</th><th className="px-4 py-3 font-semibold">Statut</th>
              <th className="px-4 py-3 font-semibold">Fin d'essai</th><th className="px-4 py-3 font-semibold text-right">Utilisateurs</th>
              <th className="px-4 py-3 font-semibold text-right">Dossiers</th><th className="px-4 py-3 font-semibold text-center">Accès</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map(o => {
              const plateforme = o.id === user?.organisation?.id;
              return (
                <tr key={o.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-foreground">{o.nom}{plateforme && <Badge variant="outline" className="ml-2 text-[10px]">Plateforme</Badge>}</p>
                    <p className="text-[11px] text-muted-foreground">{o.slug} · {o.pays} · {o.devise} · créé le {dateCourte(o.createdAt)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Select value={o.abonnement.plan} onValueChange={plan => modifier.mutate({ id: o.id, plan })}>
                      <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="starter">Starter</SelectItem><SelectItem value="business">Business</SelectItem><SelectItem value="enterprise">Enterprise</SelectItem></SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-3">
                    <Select value={o.abonnement.statut} disabled={plateforme} onValueChange={statut => {
                      if (["suspendu", "annule"].includes(statut) && !window.confirm(`Bloquer l'accès de « ${o.nom} » ? Ses utilisateurs ne pourront plus se connecter (données conservées).`)) return;
                      modifier.mutate({ id: o.id, statut });
                    }}>
                      <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                      <SelectContent>{(Object.keys(STATUTS) as Statut[]).map(s => <SelectItem key={s} value={s}>{STATUTS[s].libelle}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{o.abonnement.statut === "essai" ? dateCourte(o.abonnement.finEssai) : "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{o.utilisateursActifs} / {o.abonnement.maxUtilisateurs ?? "∞"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{o.dossiers}</td>
                  <td className="px-4 py-3 text-center">
                    <Switch checked={o.actif} disabled={plateforme || modifier.isPending} aria-label={o.actif ? `Suspendre ${o.nom}` : `Réactiver ${o.nom}`}
                      onCheckedChange={actif => {
                        if (!actif && !window.confirm(`Suspendre l'espace « ${o.nom} » ? Ses utilisateurs ne pourront plus se connecter (données conservées).`)) return;
                        modifier.mutate({ id: o.id, actif });
                      }} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Les limites et l'accès sont appliqués par le serveur. Une suspension prend effet en moins de 15 secondes ; aucune donnée n'est supprimée.</p>
    </div>
  );
}

function Demandes() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["plateforme-demandes"],
    queryFn: () => api.get<{ demandes: DemandeDemo[] }>("/api/plateforme/demandes-demo"),
  });
  const traiter = useMutation({
    mutationFn: ({ id, traitee }: { id: string; traitee: boolean }) => api.patch(`/api/plateforme/demandes-demo/${id}`, { traitee }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plateforme-demandes"] }),
    onError: erreur,
  });
  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (error) return <p role="alert" className="stat-card text-sm text-destructive">{(error as Error).message}</p>;
  const demandes = data?.demandes ?? [];
  if (!demandes.length) return <div className="stat-card py-14 text-center text-sm text-muted-foreground"><Inbox className="mx-auto mb-3 h-6 w-6" />Aucune demande de démonstration pour l'instant.</div>;
  return (
    <div className="grid gap-3">
      {demandes.map(d => (
        <article key={d.id} className={`stat-card ${d.traitee ? "opacity-60" : ""}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-foreground">{d.entreprise} <span className="font-normal text-muted-foreground">— {d.nom}</span></p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {dateCourte(d.createdAt)} · {d.pays ?? "Pays non précisé"} · {d.taille ? `${d.taille} personnes` : "Taille non précisée"} · {d.langue.toUpperCase()}
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Traitée <Switch checked={d.traitee} onCheckedChange={traitee => traiter.mutate({ id: d.id, traitee })} />
            </label>
          </div>
          {d.message && <p className="mt-3 whitespace-pre-line text-sm text-foreground/80">{d.message}</p>}
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <a href={`mailto:${d.email}`} className="inline-flex items-center gap-1.5 font-medium text-secondary hover:underline"><Mail className="h-3.5 w-3.5" />{d.email}</a>
            {d.telephone && <a href={`tel:${d.telephone}`} className="text-muted-foreground hover:text-foreground">{d.telephone}</a>}
          </div>
        </article>
      ))}
    </div>
  );
}

/** Console de la plateforme SaaS : réservée aux administrateurs de la plateforme (contrôlé aussi par le serveur). */
const Plateforme = () => {
  const { user } = useAuth();
  if (!user?.plateformeAdmin) return <Navigate to="/dashboard" replace />;
  return (
    <AppLayout title="Plateforme" subtitle="Espaces clients, abonnements, demandes de démonstration et sauvegardes">
      <Tabs defaultValue="espaces">
        <TabsList className="mb-5 flex-wrap h-auto">
          <TabsTrigger value="espaces" className="gap-1.5"><Building2 className="h-3.5 w-3.5" />Espaces clients</TabsTrigger>
          <TabsTrigger value="demandes" className="gap-1.5"><Inbox className="h-3.5 w-3.5" />Demandes de démo</TabsTrigger>
          <TabsTrigger value="sauvegardes" className="gap-1.5"><DatabaseBackup className="h-3.5 w-3.5" />Sauvegardes</TabsTrigger>
        </TabsList>
        <TabsContent value="espaces"><Espaces /></TabsContent>
        <TabsContent value="demandes"><Demandes /></TabsContent>
        <TabsContent value="sauvegardes"><Sauvegardes /></TabsContent>
      </Tabs>
    </AppLayout>
  );
};

export default Plateforme;
