import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Download, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, downloadFile } from "@/lib/api";
import { fcfa } from "@/lib/permissions";
import { toast } from "@/hooks/use-toast";

const CATEGORIES: Record<string, string> = {
  droits_douane: "Droits de douane", tva: "TVA", honoraires: "Honoraires", redevances: "Redevances",
  penalites: "Pénalités", frais_divers: "Frais divers", remboursement: "Remboursement", ouverture: "Ouverture DI",
};

/** Historique de tous les mouvements des DI (ouvertures, débits, recharges). */
export default function DIHistoriqueGlobal() {
  const navigate = useNavigate();
  const [f, setF] = useState({ q: "", type: "tous", categorie: "toutes", from: "", to: "", page: 1 });

  const qs = useMemo(() => {
    const p = new URLSearchParams({ page: String(f.page), limit: "50" });
    if (f.q.trim()) p.set("q", f.q.trim());
    if (f.type !== "tous") p.set("type", f.type);
    if (f.categorie !== "toutes") p.set("categorie", f.categorie);
    if (f.from) p.set("from", new Date(`${f.from}T00:00:00`).toISOString());
    if (f.to) p.set("to", new Date(`${f.to}T23:59:59`).toISOString());
    return p.toString();
  }, [f]);

  const { data, isLoading } = useQuery({
    queryKey: ["di-historique", qs],
    queryFn: () => api.get<any>(`/api/di/mouvements?${qs}`),
    placeholderData: prev => prev,
  });
  const mouvements: any[] = data?.data ?? [];
  const exporter = () => downloadFile(`/api/di/mouvements/export?${qs}`, `historique-di-${new Date().toISOString().slice(0, 10)}.csv`)
    .catch((e: Error) => toast({ title: "Export impossible", description: e.message, variant: "destructive" }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="DI, client, dossier, facture, motif…" value={f.q} onChange={e => setF({ ...f, q: e.target.value, page: 1 })} className="pl-9 bg-card" />
        </div>
        <Select value={f.type} onValueChange={v => setF({ ...f, type: v, page: 1 })}>
          <SelectTrigger className="w-36 bg-card"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="tous">Débits et crédits</SelectItem><SelectItem value="debit">Débits</SelectItem><SelectItem value="credit">Crédits</SelectItem></SelectContent>
        </Select>
        <Select value={f.categorie} onValueChange={v => setF({ ...f, categorie: v, page: 1 })}>
          <SelectTrigger className="w-44 bg-card"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="toutes">Toutes catégories</SelectItem>
            {Object.entries(CATEGORIES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="space-y-1"><Label className="text-[10px]">Du</Label><Input type="date" value={f.from} onChange={e => setF({ ...f, from: e.target.value, page: 1 })} className="h-10 w-40 bg-card" /></div>
        <div className="space-y-1"><Label className="text-[10px]">Au</Label><Input type="date" value={f.to} onChange={e => setF({ ...f, to: e.target.value, page: 1 })} className="h-10 w-40 bg-card" /></div>
        <Button variant="outline" className="gap-1.5 ml-auto" onClick={exporter}><Download className="w-4 h-4" /> Export Excel (CSV)</Button>
      </div>

      {data && (
        <div className="grid grid-cols-3 gap-3">
          <div className="stat-card py-3"><p className="text-xs text-muted-foreground">Mouvements</p><p className="text-lg font-display font-bold">{data.meta.total}</p></div>
          <div className="stat-card py-3"><p className="text-xs text-muted-foreground">Total crédits</p><p className="text-lg font-display font-bold text-success">{fcfa(data.totaux.credits)}</p></div>
          <div className="stat-card py-3"><p className="text-xs text-muted-foreground">Total débits</p><p className="text-lg font-display font-bold text-destructive">{fcfa(data.totaux.debits)}</p></div>
        </div>
      )}

      <div className="stat-card p-0 overflow-x-auto">
        {isLoading ? <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-secondary" /></div> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground border-b border-border bg-muted/40">
              <th className="py-2 px-3">Date</th><th className="py-2 px-3">DI</th><th className="py-2 px-3">Dossier</th><th className="py-2 px-3">Catégorie</th>
              <th className="py-2 px-3">Motif / facture</th><th className="py-2 px-3 text-right">Montant</th><th className="py-2 px-3">Saisi par</th>
            </tr></thead>
            <tbody>
              {mouvements.map(m => (
                <tr key={m.id} className="border-b border-border/40 hover:bg-muted/20">
                  <td className="py-2 px-3 text-xs whitespace-nowrap">{new Date(m.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td className="py-2 px-3"><span className="font-semibold">{m.di.numero}</span><div className="text-[11px] text-muted-foreground">{m.di.client}</div></td>
                  <td className="py-2 px-3">
                    {m.dossier ? <button className="text-secondary hover:underline text-xs" onClick={() => navigate(`/dossiers/${m.dossier.id}`)}>{m.dossier.numero}</button> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="py-2 px-3 text-xs">{CATEGORIES[m.categorie] ?? m.categorie ?? "—"}</td>
                  <td className="py-2 px-3 text-xs">{m.motif}{m.referenceFacture && <div className="font-mono text-muted-foreground">{m.referenceFacture}</div>}</td>
                  <td className={`py-2 px-3 text-right font-mono whitespace-nowrap ${m.type === "debit" ? "text-destructive" : "text-success"}`}>
                    <span className="inline-flex items-center gap-1">
                      {m.type === "debit" ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                      {m.type === "debit" ? "−" : "+"}{Number(m.montant).toLocaleString("fr-FR")}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-xs text-muted-foreground">{m.auteur?.nom}</td>
                </tr>
              ))}
              {mouvements.length === 0 && <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">Aucun mouvement</td></tr>}
            </tbody>
          </table>
        )}
        {(data?.meta?.totalPages ?? 1) > 1 && (
          <div className="flex justify-between items-center px-4 py-2 border-t border-border text-xs">
            <span>Page {f.page} / {data.meta.totalPages}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={f.page <= 1} onClick={() => setF({ ...f, page: f.page - 1 })}>Précédent</Button>
              <Button size="sm" variant="outline" disabled={f.page >= data.meta.totalPages} onClick={() => setF({ ...f, page: f.page + 1 })}>Suivant</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
