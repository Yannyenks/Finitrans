import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Truck, Container, UserRound, CalendarDays, Plus, Search, Loader2, CheckCircle2, Phone,
  MapPin, ChevronRight, Car, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

const erreur = (err: any) => toast({ title: "Erreur", description: err?.message, variant: "destructive" });
const aujourdhui = () => new Date().toISOString().slice(0, 10);

const STATUTS: Record<string, { label: string; cls: string; suivant?: string; action?: string }> = {
  planifie:    { label: "Planifié",      cls: "bg-blue-100 text-blue-700",   suivant: "en_route",    action: "Départ" },
  en_route:    { label: "En route",      cls: "bg-amber-100 text-amber-700", suivant: "livre",       action: "Livré" },
  livre:       { label: "Livré",         cls: "bg-green-100 text-green-700", suivant: "retour_vide", action: "TC vide retourné" },
  retour_vide: { label: "Vide retourné", cls: "bg-gray-100 text-gray-600" },
  annule:      { label: "Annulé",        cls: "bg-red-100 text-red-700" },
};

function useRefresh() {
  const qc = useQueryClient();
  return () => ["logistique-transports", "logistique-chauffeurs", "logistique-camions", "logistique-resume"].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
}

/** Principales villes du Cameroun (départ et destination des transports). */
export const VILLES_CAMEROUN = [
  "Douala", "Yaoundé", "Kribi", "Bafoussam", "Bamenda", "Garoua", "Maroua", "Ngaoundéré", "Bertoua", "Ebolowa",
  "Buea", "Limbé", "Kumba", "Tiko", "Mutengene", "Nkongsamba", "Edéa", "Dschang", "Foumban", "Mbouda",
  "Bafang", "Bangangté", "Bafia", "Obala", "Mbalmayo", "Sangmélima", "Ambam", "Kyé-Ossi", "Lolodorf", "Eséka",
  "Akonolinga", "Abong-Mbang", "Batouri", "Yokadouma", "Garoua-Boulaï", "Meiganga", "Tibati", "Guider", "Touboro",
  "Mokolo", "Kaélé", "Yagoua", "Kousséri", "Mora", "Kumbo", "Nkambé", "Wum", "Mamfé", "Mbanga", "Loum", "Manjo",
  "Penja", "Mbankomo", "Soa", "Nanga-Eboko", "Mfou",
].sort((a, b) => a.localeCompare(b, "fr"));

/** « Yaoundé — entrepôt client » → { ville: "Yaoundé", precision: "entrepôt client" } */
function decouperLieu(lieu: string | null | undefined): { ville: string; precision: string } {
  const l = (lieu ?? "").trim();
  if (!l) return { ville: "", precision: "" };
  const base = l.replace(/^Port de /i, "");
  const ville = VILLES_CAMEROUN.find(v => base === v || base.startsWith(`${v} — `));
  return ville ? { ville, precision: base.slice(ville.length).replace(/^ — /, "") } : { ville: "__autre__", precision: l };
}
const composerLieu = (ville: string, precision: string) =>
  ville === "__autre__" ? precision.trim() : ville ? `${ville}${precision.trim() ? ` — ${precision.trim()}` : ""}` : "";

/** Trajet lisible : « Douala → Kribi » ou « Douala ⇄ Kribi » (aller-retour) */
export const trajet = (t: { origine?: string | null; destination: string; allerRetour?: boolean }) =>
  `${t.origine || "—"} ${t.allerRetour ? "⇄" : "→"} ${t.destination}`;

