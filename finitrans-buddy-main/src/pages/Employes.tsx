import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, ChevronRight, Loader2, Plus, ShieldCheck, KeyRound, UserX, UserCheck, Search } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, refreshSessionUser } from "@/lib/api";
import { PROFIL_LABELS, useAuth } from "@/lib/permissions";
import { toast } from "@/hooks/use-toast";

const COMPAGNIES = ["MSC", "COSCO", "MAERSK", "CMA_CGM"];
const PERMS: [string, string][] = [
  ["permDossier", "Dossiers"], ["permValidation", "Validation"], ["permFinancier", "Finance"],
  ["permRapports", "Rapports"], ["permAdministration", "Administration"],
];
const NIVEAUX = ["non", "lecture", "partiel", "complet"];
const erreur = (e: any) => toast({ title: "Erreur", description: e?.message, variant: "destructive" });

/** Profils proposés à l'attribution (le profil DG est réservé au DG). */
function profilsAttribuables(roles: any[], estDG: boolean) {
  return roles.filter(r => estDG || r.profil !== "dg");
}

const CompagniesPicker = ({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) => (
  <div className="flex flex-wrap gap-3">
    {COMPAGNIES.map(c => (
      <label key={c} className="flex items-center gap-1.5 text-xs cursor-pointer">
        <Checkbox checked={value.includes(c)} onCheckedChange={v => onChange(v ? [...value, c] : value.filter(x => x !== c))} />
        {c.replace("_", "-")}
      </label>
    ))}
  </div>
);

const NouveauCompte = ({ roles, estDG, onClose }: { roles: any[]; estDG: boolean; onClose: () => void }) => {
  const qc = useQueryClient();
  const [form, setForm] = useState({ nom: "", email: "", password: "", site: "Douala", profil: "operations", telephone: "", compagnies: [...COMPAGNIES] });
  const role = roles.find(r => r.profil === form.profil);
  const creer = useMutation({
    mutationFn: () => api.post("/api/employes", {
      nom: form.nom.trim(), email: form.email.trim(), password: form.password, site: form.site, profil: form.profil,
      telephone: form.telephone || undefined, compagniesAssignees: form.compagnies,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employes-tous"] }); toast({ title: "Compte créé", description: `${form.nom} — ${role?.label}` }); onClose(); },
    onError: erreur,
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-card sm:max-w-lg">
        <DialogHeader><DialogTitle className="font-display">Nouveau compte</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">Nom complet *</Label><Input value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">Email *</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">Mot de passe initial * (8 car.)</Label><Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} autoComplete="new-password" /></div>
            <div className="space-y-1"><Label className="text-xs">Téléphone</Label><Input value={form.telephone} onChange={e => setForm({ ...form, telephone: e.target.value })} /></div>
            <div className="space-y-1">
              <Label className="text-xs">Rôle (type de compte) *</Label>
              <Select value={form.profil} onValueChange={v => setForm({ ...form, profil: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{profilsAttribuables(roles, estDG).map(r => <SelectItem key={r.profil} value={r.profil}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Site</Label>
              <Select value={form.site} onValueChange={v => setForm({ ...form, site: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Douala">Douala</SelectItem><SelectItem value="Kribi">Kribi</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1"><Label className="text-xs">Compagnies couvertes</Label><CompagniesPicker value={form.compagnies} onChange={c => setForm({ ...form, compagnies: c })} /></div>
          {role && <p className="text-xs text-muted-foreground rounded-lg bg-muted/40 p-2">{role.description} — modules : {role.modules.length}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button className="bg-secondary text-secondary-foreground gap-2" disabled={form.nom.trim().length < 2 || !form.email.includes("@") || form.password.length < 8 || creer.isPending} onClick={() => creer.mutate()}>
              {creer.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Créer le compte
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const AttributionRole = ({ emp, roles, estDG, onClose }: { emp: any; roles: any[]; estDG: boolean; onClose: () => void }) => {
  const qc = useQueryClient();
  const [profil, setProfil] = useState(emp.profil);
  const [site, setSite] = useState(emp.site);
  const [compagnies, setCompagnies] = useState<string[]>(emp.compagniesAssignees ?? []);
  const [modele, setModele] = useState(true);
  const role = roles.find(r => r.profil === profil);
  const [perms, setPerms] = useState<Record<string, string>>(() => Object.fromEntries(PERMS.map(([k]) => [k, emp[k]])));
  const choisirProfil = (p: string) => {
    setProfil(p);
    const r = roles.find(x => x.profil === p);
    if (r && modele) setPerms({ ...r.permissions });
  };
  const enregistrer = useMutation({
    mutationFn: () => api.post(`/api/roles/attribuer/${emp.id}`, {
      profil, site, compagniesAssignees: compagnies, appliquerModele: modele,
      ...(modele || role?.superviseur ? {} : { permissions: perms }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employes-tous"] });
      refreshSessionUser();
      toast({ title: "Rôle attribué", description: `${emp.nom} → ${role?.label ?? profil}` });
      onClose();
    },
    onError: erreur,
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-card sm:max-w-lg">
        <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-secondary" /> Rôle et accès — {emp.nom}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Rôle (type de compte)</Label>
              <Select value={profil} onValueChange={choisirProfil}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{profilsAttribuables(roles, estDG).map(r => <SelectItem key={r.profil} value={r.profil}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Site</Label>
              <Select value={site} onValueChange={setSite}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Douala">Douala</SelectItem><SelectItem value="Kribi">Kribi</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          {role && <p className="text-xs text-muted-foreground rounded-lg bg-muted/40 p-2">{role.description}</p>}
          <div className="space-y-1">
            <Label className="text-xs">Compagnies couvertes (attribution des tâches de sortie / Kribi)</Label>
            <CompagniesPicker value={compagnies} onChange={setCompagnies} />
          </div>
          {role?.superviseur ? (
            <p className="text-xs rounded-lg bg-secondary/10 text-secondary p-2">Superviseur : contrôle total sur tous les process, permissions maximales.</p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Switch id="modele" checked={modele} onCheckedChange={v => { setModele(v); if (v && role) setPerms({ ...role.permissions }); }} />
                <Label htmlFor="modele" className="text-sm">Appliquer les permissions du rôle</Label>
              </div>
              <div className="flex flex-wrap gap-3">
                {PERMS.map(([k, label]) => (
                  <div key={k} className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">{label}</Label>
                    <Select value={perms[k]} disabled={modele} onValueChange={v => setPerms({ ...perms, [k]: v })}>
                      <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{NIVEAUX.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button className="bg-secondary text-secondary-foreground gap-2" disabled={enregistrer.isPending} onClick={() => enregistrer.mutate()}>
              {enregistrer.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Attribuer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const ResetMotDePasse = ({ emp, onClose }: { emp: any; onClose: () => void }) => {
  const [mdp, setMdp] = useState("");
  const reset = useMutation({
    mutationFn: () => api.patch(`/api/employes/${emp.id}/reset-password`, { newPassword: mdp }),
    onSuccess: () => { toast({ title: "Mot de passe réinitialisé", description: `Communiquez-le à ${emp.nom} ; ses sessions ont été fermées.` }); onClose(); },
    onError: erreur,
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-card sm:max-w-sm">
        <DialogHeader><DialogTitle className="font-display">Nouveau mot de passe — {emp.nom}</DialogTitle></DialogHeader>
        <Input type="password" value={mdp} onChange={e => setMdp(e.target.value)} placeholder="8 caractères minimum" autoComplete="new-password" />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button className="bg-secondary text-secondary-foreground" disabled={mdp.length < 8 || reset.isPending} onClick={() => reset.mutate()}>Réinitialiser</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

type Dlg = { type: "nouveau" } | { type: "role" | "mdp"; emp: any } | null;

const Employes = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, superviseur } = useAuth();
  const estDG = user?.profil === "dg";
  const [recherche, setRecherche] = useState("");
  const [inactifs, setInactifs] = useState(false);
  const [dlg, setDlg] = useState<Dlg>(null);

  const { data: empData, isLoading } = useQuery({ queryKey: ["employes-tous"], queryFn: () => api.get<any>("/api/employes?limit=100") });
  const { data: rolesData } = useQuery({ queryKey: ["roles"], queryFn: () => api.get<any>("/api/roles") });
  const { data: chartsData } = useQuery({ queryKey: ["dashboard-charts"], queryFn: () => api.get<any>("/api/dashboard/charts") });
  const roles: any[] = rolesData?.profils ?? [];
  const perfParNom = new Map((chartsData?.tauxRetardParEmploye ?? []).map((e: any) => [e.nom, e]));

  const basculer = useMutation({
    mutationFn: (emp: any) => emp.actif ? api.delete(`/api/employes/${emp.id}`) : api.post(`/api/employes/${emp.id}/reactiver`),
    onSuccess: (_r, emp) => { qc.invalidateQueries({ queryKey: ["employes-tous"] }); toast({ title: emp.actif ? "Compte désactivé" : "Compte réactivé", description: emp.nom }); },
    onError: erreur,
  });

  const employes = useMemo(() => (empData?.data ?? []).filter((e: any) =>
    (inactifs || e.actif) && (!recherche || `${e.nom} ${e.email} ${e.role}`.toLowerCase().includes(recherche.toLowerCase())),
  ), [empData, inactifs, recherche]);

  const peutGerer = (e: any) => superviseur && e.id !== user?.id && (e.profil !== "dg" || estDG);

  return (
    <AppLayout title="Employés & rôles" subtitle={`${employes.length} collaborateur(s) — attribution des rôles par type de compte`}>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Rechercher..." value={recherche} onChange={e => setRecherche(e.target.value)} className="pl-9 bg-card" />
        </div>
        <label className="flex items-center gap-2 text-sm"><Switch checked={inactifs} onCheckedChange={setInactifs} /> Afficher les comptes désactivés</label>
        {superviseur && (
          <Button className="ml-auto gap-2 bg-secondary text-secondary-foreground" onClick={() => setDlg({ type: "nouveau" })}><Plus className="w-4 h-4" /> Nouveau compte</Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-secondary" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {employes.map((emp: any) => {
            const perf: any = perfParNom.get(emp.nom) ?? { actifs: 0, enRetard: 0 };
            return (
              <div key={emp.id} className={`stat-card ${emp.actif ? "" : "opacity-60"}`} data-testid="carte-employe">
                <button className="w-full text-left flex items-start justify-between mb-3" onClick={() => navigate(`/employes/${encodeURIComponent(emp.nom)}`)}>
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-primary-foreground">{emp.nom.split(" ").pop()?.charAt(0)}</span>
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-display font-bold text-foreground truncate">{emp.nom}</h3>
                      <p className="text-xs text-muted-foreground truncate">{emp.email}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" /> {emp.site}{!emp.actif && " · désactivé"}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </button>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-secondary/10 text-secondary font-medium">{PROFIL_LABELS[emp.profil] ?? emp.profil}</span>
                  {emp.compagniesAssignees?.length > 0 && emp.compagniesAssignees.length < 4 && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{emp.compagniesAssignees.join(", ").replace(/_/g, "-")}</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-center mb-3">
                  <div className="p-2 rounded-lg bg-muted/50"><div className="text-lg font-display font-bold">{perf.actifs}</div><div className="text-[10px] text-muted-foreground">Dossiers actifs</div></div>
                  <div className="p-2 rounded-lg bg-muted/50"><div className="text-lg font-display font-bold text-destructive">{perf.enRetard}</div><div className="text-[10px] text-muted-foreground">En retard</div></div>
                </div>
                {peutGerer(emp) && (
                  <div className="flex gap-1.5 flex-wrap border-t border-border/50 pt-3">
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setDlg({ type: "role", emp })}><ShieldCheck className="w-3 h-3" /> Rôle & accès</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setDlg({ type: "mdp", emp })}><KeyRound className="w-3 h-3" /> Mot de passe</Button>
                    <Button size="sm" variant="ghost" className={`h-7 text-xs gap-1 ${emp.actif ? "text-destructive" : "text-success"}`} disabled={basculer.isPending}
                      onClick={() => (!emp.actif || confirm(`Désactiver le compte de ${emp.nom} ?`)) && basculer.mutate(emp)}>
                      {emp.actif ? <><UserX className="w-3 h-3" /> Désactiver</> : <><UserCheck className="w-3 h-3" /> Réactiver</>}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {dlg?.type === "nouveau" && <NouveauCompte roles={roles} estDG={estDG} onClose={() => setDlg(null)} />}
      {dlg?.type === "role" && <AttributionRole emp={dlg.emp} roles={roles} estDG={estDG} onClose={() => setDlg(null)} />}
      {dlg?.type === "mdp" && <ResetMotDePasse emp={dlg.emp} onClose={() => setDlg(null)} />}
    </AppLayout>
  );
};

export default Employes;
