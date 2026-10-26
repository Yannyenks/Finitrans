import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2, ShieldCheck, Workflow, Users, History, LayoutDashboard, Loader2, Save, RotateCcw,
  Pencil, Wallet, Plane, Activity, FileText,
} from "lucide-react";
import AppLayout from "@/components/AppLayout";
import Sauvegardes from "@/components/Sauvegardes";
import { DatabaseBackup } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, refreshSessionUser } from "@/lib/api";
import { PROFIL_LABELS, STATUS_LABELS, fcfa } from "@/lib/permissions";
import { toast } from "@/hooks/use-toast";

const Chargement = () => <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-secondary" /></div>;
const erreur = (e: any) => toast({ title: "Erreur", description: e?.message, variant: "destructive" });

// ── Synthèse ────────────────────────────────────────────────────────────────

const Synthese = () => {
  const { data, isLoading } = useQuery({ queryKey: ["admin-synthese"], queryFn: () => api.get<any>("/api/admin/synthese") });
  if (isLoading || !data) return <Chargement />;
  const cartes = [
    { label: "Employés actifs", value: data.effectifs.actifs, icon: Users },
    { label: "Masse salariale / mois", value: fcfa(data.rh.masseSalarialeMensuelle), icon: Wallet },
    { label: "En congé aujourd'hui", value: data.rh.congesEnCours, icon: Plane },
    { label: "Congés à valider", value: data.rh.congesEnAttente, icon: Plane },
    { label: "Dossiers actifs", value: data.activite.dossiersActifs, icon: FileText },
    { label: "Dossiers clôturés (30 j)", value: data.activite.dossiersClotures30j, icon: FileText },
    { label: "Facturation du mois", value: fcfa(data.finance.facturationMois), icon: Wallet },
    { label: "Encaissements du mois", value: fcfa(data.finance.encaissementsMois), icon: Wallet },
    { label: "Paiements douane en attente", value: fcfa(data.finance.paiementsDouaneEnAttente), icon: Activity },
    { label: "Écritures à valider", value: data.finance.ecrituresBrouillon, icon: Activity },
    { label: "Connexions (7 j)", value: data.activite.connexions7j, icon: Activity },
    { label: "Fiches RH complètes", value: `${data.effectifs.fichesRH}/${data.effectifs.actifs}`, icon: Users },
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cartes.map(c => (
          <div key={c.label} className="stat-card">
            <c.icon className="w-4 h-4 text-secondary mb-2" />
            <div className="text-lg font-display font-bold text-foreground">{c.value}</div>
            <div className="text-xs text-muted-foreground">{c.label}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="stat-card">
          <h3 className="font-display font-semibold mb-3">Effectifs par rôle</h3>
          {Object.entries(data.effectifs.parProfil).map(([p, n]) => (
            <div key={p} className="flex justify-between text-sm py-1.5 border-b border-border/40"><span>{PROFIL_LABELS[p] ?? p}</span><strong>{n as number}</strong></div>
          ))}
        </div>
        <div className="stat-card">
          <h3 className="font-display font-semibold mb-3">Effectifs par site</h3>
          {Object.entries(data.effectifs.parSite).map(([s, n]) => (
            <div key={s} className="flex justify-between text-sm py-1.5 border-b border-border/40"><span>{s}</span><strong>{n as number}</strong></div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Fiche entreprise ────────────────────────────────────────────────────────

const CHAMPS_ENTREPRISE: [string, string, string?][] = [
  ["raisonSociale", "Raison sociale"], ["sigle", "Sigle"], ["formeJuridique", "Forme juridique"],
  ["capital", "Capital (FCFA)", "number"], ["rccm", "RCCM"], ["niu", "NIU (n° contribuable)"],
  ["agrementCommissionnaire", "N° agrément commissionnaire en douane"], ["adresse", "Adresse"],
  ["telephone", "Téléphone"], ["email", "Email", "email"], ["siteWeb", "Site web"],
  ["banquePrincipale", "Banque principale"], ["rib", "RIB"], ["devise", "Devise"],
  ["tauxTVA", "Taux de TVA (%)", "number"], ["debutExercice", "Début d'exercice (JJ-MM)"],
];

const Entreprise = () => {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["entreprise"], queryFn: () => api.get<any>("/api/admin/entreprise") });
  const [form, setForm] = useState<Record<string, any>>({});
  useEffect(() => { if (data) setForm(data); }, [data]);
  const save = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {};
      for (const [k, , type] of CHAMPS_ENTREPRISE) {
        const v = form[k];
        if (v === undefined || v === null) continue;
        payload[k] = type === "number" ? Number(v) : String(v);
      }
      return api.put("/api/admin/entreprise", payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["entreprise"] }); toast({ title: "Fiche entreprise enregistrée" }); },
    onError: erreur,
  });
  if (isLoading) return <Chargement />;
  return (
    <div className="stat-card max-w-4xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CHAMPS_ENTREPRISE.map(([k, label, type]) => (
          <div key={k} className="space-y-1.5">
            <Label className="text-xs">{label}</Label>
            <Input type={type ?? "text"} value={form[k] ?? ""} onChange={e => setForm({ ...form, [k]: e.target.value })} className="bg-muted/40" />
          </div>
        ))}
      </div>
      <Button className="mt-5 gap-2 bg-secondary text-secondary-foreground" disabled={save.isPending || !form.raisonSociale} onClick={() => save.mutate()}>
        {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Enregistrer
      </Button>
    </div>
  );
};

