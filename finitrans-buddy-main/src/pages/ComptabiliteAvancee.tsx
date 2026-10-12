import { Fragment, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  LayoutDashboard, BookOpen, Zap, Library, Scale, FileBarChart, Landmark, HandCoins, ListTree,
  Loader2, Plus, Trash2, CheckCircle2, Undo2, Pencil, Download, AlertTriangle, Lock, Unlock,
} from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, downloadFile } from "@/lib/api";
import { fcfa, useAuth } from "@/lib/permissions";
import { toast } from "@/hooks/use-toast";

const Chargement = () => <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-secondary" /></div>;
const erreur = (e: any) => toast({ title: "Erreur", description: e?.message, variant: "destructive" });
const n2 = (v: number | string) => Number(v ?? 0).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const MOIS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];
const anneeCourante = new Date().getFullYear();
const isoDebut = (d: string) => (d ? new Date(`${d}T00:00:00`).toISOString() : "");
const isoFin = (d: string) => (d ? new Date(`${d}T23:59:59`).toISOString() : "");

const SOURCES: Record<string, string> = {
  FACTURE: "Factures clients (ventes)",
  FACTURE_REGLEMENT: "Règlements clients (banque)",
  PAIEMENT_DOUANE: "Paiements douane (débours)",
  PAIEMENT_COMPAGNIE: "Paiements compagnies (débours)",
};

/** Filtre de période réutilisable. */
const Periode = ({ from, to, onChange }: { from: string; to: string; onChange: (f: string, t: string) => void }) => (
  <div className="flex items-end gap-2">
    <div className="space-y-1"><Label className="text-[10px]">Du</Label><Input type="date" value={from} onChange={e => onChange(e.target.value, to)} className="h-9 w-40 bg-card" /></div>
    <div className="space-y-1"><Label className="text-[10px]">Au</Label><Input type="date" value={to} onChange={e => onChange(from, e.target.value)} className="h-9 w-40 bg-card" /></div>
  </div>
);
const qsPeriode = (from: string, to: string) => {
  const p = new URLSearchParams();
  if (from) p.set("from", isoDebut(from));
  if (to) p.set("to", isoFin(to));
  return p.toString();
};

function useComptes() {
  return useQuery({ queryKey: ["compta-comptes"], queryFn: () => api.get<any[]>("/api/compta/comptes"), staleTime: 60_000 });
}

// ── Tableau de bord ─────────────────────────────────────────────────────────

