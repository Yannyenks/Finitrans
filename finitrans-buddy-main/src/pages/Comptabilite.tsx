import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { api, downloadFile } from "@/lib/api";
import { fcfa, useAuth } from "@/lib/permissions";
import {
  BookOpen, TrendingDown, FileText, BarChart3, Scale, Receipt, Loader2,
  CheckCircle, AlertTriangle, Download, ArrowRight, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const annee = new Date().getFullYear();
const debutMois = new Date(annee, new Date().getMonth(), 1);
const erreur = (e: any) => toast({ title: "Export impossible", description: e?.message, variant: "destructive" });

/** États issus de la comptabilité générale (module Comptabilité avancée). */
const EtatsComptables = () => {
  const navigate = useNavigate();
  const { data: bilan, isLoading } = useQuery({ queryKey: ["compta-bilan", ""], queryFn: () => api.get<any>("/api/compta/bilan") });
  const { data: res } = useQuery({
    queryKey: ["compta-resultat-annee"],
    queryFn: () => api.get<any>(`/api/compta/resultat?from=${new Date(annee, 0, 1).toISOString()}`),
  });
  if (isLoading || !bilan) return <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-secondary" /></div>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="stat-card"><p className="text-xs text-muted-foreground">Total actif</p><p className="text-xl font-display font-bold">{fcfa(bilan.totalActif)}</p></div>
        <div className="stat-card"><p className="text-xs text-muted-foreground">Total passif</p><p className="text-xl font-display font-bold">{fcfa(bilan.totalPassif)}</p></div>
        <div className="stat-card"><p className="text-xs text-muted-foreground">Résultat {annee}</p><p className={`text-xl font-display font-bold ${(res?.resultat ?? 0) >= 0 ? "text-success" : "text-destructive"}`}>{fcfa(res?.resultat ?? 0)}</p></div>
      </div>
      <p className={`text-sm rounded-xl px-3 py-2 ${bilan.equilibre ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
        {bilan.equilibre ? "Bilan équilibré (partie double SYSCOHADA)." : "Bilan déséquilibré — vérifiez les écritures."}
      </p>
      <Button className="gap-2 bg-secondary text-secondary-foreground" onClick={() => navigate("/comptabilite-avancee?onglet=etats")}>
        Bilan et compte de résultat détaillés <ArrowRight className="w-4 h-4" />
      </Button>
    </div>
  );
};

/** TVA du mois tirée du grand livre (4431 facturée − 4451 récupérable). */
const Fiscal = () => {
  const navigate = useNavigate();
  const { data: bal, isLoading } = useQuery({
    queryKey: ["compta-balance-mois"],
    queryFn: () => api.get<any>(`/api/compta/balance?from=${debutMois.toISOString()}`),
  });
  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-secondary" /></div>;
  const ligne = (n: string) => (bal?.lignes ?? []).find((l: any) => l.numero === n);
  const tvaFacturee = ligne("443100") ? ligne("443100").credit - ligne("443100").debit : 0;
  const tvaRecup = ligne("445100") ? ligne("445100").debit - ligne("445100").credit : 0;
  const tvaDue = tvaFacturee - tvaRecup;
  const exportBalance = () => downloadFile(`/api/compta/export/balance?from=${debutMois.toISOString()}`, `balance-${debutMois.toISOString().slice(0, 7)}.csv`).catch(erreur);
  return (
    <div className="space-y-4 max-w-2xl">
      <div className="stat-card">
        <h3 className="font-display font-semibold mb-3">TVA du mois en cours</h3>
        {[["TVA facturée (443100)", tvaFacturee], ["TVA récupérable (445100)", tvaRecup]].map(([l, v]) => (
          <div key={l as string} className="flex justify-between text-sm py-1.5 border-b border-border/40"><span>{l}</span><span className="font-mono">{fcfa(v as number)}</span></div>
        ))}
        <div className="flex justify-between font-semibold pt-2"><span>{tvaDue >= 0 ? "TVA à reverser" : "Crédit de TVA"}</span><span className="font-mono">{fcfa(Math.abs(tvaDue))}</span></div>
        <p className="text-xs text-muted-foreground mt-2">Calculée sur les écritures du mois (brouillons inclus). Échéance de déclaration : le 15 du mois suivant.</p>
        <div className="flex gap-2 mt-3">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={exportBalance}><Download className="w-3.5 h-3.5" /> Balance du mois (CSV)</Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate("/comptabilite-avancee?onglet=ecritures")}>Écritures <ArrowRight className="w-3.5 h-3.5" /></Button>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground flex items-center gap-1.5">
        <Scale className="w-3.5 h-3.5" /> SYSCOHADA révisé — plan comptable applicable au Cameroun.
      </div>
    </div>
  );
};

const Comptabilite = () => {
  const navigate = useNavigate();
  const { user, hasModule } = useAuth();
  const avancee = hasModule("comptabilite_avancee");

  const { data: douaneData, isLoading } = useQuery({ queryKey: ["paiements-douane-compta"], queryFn: () => api.get<any>("/api/finance/paiements-douane?limit=100") });
  const { data: cieData } = useQuery({ queryKey: ["paiements-cie-compta"], queryFn: () => api.get<any>("/api/finance/paiements-compagnie?limit=100") });
  const { data: virtsData } = useQuery({ queryKey: ["virements-compta"], queryFn: () => api.get<any>("/api/finance/virements?limit=100") });
  const { data: facturesData } = useQuery({ queryKey: ["factures-compta"], queryFn: () => api.get<any>("/api/finance/factures?limit=100") });
  const { data: diStats } = useQuery({ queryKey: ["di-stats-compta"], queryFn: () => api.get<any>("/api/di/stats/resume") });

  const douaneList: any[] = douaneData?.data ?? [];
  const cieList: any[] = cieData?.data ?? [];
  const virtsList: any[] = virtsData?.data ?? [];
  const factures: any[] = facturesData?.data ?? [];

  const somme = (l: any[], f: (x: any) => boolean) => l.filter(f).reduce((s, x) => s + Number(x.montant), 0);
  const douanePaye = somme(douaneList, p => p.statut === "paye");
  const douaneAttente = somme(douaneList, p => p.statut !== "paye");
  const ciePaye = somme(cieList, p => p.statut === "paye");
  const virementsEffectues = somme(virtsList, v => v.statut === "effectue");
  const facture = somme(factures, f => f.type !== "proforma");
  const encaisse = somme(factures, f => f.type === "reglee");

  const journal = useMemo(() => [
    ...douaneList.map(p => ({ id: `d-${p.id}`, date: p.datePaiement, ref: p.reference, libelle: `Douane (${p.type}) — ${p.dossier?.numero ?? "—"}`, nature: "Débours douane", montant: Number(p.montant), statut: p.statut })),
    ...cieList.map(p => ({ id: `c-${p.id}`, date: p.datePaiement, ref: p.reference, libelle: `${p.compagnie?.replace("_", "-")} (${p.type}) — ${p.dossier?.numero ?? "—"}`, nature: "Débours compagnie", montant: Number(p.montant), statut: p.statut })),
    ...virtsList.map(v => ({ id: `v-${v.id}`, date: v.dateVirement, ref: v.reference, libelle: `Virement → ${v.destination}${v.dossier ? ` — ${v.dossier.numero}` : ""}`, nature: "Virement", montant: Number(v.montant), statut: v.statut })),
    ...factures.map(f => ({ id: `f-${f.id}`, date: f.dateFacture, ref: f.numero, libelle: `Facture ${f.dossier?.client ?? ""} — ${f.dossier?.numero ?? ""}`, nature: "Facture client", montant: Number(f.montant), statut: f.type })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [douaneList, cieList, virtsList, factures]);

  const chartData = ["MSC", "COSCO", "MAERSK", "CMA_CGM"].map(c => ({
    name: c.replace("_", "-"),
    cie: somme(cieList, p => p.compagnie === c),
  }));
  const pieData = [
    { name: "Débours douane", value: douanePaye, color: "#F07B37" },
    { name: "Débours compagnies", value: ciePaye, color: "#1A9AD6" },
    { name: "Virements", value: virementsEffectues, color: "#22c55e" },
  ].filter(d => d.value > 0);

  const exportOhada = () =>
    downloadFile(`/api/exports/ohada?debut=${new Date(annee, 0, 1).toISOString()}`, `ohada-${annee}.csv`).catch(erreur);

  if (isLoading) {
    return <AppLayout title="Comptabilité"><div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-secondary" /></div></AppLayout>;
  }

  return (
    <AppLayout title="Comptabilité" subtitle={`${user?.nom ?? ""} — Suivi financier des opérations — Exercice ${annee}`}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Facturé (validé + réglé)", value: facture, color: "text-secondary", icon: FileText },
          { label: "Encaissé", value: encaisse, color: "text-success", icon: Wallet },
          { label: "Débours douane payés", value: douanePaye, color: "text-warning", icon: Receipt },
          { label: "Débours douane en attente", value: douaneAttente, color: "text-destructive", icon: TrendingDown },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <s.icon className={`w-5 h-5 ${s.color} mb-2`} />
            <div className={`text-lg font-display font-black ${s.color}`}>{fcfa(s.value)}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {diStats && (
        <div className="stat-card mb-6 grid grid-cols-3 gap-4">
          <div><p className="text-xs text-muted-foreground mb-1">Enveloppes DI actives</p><p className="text-xl font-display font-black">{fcfa(diStats.totalMontant)}</p></div>
          <div><p className="text-xs text-muted-foreground mb-1">Solde DI restant</p><p className="text-xl font-display font-black text-success">{fcfa(diStats.totalSolde)}</p></div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">DI en alerte</p>
            <p className={`text-xl font-display font-black ${(diStats.diEnAlerte ?? 0) > 0 ? "text-warning" : "text-success"}`}>
              {diStats.diEnAlerte ?? 0}{(diStats.diEnAlerte ?? 0) > 0 && <AlertTriangle className="inline w-4 h-4 ml-1" />}
            </p>
          </div>
        </div>
      )}

      <Tabs defaultValue="journal">
        <TabsList className="mb-4">
          <TabsTrigger value="journal" className="gap-1.5"><BookOpen className="w-3.5 h-3.5" /> Opérations ({journal.length})</TabsTrigger>
          <TabsTrigger value="analyse" className="gap-1.5"><BarChart3 className="w-3.5 h-3.5" /> Analyse</TabsTrigger>
          {avancee && <TabsTrigger value="etats" className="gap-1.5"><Scale className="w-3.5 h-3.5" /> Bilan & résultat</TabsTrigger>}
          {avancee && <TabsTrigger value="fiscal" className="gap-1.5"><FileText className="w-3.5 h-3.5" /> TVA</TabsTrigger>}
        </TabsList>

        <TabsContent value="journal">
          <div className="stat-card overflow-hidden p-0">
            <div className="flex items-center justify-between p-4 border-b border-border gap-2 flex-wrap">
              <h3 className="font-display font-semibold flex items-center gap-2"><BookOpen className="w-4 h-4 text-secondary" /> Opérations financières — {annee}</h3>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={exportOhada}><Download className="w-3.5 h-3.5" /> Export OHADA (CSV)</Button>
                {avancee && <Button size="sm" className="gap-1.5 bg-secondary text-secondary-foreground" onClick={() => navigate("/comptabilite-avancee?onglet=automatisation")}>Comptabiliser <ArrowRight className="w-3.5 h-3.5" /></Button>}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground uppercase">
                  <th className="px-4 py-3">Date</th><th className="px-4 py-3">Nature</th><th className="px-4 py-3">Référence</th><th className="px-4 py-3">Libellé</th><th className="px-4 py-3 text-right">Montant</th><th className="px-4 py-3">Statut</th>
                </tr></thead>
                <tbody>
                  {journal.slice(0, 150).map(e => (
                    <tr key={e.id} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{new Date(e.date).toLocaleDateString("fr-FR")}</td>
                      <td className="px-4 py-2.5 text-xs">{e.nature}</td>
                      <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{e.ref ?? "—"}</td>
                      <td className="px-4 py-2.5 max-w-xs truncate">{e.libelle}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{e.montant.toLocaleString("fr-FR")}</td>
                      <td className="px-4 py-2.5"><span className="status-badge bg-muted text-muted-foreground">{String(e.statut).replace("_", " ")}</span></td>
                    </tr>
                  ))}
                  {journal.length === 0 && <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">Aucune opération</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          {!avancee && (
            <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Les écritures comptables et états financiers sont gérés dans le module Comptabilité avancée (Direction / Comptable).</p>
          )}
        </TabsContent>

        <TabsContent value="analyse">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="stat-card">
              <h3 className="font-display font-semibold mb-4">Débours compagnies par armateur</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1_000_000).toFixed(1)}M`} />
                  <Tooltip formatter={(v: number) => [fcfa(v)]} />
                  <Bar dataKey="cie" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} name="Compagnie" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="stat-card">
              <h3 className="font-display font-semibold mb-4">Répartition des sorties de fonds</h3>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={4} strokeWidth={0}>
                    {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => [fcfa(v)]} />
                </PieChart>
              </ResponsiveContainer>
              {pieData.map(d => (
                <div key={d.name} className="flex items-center justify-between text-xs mt-1.5">
                  <span className="flex items-center gap-2 text-muted-foreground"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />{d.name}</span>
                  <span className="font-bold">{fcfa(d.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {avancee && <TabsContent value="etats"><EtatsComptables /></TabsContent>}
        {avancee && <TabsContent value="fiscal"><Fiscal /></TabsContent>}
      </Tabs>
    </AppLayout>
  );
};

export default Comptabilite;