const ChoixVille = ({ libelle, ville, precision, onVille, onPrecision }: {
  libelle: string; ville: string; precision: string; onVille: (v: string) => void; onPrecision: (v: string) => void;
}) => (
  <div className="space-y-1.5">
    <Label className="text-xs">{libelle}</Label>
    <Select value={ville} onValueChange={onVille}>
      <SelectTrigger className="bg-muted/50" aria-label={libelle}><SelectValue placeholder="Ville du Cameroun…" /></SelectTrigger>
      <SelectContent className="max-h-72">
        {VILLES_CAMEROUN.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
        <SelectItem value="__autre__">Autre lieu…</SelectItem>
      </SelectContent>
    </Select>
    <Input value={precision} onChange={e => onPrecision(e.target.value)} className="bg-muted/50 h-8 text-xs"
      placeholder={ville === "__autre__" ? "Lieu (saisie libre)" : "Précision : port, entrepôt, client…"} aria-label={`${libelle} — précision`} />
  </div>
);

// ── Transport : véhicule + chauffeur + TC + trajet ──────────────────────────
const TransportDialog = ({ dossiers, camions, chauffeurs, initial, onClose }: { dossiers: any[]; camions: any[]; chauffeurs: any[]; initial?: any; onClose: () => void }) => {
  const refresh = useRefresh();
  const [form, setForm] = useState(() => ({
    dossierId: initial?.dossierId ?? "", conteneur: initial?.conteneur ?? "", camionId: initial?.camionId ?? "",
    chauffeurId: initial?.chauffeurId ?? "", dateEnlevement: (initial?.dateEnlevement ?? new Date().toISOString()).slice(0, 10),
    notes: initial?.notes ?? "", allerRetour: !!initial?.allerRetour,
    depart: decouperLieu(initial?.origine ?? "Douala — port"), arrivee: decouperLieu(initial?.destination),
  }));
  const origine = composerLieu(form.depart.ville, form.depart.precision);
  const destination = composerLieu(form.arrivee.ville, form.arrivee.precision);
  const dossier = dossiers.find(d => d.id === form.dossierId);
  const tcDuDossier: string[] = dossier?.conteneur ? String(dossier.conteneur).split(/[,;\s]+/).filter(Boolean) : [];
  const save = useMutation({
    mutationFn: () => {
      const payload = {
        dossierId: form.dossierId || null, conteneur: form.conteneur.trim(), camionId: form.camionId || null,
        chauffeurId: form.chauffeurId || null, dateEnlevement: new Date(`${form.dateEnlevement}T08:00:00`).toISOString(),
        origine: origine || null, destination, allerRetour: form.allerRetour, notes: form.notes || null,
      };
      return initial ? api.patch(`/api/logistique/transports/${initial.id}`, payload) : api.post("/api/logistique/transports", payload);
    },
    onSuccess: () => { refresh(); toast({ title: initial ? "Transport modifié" : "Transport planifié", description: `TC ${form.conteneur.toUpperCase()}` }); onClose(); },
    onError: erreur,
  });
  const valide = form.conteneur.trim().length >= 3 && destination.length >= 2 && !!form.dateEnlevement;
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-card sm:max-w-[520px] max-h-[92dvh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><Truck className="w-4 h-4 text-secondary" /> {initial ? "Modifier le transport" : "Nouveau transport"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Dossier</Label>
            <Select value={form.dossierId || "__aucun__"} onValueChange={v => {
              const d = dossiers.find(x => x.id === v);
              setForm(f => ({ ...f, dossierId: v === "__aucun__" ? "" : v, conteneur: f.conteneur || (d?.conteneur ? String(d.conteneur).split(/[,;\s]+/)[0] : "") }));
            }}>
              <SelectTrigger className="bg-muted/50"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__aucun__">Sans dossier</SelectItem>
                {dossiers.map(d => <SelectItem key={d.id} value={d.id}>{d.numero} — {d.client}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">1 · N° TC (conteneur) *</Label>
              <Input list="tc-dossier" value={form.conteneur} onChange={e => setForm({ ...form, conteneur: e.target.value.toUpperCase() })} placeholder="MSCU1234567" className="bg-muted/50 font-mono" aria-label="N° TC" />
              <datalist id="tc-dossier">{tcDuDossier.map(tc => <option key={tc} value={tc} />)}</datalist>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">2 · Véhicule</Label>
              <Select value={form.camionId || "__aucun__"} onValueChange={v => setForm({ ...form, camionId: v === "__aucun__" ? "" : v })}>
                <SelectTrigger className="bg-muted/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__aucun__">Non attribué</SelectItem>
                  {camions.filter(c => c.actif).map(c => <SelectItem key={c.id} value={c.id}>{c.immatriculation}{c.capacite ? ` · ${c.capacite}'` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">3 · Chauffeur</Label>
              <Select value={form.chauffeurId || "__aucun__"} onValueChange={v => setForm({ ...form, chauffeurId: v === "__aucun__" ? "" : v })}>
                <SelectTrigger className="bg-muted/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__aucun__">Non attribué</SelectItem>
                  {chauffeurs.filter(c => c.actif).map(c => <SelectItem key={c.id} value={c.id}>{c.nom} · {c.telephone}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="rounded-xl border border-border/60 p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-foreground">4 · Destination</p>
              <div className="flex rounded-lg bg-muted p-0.5 text-[11px] font-semibold" role="radiogroup" aria-label="Type de trajet">
                {[{ v: false, l: "Aller simple →" }, { v: true, l: "Aller-retour ⇄" }].map(o => (
                  <button key={String(o.v)} type="button" role="radio" aria-checked={form.allerRetour === o.v}
                    onClick={() => setForm({ ...form, allerRetour: o.v })}
                    className={`px-2.5 py-1 rounded-md transition-colors ${form.allerRetour === o.v ? "bg-card shadow text-foreground" : "text-muted-foreground"}`}>
                    {o.l}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-start">
              <ChoixVille libelle="Départ" ville={form.depart.ville} precision={form.depart.precision}
                onVille={v => setForm({ ...form, depart: { ...form.depart, ville: v } })} onPrecision={v => setForm({ ...form, depart: { ...form.depart, precision: v } })} />
              <button type="button" title="Inverser départ et destination" aria-label="Inverser départ et destination"
                onClick={() => setForm({ ...form, depart: form.arrivee, arrivee: form.depart })}
                className="mt-6 w-8 h-8 rounded-lg border border-border hover:bg-muted flex items-center justify-center text-secondary font-bold">
                {form.allerRetour ? "⇄" : "→"}
              </button>
              <ChoixVille libelle="Destination *" ville={form.arrivee.ville} precision={form.arrivee.precision}
                onVille={v => setForm({ ...form, arrivee: { ...form.arrivee, ville: v } })} onPrecision={v => setForm({ ...form, arrivee: { ...form.arrivee, precision: v } })} />
            </div>
            {destination && (
              <p className="text-[11px] text-muted-foreground">Trajet : <span className="font-semibold text-foreground">{trajet({ origine, destination, allerRetour: form.allerRetour })}</span></p>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[10rem_1fr] gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Date *</Label>
              <Input type="date" value={form.dateEnlevement} onChange={e => setForm({ ...form, dateEnlevement: e.target.value })} className="bg-muted/50" />
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Notes</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="bg-muted/50" /></div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button onClick={() => save.mutate()} disabled={!valide || save.isPending} className="gap-2 bg-secondary text-secondary-foreground">
              {save.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Enregistrer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ── Chauffeur ───────────────────────────────────────────────────────────────
const ChauffeurDialog = ({ initial, onClose }: { initial?: any; onClose: () => void }) => {
  const refresh = useRefresh();
  const [form, setForm] = useState({
    nom: initial?.nom ?? "", telephone: initial?.telephone ?? "", numeroPermis: initial?.numeroPermis ?? "",
    cni: initial?.cni ?? "", transporteur: initial?.transporteur ?? "", notes: initial?.notes ?? "",
  });
  const save = useMutation({
    mutationFn: () => {
      const payload = { ...form, numeroPermis: form.numeroPermis || null, cni: form.cni || null, transporteur: form.transporteur || null, notes: form.notes || null };
      return initial ? api.patch(`/api/logistique/chauffeurs/${initial.id}`, payload) : api.post("/api/logistique/chauffeurs", payload);
    },
    onSuccess: () => { refresh(); toast({ title: initial ? "Chauffeur modifié" : "Chauffeur ajouté", description: form.nom }); onClose(); },
    onError: erreur,
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-card sm:max-w-[440px]">
        <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><UserRound className="w-4 h-4 text-secondary" /> {initial ? "Modifier le chauffeur" : "Nouveau chauffeur"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Nom complet *</Label><Input value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} className="bg-muted/50" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Téléphone *</Label><Input value={form.telephone} onChange={e => setForm({ ...form, telephone: e.target.value })} placeholder="+237 6XX XX XX XX" className="bg-muted/50" /></div>
            <div className="space-y-1.5"><Label className="text-xs">N° permis</Label><Input value={form.numeroPermis} onChange={e => setForm({ ...form, numeroPermis: e.target.value })} className="bg-muted/50" /></div>
            <div className="space-y-1.5"><Label className="text-xs">N° CNI</Label><Input value={form.cni} onChange={e => setForm({ ...form, cni: e.target.value })} className="bg-muted/50" /></div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Transporteur / société</Label><Input value={form.transporteur} onChange={e => setForm({ ...form, transporteur: e.target.value })} className="bg-muted/50" /></div>
          <div className="space-y-1.5"><Label className="text-xs">Notes</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="bg-muted/50" /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button onClick={() => save.mutate()} disabled={form.nom.trim().length < 2 || form.telephone.trim().length < 6 || save.isPending} className="gap-2 bg-secondary text-secondary-foreground">
              {save.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Enregistrer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ── Véhicule (camion) ───────────────────────────────────────────────────────
const CamionDialog = ({ initial, onClose }: { initial?: any; onClose: () => void }) => {
  const refresh = useRefresh();
  const [form, setForm] = useState({
    immatriculation: initial?.immatriculation ?? "", marque: initial?.marque ?? "", typeVehicule: initial?.typeVehicule ?? "porte_conteneur",
    capacite: initial?.capacite ?? "40", transporteur: initial?.transporteur ?? "", notes: initial?.notes ?? "",
  });
  const save = useMutation({
    mutationFn: () => {
      const payload = { ...form, marque: form.marque || null, capacite: form.capacite || null, transporteur: form.transporteur || null, notes: form.notes || null };
      return initial ? api.patch(`/api/logistique/camions/${initial.id}`, payload) : api.post("/api/logistique/camions", payload);
    },
    onSuccess: () => { refresh(); toast({ title: initial ? "Véhicule modifié" : "Véhicule ajouté", description: form.immatriculation.toUpperCase() }); onClose(); },
    onError: erreur,
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-card sm:max-w-[440px]">
        <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><Truck className="w-4 h-4 text-secondary" /> {initial ? "Modifier le véhicule" : "Nouveau véhicule"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Immatriculation *</Label><Input value={form.immatriculation} onChange={e => setForm({ ...form, immatriculation: e.target.value.toUpperCase() })} placeholder="LT 1234 AB" className="bg-muted/50 font-mono" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Marque / modèle</Label><Input value={form.marque} onChange={e => setForm({ ...form, marque: e.target.value })} className="bg-muted/50" /></div>
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Select value={form.typeVehicule} onValueChange={v => setForm({ ...form, typeVehicule: v })}>
                <SelectTrigger className="bg-muted/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="porte_conteneur">Porte-conteneur</SelectItem><SelectItem value="plateau">Plateau</SelectItem>
                  <SelectItem value="benne">Benne</SelectItem><SelectItem value="utilitaire">Utilitaire</SelectItem><SelectItem value="autre">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Capacité TC</Label>
              <Select value={form.capacite || "aucune"} onValueChange={v => setForm({ ...form, capacite: v === "aucune" ? "" : v })}>
                <SelectTrigger className="bg-muted/50"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="20">20 pieds</SelectItem><SelectItem value="40">40 pieds</SelectItem><SelectItem value="2x20">2 × 20 pieds</SelectItem><SelectItem value="aucune">—</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Transporteur / propriétaire</Label><Input value={form.transporteur} onChange={e => setForm({ ...form, transporteur: e.target.value })} className="bg-muted/50" /></div>
          <div className="space-y-1.5"><Label className="text-xs">Notes</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="bg-muted/50" /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button onClick={() => save.mutate()} disabled={form.immatriculation.trim().length < 3 || save.isPending} className="gap-2 bg-secondary text-secondary-foreground">
              {save.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Enregistrer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/** Motifs fréquents de retour d'un TC vide */
const MOTIFS_RETOUR_VIDE = ["Marchandise dépotée chez le client", "Dépotage au magasin / entrepôt", "Restitution à la compagnie (fin de franchise)", "Conteneur endommagé", "Annulation de la livraison"];

/** TC vide retourné : justification obligatoire. */
const RetourVideDialog = ({ transport, onClose }: { transport: any; onClose: () => void }) => {
  const qc = useQueryClient();
  const [motif, setMotif] = useState("");
  const [detail, setDetail] = useState("");
  const justification = [motif, detail.trim()].filter(Boolean).join(" — ");
  const valider = useMutation({
    mutationFn: () => api.patch(`/api/logistique/transports/${transport.id}`, { statut: "retour_vide", justificationRetourVide: justification }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["logistique-transports"] }); qc.invalidateQueries({ queryKey: ["logistique-resume"] }); toast({ title: "TC vide retourné", description: `${transport.conteneur} — ${justification}` }); onClose(); },
    onError: erreur,
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-card sm:max-w-[460px]">
        <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><Container className="w-4 h-4 text-secondary" /> TC vide retourné — <span className="font-mono">{transport.conteneur}</span></DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Motif du retour *</Label>
            <div className="flex flex-wrap gap-1.5">
              {MOTIFS_RETOUR_VIDE.map(m => (
                <button key={m} type="button" onClick={() => setMotif(p => p === m ? "" : m)}
                  className={`text-[11px] px-2.5 py-1.5 rounded-full border transition-colors ${motif === m ? "bg-secondary text-secondary-foreground border-secondary" : "border-border text-muted-foreground hover:bg-muted"}`}>{m}</button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Justification {motif ? "(précisions)" : "*"}</Label>
            <textarea value={detail} onChange={e => setDetail(e.target.value)} rows={3} maxLength={900}
              placeholder="Ex. : dépoté le 21/10 chez SOCIÉTÉ ALPHA, conteneur restitué au terminal MSC Douala"
              className="w-full rounded-md border border-input bg-muted/50 px-3 py-2 text-sm" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button disabled={justification.length < 5 || valider.isPending} onClick={() => valider.mutate()} className="gap-1.5 bg-secondary text-secondary-foreground">
              {valider.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Confirmer le retour
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

type Dlg = { type: "transport"; initial?: any } | { type: "chauffeur"; initial?: any } | { type: "camion"; initial?: any } | { type: "retour_vide"; initial: any } | null;

const Logistique = () => {
  const navigate = useNavigate();
  const refresh = useRefresh();
  const qc = useQueryClient();
  const [dlg, setDlg] = useState<Dlg>(null);
  const [f, setF] = useState({ q: "", statut: "actifs", date: "" });

  const qs = useMemo(() => {
    const p = new URLSearchParams({ limit: "100" });
    if (f.q.trim()) p.set("q", f.q.trim());
    if (f.statut === "actifs") p.set("statut", "planifie,en_route");
    else if (f.statut !== "tous") p.set("statut", f.statut);
    if (f.date) { p.set("from", new Date(`${f.date}T00:00:00`).toISOString()); p.set("to", new Date(`${f.date}T23:59:59`).toISOString()); }
    return p.toString();
  }, [f]);

  const { data: transportsData, isLoading } = useQuery({ queryKey: ["logistique-transports", qs], queryFn: () => api.get<any>(`/api/logistique/transports?${qs}`), refetchInterval: 60_000 });
  const { data: chauffeurs = [] } = useQuery({ queryKey: ["logistique-chauffeurs"], queryFn: () => api.get<any[]>("/api/logistique/chauffeurs") });
  const { data: camions = [] } = useQuery({ queryKey: ["logistique-camions"], queryFn: () => api.get<any[]>("/api/logistique/camions") });
  const { data: resume } = useQuery({ queryKey: ["logistique-resume"], queryFn: () => api.get<any>("/api/logistique/resume") });
  const { data: dossiersData } = useQuery({ queryKey: ["dossiers-logistique"], queryFn: () => api.get<any>("/api/dossiers?limit=100&status=paiement,bon_compagnie,operations_douala,operations_kribi,cloture") });

  const transports: any[] = transportsData?.data ?? [];
  const dossiers: any[] = dossiersData?.data ?? [];

  const avancer = useMutation({
    mutationFn: ({ id, statut }: { id: string; statut: string }) => api.patch(`/api/logistique/transports/${id}`, { statut }),
    onSuccess: () => { refresh(); toast({ title: "Transport mis à jour" }); },
    onError: erreur,
  });
  const basculer = useMutation({
    mutationFn: ({ type, item }: { type: "chauffeurs" | "camions"; item: any }) => api.patch(`/api/logistique/${type}/${item.id}`, { actif: !item.actif }),
    onSuccess: () => refresh(),
    onError: erreur,
  });

  return (
    <AppLayout title="Logistique" subtitle="N° TC · véhicule · chauffeur · destination">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Transports aujourd'hui", value: resume?.aujourdhui ?? 0, color: "text-secondary", icon: CalendarDays },
          { label: "En route", value: resume?.parStatut?.en_route ?? 0, color: "text-warning", icon: Truck },
          { label: "Véhicules actifs", value: resume?.camionsActifs ?? 0, color: "text-accent", icon: Car },
          { label: "Chauffeurs actifs", value: resume?.chauffeursActifs ?? 0, color: "text-success", icon: UserRound },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <s.icon className={`w-5 h-5 ${s.color} mb-2`} />
            <div className={`text-2xl font-display font-black ${s.color}`}>{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      <Tabs defaultValue="transports">
        <TabsList className="mb-4 flex-wrap h-auto">
          <TabsTrigger value="transports" className="gap-1.5"><Container className="w-3.5 h-3.5" /> Transports TC</TabsTrigger>
          <TabsTrigger value="vehicules" className="gap-1.5"><Truck className="w-3.5 h-3.5" /> Véhicules ({camions.length})</TabsTrigger>
          <TabsTrigger value="chauffeurs" className="gap-1.5"><UserRound className="w-3.5 h-3.5" /> Chauffeurs ({chauffeurs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="transports">
          <div className="flex flex-wrap items-end gap-2 mb-4">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="TC, dossier, client, destination…" value={f.q} onChange={e => setF({ ...f, q: e.target.value })} className="pl-9 bg-card" />
            </div>
            <Select value={f.statut} onValueChange={v => setF({ ...f, statut: v })}>
              <SelectTrigger className="w-full sm:w-44 bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="actifs">Planifiés et en route</SelectItem>
                <SelectItem value="tous">Tous</SelectItem>
                {Object.entries(STATUTS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="space-y-1"><Label className="text-[10px]">Date</Label><Input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} className="h-10 w-40 bg-card" /></div>
            {f.date !== aujourdhui() && <Button variant="ghost" size="sm" onClick={() => setF({ ...f, date: aujourdhui(), statut: "tous" })}>Aujourd'hui</Button>}
            <Button className="w-full sm:w-auto sm:ml-auto gap-2 bg-secondary text-secondary-foreground" onClick={() => setDlg({ type: "transport" })}><Plus className="w-4 h-4" /> Nouveau transport</Button>
          </div>
          <div className="stat-card p-0 overflow-x-auto">
            {isLoading ? <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-secondary" /></div> : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-muted-foreground border-b border-border bg-muted/40">
                  <th className="py-2 px-3">N° TC</th><th className="py-2 px-3">Véhicule</th><th className="py-2 px-3">Chauffeur</th>
                  <th className="py-2 px-3">Destination</th><th className="py-2 px-3">Date</th><th className="py-2 px-3">Dossier</th><th className="py-2 px-3">Statut</th><th className="py-2 px-3"></th>
                </tr></thead>
                <tbody>
                  {transports.map(t => {
                    const st = STATUTS[t.statut] ?? STATUTS.planifie;
                    return (
                      <tr key={t.id} className="border-b border-border/40 hover:bg-muted/20">
                        <td className="py-2 px-3 font-mono font-semibold">{t.conteneur}</td>
                        <td className="py-2 px-3 font-mono text-xs">{t.camion?.immatriculation ?? <span className="text-destructive">à attribuer</span>}</td>
                        <td className="py-2 px-3 text-xs">{t.chauffeur ? <>{t.chauffeur.nom}<div className="text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{t.chauffeur.telephone}</div></> : <span className="text-destructive">à attribuer</span>}</td>
                        <td className="py-2 px-3 text-xs"><span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{trajet(t)}</span></td>
                        <td className="py-2 px-3 text-xs whitespace-nowrap">{new Date(t.dateEnlevement).toLocaleDateString("fr-FR")}{t.dateLivraison && <div className="text-muted-foreground">livré {new Date(t.dateLivraison).toLocaleDateString("fr-FR")}</div>}</td>
                        <td className="py-2 px-3 text-xs">{t.dossier ? <button className="text-secondary hover:underline" onClick={() => navigate(`/dossiers/${t.dossier.id}`)}>{t.dossier.numero}</button> : "—"}</td>
                        <td className="py-2 px-3"><span className={`status-badge ${st.cls}`}>{st.label}</span>
                          {t.justificationRetourVide && <div className="text-[10px] text-muted-foreground mt-0.5 max-w-[16rem] whitespace-normal" title={t.justificationRetourVide}>{t.justificationRetourVide}</div>}</td>
                        <td className="py-2 px-3">
                          <div className="flex gap-1 justify-end">
                            {st.suivant && <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={avancer.isPending} onClick={() => st.suivant === "retour_vide" ? setDlg({ type: "retour_vide", initial: t }) : avancer.mutate({ id: t.id, statut: st.suivant! })}><CheckCircle2 className="w-3 h-3" /> {st.action}</Button>}
                            {(t.statut === "planifie" || t.statut === "en_route") && <Button size="sm" variant="ghost" className="h-7 px-2" title="Modifier" onClick={() => setDlg({ type: "transport", initial: t })}><Pencil className="w-3.5 h-3.5" /></Button>}
                            {t.statut === "planifie" && <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => avancer.mutate({ id: t.id, statut: "annule" })}>Annuler</Button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {transports.length === 0 && <tr><td colSpan={8} className="text-center py-10 text-muted-foreground">Aucun transport pour ce filtre</td></tr>}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="vehicules">
          <div className="flex justify-end mb-3"><Button className="gap-2 bg-secondary text-secondary-foreground" onClick={() => setDlg({ type: "camion" })}><Plus className="w-4 h-4" /> Nouveau véhicule</Button></div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {camions.map(c => (
              <div key={c.id} className={`stat-card ${c.actif ? "" : "opacity-60"}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono font-bold">{c.immatriculation}</span>
                  <Switch checked={c.actif} onCheckedChange={() => basculer.mutate({ type: "camions", item: c })} title="Actif" />
                </div>
                <p className="text-xs text-muted-foreground">{[c.marque, c.typeVehicule?.replace("_", "-"), c.capacite && `${c.capacite}'`, c.transporteur].filter(Boolean).join(" · ") || "—"}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-muted-foreground">{c._count?.transports ?? 0} transport(s)</span>
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setDlg({ type: "camion", initial: c })}><Pencil className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            ))}
            {camions.length === 0 && <p className="text-sm text-muted-foreground py-10 text-center col-span-full">Aucun véhicule enregistré</p>}
          </div>
        </TabsContent>

        <TabsContent value="chauffeurs">
          <div className="flex justify-end mb-3"><Button className="gap-2 bg-secondary text-secondary-foreground" onClick={() => setDlg({ type: "chauffeur" })}><Plus className="w-4 h-4" /> Nouveau chauffeur</Button></div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {chauffeurs.map(c => (
              <div key={c.id} className={`stat-card ${c.actif ? "" : "opacity-60"}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold">{c.nom}</span>
                  <Switch checked={c.actif} onCheckedChange={() => basculer.mutate({ type: "chauffeurs", item: c })} title="Actif" />
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" /> {c.telephone}</p>
                <p className="text-xs text-muted-foreground">{[c.numeroPermis && `Permis ${c.numeroPermis}`, c.transporteur].filter(Boolean).join(" · ")}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-muted-foreground">{c._count?.transports ?? 0} transport(s)</span>
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setDlg({ type: "chauffeur", initial: c })}><Pencil className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            ))}
            {chauffeurs.length === 0 && <p className="text-sm text-muted-foreground py-10 text-center col-span-full">Aucun chauffeur enregistré</p>}
          </div>
        </TabsContent>

      </Tabs>

      {dlg?.type === "retour_vide" && <RetourVideDialog transport={dlg.initial} onClose={() => setDlg(null)} />}
      {dlg?.type === "transport" && <TransportDialog dossiers={dossiers} camions={camions} chauffeurs={chauffeurs} initial={dlg.initial} onClose={() => setDlg(null)} />}
      {dlg?.type === "chauffeur" && <ChauffeurDialog initial={dlg.initial} onClose={() => setDlg(null)} />}
      {dlg?.type === "camion" && <CamionDialog initial={dlg.initial} onClose={() => setDlg(null)} />}
    </AppLayout>
  );
};

export default Logistique;
