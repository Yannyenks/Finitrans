import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  ArrowLeft, ArrowUpRight, Banknote, BellRing, Briefcase, Building2, CalendarClock, Check, ChevronRight,
  CircleDollarSign, Crown, Download, FileText, FolderOpen, Gem, Globe, Handshake, Loader2, Mail, MapPin,
  MessageSquare, Pencil, Phone, PhoneCall, Plus, Receipt, RefreshCw, Search, ShieldAlert, Sparkles, Star,
  Trash2, TrendingUp, UserRound, Users, Video, Wallet,
} from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/permissions";
import { telechargerCsv } from "@/lib/csv";
import { dateHeure } from "@/lib/temps";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LIBELLE_MODE, MODES_REGLEMENT } from "@/components/dossier/SousEtapesPanel";

// ── Référentiels ──────────────────────────────────────────────────────────────

const SEGMENTS: Record<string, { label: string; classe: string; icon: any }> = {
  standard:    { label: "Standard",    classe: "bg-slate-100 text-slate-700 border-slate-200", icon: Star },
  premium:     { label: "Premium",     classe: "bg-amber-50 text-amber-700 border-amber-200",   icon: Gem },
  strategique: { label: "Stratégique", classe: "bg-primary text-primary-foreground border-primary", icon: Crown },
};
const STATUTS: Record<string, { label: string; classe: string }> = {
  prospect: { label: "Prospect", classe: "bg-blue-50 text-blue-700 border-blue-200" },
  actif:    { label: "Actif",    classe: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  inactif:  { label: "Inactif",  classe: "bg-muted text-muted-foreground border-border" },
};
const ECHANGES: Record<string, { label: string; icon: any; couleur: string }> = {
  appel:       { label: "Appel",       icon: PhoneCall,     couleur: "bg-blue-500" },
  email:       { label: "E-mail",      icon: Mail,          couleur: "bg-sky-500" },
  reunion:     { label: "Réunion",     icon: Video,         couleur: "bg-violet-500" },
  visite:      { label: "Visite",      icon: MapPin,        couleur: "bg-emerald-500" },
  note:        { label: "Note",        icon: FileText,      couleur: "bg-slate-500" },
  relance:     { label: "Relance",     icon: BellRing,      couleur: "bg-secondary" },
  reclamation: { label: "Réclamation", icon: ShieldAlert,   couleur: "bg-destructive" },
};
const ETAPES: Record<string, string> = {
  reception: "Réception", soumission_sgs: "Soumission SGS", codage: "Codage", validation: "Validation",
  paiement: "Paiement", bon_compagnie: "Bon compagnie", operations_douala: "Opérations Douala", operations_kribi: "Opérations Kribi", cloture: "Clôturé", facturation: "Facturation",
};

// ── Formatage ─────────────────────────────────────────────────────────────────

const fcfa = (n: number | null | undefined) => `${Math.round(Number(n ?? 0)).toLocaleString("fr-FR")} FCFA`;
function compact(n: number | null | undefined) {
  const v = Number(n ?? 0);
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Md`;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} k`;
  return v.toLocaleString("fr-FR");
}
const jour = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const libelleMois = (cle: string) => { const [a, m] = cle.split("-"); return `${MOIS[Number(m) - 1]} ${a.slice(2)}`; };
const initiales = (nom: string) => nom.split(/\s+/).filter(Boolean).slice(0, 2).map(m => m[0]).join("").toUpperCase();
const DEGRADES = [
  "from-primary to-[hsl(213,55%,30%)]", "from-secondary to-amber-500", "from-accent to-blue-700",
  "from-emerald-600 to-teal-500", "from-violet-600 to-fuchsia-500", "from-rose-500 to-orange-400",
];
const degrade = (nom: string) => DEGRADES[[...nom].reduce((s, c) => s + c.charCodeAt(0), 0) % DEGRADES.length];

function relance(d: string | null | undefined) {
  if (!d) return null;
  const jours = Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);
  if (jours < 0) return { texte: `En retard de ${-jours} j`, classe: "text-destructive bg-destructive/10" };
  if (jours === 0) return { texte: "Aujourd'hui", classe: "text-secondary bg-secondary/10" };
  return { texte: `Dans ${jours} j`, classe: "text-muted-foreground bg-muted" };
}

const erreur = (e: any) => toast({ title: "Erreur", description: e?.message ?? "Opération impossible", variant: "destructive" });

// ── Petits composants ─────────────────────────────────────────────────────────