const Dashboard = ({ goTo }: { goTo: (o: string) => void }) => {
  const { data, isLoading } = useQuery({ queryKey: ["compta-dashboard"], queryFn: () => api.get<any>("/api/compta/dashboard") });
  if (isLoading || !data) return <Chargement />;
  const aCompta = Object.values(data.aComptabiliser as Record<string, number>).reduce((s, v) => s + v, 0);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: `Chiffre d'affaires ${anneeCourante}`, value: fcfa(data.annee.chiffreAffaires), cls: "text-secondary" },
          { label: `Charges ${anneeCourante}`, value: fcfa(data.annee.charges), cls: "text-destructive" },
          { label: `Résultat ${anneeCourante}`, value: fcfa(data.annee.resultat), cls: data.annee.resultat >= 0 ? "text-success" : "text-destructive" },
          { label: "Trésorerie", value: fcfa(data.tresorerie.solde), cls: "text-foreground" },
          { label: "Créances clients", value: fcfa(data.creances.total), cls: "text-amber-600" },
          { label: "CA du mois", value: fcfa(data.mois.chiffreAffaires), cls: "text-secondary" },
          { label: "Écritures à valider", value: data.brouillons, cls: data.brouillons ? "text-amber-600" : "text-success", go: "ecritures" },
          { label: "Opérations à comptabiliser", value: aCompta, cls: aCompta ? "text-amber-600" : "text-success", go: "automatisation" },
        ].map(k => (
          <button key={k.label} onClick={() => k.go && goTo(k.go)} className="stat-card text-left">
            <div className={`text-lg font-display font-bold ${k.cls}`}>{k.value}</div>
            <div className="text-xs text-muted-foreground">{k.label}</div>
          </button>
        ))}
      </div>
      <div className="stat-card">
        <h3 className="font-display font-semibold mb-3">Trésorerie {anneeCourante} — encaissements / décaissements</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.tresorerie.mois.map((m: any) => ({ ...m, nom: MOIS[m.mois - 1] }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="nom" fontSize={11} />
              <YAxis fontSize={11} tickFormatter={v => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v: number) => fcfa(v)} />
              <Legend />
              <Bar dataKey="encaissements" name="Encaissements" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="decaissements" name="Décaissements" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="stat-card">
          <h3 className="font-display font-semibold mb-3">Comptes de trésorerie</h3>
          {data.tresorerie.comptes.map((c: any) => (
            <div key={c.numero} className="flex justify-between text-sm py-1.5 border-b border-border/40"><span>{c.numero} — {c.libelle}</span><strong>{fcfa(c.solde)}</strong></div>
          ))}
        </div>
        <div className="stat-card">
          <h3 className="font-display font-semibold mb-3">Balance âgée des créances</h3>
          {Object.entries(data.creances.tranches).map(([t, v]) => (
            <div key={t} className="flex justify-between text-sm py-1.5 border-b border-border/40"><span>{t} jours</span><strong>{fcfa(v as number)}</strong></div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Saisie / modification d'écriture ────────────────────────────────────────

type Ligne = { compte: string; libelle: string; debit: string; credit: string; tiers: string };
const LIGNE_VIDE: Ligne = { compte: "", libelle: "", debit: "", credit: "", tiers: "" };

const EcritureDialog = ({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: any }) => {
  const qc = useQueryClient();
  const { data: comptes } = useComptes();
  const { data: journaux } = useQuery({ queryKey: ["compta-journaux"], queryFn: () => api.get<any[]>("/api/compta/journaux") });
  const [entete, setEntete] = useState(() => ({
    journal: initial?.journal?.code ?? "OD",
    date: (initial?.date ?? new Date().toISOString()).slice(0, 10),
    libelle: initial?.libelle ?? "",
    piece: initial?.piece ?? "",
  }));
  const [lignes, setLignes] = useState<Ligne[]>(() => initial?.lignes?.map((l: any) => ({
    compte: l.compte.numero, libelle: l.libelle ?? "", tiers: l.tiers ?? "",
    debit: Number(l.debit) ? String(Number(l.debit)) : "", credit: Number(l.credit) ? String(Number(l.credit)) : "",
  })) ?? [{ ...LIGNE_VIDE }, { ...LIGNE_VIDE }]);

  const totalD = lignes.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalC = lignes.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const equilibre = Math.round(totalD * 100) === Math.round(totalC * 100) && totalD > 0;

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        journal: entete.journal, date: new Date(`${entete.date}T12:00:00`).toISOString(),
        libelle: entete.libelle.trim(), piece: entete.piece.trim() || undefined,
        lignes: lignes.filter(l => l.compte && (Number(l.debit) || Number(l.credit))).map(l => ({
          compte: l.compte, libelle: l.libelle || undefined, tiers: l.tiers || undefined,
          debit: Number(l.debit) || 0, credit: Number(l.credit) || 0,
        })),
      };
      return initial ? api.put(`/api/compta/ecritures/${initial.id}`, payload) : api.post("/api/compta/ecritures", payload);
    },
    onSuccess: (e: any) => {
      ["compta-ecritures", "compta-dashboard", "compta-balance"].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
      toast({ title: initial ? "Écriture modifiée" : "Écriture enregistrée", description: e?.numero });
      onClose();
    },
    onError: erreur,
  });

  const majLigne = (i: number, patch: Partial<Ligne>) => setLignes(ls => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const ecart = totalD - totalC;

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-4xl bg-card max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display">{initial ? `Modifier ${initial.numero}` : "Nouvelle écriture"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Journal</Label>
            <Select value={entete.journal} onValueChange={v => setEntete({ ...entete, journal: v })} disabled={!!initial}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{(journaux ?? []).filter(j => j.actif).map(j => <SelectItem key={j.code} value={j.code}>{j.code} — {j.libelle}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">Date</Label><Input type="date" value={entete.date} onChange={e => setEntete({ ...entete, date: e.target.value })} className="h-9" /></div>
          <div className="space-y-1 md:col-span-1"><Label className="text-xs">N° pièce</Label><Input value={entete.piece} onChange={e => setEntete({ ...entete, piece: e.target.value })} className="h-9" placeholder="Facture, quittance…" /></div>
          <div className="space-y-1 col-span-2 md:col-span-1"><Label className="text-xs">Libellé *</Label><Input value={entete.libelle} onChange={e => setEntete({ ...entete, libelle: e.target.value })} className="h-9" /></div>
        </div>
        <datalist id="plan-comptable">{(comptes ?? []).filter(c => c.actif).map(c => <option key={c.id} value={c.numero}>{c.libelle}</option>)}</datalist>
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-12 gap-2 text-[10px] text-muted-foreground font-semibold uppercase px-1">
            <span className="col-span-2">Compte</span><span className="col-span-4">Libellé / tiers</span><span className="col-span-2">Débit</span><span className="col-span-2">Crédit</span><span className="col-span-2"></span>
          </div>
          {lignes.map((l, i) => {
            const compte = comptes?.find(c => c.numero === l.compte);
            return (
              <div key={i} className="grid grid-cols-12 gap-2 items-start">
                <div className="col-span-2">
                  <Input list="plan-comptable" value={l.compte} onChange={e => majLigne(i, { compte: e.target.value.trim() })} className={`h-9 font-mono text-xs ${l.compte && !compte ? "border-destructive" : ""}`} placeholder="411000" />
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">{compte?.libelle ?? (l.compte ? "Compte inconnu" : "")}</p>
                </div>
                <div className="col-span-4 space-y-1">
                  <Input value={l.libelle} onChange={e => majLigne(i, { libelle: e.target.value })} className="h-9 text-xs" placeholder="Libellé (défaut : libellé de l'écriture)" />
                  <Input value={l.tiers} onChange={e => majLigne(i, { tiers: e.target.value })} className="h-8 text-xs" placeholder="Tiers (client, fournisseur…)" />
                </div>
                <Input type="number" min={0} value={l.debit} onChange={e => majLigne(i, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} className="col-span-2 h-9 font-mono text-xs" />
                <Input type="number" min={0} value={l.credit} onChange={e => majLigne(i, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} className="col-span-2 h-9 font-mono text-xs" />
                <div className="col-span-2 flex gap-1">
                  {ecart !== 0 && !l.debit && !l.credit && (
                    <Button type="button" size="sm" variant="outline" className="h-9 text-[10px] px-2" title="Solder l'écriture sur cette ligne"
                      onClick={() => majLigne(i, ecart > 0 ? { credit: String(Math.round(ecart * 100) / 100) } : { debit: String(Math.round(-ecart * 100) / 100) })}>
                      Solder
                    </Button>
                  )}
                  {lignes.length > 2 && (
                    <Button type="button" size="sm" variant="ghost" className="h-9 px-2 text-destructive" onClick={() => setLignes(ls => ls.filter((_, j) => j !== i))}><Trash2 className="w-3.5 h-3.5" /></Button>
                  )}
                </div>
              </div>
            );
          })}
          <Button type="button" variant="outline" size="sm" className="gap-1 text-xs" onClick={() => setLignes(ls => [...ls, { ...LIGNE_VIDE }])}><Plus className="w-3 h-3" /> Ligne</Button>
        </div>
        <div className={`mt-3 rounded-xl p-3 text-sm flex items-center justify-between ${equilibre ? "bg-success/10 text-success" : "bg-amber-50 text-amber-700"}`}>
          <span>Total débit <strong>{n2(totalD)}</strong> · Total crédit <strong>{n2(totalC)}</strong></span>
          <span className="font-semibold">{equilibre ? "Écriture équilibrée" : `Écart : ${n2(ecart)}`}</span>
        </div>
        <div className="flex justify-end gap-2 mt-3">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button className="bg-secondary text-secondary-foreground gap-2" disabled={!equilibre || entete.libelle.trim().length < 2 || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Enregistrer (brouillon)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ── Écritures ───────────────────────────────────────────────────────────────

const Ecritures = () => {
  const qc = useQueryClient();
  const { can, user } = useAuth();
  const saisie = can("permFinancier", "partiel");
  const direction = can("permFinancier", "complet");
  const [f, setF] = useState({ journal: "tous", statut: "tous", q: "", from: "", to: "", page: 1 });
  const [dialog, setDialog] = useState<{ open: boolean; initial?: any }>({ open: false });
  const [ouverte, setOuverte] = useState<string | null>(null);
  const qs = useMemo(() => {
    const p = new URLSearchParams({ page: String(f.page), limit: "30" });
    if (f.journal !== "tous") p.set("journal", f.journal);
    if (f.statut !== "tous") p.set("statut", f.statut);
    if (f.q.trim()) p.set("q", f.q.trim());
    if (f.from) p.set("from", isoDebut(f.from));
    if (f.to) p.set("to", isoFin(f.to));
    return p.toString();
  }, [f]);
  const { data, isLoading } = useQuery({ queryKey: ["compta-ecritures", qs], queryFn: () => api.get<any>(`/api/compta/ecritures?${qs}`) });
  const { data: journaux } = useQuery({ queryKey: ["compta-journaux"], queryFn: () => api.get<any[]>("/api/compta/journaux") });
  const refresh = () => ["compta-ecritures", "compta-dashboard", "compta-balance"].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
  const action = useMutation({
    mutationFn: ({ type, id }: { type: "valider" | "supprimer" | "contrepasser" | "lot"; id?: string }) =>
      type === "valider" ? api.post(`/api/compta/ecritures/${id}/valider`)
      : type === "supprimer" ? api.delete(`/api/compta/ecritures/${id}`)
      : type === "contrepasser" ? api.post(`/api/compta/ecritures/${id}/contrepasser`, {})
      : api.post("/api/compta/ecritures/valider-lot", f.journal !== "tous" ? { journal: f.journal } : {}),
    onSuccess: (r: any, v) => {
      refresh();
      toast({ title: v.type === "lot" ? `${r?.validees ?? 0} écriture(s) validée(s)` : v.type === "supprimer" ? "Écriture supprimée" : v.type === "contrepasser" ? `Contre-passée par ${r?.numero}` : "Écriture validée" });
    },
    onError: erreur,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Select value={f.journal} onValueChange={v => setF({ ...f, journal: v, page: 1 })}>
          <SelectTrigger className="h-9 w-44 bg-card"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="tous">Tous les journaux</SelectItem>{(journaux ?? []).map(j => <SelectItem key={j.code} value={j.code}>{j.code} — {j.libelle}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={f.statut} onValueChange={v => setF({ ...f, statut: v, page: 1 })}>
          <SelectTrigger className="h-9 w-36 bg-card"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="tous">Tous statuts</SelectItem><SelectItem value="brouillon">Brouillons</SelectItem><SelectItem value="validee">Validées</SelectItem></SelectContent>
        </Select>
        <Periode from={f.from} to={f.to} onChange={(from, to) => setF({ ...f, from, to, page: 1 })} />
        <Input placeholder="Libellé, n°, pièce…" value={f.q} onChange={e => setF({ ...f, q: e.target.value, page: 1 })} className="h-9 w-56 bg-card" />
        <div className="ml-auto flex gap-2">
          {direction && <Button variant="outline" className="h-9 gap-1 text-xs" disabled={action.isPending} onClick={() => action.mutate({ type: "lot" })}><CheckCircle2 className="w-3.5 h-3.5" /> Valider les brouillons</Button>}
          <Button variant="outline" className="h-9 gap-1 text-xs" onClick={() => downloadFile(`/api/compta/export/ecritures?${qsPeriode(f.from, f.to)}`, `ecritures-${anneeCourante}.csv`).catch(erreur)}><Download className="w-3.5 h-3.5" /> Export</Button>
          {saisie && <Button className="h-9 gap-1 text-xs bg-secondary text-secondary-foreground" onClick={() => setDialog({ open: true })}><Plus className="w-3.5 h-3.5" /> Nouvelle écriture</Button>}
        </div>
      </div>
      {isLoading ? <Chargement /> : (
        <div className="stat-card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground border-b border-border bg-muted/40">
              <th className="py-2 px-3">N°</th><th className="py-2 px-3">Date</th><th className="py-2 px-3">Journal</th><th className="py-2 px-3">Libellé</th>
              <th className="py-2 px-3 text-right">Montant</th><th className="py-2 px-3">Statut</th><th className="py-2 px-3"></th>
            </tr></thead>
            <tbody>
              {(data?.data ?? []).map((e: any) => (
                <Fragment key={e.id}>
                  <tr className="border-b border-border/40 hover:bg-muted/20 cursor-pointer" onClick={() => setOuverte(ouverte === e.id ? null : e.id)}>
                    <td className="py-2 px-3 font-mono text-xs">{e.numero}</td>
                    <td className="py-2 px-3 text-xs">{new Date(e.date).toLocaleDateString("fr-FR")}</td>
                    <td className="py-2 px-3 text-xs">{e.journal.code}</td>
                    <td className="py-2 px-3">{e.libelle}{e.sourceType && <span className="ml-1 text-[10px] text-muted-foreground">(auto)</span>}{e.dossier && <span className="ml-1 text-[10px] text-secondary">{e.dossier.numero}</span>}</td>
                    <td className="py-2 px-3 text-right font-mono">{n2(e.totalDebit)}</td>
                    <td className="py-2 px-3"><span className={`status-badge ${e.statut === "validee" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>{e.statut === "validee" ? "validée" : "brouillon"}</span></td>
                    <td className="py-2 px-3" onClick={ev => ev.stopPropagation()}>
                      <div className="flex gap-1 justify-end">
                        {e.statut === "brouillon" && saisie && <Button size="sm" variant="ghost" className="h-7 px-2" title="Modifier" onClick={() => setDialog({ open: true, initial: e })}><Pencil className="w-3.5 h-3.5" /></Button>}
                        {e.statut === "brouillon" && direction && <Button size="sm" variant="ghost" className="h-7 px-2 text-success" title="Valider" onClick={() => action.mutate({ type: "valider", id: e.id })}><CheckCircle2 className="w-3.5 h-3.5" /></Button>}
                        {e.statut === "brouillon" && saisie && <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" title="Supprimer" onClick={() => confirm(`Supprimer ${e.numero} ?`) && action.mutate({ type: "supprimer", id: e.id })}><Trash2 className="w-3.5 h-3.5" /></Button>}
                        {e.statut === "validee" && direction && !e.contrepasseeDeId && <Button size="sm" variant="ghost" className="h-7 px-2" title="Contre-passer" onClick={() => confirm(`Contre-passer ${e.numero} ?`) && action.mutate({ type: "contrepasser", id: e.id })}><Undo2 className="w-3.5 h-3.5" /></Button>}
                      </div>
                    </td>
                  </tr>
                  {ouverte === e.id && (
                    <tr className="bg-muted/20">
                      <td colSpan={7} className="px-6 py-2">
                        <table className="w-full text-xs">
                          <tbody>
                            {e.lignes.map((l: any) => (
                              <tr key={l.id}>
                                <td className="py-1 font-mono w-24">{l.compte.numero}</td>
                                <td className="py-1">{l.compte.libelle}{l.tiers ? ` · ${l.tiers}` : ""}{l.libelle && l.libelle !== e.libelle ? ` — ${l.libelle}` : ""}</td>
                                <td className="py-1 text-right font-mono w-32">{Number(l.debit) ? n2(l.debit) : ""}</td>
                                <td className="py-1 text-right font-mono w-32">{Number(l.credit) ? n2(l.credit) : ""}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Saisie par {e.createdBy?.nom}{e.valideePar ? ` · validée par ${e.valideePar.nom} le ${new Date(e.valideeAt).toLocaleDateString("fr-FR")}` : ""}{e.piece ? ` · pièce ${e.piece}` : ""}
                        </p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          {(data?.data ?? []).length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Aucune écriture</p>}
          {(data?.meta?.totalPages ?? 1) > 1 && (
            <div className="flex justify-between items-center px-4 py-2 border-t border-border text-xs">
              <span>Page {f.page} / {data.meta.totalPages} · {data.meta.total} écritures</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={f.page <= 1} onClick={() => setF({ ...f, page: f.page - 1 })}>Précédent</Button>
                <Button size="sm" variant="outline" disabled={f.page >= data.meta.totalPages} onClick={() => setF({ ...f, page: f.page + 1 })}>Suivant</Button>
              </div>
            </div>
          )}
        </div>
      )}
      {dialog.open && <EcritureDialog open onClose={() => setDialog({ open: false })} initial={dialog.initial} />}
      {!saisie && <p className="text-xs text-muted-foreground">Consultation seule — {user?.profilLabel}</p>}
    </div>
  );
};

// ── Automatisation ──────────────────────────────────────────────────────────

const Automatisation = () => {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [choix, setChoix] = useState<string[]>(Object.keys(SOURCES));
  const [mois, setMois] = useState(() => new Date().toISOString().slice(0, 7));
  const { data, isLoading } = useQuery({ queryKey: ["compta-apercu"], queryFn: () => api.get<any>("/api/compta/comptabilisation/apercu") });
  const refresh = () => ["compta-apercu", "compta-ecritures", "compta-dashboard", "compta-balance"].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
  const generer = useMutation({
    mutationFn: () => api.post<any>("/api/compta/comptabilisation/generer", { sources: choix }),
    onSuccess: (r) => {
      refresh();
      toast({ title: `${r.creees.length} écriture(s) générée(s) en brouillon`, description: r.erreurs.length ? `${r.erreurs.length} opération(s) en erreur : ${r.erreurs[0].message}` : "À contrôler puis valider dans l'onglet Écritures" });
    },
    onError: erreur,
  });
  const paie = useMutation({
    mutationFn: () => api.post<any>("/api/compta/paie/generer", { mois }),
    onSuccess: (e) => { refresh(); toast({ title: "Paie comptabilisée", description: e.numero }); },
    onError: erreur,
  });
  if (isLoading || !data) return <Chargement />;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="stat-card lg:col-span-2">
        <h3 className="font-display font-semibold mb-1 flex items-center gap-2"><Zap className="w-4 h-4 text-secondary" /> Comptabilisation automatique des opérations</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Les opérations validées dans l'application (factures, règlements, paiements douane et compagnie) sont transformées en écritures
          SYSCOHADA (411 / 706 / 4431 / 4671 / 521). Chaque opération n'est comptabilisée qu'une seule fois.
        </p>
        <div className="space-y-2">
          {Object.entries(SOURCES).map(([k, label]) => (
            <label key={k} className="flex items-center gap-3 p-3 rounded-xl border border-border/60 cursor-pointer">
              <Checkbox checked={choix.includes(k)} onCheckedChange={c => setChoix(c ? [...choix, k] : choix.filter(x => x !== k))} />
              <span className="flex-1 text-sm">{label}</span>
              <span className="text-xs text-muted-foreground">{data[k]?.nombre ?? 0} opération(s)</span>
              <strong className="text-sm">{fcfa(data[k]?.montant ?? 0)}</strong>
            </label>
          ))}
        </div>
        <Button className="mt-4 gap-2 bg-secondary text-secondary-foreground" disabled={!can("permFinancier", "partiel") || choix.length === 0 || generer.isPending} onClick={() => generer.mutate()}>
          {generer.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} Générer les écritures
        </Button>
      </div>
      <div className="stat-card">
        <h3 className="font-display font-semibold mb-1">Paie mensuelle</h3>
        <p className="text-xs text-muted-foreground mb-4">Écriture 661 / 422 à partir des salaires et primes des fiches RH (une seule fois par mois).</p>
        <Label className="text-xs">Mois</Label>
        <Input type="month" value={mois} onChange={e => setMois(e.target.value)} className="mb-3" />
        <Button className="w-full gap-2 bg-secondary text-secondary-foreground" disabled={!can("permFinancier", "complet") || !mois || paie.isPending} onClick={() => paie.mutate()}>
          {paie.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Comptabiliser la paie
        </Button>
      </div>
    </div>
  );
};

// ── Grand livre ─────────────────────────────────────────────────────────────

const GrandLivre = () => {
  const { data: comptes } = useComptes();
  const [compte, setCompte] = useState("521100");
  const [from, setFrom] = useState(`${anneeCourante}-01-01`);
  const [to, setTo] = useState("");
  const qs = qsPeriode(from, to);
  const { data, isLoading, error } = useQuery({
    queryKey: ["compta-gl", compte, qs],
    queryFn: () => api.get<any>(`/api/compta/grand-livre/${compte}?${qs}`),
    enabled: !!compte,
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label className="text-[10px]">Compte</Label>
          <Select value={compte} onValueChange={setCompte}>
            <SelectTrigger className="h-9 w-80 bg-card"><SelectValue /></SelectTrigger>
            <SelectContent>{(comptes ?? []).map(c => <SelectItem key={c.id} value={c.numero}>{c.numero} — {c.libelle}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Periode from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} />
        <Button variant="outline" className="h-9 gap-1 text-xs ml-auto" onClick={() => downloadFile(`/api/compta/export/grand-livre?compte=${compte}&${qs}`, `grand-livre-${compte}.csv`).catch(erreur)}><Download className="w-3.5 h-3.5" /> Export</Button>
      </div>
      {isLoading ? <Chargement /> : error ? <p className="text-sm text-destructive">{(error as Error).message}</p> : data && (
        <div className="stat-card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground border-b border-border bg-muted/40">
              <th className="py-2 px-3">Date</th><th className="py-2 px-3">Écriture</th><th className="py-2 px-3">Libellé</th>
              <th className="py-2 px-3 text-right">Débit</th><th className="py-2 px-3 text-right">Crédit</th><th className="py-2 px-3 text-right">Solde</th>
            </tr></thead>
            <tbody>
              <tr className="border-b border-border/40 text-muted-foreground"><td colSpan={5} className="py-2 px-3 text-xs">Solde d'ouverture</td><td className="py-2 px-3 text-right font-mono">{n2(data.soldeOuverture)}</td></tr>
              {data.mouvements.map((m: any, i: number) => (
                <tr key={i} className="border-b border-border/40">
                  <td className="py-2 px-3 text-xs">{new Date(m.date).toLocaleDateString("fr-FR")}</td>
                  <td className="py-2 px-3 font-mono text-xs">{m.numero}{m.statut === "brouillon" && <span className="ml-1 text-amber-600">(b)</span>}</td>
                  <td className="py-2 px-3">{m.libelle}{m.tiers ? <span className="text-xs text-muted-foreground"> · {m.tiers}</span> : ""}</td>
                  <td className="py-2 px-3 text-right font-mono">{m.debit ? n2(m.debit) : ""}</td>
                  <td className="py-2 px-3 text-right font-mono">{m.credit ? n2(m.credit) : ""}</td>
                  <td className="py-2 px-3 text-right font-mono">{n2(m.solde)}</td>
                </tr>
              ))}
              <tr className="font-semibold bg-muted/30">
                <td colSpan={3} className="py-2 px-3">Totaux et solde final</td>
                <td className="py-2 px-3 text-right font-mono">{n2(data.totalDebit)}</td>
                <td className="py-2 px-3 text-right font-mono">{n2(data.totalCredit)}</td>
                <td className="py-2 px-3 text-right font-mono">{n2(data.soldeFinal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ── Balance ─────────────────────────────────────────────────────────────────

const Balance = () => {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [validees, setValidees] = useState(false);
  const qs = `${qsPeriode(from, to)}${validees ? "&validees=true" : ""}`;
  const { data, isLoading } = useQuery({ queryKey: ["compta-balance", qs], queryFn: () => api.get<any>(`/api/compta/balance?${qs}`) });
  const parClasse = useMemo(() => {
    const g: Record<number, any[]> = {};
    (data?.lignes ?? []).forEach((l: any) => { (g[l.classe] ??= []).push(l); });
    return g;
  }, [data]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Periode from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} />
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={validees} onCheckedChange={c => setValidees(!!c)} /> Écritures validées uniquement</label>
        <Button variant="outline" className="h-9 gap-1 text-xs ml-auto" onClick={() => downloadFile(`/api/compta/export/balance?${qs}`, "balance.csv").catch(erreur)}><Download className="w-3.5 h-3.5" /> Export</Button>
      </div>
      {isLoading || !data ? <Chargement /> : (
        <div className="stat-card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground border-b border-border bg-muted/40">
              <th className="py-2 px-3">Compte</th><th className="py-2 px-3">Libellé</th><th className="py-2 px-3 text-right">Débit</th>
              <th className="py-2 px-3 text-right">Crédit</th><th className="py-2 px-3 text-right">Solde débiteur</th><th className="py-2 px-3 text-right">Solde créditeur</th>
            </tr></thead>
            <tbody>
              {Object.entries(parClasse).map(([classe, lignes]) => (
                <Fragment key={classe}>
                  <tr className="bg-muted/20"><td colSpan={6} className="py-1.5 px-3 text-xs font-semibold">Classe {classe}</td></tr>
                  {lignes.map((l: any) => (
                    <tr key={l.compteId} className="border-b border-border/30">
                      <td className="py-1.5 px-3 font-mono text-xs">{l.numero}</td><td className="py-1.5 px-3">{l.libelle}</td>
                      <td className="py-1.5 px-3 text-right font-mono">{n2(l.debit)}</td><td className="py-1.5 px-3 text-right font-mono">{n2(l.credit)}</td>
                      <td className="py-1.5 px-3 text-right font-mono">{l.soldeDebiteur ? n2(l.soldeDebiteur) : ""}</td><td className="py-1.5 px-3 text-right font-mono">{l.soldeCrediteur ? n2(l.soldeCrediteur) : ""}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              <tr className="font-semibold bg-muted/40">
                <td colSpan={2} className="py-2 px-3">Totaux {data.equilibree ? "✓ balance équilibrée" : "⚠ déséquilibre"}</td>
                <td className="py-2 px-3 text-right font-mono">{n2(data.totaux.debit)}</td><td className="py-2 px-3 text-right font-mono">{n2(data.totaux.credit)}</td>
                <td className="py-2 px-3 text-right font-mono">{n2(data.totaux.soldeDebiteur)}</td><td className="py-2 px-3 text-right font-mono">{n2(data.totaux.soldeCrediteur)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ── États financiers ────────────────────────────────────────────────────────

const Etats = () => {
  const [date, setDate] = useState("");
  const [from, setFrom] = useState(`${anneeCourante}-01-01`);
  const [to, setTo] = useState("");
  const { data: bilan, isLoading: lb } = useQuery({ queryKey: ["compta-bilan", date], queryFn: () => api.get<any>(`/api/compta/bilan${date ? `?to=${isoFin(date)}` : ""}`) });
  const { data: res, isLoading: lr } = useQuery({ queryKey: ["compta-resultat", from, to], queryFn: () => api.get<any>(`/api/compta/resultat?${qsPeriode(from, to)}`) });
  const Colonne = ({ titre, lignes, total, extra }: { titre: string; lignes: any[]; total: number; extra?: React.ReactNode }) => {
    const rubriques = [...new Set(lignes.map(l => l.rubrique))];
    return (
      <div className="stat-card">
        <h4 className="font-display font-semibold mb-2">{titre}</h4>
        {rubriques.map(r => (
          <div key={r} className="mb-2">
            <p className="text-[11px] font-semibold uppercase text-muted-foreground">{r}</p>
            {lignes.filter(l => l.rubrique === r).map(l => (
              <div key={l.numero} className="flex justify-between text-sm py-1 border-b border-border/30"><span>{l.numero} {l.libelle}</span><span className="font-mono">{n2(l.montant)}</span></div>
            ))}
          </div>
        ))}
        {extra}
        <div className="flex justify-between font-semibold pt-2"><span>Total</span><span className="font-mono">{n2(total)}</span></div>
      </div>
    );
  };
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="flex items-end gap-3 flex-wrap">
          <h3 className="font-display font-semibold text-lg mr-auto">Bilan</h3>
          <div className="space-y-1"><Label className="text-[10px]">Arrêté au</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9 w-44 bg-card" /></div>
        </div>
        {lb || !bilan ? <Chargement /> : (
          <>
            <div className={`text-sm rounded-xl px-3 py-2 ${bilan.equilibre ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
              {bilan.equilibre ? "Bilan équilibré" : "Bilan déséquilibré"} — Actif {fcfa(bilan.totalActif)} / Passif {fcfa(bilan.totalPassif)}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Colonne titre="Actif" lignes={bilan.actif} total={bilan.totalActif} />
              <Colonne titre="Passif" lignes={bilan.passif} total={bilan.totalPassif} extra={
                <div className="flex justify-between text-sm py-1 border-b border-border/30 font-medium"><span>Résultat (non affecté)</span><span className="font-mono">{n2(bilan.resultat)}</span></div>
              } />
            </div>
          </>
        )}
      </div>
      <div className="space-y-3">
        <div className="flex items-end gap-3 flex-wrap">
          <h3 className="font-display font-semibold text-lg mr-auto">Compte de résultat</h3>
          <Periode from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} />
        </div>
        {lr || !res ? <Chargement /> : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="stat-card">
              <h4 className="font-display font-semibold mb-2">Charges</h4>
              {res.charges.map((c: any) => <div key={c.numero} className="flex justify-between text-sm py-1 border-b border-border/30"><span>{c.numero} {c.libelle}</span><span className="font-mono">{n2(c.montant)}</span></div>)}
              <div className="flex justify-between font-semibold pt-2"><span>Total charges</span><span className="font-mono">{n2(res.totalCharges)}</span></div>
            </div>
            <div className="stat-card">
              <h4 className="font-display font-semibold mb-2">Produits</h4>
              {res.produits.map((p: any) => <div key={p.numero} className="flex justify-between text-sm py-1 border-b border-border/30"><span>{p.numero} {p.libelle}</span><span className="font-mono">{n2(p.montant)}</span></div>)}
              <div className="flex justify-between font-semibold pt-2"><span>Total produits</span><span className="font-mono">{n2(res.totalProduits)}</span></div>
            </div>
            <div className={`stat-card flex flex-col justify-center items-center text-center ${res.resultat >= 0 ? "bg-success/5" : "bg-destructive/5"}`}>
              <p className="text-sm text-muted-foreground">{res.resultat >= 0 ? "Bénéfice" : "Perte"} de la période</p>
              <p className={`text-3xl font-display font-bold ${res.resultat >= 0 ? "text-success" : "text-destructive"}`}>{fcfa(res.resultat)}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Trésorerie ──────────────────────────────────────────────────────────────

const Tresorerie = () => {
  const [annee, setAnnee] = useState(anneeCourante);
  const { data, isLoading } = useQuery({ queryKey: ["compta-treso", annee], queryFn: () => api.get<any>(`/api/compta/tresorerie?annee=${annee}`) });
  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <div className="space-y-1"><Label className="text-[10px]">Année</Label><Input type="number" value={annee} onChange={e => setAnnee(Number(e.target.value))} className="h-9 w-28 bg-card" /></div>
      </div>
      {isLoading || !data ? <Chargement /> : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="stat-card lg:col-span-2 p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground border-b border-border bg-muted/40">
                <th className="py-2 px-3">Mois</th><th className="py-2 px-3 text-right">Encaissements</th><th className="py-2 px-3 text-right">Décaissements</th><th className="py-2 px-3 text-right">Solde cumulé</th>
              </tr></thead>
              <tbody>
                {data.mois.map((m: any) => (
                  <tr key={m.mois} className="border-b border-border/30">
                    <td className="py-1.5 px-3">{MOIS[m.mois - 1]}</td>
                    <td className="py-1.5 px-3 text-right font-mono text-success">{n2(m.encaissements)}</td>
                    <td className="py-1.5 px-3 text-right font-mono text-destructive">{n2(m.decaissements)}</td>
                    <td className={`py-1.5 px-3 text-right font-mono ${m.solde < 0 ? "text-destructive" : ""}`}>{n2(m.solde)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="stat-card">
            <h4 className="font-display font-semibold mb-2">Soldes actuels</h4>
            {data.comptes.map((c: any) => <div key={c.numero} className="flex justify-between text-sm py-1.5 border-b border-border/30"><span>{c.numero} {c.libelle}</span><span className="font-mono">{n2(c.solde)}</span></div>)}
            <div className="flex justify-between font-semibold pt-2"><span>Total</span><span className="font-mono">{n2(data.soldeTotal)}</span></div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Créances ────────────────────────────────────────────────────────────────

const Creances = () => {
  const { data, isLoading } = useQuery({ queryKey: ["compta-creances"], queryFn: () => api.get<any>("/api/compta/creances") });
  if (isLoading || !data) return <Chargement />;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="stat-card"><div className="text-lg font-display font-bold">{fcfa(data.total)}</div><div className="text-xs text-muted-foreground">Total à encaisser</div></div>
        {Object.entries(data.tranches).map(([t, v]) => (
          <div key={t} className="stat-card"><div className={`text-lg font-display font-bold ${t === "+90" ? "text-destructive" : ""}`}>{fcfa(v as number)}</div><div className="text-xs text-muted-foreground">{t} jours</div></div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="stat-card">
          <h4 className="font-display font-semibold mb-2">Par client</h4>
          {data.parClient.map((c: any) => (
            <div key={c.client} className="flex justify-between text-sm py-1.5 border-b border-border/30"><span>{c.client} <span className="text-xs text-muted-foreground">({c.factures} fact.)</span></span><span className="font-mono">{fcfa(c.total)}</span></div>
          ))}
          {data.parClient.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Aucune créance</p>}
        </div>
        <div className="stat-card">
          <h4 className="font-display font-semibold mb-2">Factures non réglées</h4>
          <div className="max-h-96 overflow-y-auto">
            {data.factures.map((f: any) => (
              <div key={f.id} className="flex justify-between text-sm py-1.5 border-b border-border/30">
                <span>{f.numero} · {f.dossier.client}<span className={`ml-1 text-xs ${f.age > 90 ? "text-destructive" : "text-muted-foreground"}`}>({f.age} j)</span></span>
                <span className="font-mono">{fcfa(f.montant)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Plan comptable & exercices ──────────────────────────────────────────────

const Referentiel = () => {
  const qc = useQueryClient();
  const { can, user } = useAuth();
  const direction = can("permFinancier", "complet");
  const { data: comptes, isLoading } = useComptes();
  const { data: exercices } = useQuery({ queryKey: ["compta-exercices"], queryFn: () => api.get<any[]>("/api/compta/exercices") });
  const [nouveau, setNouveau] = useState({ numero: "", libelle: "", type: "charge" });
  const [classe, setClasse] = useState("toutes");
  const creer = useMutation({
    mutationFn: () => api.post("/api/compta/comptes", nouveau),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["compta-comptes"] }); setNouveau({ numero: "", libelle: "", type: "charge" }); toast({ title: "Compte créé" }); },
    onError: erreur,
  });
  const basculer = useMutation({
    mutationFn: (c: any) => api.patch(`/api/compta/comptes/${c.id}`, { actif: !c.actif }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["compta-comptes"] }),
    onError: erreur,
  });
  const exo = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "cloturer" | "rouvrir" }) => api.post(`/api/compta/exercices/${id}/${action}`),
    onSuccess: (_r, v) => { qc.invalidateQueries({ queryKey: ["compta-exercices"] }); toast({ title: v.action === "cloturer" ? "Exercice clôturé" : "Exercice rouvert" }); },
    onError: erreur,
  });
  if (isLoading) return <Chargement />;
  const liste = (comptes ?? []).filter(c => classe === "toutes" || String(c.classe) === classe);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="stat-card lg:col-span-2">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-display font-semibold">Plan comptable SYSCOHADA</h4>
          <Select value={classe} onValueChange={setClasse}>
            <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="toutes">Toutes classes</SelectItem>{[1, 2, 3, 4, 5, 6, 7, 8, 9].map(c => <SelectItem key={c} value={String(c)}>Classe {c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {direction && (
          <div className="flex gap-2 mb-3 flex-wrap">
            <Input placeholder="N° (ex : 605300)" value={nouveau.numero} onChange={e => setNouveau({ ...nouveau, numero: e.target.value.trim() })} className="h-9 w-36 font-mono" />
            <Input placeholder="Libellé" value={nouveau.libelle} onChange={e => setNouveau({ ...nouveau, libelle: e.target.value })} className="h-9 flex-1 min-w-[180px]" />
            <Select value={nouveau.type} onValueChange={v => setNouveau({ ...nouveau, type: v })}>
              <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
              <SelectContent>{["actif", "passif", "charge", "produit", "mixte"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
            <Button className="h-9 gap-1 bg-secondary text-secondary-foreground" disabled={!nouveau.numero || nouveau.libelle.length < 2 || creer.isPending} onClick={() => creer.mutate()}><Plus className="w-3.5 h-3.5" /> Ajouter</Button>
          </div>
        )}
        <div className="max-h-[520px] overflow-y-auto">
          {liste.map(c => (
            <div key={c.id} className={`flex items-center gap-3 text-sm py-1.5 border-b border-border/30 ${c.actif ? "" : "opacity-50"}`}>
              <span className="font-mono w-20">{c.numero}</span><span className="flex-1">{c.libelle}</span>
              <span className="text-[11px] text-muted-foreground w-16">{c.type}</span>
              {direction && <Switch checked={c.actif} onCheckedChange={() => basculer.mutate(c)} />}
            </div>
          ))}
        </div>
      </div>
      <div className="stat-card">
        <h4 className="font-display font-semibold mb-3">Exercices comptables</h4>
        {(exercices ?? []).map(e => (
          <div key={e.id} className="p-3 rounded-xl border border-border/60 mb-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold">Exercice {e.code}</span>
              <span className={`status-badge ${e.statut === "ouvert" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>{e.statut}</span>
            </div>
            <p className="text-xs text-muted-foreground">{e._count?.ecritures ?? 0} écritures{e.resultat !== null && e.resultat !== undefined ? ` · résultat ${fcfa(e.resultat)}` : ""}</p>
            {direction && e.statut === "ouvert" && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 mt-2" disabled={exo.isPending} onClick={() => confirm(`Clôturer l'exercice ${e.code} ? Plus aucune écriture ne pourra y être saisie.`) && exo.mutate({ id: e.id, action: "cloturer" })}>
                <Lock className="w-3 h-3" /> Clôturer
              </Button>
            )}
            {user?.profil === "dg" && e.statut === "cloture" && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 mt-2" disabled={exo.isPending} onClick={() => exo.mutate({ id: e.id, action: "rouvrir" })}>
                <Unlock className="w-3 h-3" /> Rouvrir
              </Button>
            )}
          </div>
        ))}
        {(exercices ?? []).length === 0 && <p className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> L'exercice est créé automatiquement à la première écriture.</p>}
      </div>
    </div>
  );
};

const ComptabiliteAvancee = () => {
  const [params, setParams] = useSearchParams();
  const onglet = params.get("onglet") ?? "tableau";
  const goTo = (o: string) => setParams({ onglet: o });
  return (
    <AppLayout title="Comptabilité avancée" subtitle="Comptabilité générale SYSCOHADA — partie double, états financiers et automatisation">
      <Tabs value={onglet} onValueChange={goTo}>
        <TabsList className="mb-5 flex-wrap h-auto">
          <TabsTrigger value="tableau" className="gap-1.5"><LayoutDashboard className="w-3.5 h-3.5" /> Tableau de bord</TabsTrigger>
          <TabsTrigger value="ecritures" className="gap-1.5"><BookOpen className="w-3.5 h-3.5" /> Écritures</TabsTrigger>
          <TabsTrigger value="automatisation" className="gap-1.5"><Zap className="w-3.5 h-3.5" /> Automatisation & paie</TabsTrigger>
          <TabsTrigger value="grand-livre" className="gap-1.5"><Library className="w-3.5 h-3.5" /> Grand livre</TabsTrigger>
          <TabsTrigger value="balance" className="gap-1.5"><Scale className="w-3.5 h-3.5" /> Balance</TabsTrigger>
          <TabsTrigger value="etats" className="gap-1.5"><FileBarChart className="w-3.5 h-3.5" /> Bilan & résultat</TabsTrigger>
          <TabsTrigger value="tresorerie" className="gap-1.5"><Landmark className="w-3.5 h-3.5" /> Trésorerie</TabsTrigger>
          <TabsTrigger value="creances" className="gap-1.5"><HandCoins className="w-3.5 h-3.5" /> Créances</TabsTrigger>
          <TabsTrigger value="referentiel" className="gap-1.5"><ListTree className="w-3.5 h-3.5" /> Plan & exercices</TabsTrigger>
        </TabsList>
        <TabsContent value="tableau"><Dashboard goTo={goTo} /></TabsContent>
        <TabsContent value="ecritures"><Ecritures /></TabsContent>
        <TabsContent value="automatisation"><Automatisation /></TabsContent>
        <TabsContent value="grand-livre"><GrandLivre /></TabsContent>
        <TabsContent value="balance"><Balance /></TabsContent>
        <TabsContent value="etats"><Etats /></TabsContent>
        <TabsContent value="tresorerie"><Tresorerie /></TabsContent>
        <TabsContent value="creances"><Creances /></TabsContent>
        <TabsContent value="referentiel"><Referentiel /></TabsContent>
      </Tabs>
    </AppLayout>
  );
};

export default ComptabiliteAvancee;