// ── Rôles & modules ─────────────────────────────────────────────────────────

const PERMS: [string, string][] = [
  ["permDossier", "Dossiers"], ["permValidation", "Validation"], ["permFinancier", "Finance"],
  ["permRapports", "Rapports"], ["permAdministration", "Administration"],
];
const NIVEAUX = ["non", "lecture", "partiel", "complet"];

const Roles = () => {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["roles"], queryFn: () => api.get<any>("/api/roles") });
  const [edits, setEdits] = useState<Record<string, { modules: string[]; permissions: Record<string, string> }>>({});
  const [appliquer, setAppliquer] = useState(true);

  useEffect(() => {
    if (!data) return;
    const init: typeof edits = {};
    for (const p of data.profils) init[p.profil] = { modules: [...p.modules], permissions: { ...p.permissions } };
    setEdits(init);
  }, [data]);

  const save = useMutation({
    mutationFn: (profil: string) => {
      const p = data.profils.find((x: any) => x.profil === profil);
      const e = edits[profil];
      return api.put(`/api/roles/${profil}`, {
        modules: e.modules,
        ...(p.superviseur ? {} : { permissions: e.permissions, appliquerAuxComptes: appliquer }),
      });
    },
    onSuccess: (r: any, profil) => {
      qc.invalidateQueries({ queryKey: ["roles"] });
      refreshSessionUser();
      toast({ title: `Rôle « ${PROFIL_LABELS[profil] ?? profil} » enregistré`, description: r?.comptesMisAJour ? `${r.comptesMisAJour} compte(s) mis à jour` : undefined });
    },
    onError: erreur,
  });
  const reset = useMutation({
    mutationFn: (profil: string) => api.post(`/api/roles/${profil}/reinitialiser`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["roles"] }); toast({ title: "Rôle réinitialisé" }); },
    onError: erreur,
  });

  if (isLoading || !data) return <Chargement />;
  const modules: { cle: string; label: string }[] = data.modules;

  const toggle = (profil: string, m: string) => setEdits(prev => {
    const cur = prev[profil];
    const has = cur.modules.includes(m);
    return { ...prev, [profil]: { ...cur, modules: has ? cur.modules.filter(x => x !== m) : [...cur.modules, m] } };
  });

  return (
    <div className="space-y-4">
      <div className="stat-card text-sm text-muted-foreground flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-secondary flex-shrink-0" />
        <div>
          Chaque type de compte reçoit les modules et les permissions de son rôle. Le DG et le Responsable Exploitation
          sont superviseurs : contrôle total, quel que soit le réglage. Modifier un rôle s'applique immédiatement à tous les comptes de ce rôle
          (modules) ; cochez « appliquer aux comptes » pour réaligner aussi leurs permissions.
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Switch id="appliquer" checked={appliquer} onCheckedChange={setAppliquer} />
        <Label htmlFor="appliquer" className="text-sm">Appliquer les permissions aux comptes existants lors de l'enregistrement</Label>
      </div>
      {data.profils.map((p: any) => {
        const e = edits[p.profil];
        if (!e) return null;
        return (
          <div key={p.profil} className="stat-card" data-testid={`role-${p.profil}`}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 className="font-display font-semibold text-foreground">
                  {p.label} <span className="text-xs text-muted-foreground font-normal">· {p.effectif} compte(s){p.superviseur ? " · superviseur" : ""}{p.personnalise ? " · personnalisé" : ""}</span>
                </h3>
                <p className="text-xs text-muted-foreground">{p.description}</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {p.personnalise && (
                  <Button size="sm" variant="outline" className="h-8 text-xs gap-1" disabled={reset.isPending} onClick={() => reset.mutate(p.profil)}>
                    <RotateCcw className="w-3 h-3" /> Défaut
                  </Button>
                )}
                <Button size="sm" className="h-8 text-xs gap-1 bg-secondary text-secondary-foreground" disabled={save.isPending} onClick={() => save.mutate(p.profil)}>
                  <Save className="w-3 h-3" /> Enregistrer
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 mb-3">
              {modules.map(m => (
                <label key={m.cle} className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <Checkbox checked={e.modules.includes(m.cle)} onCheckedChange={() => toggle(p.profil, m.cle)} />
                  {m.label}
                </label>
              ))}
            </div>
            {!p.superviseur && (
              <div className="flex flex-wrap gap-3">
                {PERMS.map(([k, label]) => (
                  <div key={k} className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">{label}</Label>
                    <Select value={e.permissions[k]} onValueChange={v => setEdits(prev => ({ ...prev, [p.profil]: { ...prev[p.profil], permissions: { ...prev[p.profil].permissions, [k]: v } } }))}>
                      <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{NIVEAUX.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ── Attribution des étapes ──────────────────────────────────────────────────

const Attribution = () => {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["roles-attribution"], queryFn: () => api.get<any>("/api/roles/attribution") });
  const [cfg, setCfg] = useState<Record<string, { owner: string; sousEtapes: Record<string, string> }>>({});
  useEffect(() => {
    if (!data) return;
    const init: typeof cfg = {};
    for (const e of data.etapes) init[e.etape] = { owner: e.owner, sousEtapes: Object.fromEntries(e.sousEtapes.map((s: any) => [s.cle, s.profil])) };
    setCfg(init);
  }, [data]);
  const save = useMutation({
    mutationFn: () => api.put("/api/roles/attribution", cfg),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["roles-attribution"] }); toast({ title: "Attribution enregistrée", description: "S'applique aux nouvelles tâches et aux étapes non encore attribuées." }); },
    onError: erreur,
  });
  const reset = useMutation({
    mutationFn: () => api.delete("/api/roles/attribution"),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["roles-attribution"] }); toast({ title: "Attribution par défaut rétablie" }); },
    onError: erreur,
  });
  if (isLoading || !data) return <Chargement />;
  const profils: { profil: string; label: string }[] = data.profils;
  const ProfilSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-56 text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>{profils.map(p => <SelectItem key={p.profil} value={p.profil}>{p.label}</SelectItem>)}</SelectContent>
    </Select>
  );
  return (
    <div className="space-y-4">
      <div className="stat-card text-sm text-muted-foreground flex items-start gap-3">
        <Workflow className="w-5 h-5 text-secondary flex-shrink-0" />
        <div>
          À la création d'un dossier, chaque tâche est attribuée automatiquement à un compte du profil indiqué
          (en tenant compte de ses compagnies et de son site, puis de sa charge). Le responsable d'étape la termine et passe la main.
        </div>
      </div>
      <div className="flex gap-2">
        <Button className="gap-2 bg-secondary text-secondary-foreground" disabled={save.isPending} onClick={() => save.mutate()}><Save className="w-4 h-4" /> Enregistrer</Button>
        <Button variant="outline" className="gap-2" disabled={reset.isPending} onClick={() => reset.mutate()}><RotateCcw className="w-4 h-4" /> Attribution par défaut</Button>
      </div>
      {data.etapes.map((e: any) => cfg[e.etape] && (
        <div key={e.etape} className="stat-card">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <h3 className="font-display font-semibold text-foreground">{STATUS_LABELS[e.etape] ?? e.label}</h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              Responsable d'étape
              <ProfilSelect value={cfg[e.etape].owner} onChange={v => setCfg({ ...cfg, [e.etape]: { ...cfg[e.etape], owner: v } })} />
            </div>
          </div>
          <div className="space-y-2">
            {e.sousEtapes.map((s: any) => (
              <div key={s.cle} className="flex items-center justify-between gap-3 text-sm border-b border-border/30 pb-2">
                <span>{s.label}{s.sites.length === 1 && <span className="text-[11px] text-muted-foreground"> · {s.sites[0]} uniquement</span>}</span>
                <ProfilSelect value={cfg[e.etape].sousEtapes[s.cle]} onChange={v => setCfg({ ...cfg, [e.etape]: { ...cfg[e.etape], sousEtapes: { ...cfg[e.etape].sousEtapes, [s.cle]: v } } })} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// ── Ressources humaines ─────────────────────────────────────────────────────

const CONTRATS = ["CDI", "CDD", "stage", "consultant", "interim"];
const RH = () => {
  const qc = useQueryClient();
  const { data: fiches, isLoading } = useQuery({ queryKey: ["rh-fiches"], queryFn: () => api.get<any[]>("/api/rh/fiches") });
  const { data: masse } = useQuery({ queryKey: ["rh-masse"], queryFn: () => api.get<any>("/api/rh/masse-salariale") });
  const [edit, setEdit] = useState<any | null>(null);
  const save = useMutation({
    mutationFn: () => api.put(`/api/rh/fiches/${edit.id}`, {
      matricule: edit.matricule || null, poste: edit.poste || null, departement: edit.departement || null,
      typeContrat: edit.typeContrat, salaireBase: Number(edit.salaireBase || 0), primes: Number(edit.primes || 0),
      dateEmbauche: edit.dateEmbauche ? new Date(edit.dateEmbauche).toISOString() : null,
      dateFinContrat: edit.dateFinContrat ? new Date(edit.dateFinContrat).toISOString() : null,
      numeroCNPS: edit.numeroCNPS || null, banque: edit.banque || null, rib: edit.rib || null,
      adresse: edit.adresse || null, contactUrgence: edit.contactUrgence || null,
      joursCongesAn: Number(edit.joursCongesAn || 18), notes: edit.notes || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rh-fiches"] }); qc.invalidateQueries({ queryKey: ["rh-masse"] }); qc.invalidateQueries({ queryKey: ["admin-synthese"] });
      toast({ title: "Fiche RH enregistrée" }); setEdit(null);
    },
    onError: erreur,
  });
  if (isLoading) return <Chargement />;
  const ouvrir = (u: any) => {
    const f = u.ficheRH ?? {};
    setEdit({
      id: u.id, nom: u.nom, matricule: f.matricule ?? "", poste: f.poste ?? u.role ?? "", departement: f.departement ?? "",
      typeContrat: f.typeContrat ?? "CDI", salaireBase: f.salaireBase ?? 0, primes: f.primes ?? 0,
      dateEmbauche: f.dateEmbauche?.slice(0, 10) ?? "", dateFinContrat: f.dateFinContrat?.slice(0, 10) ?? "",
      numeroCNPS: f.numeroCNPS ?? "", banque: f.banque ?? "", rib: f.rib ?? "", adresse: f.adresse ?? "",
      contactUrgence: f.contactUrgence ?? "", joursCongesAn: f.joursCongesAn ?? 18, notes: f.notes ?? "",
    });
  };
  const champ = (k: string, label: string, type = "text") => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type={type} value={edit[k] ?? ""} onChange={e => setEdit({ ...edit, [k]: e.target.value })} className="bg-muted/40 h-9" />
    </div>
  );
  return (
    <div className="space-y-5">
      {masse && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="stat-card"><div className="text-lg font-display font-bold">{fcfa(masse.totalMensuel)}</div><div className="text-xs text-muted-foreground">Masse salariale mensuelle</div></div>
          <div className="stat-card"><div className="text-lg font-display font-bold">{fcfa(masse.totalAnnuel)}</div><div className="text-xs text-muted-foreground">Masse salariale annuelle</div></div>
          {Object.entries(masse.parSite ?? {}).map(([s, v]) => (
            <div key={s} className="stat-card"><div className="text-lg font-display font-bold">{fcfa(v as number)}</div><div className="text-xs text-muted-foreground">Site {s} / mois</div></div>
          ))}
        </div>
      )}
      <div className="stat-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground border-b border-border">
            <th className="py-2 pr-3">Employé</th><th className="py-2 pr-3">Poste</th><th className="py-2 pr-3">Contrat</th>
            <th className="py-2 pr-3">Embauche</th><th className="py-2 pr-3">Salaire + primes</th><th className="py-2 pr-3">Congés / an</th><th className="py-2"></th>
          </tr></thead>
          <tbody>
            {(fiches ?? []).map(u => (
              <tr key={u.id} className={`border-b border-border/40 ${u.actif ? "" : "opacity-50"}`}>
                <td className="py-2.5 pr-3 font-medium">{u.nom}<div className="text-[11px] text-muted-foreground">{PROFIL_LABELS[u.profil] ?? u.profil} · {u.site}</div></td>
                <td className="py-2.5 pr-3">{u.ficheRH?.poste ?? "—"}</td>
                <td className="py-2.5 pr-3">{u.ficheRH?.typeContrat ?? "—"}</td>
                <td className="py-2.5 pr-3">{u.ficheRH?.dateEmbauche ? new Date(u.ficheRH.dateEmbauche).toLocaleDateString("fr-FR") : "—"}</td>
                <td className="py-2.5 pr-3">{u.ficheRH ? fcfa(Number(u.ficheRH.salaireBase ?? 0) + Number(u.ficheRH.primes ?? 0)) : "—"}</td>
                <td className="py-2.5 pr-3">{u.ficheRH?.joursCongesAn ?? 18}</td>
                <td className="py-2.5"><Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => ouvrir(u)}><Pencil className="w-3 h-3" /> Fiche</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={!!edit} onOpenChange={o => !o && setEdit(null)}>
        <DialogContent className="sm:max-w-2xl bg-card max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display">Fiche RH — {edit?.nom}</DialogTitle></DialogHeader>
          {edit && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {champ("matricule", "Matricule")}{champ("poste", "Poste")}{champ("departement", "Département")}
              <div className="space-y-1">
                <Label className="text-xs">Type de contrat</Label>
                <Select value={edit.typeContrat} onValueChange={v => setEdit({ ...edit, typeContrat: v })}>
                  <SelectTrigger className="h-9 bg-muted/40"><SelectValue /></SelectTrigger>
                  <SelectContent>{CONTRATS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {champ("dateEmbauche", "Date d'embauche", "date")}{champ("dateFinContrat", "Fin de contrat", "date")}
              {champ("salaireBase", "Salaire de base (FCFA)", "number")}{champ("primes", "Primes mensuelles (FCFA)", "number")}
              {champ("numeroCNPS", "N° CNPS")}{champ("joursCongesAn", "Jours de congé / an", "number")}
              {champ("banque", "Banque")}{champ("rib", "RIB")}{champ("adresse", "Adresse")}{champ("contactUrgence", "Contact d'urgence")}
              <div className="md:col-span-2 space-y-1"><Label className="text-xs">Notes</Label><Textarea value={edit.notes} onChange={e => setEdit({ ...edit, notes: e.target.value })} className="bg-muted/40 h-16" /></div>
              <div className="md:col-span-2 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEdit(null)}>Annuler</Button>
                <Button className="bg-secondary text-secondary-foreground gap-2" disabled={save.isPending} onClick={() => save.mutate()}>
                  {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Enregistrer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── Journal d'activité ──────────────────────────────────────────────────────

const Journal = () => {
  const [userId, setUserId] = useState("tous");
  const [action, setAction] = useState("");
  const params = useMemo(() => {
    const p = new URLSearchParams({ limit: "200" });
    if (userId !== "tous") p.set("userId", userId);
    if (action.trim()) p.set("action", action.trim());
    return p.toString();
  }, [userId, action]);
  const { data, isLoading } = useQuery({ queryKey: ["admin-activites", params], queryFn: () => api.get<any[]>(`/api/admin/activites?${params}`) });
  const { data: emp } = useQuery({ queryKey: ["employes-tous"], queryFn: () => api.get<any>("/api/employes?limit=100") });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Select value={userId} onValueChange={setUserId}>
          <SelectTrigger className="w-60 bg-card"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tous">Tous les utilisateurs</SelectItem>
            {(emp?.data ?? []).map((u: any) => <SelectItem key={u.id} value={u.id}>{u.nom}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="Filtrer par action (ex : ROLE, CONNEXION, ECRITURE)…" value={action} onChange={e => setAction(e.target.value)} className="w-80 bg-card" />
      </div>
      {isLoading ? <Chargement /> : (
        <div className="stat-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground border-b border-border">
              <th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Utilisateur</th><th className="py-2 pr-3">Action</th><th className="py-2 pr-3">Objet</th><th className="py-2">Détails</th>
            </tr></thead>
            <tbody>
              {(data ?? []).map(a => (
                <tr key={`${a.entite}-${a.id}`} className="border-b border-border/40 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap text-xs text-muted-foreground">{new Date(a.date).toLocaleString("fr-FR")}</td>
                  <td className="py-2 pr-3">{a.utilisateur}</td>
                  <td className="py-2 pr-3"><span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-muted">{a.action}</span></td>
                  <td className="py-2 pr-3 text-xs">{a.dossier?.numero ?? a.entite}</td>
                  <td className="py-2 text-xs text-muted-foreground">{a.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(data ?? []).length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Aucune activité</p>}
        </div>
      )}
    </div>
  );
};

const Administration = () => {
  const [params, setParams] = useSearchParams();
  const onglet = params.get("onglet") ?? "synthese";
  return (
    <AppLayout title="Administration de l'entreprise" subtitle="Pilotage, rôles, organisation du travail et ressources humaines">
      <Tabs value={onglet} onValueChange={v => setParams({ onglet: v })}>
        <TabsList className="mb-5 flex-wrap h-auto">
          <TabsTrigger value="synthese" className="gap-1.5"><LayoutDashboard className="w-3.5 h-3.5" /> Synthèse</TabsTrigger>
          <TabsTrigger value="entreprise" className="gap-1.5"><Building2 className="w-3.5 h-3.5" /> Entreprise</TabsTrigger>
          <TabsTrigger value="roles" className="gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Rôles & modules</TabsTrigger>
          <TabsTrigger value="attribution" className="gap-1.5"><Workflow className="w-3.5 h-3.5" /> Attribution des étapes</TabsTrigger>
          <TabsTrigger value="rh" className="gap-1.5"><Users className="w-3.5 h-3.5" /> Ressources humaines</TabsTrigger>
          <TabsTrigger value="journal" className="gap-1.5"><History className="w-3.5 h-3.5" /> Journal d'activité</TabsTrigger>
          <TabsTrigger value="sauvegardes" className="gap-1.5"><DatabaseBackup className="w-3.5 h-3.5" /> Sauvegardes</TabsTrigger>
        </TabsList>
        <TabsContent value="synthese"><Synthese /></TabsContent>
        <TabsContent value="entreprise"><Entreprise /></TabsContent>
        <TabsContent value="roles"><Roles /></TabsContent>
        <TabsContent value="attribution"><Attribution /></TabsContent>
        <TabsContent value="rh"><RH /></TabsContent>
        <TabsContent value="journal"><Journal /></TabsContent>
        <TabsContent value="sauvegardes"><Sauvegardes /></TabsContent>
      </Tabs>
    </AppLayout>
  );
};

export default Administration;