const Pastille = ({ classe, children }: { classe: string; children: React.ReactNode }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${classe}`}>{children}</span>
);

const Avatar = ({ nom, taille = "w-11 h-11 text-sm" }: { nom: string; taille?: string }) => (
  <div className={`${taille} rounded-2xl bg-gradient-to-br ${degrade(nom)} text-white font-display font-bold flex items-center justify-center shadow-md flex-shrink-0`}>
    {initiales(nom) || "?"}
  </div>
);

const Kpi = ({ icon: Icon, label, valeur, detail, accent, delai = 0 }: {
  icon: any; label: string; valeur: string; detail?: React.ReactNode; accent: string; delai?: number;
}) => (
  <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: delai }}
    className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
    <div className={`absolute -right-6 -top-6 w-24 h-24 rounded-full opacity-10 ${accent}`} />
    <div className="flex items-center gap-2.5 mb-3">
      <div className={`w-9 h-9 rounded-xl ${accent} text-white flex items-center justify-center shadow-sm`}><Icon className="w-4.5 h-4.5 w-[18px] h-[18px]" /></div>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
    </div>
    <p className="text-2xl font-display font-black text-foreground tabular-nums tracking-tight">{valeur}</p>
    {detail && <div className="text-[11px] text-muted-foreground mt-1">{detail}</div>}
  </motion.div>
);

// ── Formulaires ───────────────────────────────────────────────────────────────

type ClientForm = Record<string, string>;
const CLIENT_VIDE: ClientForm = {
  nom: "", statut: "actif", segment: "standard", secteur: "", niu: "", rccm: "", adresse: "", ville: "", pays: "Cameroun",
  telephone: "", email: "", siteWeb: "", contactNom: "", contactFonction: "", contactTelephone: "", contactEmail: "",
  delaiPaiementJours: "", plafondCredit: "", modeReglementPrefere: "", gestionnaireId: "", tags: "", notes: "",
};

function versCorps(v: ClientForm) {
  const txt = (k: string) => v[k]?.trim() || null;
  return {
    nom: v.nom.trim(), statut: v.statut, segment: v.segment,
    secteur: txt("secteur"), niu: txt("niu"), rccm: txt("rccm"), adresse: txt("adresse"), ville: txt("ville"), pays: txt("pays"),
    telephone: txt("telephone"), email: txt("email") ?? "", siteWeb: txt("siteWeb"),
    contactNom: txt("contactNom"), contactFonction: txt("contactFonction"), contactTelephone: txt("contactTelephone"), contactEmail: txt("contactEmail") ?? "",
    delaiPaiementJours: v.delaiPaiementJours ? Number(v.delaiPaiementJours) : null,
    plafondCredit: v.plafondCredit ? Number(v.plafondCredit) : null,
    modeReglementPrefere: v.modeReglementPrefere || null,
    gestionnaireId: v.gestionnaireId || null,
    tags: v.tags.split(",").map(t => t.trim()).filter(Boolean),
    notes: txt("notes"),
  };
}

const Champ = ({ label, children, large }: { label: string; children: React.ReactNode; large?: boolean }) => (
  <div className={`space-y-1.5 ${large ? "sm:col-span-2" : ""}`}>
    <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</Label>
    {children}
  </div>
);

function useComptes() {
  const { data } = useQuery({
    queryKey: ["employes-list"],
    queryFn: () => api.get<any>("/api/employes").catch(() => ({ data: [] })),
    staleTime: 5 * 60_000,
  });
  return ((Array.isArray(data) ? data : data?.data) ?? []).filter((u: any) => u.actif !== false) as { id: string; nom: string }[];
}

const ClientDialog = ({ initial, id, onClose }: { initial: ClientForm; id?: string; onClose: (nouvelId?: string) => void }) => {
  const [v, setV] = useState<ClientForm>(initial);
  const comptes = useComptes();
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV(p => ({ ...p, [k]: e.target.value }));
  const enregistrer = useMutation({
    mutationFn: () => id ? api.patch<any>(`/api/crm/clients/${id}`, versCorps(v)) : api.post<any>("/api/crm/clients", versCorps(v)),
    onSuccess: (c: any) => { toast({ title: id ? "Fiche client mise à jour" : "Client créé", description: v.nom }); onClose(c?.id); },
    onError: erreur,
  });
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display">{id ? "Modifier la fiche client" : "Nouveau client"}</DialogTitle></DialogHeader>
        <div className="space-y-5">
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Champ label="Raison sociale *" large><Input value={v.nom} onChange={set("nom")} placeholder="Ex : SOCIÉTÉ ALPHA SA" autoFocus /></Champ>
            <Champ label="Statut">
              <Select value={v.statut} onValueChange={x => setV(p => ({ ...p, statut: x }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(STATUTS).map(([k, s]) => <SelectItem key={k} value={k}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </Champ>
            <Champ label="Segment">
              <Select value={v.segment} onValueChange={x => setV(p => ({ ...p, segment: x }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(SEGMENTS).map(([k, s]) => <SelectItem key={k} value={k}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </Champ>
            <Champ label="Secteur d'activité"><Input value={v.secteur} onChange={set("secteur")} placeholder="BTP, agro-industrie, distribution…" /></Champ>
            <Champ label="Gestionnaire du compte">
              <Select value={v.gestionnaireId || "__aucun__"} onValueChange={x => setV(p => ({ ...p, gestionnaireId: x === "__aucun__" ? "" : x }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__aucun__">— Non attribué —</SelectItem>
                  {comptes.map(c => <SelectItem key={c.id} value={c.id}>{c.nom}</SelectItem>)}
                </SelectContent>
              </Select>
            </Champ>
          </section>

          <section className="space-y-2">
            <p className="text-xs font-bold text-foreground">Identité & coordonnées</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Champ label="NIU"><Input value={v.niu} onChange={set("niu")} className="font-mono" /></Champ>
              <Champ label="RCCM"><Input value={v.rccm} onChange={set("rccm")} className="font-mono" /></Champ>
              <Champ label="Téléphone"><Input value={v.telephone} onChange={set("telephone")} /></Champ>
              <Champ label="E-mail"><Input type="email" value={v.email} onChange={set("email")} /></Champ>
              <Champ label="Ville"><Input value={v.ville} onChange={set("ville")} /></Champ>
              <Champ label="Pays"><Input value={v.pays} onChange={set("pays")} /></Champ>
              <Champ label="Adresse" large><Input value={v.adresse} onChange={set("adresse")} /></Champ>
              <Champ label="Site web" large><Input value={v.siteWeb} onChange={set("siteWeb")} placeholder="https://" /></Champ>
            </div>
          </section>

          <section className="space-y-2">
            <p className="text-xs font-bold text-foreground">Interlocuteur principal</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Champ label="Nom"><Input value={v.contactNom} onChange={set("contactNom")} /></Champ>
              <Champ label="Fonction"><Input value={v.contactFonction} onChange={set("contactFonction")} /></Champ>
              <Champ label="Téléphone"><Input value={v.contactTelephone} onChange={set("contactTelephone")} /></Champ>
              <Champ label="E-mail"><Input type="email" value={v.contactEmail} onChange={set("contactEmail")} /></Champ>
            </div>
          </section>

          <section className="space-y-2">
            <p className="text-xs font-bold text-foreground">Conditions commerciales</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Champ label="Délai de paiement (jours)"><Input type="number" min={0} value={v.delaiPaiementJours} onChange={set("delaiPaiementJours")} /></Champ>
              <Champ label="Plafond de crédit (FCFA)"><Input type="number" min={0} value={v.plafondCredit} onChange={set("plafondCredit")} /></Champ>
              <Champ label="Mode de règlement préféré">
                <Select value={v.modeReglementPrefere || "__aucun__"} onValueChange={x => setV(p => ({ ...p, modeReglementPrefere: x === "__aucun__" ? "" : x }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__aucun__">—</SelectItem>
                    {MODES_REGLEMENT.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Champ>
            </div>
            <Champ label="Étiquettes (séparées par des virgules)"><Input value={v.tags} onChange={set("tags")} placeholder="import régulier, conteneurs frigo…" /></Champ>
            <Champ label="Notes internes"><Textarea value={v.notes} onChange={set("notes")} className="h-20 resize-none" /></Champ>
          </section>

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" onClick={() => onClose()}>Annuler</Button>
            <Button onClick={() => enregistrer.mutate()} disabled={v.nom.trim().length < 2 || enregistrer.isPending} className="bg-secondary text-secondary-foreground gap-1.5">
              {enregistrer.isPending && <Loader2 className="w-4 h-4 animate-spin" />} {id ? "Enregistrer" : "Créer le client"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const EchangeDialog = ({ clientId, dossiers, onClose }: { clientId: string; dossiers: any[]; onClose: () => void }) => {
  const [v, setV] = useState({ type: "appel", sujet: "", contenu: "", prochaineAction: "", dateProchaineAction: "", dossierId: "" });
  const enregistrer = useMutation({
    mutationFn: () => api.post(`/api/crm/clients/${clientId}/interactions`, {
      type: v.type, sujet: v.sujet.trim(), contenu: v.contenu.trim() || null,
      prochaineAction: v.prochaineAction.trim() || null,
      dateProchaineAction: v.dateProchaineAction ? new Date(`${v.dateProchaineAction}T09:00:00`).toISOString() : null,
      dossierId: v.dossierId || null,
    }),
    onSuccess: () => { toast({ title: "Échange enregistré" }); onClose(); },
    onError: erreur,
  });
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="font-display">Nouvel échange</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
            {Object.entries(ECHANGES).map(([k, e]) => (
              <button key={k} type="button" onClick={() => setV(p => ({ ...p, type: k }))}
                className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-[10px] font-semibold transition-all ${v.type === k ? "border-secondary bg-secondary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}>
                <e.icon className="w-4 h-4" />{e.label}
              </button>
            ))}
          </div>
          <Champ label="Objet *"><Input value={v.sujet} onChange={e => setV(p => ({ ...p, sujet: e.target.value }))} placeholder="Ex : Point sur l'arrivée du conteneur" autoFocus /></Champ>
          <Champ label="Compte rendu"><Textarea value={v.contenu} onChange={e => setV(p => ({ ...p, contenu: e.target.value }))} className="h-24 resize-none" /></Champ>
          {dossiers.length > 0 && (
            <Champ label="Dossier concerné">
              <Select value={v.dossierId || "__aucun__"} onValueChange={x => setV(p => ({ ...p, dossierId: x === "__aucun__" ? "" : x }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__aucun__">—</SelectItem>
                  {dossiers.map(d => <SelectItem key={d.id} value={d.id}>{d.numero} · {ETAPES[d.status] ?? d.status}</SelectItem>)}
                </SelectContent>
              </Select>
            </Champ>
          )}
          <div className="rounded-xl border border-dashed border-secondary/40 bg-secondary/5 p-3 grid grid-cols-1 sm:grid-cols-[1fr_150px] gap-2">
            <Champ label="Prochaine action"><Input value={v.prochaineAction} onChange={e => setV(p => ({ ...p, prochaineAction: e.target.value }))} placeholder="Ex : Relancer pour le solde" /></Champ>
            <Champ label="Pour le"><Input type="date" value={v.dateProchaineAction} onChange={e => setV(p => ({ ...p, dateProchaineAction: e.target.value }))} /></Champ>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button onClick={() => enregistrer.mutate()} disabled={v.sujet.trim().length < 2 || (!!v.prochaineAction.trim() && !v.dateProchaineAction) || enregistrer.isPending}
              className="bg-secondary text-secondary-foreground gap-1.5">
              {enregistrer.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Enregistrer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const ReglementDialog = ({ client, onClose }: { client: any; onClose: () => void }) => {
  const [v, setV] = useState({
    mode: client.modeReglementPrefere ?? "virement", montant: "", date: new Date().toISOString().slice(0, 10),
    reference: "", banque: "", echeance: "", payeur: "", dossierId: "", observations: "",
  });
  const avecBanque = ["virement", "cheque", "traite"].includes(v.mode);
  const enregistrer = useMutation({
    mutationFn: () => api.post("/api/crm/reglements", {
      clientId: client.id, mode: v.mode, montant: Number(v.montant), dateReglement: new Date(`${v.date}T12:00:00`).toISOString(),
      reference: v.reference.trim() || null, banque: avecBanque ? v.banque.trim() || null : null, payeur: v.payeur.trim() || null,
      dateEcheance: v.echeance ? new Date(`${v.echeance}T12:00:00`).toISOString() : null,
      dossierId: v.dossierId || null, observations: v.observations.trim() || null,
    }),
    onSuccess: () => { toast({ title: "Règlement enregistré", description: fcfa(Number(v.montant)) }); onClose(); },
    onError: erreur,
  });
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display">Enregistrer un règlement — {client.nom}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Champ label="Mode de règlement *">
            <Select value={v.mode} onValueChange={x => setV(p => ({ ...p, mode: x }))}>
              <SelectTrigger aria-label="Mode de règlement"><SelectValue /></SelectTrigger>
              <SelectContent>{MODES_REGLEMENT.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </Champ>
          <div className="grid grid-cols-2 gap-3">
            <Champ label="Montant (FCFA) *"><Input type="number" min={1} value={v.montant} onChange={e => setV(p => ({ ...p, montant: e.target.value }))} className="font-mono" /></Champ>
            <Champ label="Date"><Input type="date" value={v.date} onChange={e => setV(p => ({ ...p, date: e.target.value }))} /></Champ>
            <Champ label="Référence"><Input value={v.reference} onChange={e => setV(p => ({ ...p, reference: e.target.value }))} className="font-mono" /></Champ>
            {avecBanque
              ? <Champ label="Banque"><Input value={v.banque} onChange={e => setV(p => ({ ...p, banque: e.target.value }))} /></Champ>
              : <Champ label="Payé par"><Input value={v.payeur} onChange={e => setV(p => ({ ...p, payeur: e.target.value }))} /></Champ>}
            {(v.mode === "traite" || v.mode === "cheque") && (
              <Champ label={`Échéance${v.mode === "traite" ? " *" : ""}`}><Input type="date" value={v.echeance} onChange={e => setV(p => ({ ...p, echeance: e.target.value }))} /></Champ>
            )}
            {client.dossiers?.length > 0 && (
              <Champ label="Dossier">
                <Select value={v.dossierId || "__aucun__"} onValueChange={x => setV(p => ({ ...p, dossierId: x === "__aucun__" ? "" : x }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__aucun__">—</SelectItem>
                    {client.dossiers.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.numero}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Champ>
            )}
          </div>
          <Champ label="Observations"><Textarea value={v.observations} onChange={e => setV(p => ({ ...p, observations: e.target.value }))} className="h-16 resize-none" /></Champ>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button onClick={() => enregistrer.mutate()} disabled={!(Number(v.montant) > 0) || (v.mode === "traite" && !v.echeance) || enregistrer.isPending}
              className="bg-secondary text-secondary-foreground gap-1.5">
              {enregistrer.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Enregistrer le règlement
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ── Tableau de bord + portefeuille ────────────────────────────────────────────

const Accueil = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [statut, setStatut] = useState("tous");
  const [segment, setSegment] = useState("tous");
  const [tri, setTri] = useState<"nom" | "encaisse" | "solde" | "activite">("encaisse");
  const [creation, setCreation] = useState(false);

  const { data: syn, isLoading: chargeSyn } = useQuery({ queryKey: ["crm-synthese"], queryFn: () => api.get<any>("/api/crm/synthese"), refetchInterval: 60_000 });
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (statut !== "tous") params.set("statut", statut);
  if (segment !== "tous") params.set("segment", segment);
  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["crm-clients", q.trim(), statut, segment],
    queryFn: () => api.get<any[]>(`/api/crm/clients?${params}`),
    enabled: !chargeSyn,
  });
  const { data: relances = [] } = useQuery({ queryKey: ["crm-relances"], queryFn: () => api.get<any[]>("/api/crm/relances") });
  const fait = useMutation({
    mutationFn: (id: string) => api.patch(`/api/crm/interactions/${id}`, { faite: true }),
    onSuccess: () => toast({ title: "Action marquée comme faite" }),
    onError: erreur,
  });

  const tries = useMemo(() => [...clients].sort((a, b) => {
    if (tri === "nom") return a.nom.localeCompare(b.nom);
    if (tri === "solde") return b.indicateurs.solde - a.indicateurs.solde;
    if (tri === "activite") return new Date(b.indicateurs.dernierDossier ?? 0).getTime() - new Date(a.indicateurs.dernierDossier ?? 0).getTime();
    return b.indicateurs.encaisse - a.indicateurs.encaisse || b.indicateurs.dossiers - a.indicateurs.dossiers;
  }), [clients, tri]);

  const exporter = () => telechargerCsv(`clients-finitrans-${new Date().toISOString().slice(0, 10)}.csv`, tries.map(c => ({
    Client: c.nom, Statut: STATUTS[c.statut]?.label, Segment: SEGMENTS[c.segment]?.label, Secteur: c.secteur ?? "", Ville: c.ville ?? "",
    NIU: c.niu ?? "", Téléphone: c.telephone ?? "", "E-mail": c.email ?? "", Interlocuteur: c.contactNom ?? "", Gestionnaire: c.gestionnaire ?? "",
    Dossiers: c.indicateurs.dossiers, "Dossiers en cours": c.indicateurs.dossiersEnCours, "Facturé (FCFA)": c.indicateurs.facture,
    "Encaissé (FCFA)": c.indicateurs.encaisse, "Solde (FCFA)": c.indicateurs.solde,
  })));

  const max = Math.max(1, ...(syn?.modes ?? []).map((m: any) => m.montant));

  return (
    <div className="space-y-6">
      {/* Bandeau */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-[hsl(213,55%,22%)] to-[hsl(213,60%,10%)] p-6 sm:p-8 text-primary-foreground shadow-xl">
        <div className="absolute -right-16 -top-20 w-72 h-72 rounded-full bg-secondary/25 blur-3xl" />
        <div className="absolute right-24 bottom-0 w-40 h-40 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative flex flex-col lg:flex-row lg:items-end gap-6 justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-secondary font-semibold flex items-center gap-2"><Sparkles className="w-3.5 h-3.5" /> Relation client</p>
            <h2 className="font-display text-3xl sm:text-4xl font-black mt-2 tracking-tight">Portefeuille clients</h2>
            <p className="text-sm text-primary-foreground/70 mt-1.5 max-w-xl">Dossiers, factures, règlements et échanges de chaque client réunis en un seul endroit.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exporter} disabled={tries.length === 0} className="bg-white/5 border-white/20 text-primary-foreground hover:bg-white/10 hover:text-primary-foreground gap-1.5">
              <Download className="w-4 h-4" /> Exporter
            </Button>
            <Button onClick={() => setCreation(true)} className="bg-secondary text-secondary-foreground hover:bg-secondary/90 gap-1.5 shadow-lg shadow-secondary/30">
              <Plus className="w-4 h-4" /> Nouveau client
            </Button>
          </div>
        </div>
        <div className="relative grid grid-cols-2 lg:grid-cols-4 gap-3 mt-7">
          {[
            { l: "Clients actifs", v: String(syn?.clients?.parStatut?.actif ?? 0), d: `${syn?.clients?.parStatut?.prospect ?? 0} prospect(s) · ${syn?.clients?.nouveauxCeMois ?? 0} nouveau(x) ce mois` },
            { l: "Encaissé sur 12 mois", v: `${compact(syn?.encaisse12Mois)} FCFA`, d: `${compact(syn?.encaisseCeMois)} FCFA ce mois-ci` },
            { l: "Encours clients", v: `${compact(syn?.encours)} FCFA`, d: "Factures validées non réglées" },
            { l: "Relances", v: String(syn?.relances?.enRetard ?? 0), d: `en retard · ${syn?.relances?.cetteSemaine ?? 0} cette semaine` },
          ].map((k, i) => (
            <motion.div key={k.l} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}
              className="rounded-2xl bg-white/[0.06] border border-white/10 backdrop-blur-sm p-4">
              <p className="text-[11px] text-primary-foreground/60 font-medium">{k.l}</p>
              <p className="text-2xl font-display font-black tabular-nums mt-1">{chargeSyn ? "…" : k.v}</p>
              <p className="text-[10.5px] text-primary-foreground/55 mt-0.5">{k.d}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Analyses */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-display font-bold text-foreground">Encaissements clients</p>
              <p className="text-xs text-muted-foreground">12 derniers mois</p>
            </div>
            <TrendingUp className="w-5 h-5 text-secondary" />
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={(syn?.evolution ?? []).map((m: any) => ({ ...m, libelle: libelleMois(m.mois) }))} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="crmEnc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(24 86% 58%)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(24 86% 58%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="libelle" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={compact} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={48} />
                <Tooltip formatter={(v: any) => [fcfa(v), "Encaissé"]} labelStyle={{ fontWeight: 600 }}
                  contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", fontSize: 12 }} />
                <Area type="monotone" dataKey="montant" stroke="hsl(24 86% 58%)" strokeWidth={2.5} fill="url(#crmEnc)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
          <p className="font-display font-bold text-foreground mb-1">Modes de règlement</p>
          <p className="text-xs text-muted-foreground mb-4">Montants reçus par mode</p>
          <div className="space-y-3">
            {(syn?.modes ?? []).length === 0 && <p className="text-xs text-muted-foreground py-6 text-center">Aucun règlement enregistré</p>}
            {(syn?.modes ?? []).sort((a: any, b: any) => b.montant - a.montant).map((m: any) => (
              <div key={m.mode}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-foreground">{LIBELLE_MODE[m.mode] ?? m.mode} <span className="text-muted-foreground">· {m.nombre}</span></span>
                  <span className="font-mono text-muted-foreground">{compact(m.montant)}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${(m.montant / max) * 100}%` }} className="h-full rounded-full bg-gradient-to-r from-secondary to-amber-400" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Portefeuille */}
        <div className="xl:col-span-2 rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
          <div className="p-4 border-b border-border/60 flex flex-col md:flex-row gap-2 md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un client, un NIU, une ville, un interlocuteur…" className="pl-9 bg-muted/40 border-none" />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select value={statut} onValueChange={setStatut}>
                <SelectTrigger className="w-32 h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tous">Tous statuts</SelectItem>
                  {Object.entries(STATUTS).map(([k, s]) => <SelectItem key={k} value={k}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={segment} onValueChange={setSegment}>
                <SelectTrigger className="w-36 h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tous">Tous segments</SelectItem>
                  {Object.entries(SEGMENTS).map(([k, s]) => <SelectItem key={k} value={k}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={tri} onValueChange={v => setTri(v as typeof tri)}>
                <SelectTrigger className="w-40 h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="encaisse">Tri : encaissé</SelectItem>
                  <SelectItem value="solde">Tri : encours</SelectItem>
                  <SelectItem value="activite">Tri : activité récente</SelectItem>
                  <SelectItem value="nom">Tri : nom</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {isLoading || chargeSyn ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-secondary" /></div>
          ) : tries.length === 0 ? (
            <div className="text-center py-16 px-6">
              <Users className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="font-medium text-foreground">Aucun client</p>
              <p className="text-sm text-muted-foreground mt-1">Les clients des dossiers apparaissent automatiquement ici.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border/50">
              {tries.map((c, i) => {
                const seg = SEGMENTS[c.segment] ?? SEGMENTS.standard;
                const r = relance(c.indicateurs.prochaineRelance);
                return (
                  <motion.li key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 12) * 0.02 }}>
                    <button type="button" onClick={() => navigate(`/crm/${c.id}`)}
                      className="w-full text-left px-4 py-3.5 flex items-center gap-3 hover:bg-muted/40 transition-colors group">
                      <Avatar nom={c.nom} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-foreground truncate">{c.nom}</span>
                          <Pastille classe={seg.classe}><seg.icon className="w-2.5 h-2.5" />{seg.label}</Pastille>
                          {c.statut !== "actif" && <Pastille classe={STATUTS[c.statut]?.classe ?? ""}>{STATUTS[c.statut]?.label}</Pastille>}
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {[c.secteur, c.ville, c.contactNom].filter(Boolean).join(" · ") || "Fiche à compléter"}
                        </p>
                      </div>
                      <div className="hidden sm:flex items-center gap-6 text-right">
                        <div>
                          <p className="text-[10px] text-muted-foreground">Dossiers</p>
                          <p className="text-sm font-semibold tabular-nums">{c.indicateurs.dossiers}{c.indicateurs.dossiersEnCours > 0 && <span className="text-secondary"> · {c.indicateurs.dossiersEnCours} en cours</span>}</p>
                        </div>
                        <div className="w-24">
                          <p className="text-[10px] text-muted-foreground">Encaissé</p>
                          <p className="text-sm font-semibold tabular-nums">{compact(c.indicateurs.encaisse)}</p>
                        </div>
                        <div className="w-24">
                          <p className="text-[10px] text-muted-foreground">Encours</p>
                          <p className={`text-sm font-semibold tabular-nums ${c.indicateurs.solde > 0 ? "text-destructive" : "text-muted-foreground"}`}>{compact(c.indicateurs.solde)}</p>
                        </div>
                      </div>
                      {r && <span className={`hidden md:inline text-[10px] font-semibold px-2 py-1 rounded-lg ${r.classe}`}>{r.texte}</span>}
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  </motion.li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Colonne droite */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="font-display font-bold text-foreground flex items-center gap-2"><CalendarClock className="w-4 h-4 text-secondary" /> Prochaines actions</p>
              <span className="text-xs text-muted-foreground">{relances.length}</span>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {relances.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">Aucune action planifiée</p>}
              {relances.slice(0, 20).map((r: any) => {
                const etat = relance(r.dateProchaineAction);
                return (
                  <div key={r.id} className="rounded-xl border border-border/60 p-3 flex items-start gap-2.5">
                    <div className="flex-1 min-w-0">
                      <button className="text-xs font-semibold text-foreground hover:text-secondary truncate block max-w-full" onClick={() => navigate(`/crm/${r.client.id}`)}>{r.client.nom}</button>
                      <p className="text-xs text-muted-foreground mt-0.5">{r.prochaineAction ?? r.sujet}</p>
                      {etat && <span className={`inline-block mt-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded ${etat.classe}`}>{etat.texte} · {jour(r.dateProchaineAction)}</span>}
                    </div>
                    <button title="Marquer comme fait" onClick={() => fait.mutate(r.id)}
                      className="w-7 h-7 rounded-lg border border-border hover:bg-success hover:text-white hover:border-success flex items-center justify-center transition-colors">
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
            <p className="font-display font-bold text-foreground flex items-center gap-2 mb-3"><Crown className="w-4 h-4 text-amber-500" /> Meilleurs clients</p>
            <ol className="space-y-2.5">
              {(syn?.topClients ?? []).length === 0 && <p className="text-xs text-muted-foreground text-center py-3">—</p>}
              {(syn?.topClients ?? []).map((c: any, i: number) => (
                <li key={c.id}>
                  <button className="w-full flex items-center gap-2.5 text-left group" onClick={() => navigate(`/crm/${c.id}`)}>
                    <span className="w-5 text-xs font-black text-muted-foreground tabular-nums">{i + 1}</span>
                    <Avatar nom={c.nom} taille="w-8 h-8 text-[11px] rounded-xl" />
                    <span className="flex-1 min-w-0 text-sm font-medium truncate group-hover:text-secondary">{c.nom}</span>
                    <span className="text-xs font-mono text-muted-foreground">{compact(c.encaisse)}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      {creation && <ClientDialog initial={CLIENT_VIDE} onClose={id => { setCreation(false); qc.invalidateQueries({ queryKey: ["crm-clients"] }); if (id) navigate(`/crm/${id}`); }} />}
    </div>
  );
};

// ── Fiche client 360° ─────────────────────────────────────────────────────────

const Fiche = ({ id }: { id: string }) => {
  const navigate = useNavigate();
  const { user, superviseur } = useAuth();
  const [edition, setEdition] = useState(false);
  const [echange, setEchange] = useState(false);
  const [reglement, setReglement] = useState(false);
  const { data: c, isLoading, error } = useQuery({ queryKey: ["crm-client", id], queryFn: () => api.get<any>(`/api/crm/clients/${id}`), refetchInterval: 30_000 });
  const fait = useMutation({ mutationFn: (iid: string) => api.patch(`/api/crm/interactions/${iid}`, { faite: true }), onError: erreur });
  const supprimer = useMutation({ mutationFn: (iid: string) => api.delete(`/api/crm/interactions/${iid}`), onError: erreur });

  const activite = useMemo(() => {
    if (!c) return [];
    const ev: { date: string; icon: any; couleur: string; titre: string; detail?: string; lien?: string; sansHeure?: boolean }[] = [];
    c.dossiers.forEach((d: any) => ev.push({ date: d.dateCreation, icon: FolderOpen, couleur: "bg-primary", titre: `Dossier ${d.numero} ouvert`, detail: `${d.marchandise} · ${d.compagnie} · ${ETAPES[d.status] ?? d.status}`, lien: `/dossiers/${d.id}` }));
    c.reglements.forEach((r: any) => ev.push({ date: r.dateReglement, icon: Banknote, couleur: "bg-emerald-500", titre: `Règlement ${fcfa(r.montant)}`, sansHeure: true, detail: `${LIBELLE_MODE[r.mode] ?? r.mode}${r.reference ? ` · ${r.reference}` : ""}${r.dossier ? ` · ${r.dossier.numero}` : ""}` }));
    c.interactions.forEach((x: any) => { const e = ECHANGES[x.type] ?? ECHANGES.note; ev.push({ date: x.dateInteraction, icon: e.icon, couleur: e.couleur, titre: `${e.label} — ${x.sujet}`, detail: [x.contenu, x.auteur].filter(Boolean).join(" · ") }); });
    c.factures.filter((f: any) => f.type !== "proforma").forEach((f: any) => ev.push({ date: f.dateFacture, icon: Receipt, couleur: "bg-amber-500", titre: `Facture ${f.numero} — ${fcfa(f.montant)}`, sansHeure: true, detail: `${f.dossier}${f.type === "reglee" ? " · réglée" : ""}` }));
    return ev.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [c]);

  if (isLoading) return <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-secondary" /></div>;
  if (error || !c) return (
    <div className="text-center py-24">
      <p className="text-muted-foreground mb-4">Client introuvable.</p>
      <Button variant="outline" onClick={() => navigate("/crm")}>Retour au portefeuille</Button>
    </div>
  );

  const ind = c.indicateurs ?? { dossiers: 0, dossiersEnCours: 0, facture: 0, encaisse: 0, solde: 0 };
  const seg = SEGMENTS[c.segment] ?? SEGMENTS.standard;
  const usageCredit = c.plafondCredit ? Math.min(100, Math.round((ind.solde / c.plafondCredit) * 100)) : null;
  const tauxRecouvrement = ind.facture > 0 ? Math.min(100, Math.round((ind.encaisse / ind.facture) * 100)) : null;
  const actionsOuvertes = c.interactions.filter((x: any) => !x.faite && x.dateProchaineAction);

  const versForm = (): ClientForm => ({
    ...CLIENT_VIDE,
    ...Object.fromEntries(Object.keys(CLIENT_VIDE).map(k => [k, c[k] === null || c[k] === undefined ? "" : String(c[k])])),
    tags: (c.tags ?? []).join(", "),
  });

  return (
    <div className="space-y-5">
      <button onClick={() => navigate("/crm")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Portefeuille clients
      </button>

      {/* En-tête */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-[hsl(213,55%,22%)] to-[hsl(213,60%,10%)] text-primary-foreground p-6 sm:p-8 shadow-xl">
        <div className="absolute -right-10 -top-16 w-64 h-64 rounded-full bg-secondary/25 blur-3xl" />
        <div className="relative flex flex-col lg:flex-row gap-6 lg:items-center justify-between">
          <div className="flex items-start gap-4 min-w-0">
            <Avatar nom={c.nom} taille="w-16 h-16 text-xl rounded-3xl ring-4 ring-white/10" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Pastille classe={seg.classe === SEGMENTS.strategique.classe ? "bg-secondary text-secondary-foreground border-secondary" : seg.classe}><seg.icon className="w-2.5 h-2.5" />{seg.label}</Pastille>
                <Pastille classe={STATUTS[c.statut]?.classe ?? ""}>{STATUTS[c.statut]?.label}</Pastille>
                {(c.tags ?? []).map((t: string) => <Pastille key={t} classe="bg-white/10 text-primary-foreground border-white/15">{t}</Pastille>)}
              </div>
              <h2 className="font-display text-2xl sm:text-3xl font-black tracking-tight mt-2 break-words">{c.nom}</h2>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-primary-foreground/70">
                {c.secteur && <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{c.secteur}</span>}
                {(c.ville || c.pays) && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{[c.ville, c.pays].filter(Boolean).join(", ")}</span>}
                {c.telephone && <a href={`tel:${c.telephone}`} className="flex items-center gap-1 hover:text-white"><Phone className="w-3 h-3" />{c.telephone}</a>}
                {c.email && <a href={`mailto:${c.email}`} className="flex items-center gap-1 hover:text-white"><Mail className="w-3 h-3" />{c.email}</a>}
                {c.siteWeb && <a href={/^https?:\/\//.test(c.siteWeb) ? c.siteWeb : `https://${c.siteWeb}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-white"><Globe className="w-3 h-3" />Site web</a>}
                <span className="flex items-center gap-1"><UserRound className="w-3 h-3" />Gestionnaire : {c.gestionnaire ?? "non attribué"}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setEchange(true)} variant="outline" className="bg-white/5 border-white/20 text-primary-foreground hover:bg-white/10 hover:text-primary-foreground gap-1.5"><MessageSquare className="w-4 h-4" /> Échange</Button>
            <Button onClick={() => setReglement(true)} variant="outline" className="bg-white/5 border-white/20 text-primary-foreground hover:bg-white/10 hover:text-primary-foreground gap-1.5"><Wallet className="w-4 h-4" /> Règlement</Button>
            <Button onClick={() => setEdition(true)} className="bg-secondary text-secondary-foreground hover:bg-secondary/90 gap-1.5"><Pencil className="w-4 h-4" /> Modifier</Button>
          </div>
        </div>
      </motion.div>

      {/* Indicateurs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={FolderOpen} label="Dossiers" valeur={String(ind.dossiers)} accent="bg-primary"
          detail={ind.dossiersEnCours > 0 ? <span className="text-secondary font-semibold">{ind.dossiersEnCours} en cours</span> : "Aucun en cours"} />
        <Kpi icon={Receipt} label="Facturé" valeur={compact(ind.facture)} accent="bg-amber-500" delai={0.05} detail={fcfa(ind.facture)} />
        <Kpi icon={CircleDollarSign} label="Encaissé" valeur={compact(ind.encaisse)} accent="bg-emerald-500" delai={0.1}
          detail={tauxRecouvrement !== null ? `Taux de recouvrement : ${tauxRecouvrement} %` : fcfa(ind.encaisse)} />
        <Kpi icon={ShieldAlert} label="Encours" valeur={compact(ind.solde)} accent={ind.solde > 0 ? "bg-destructive" : "bg-slate-400"} delai={0.15}
          detail={usageCredit !== null ? (
            <div className="space-y-1">
              <span>{usageCredit} % du plafond ({compact(c.plafondCredit)})</span>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className={`h-full ${usageCredit > 85 ? "bg-destructive" : "bg-secondary"}`} style={{ width: `${usageCredit}%` }} /></div>
            </div>
          ) : c.delaiPaiementJours ? `Délai accordé : ${c.delaiPaiementJours} j` : "Aucun plafond défini"} />
      </div>

      {actionsOuvertes.length > 0 && (
        <div className="rounded-2xl border border-secondary/30 bg-gradient-to-r from-secondary/10 to-transparent p-4 flex flex-wrap gap-3 items-center">
          <BellRing className="w-5 h-5 text-secondary" />
          <p className="text-sm font-semibold text-foreground">{actionsOuvertes.length} action(s) à mener</p>
          {actionsOuvertes.slice(0, 3).map((x: any) => {
            const r = relance(x.dateProchaineAction);
            return (
              <span key={x.id} className="inline-flex items-center gap-2 text-xs bg-card border border-border rounded-xl pl-3 pr-1 py-1">
                {x.prochaineAction ?? x.sujet} {r && <span className={`px-1.5 py-0.5 rounded ${r.classe}`}>{r.texte}</span>}
                <button onClick={() => fait.mutate(x.id)} className="w-6 h-6 rounded-lg hover:bg-success hover:text-white flex items-center justify-center" title="Fait"><Check className="w-3 h-3" /></button>
              </span>
            );
          })}
        </div>
      )}

      <Tabs defaultValue="activite">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="activite">Activité</TabsTrigger>
          <TabsTrigger value="dossiers">Dossiers ({c.dossiers.length})</TabsTrigger>
          <TabsTrigger value="reglements">Règlements ({c.reglements.length})</TabsTrigger>
          <TabsTrigger value="echanges">Échanges ({c.interactions.length})</TabsTrigger>
          <TabsTrigger value="factures">Factures ({c.factures.length})</TabsTrigger>
          <TabsTrigger value="fiche">Fiche</TabsTrigger>
        </TabsList>

        <TabsContent value="activite">
          <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
            {activite.length === 0 && <p className="text-sm text-muted-foreground text-center py-10">Aucune activité pour ce client.</p>}
            <ol className="relative">
              {activite.map((e, i) => (
                <li key={i} className="relative pl-12 pb-5 last:pb-0">
                  {i < activite.length - 1 && <span className="absolute left-[17px] top-9 bottom-0 w-px bg-border" />}
                  <span className={`absolute left-0 top-0 w-9 h-9 rounded-xl ${e.couleur} text-white flex items-center justify-center shadow-sm`}><e.icon className="w-4 h-4" /></span>
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    {e.lien
                      ? <button onClick={() => navigate(e.lien!)} className="text-sm font-semibold text-foreground hover:text-secondary flex items-center gap-1">{e.titre}<ArrowUpRight className="w-3 h-3" /></button>
                      : <p className="text-sm font-semibold text-foreground">{e.titre}</p>}
                    <span className="text-[11px] text-muted-foreground">{e.sansHeure ? jour(e.date) : dateHeure(e.date)}</span>
                  </div>
                  {e.detail && <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-line">{e.detail}</p>}
                </li>
              ))}
            </ol>
          </div>
        </TabsContent>

        <TabsContent value="dossiers">
          <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr><th className="text-left px-4 py-2.5">Dossier</th><th className="text-left px-4 py-2.5">Marchandise</th><th className="text-left px-4 py-2.5">Étape</th><th className="text-left px-4 py-2.5">Responsable</th><th className="text-right px-4 py-2.5">Ouvert le</th></tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {c.dossiers.map((d: any) => (
                  <tr key={d.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`/dossiers/${d.id}`)}>
                    <td className="px-4 py-3 font-semibold">{d.numero}<p className="text-[11px] text-muted-foreground font-normal">{d.compagnie} · {d.site} · {d.conteneur}</p></td>
                    <td className="px-4 py-3 text-muted-foreground">{d.marchandise}</td>
                    <td className="px-4 py-3"><Pastille classe={d.status === "cloture" ? "bg-muted text-muted-foreground border-border" : "bg-secondary/10 text-secondary border-secondary/20"}>{ETAPES[d.status] ?? d.status}</Pastille></td>
                    <td className="px-4 py-3 text-muted-foreground">{d.responsable?.nom ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{jour(d.dateCreation)}</td>
                  </tr>
                ))}
                {c.dossiers.length === 0 && <tr><td colSpan={5} className="text-center text-muted-foreground py-10">Aucun dossier</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="reglements">
          <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-x-auto">
            <div className="flex items-center justify-between p-4 border-b border-border/50">
              <p className="text-sm font-semibold">Total encaissé : <span className="text-emerald-600 font-mono">{fcfa(ind.encaisse)}</span></p>
              <Button size="sm" onClick={() => setReglement(true)} className="bg-secondary text-secondary-foreground gap-1"><Plus className="w-3.5 h-3.5" /> Règlement</Button>
            </div>
            <table className="w-full text-sm min-w-[720px]">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr><th className="text-left px-4 py-2.5">Date</th><th className="text-left px-4 py-2.5">Mode</th><th className="text-left px-4 py-2.5">Référence</th><th className="text-left px-4 py-2.5">Dossier</th><th className="text-left px-4 py-2.5">Saisi par</th><th className="text-right px-4 py-2.5">Montant</th></tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {c.reglements.map((r: any) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3">{jour(r.dateReglement)}{r.dateEcheance && <p className="text-[11px] text-muted-foreground">Échéance {jour(r.dateEcheance)}</p>}</td>
                    <td className="px-4 py-3"><Pastille classe="bg-emerald-50 text-emerald-700 border-emerald-200">{LIBELLE_MODE[r.mode] ?? r.mode}</Pastille></td>
                    <td className="px-4 py-3 font-mono text-xs">{r.reference ?? "—"}{r.banque && <p className="text-[11px] text-muted-foreground font-sans">{r.banque}</p>}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.dossier?.numero ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.saisiPar ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">{fcfa(r.montant)}</td>
                  </tr>
                ))}
                {c.reglements.length === 0 && <tr><td colSpan={6} className="text-center text-muted-foreground py-10">Aucun règlement</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="echanges">
          <div className="space-y-2">
            <div className="flex justify-end"><Button size="sm" onClick={() => setEchange(true)} className="bg-secondary text-secondary-foreground gap-1"><Plus className="w-3.5 h-3.5" /> Nouvel échange</Button></div>
            {c.interactions.length === 0 && <p className="text-sm text-muted-foreground text-center py-10 rounded-2xl border border-dashed border-border">Aucun échange enregistré</p>}
            {c.interactions.map((x: any) => {
              const e = ECHANGES[x.type] ?? ECHANGES.note;
              const r = !x.faite ? relance(x.dateProchaineAction) : null;
              return (
                <div key={x.id} className="rounded-2xl border border-border/60 bg-card p-4 flex gap-3">
                  <span className={`w-9 h-9 rounded-xl ${e.couleur} text-white flex items-center justify-center flex-shrink-0`}><e.icon className="w-4 h-4" /></span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <p className="text-sm font-semibold">{x.sujet}</p>
                      <span className="text-[11px] text-muted-foreground">{e.label} · {dateHeure(x.dateInteraction)} · {x.auteur ?? "—"}</span>
                    </div>
                    {x.contenu && <p className="text-sm text-muted-foreground mt-1 whitespace-pre-line">{x.contenu}</p>}
                    {x.prochaineAction && (
                      <p className="mt-2 text-xs flex items-center gap-2 flex-wrap">
                        <CalendarClock className="w-3.5 h-3.5 text-secondary" />
                        <span className={x.faite ? "line-through text-muted-foreground" : "font-medium"}>{x.prochaineAction}</span>
                        {x.dateProchaineAction && <span className="text-muted-foreground">· {jour(x.dateProchaineAction)}</span>}
                        {r && <span className={`px-1.5 py-0.5 rounded ${r.classe}`}>{r.texte}</span>}
                        {!x.faite && <button onClick={() => fait.mutate(x.id)} className="text-success font-semibold hover:underline">Marquer comme fait</button>}
                      </p>
                    )}
                  </div>
                  {(x.auteurId === user?.id || superviseur) && (
                    <button onClick={() => window.confirm("Supprimer cet échange ?") && supprimer.mutate(x.id)} className="text-muted-foreground hover:text-destructive self-start" title="Supprimer">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="factures">
          <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr><th className="text-left px-4 py-2.5">N°</th><th className="text-left px-4 py-2.5">Dossier</th><th className="text-left px-4 py-2.5">Date</th><th className="text-left px-4 py-2.5">Statut</th><th className="text-right px-4 py-2.5">Montant</th></tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {c.factures.map((f: any) => (
                  <tr key={f.id}>
                    <td className="px-4 py-3 font-mono text-xs">{f.numero}</td>
                    <td className="px-4 py-3 text-muted-foreground">{f.dossier}</td>
                    <td className="px-4 py-3 text-muted-foreground">{jour(f.dateFacture)}</td>
                    <td className="px-4 py-3"><Pastille classe={f.type === "reglee" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : f.type === "validee" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-muted text-muted-foreground border-border"}>{f.type === "reglee" ? "Réglée" : f.type === "validee" ? "Validée" : "Proforma"}</Pastille></td>
                    <td className="px-4 py-3 text-right font-mono">{fcfa(f.montant)}</td>
                  </tr>
                ))}
                {c.factures.length === 0 && <tr><td colSpan={5} className="text-center text-muted-foreground py-10">Aucune facture</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="fiche">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[
              { titre: "Identité", icon: Building2, lignes: [["Raison sociale", c.nom], ["NIU", c.niu], ["RCCM", c.rccm], ["Secteur", c.secteur], ["Adresse", [c.adresse, c.ville, c.pays].filter(Boolean).join(", ")]] },
              { titre: "Interlocuteur principal", icon: Handshake, lignes: [["Nom", c.contactNom], ["Fonction", c.contactFonction], ["Téléphone", c.contactTelephone], ["E-mail", c.contactEmail]] },
              { titre: "Conditions commerciales", icon: Wallet, lignes: [["Délai de paiement", c.delaiPaiementJours ? `${c.delaiPaiementJours} jours` : null], ["Plafond de crédit", c.plafondCredit ? fcfa(c.plafondCredit) : null], ["Mode préféré", c.modeReglementPrefere ? LIBELLE_MODE[c.modeReglementPrefere] : null], ["Client depuis", jour(c.createdAt)]] },
            ].map(bloc => (
              <div key={bloc.titre} className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
                <p className="font-display font-bold text-foreground flex items-center gap-2 mb-3"><bloc.icon className="w-4 h-4 text-secondary" />{bloc.titre}</p>
                <dl className="space-y-2">
                  {bloc.lignes.map(([k, v]) => (
                    <div key={k as string} className="flex justify-between gap-3 text-sm">
                      <dt className="text-muted-foreground">{k}</dt><dd className="text-right font-medium break-words">{(v as string) || "—"}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
            {c.notes && (
              <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm lg:col-span-3">
                <p className="font-display font-bold text-foreground mb-2">Notes internes</p>
                <p className="text-sm text-muted-foreground whitespace-pre-line">{c.notes}</p>
              </div>
            )}
            {c.contacts.length > 0 && (
              <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm lg:col-span-3">
                <p className="font-display font-bold text-foreground mb-3">Contacts du répertoire</p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {c.contacts.map((k: any) => (
                    <div key={k.id} className="rounded-xl border border-border/60 p-3 text-sm">
                      <p className="font-semibold">{k.nom}</p>
                      <p className="text-xs text-muted-foreground">{[k.fonction, k.telephone, k.email].filter(Boolean).join(" · ")}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {edition && <ClientDialog id={c.id} initial={versForm()} onClose={() => setEdition(false)} />}
      {echange && <EchangeDialog clientId={c.id} dossiers={c.dossiers} onClose={() => setEchange(false)} />}
      {reglement && <ReglementDialog client={c} onClose={() => setReglement(false)} />}
    </div>
  );
};

const Crm = () => {
  const { id } = useParams();
  const qc = useQueryClient();
  return (
    <AppLayout title="CRM — Relation client" subtitle="Clients, règlements, échanges et relances">
      <div className="flex justify-end -mt-2 mb-3">
        <button onClick={() => qc.invalidateQueries({ predicate: q => String(q.queryKey[0]).startsWith("crm") })}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Actualiser</button>
      </div>
      {id ? <Fiche id={id} /> : <Accueil />}
    </AppLayout>
  );
};

export default Crm;
