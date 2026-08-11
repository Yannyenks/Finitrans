import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { api, getStoredUser } from "@/lib/api";
import { motion } from "framer-motion";
import {
  BookOpen, TrendingUp, TrendingDown, DollarSign,
  FileText, BarChart3, Scale, Receipt, Loader2,
  CheckCircle, AlertTriangle, Download, Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const Comptabilite = () => {
  const user    = getStoredUser();
  const [year]  = useState(new Date().getFullYear());

  const { data: financeStats, isLoading } = useQuery({
    queryKey: ["finance-stats-compta"],
    queryFn:  () => api.get<any>("/api/finance/stats"),
  });
  const { data: douaneData } = useQuery({
    queryKey: ["paiements-douane-compta"],
    queryFn:  () => api.get<any>("/api/finance/paiements-douane?limit=200"),
    staleTime: 60_000,
  });
  const { data: cieData } = useQuery({
    queryKey: ["paiements-cie-compta"],
    queryFn:  () => api.get<any>("/api/finance/paiements-compagnie?limit=200"),
    staleTime: 60_000,
  });
  const { data: virtsData } = useQuery({
    queryKey: ["virements-compta"],
    queryFn:  () => api.get<any>("/api/finance/virements?limit=200"),
    staleTime: 60_000,
  });
  const { data: diStats } = useQuery({
    queryKey: ["di-stats-compta"],
    queryFn:  () => api.get<any>("/api/di/stats/resume"),
    staleTime: 60_000,
  });
  const { data: dossiersData } = useQuery({
    queryKey: ["dossiers-compta"],
    queryFn:  () => api.get<any>("/api/dossiers?limit=200"),
    staleTime: 60_000,
  });

  const douaneList  = douaneData?.data  ?? [];
  const cieList     = cieData?.data     ?? [];
  const virtsList   = virtsData?.data   ?? [];
  const dossiers    = dossiersData?.data ?? [];

  // ── Agrégats ──────────────────────────────────────────────────────────────
  const totalDouanePaye   = douaneList.filter((p: any) => p.statut === "paye").reduce((s: number, p: any) => s + Number(p.montant), 0);
  const totalDouaneAttente = douaneList.filter((p: any) => p.statut !== "paye").reduce((s: number, p: any) => s + Number(p.montant), 0);
  const totalCiePaye      = cieList.filter((p: any) => p.statut === "paye").reduce((s: number, p: any) => s + Number(p.montant), 0);
  const totalVirements    = virtsList.filter((v: any) => v.statut === "effectue").reduce((s: number, v: any) => s + Number(v.montant), 0);
  const totalCharges      = totalDouanePaye + totalCiePaye + totalVirements;
  const dossiersClotures  = dossiers.filter((d: any) => d.status === "cloture").length;
  const tvaRate           = 0.1925;
  const totalTVA          = totalDouanePaye * tvaRate;

  // ── Chart data ─────────────────────────────────────────────────────────────
  const compagnies = ["MSC", "COSCO", "MAERSK", "CMA_CGM"];
  const chartData  = compagnies.map(c => ({
    name:    c.replace("_", "-"),
    douane:  douaneList.filter((p: any) => p.dossier?.compagnie === c || p.compagnie === c).reduce((s: number, p: any) => s + Number(p.montant), 0),
    cie:     cieList.filter((p: any) => p.compagnie === c).reduce((s: number, p: any) => s + Number(p.montant), 0),
  }));

  const pieData = [
    { name: "Droits de douane", value: totalDouanePaye,  color: "#F07B37" },
    { name: "Frais Compagnies", value: totalCiePaye,     color: "#1A9AD6" },
    { name: "Virements",        value: totalVirements,   color: "#22c55e" },
  ].filter(d => d.value > 0);

  // ── Journal comptable simplifié ────────────────────────────────────────────
  const journalEntries = [
    ...douaneList.map((p: any) => ({
      id: p.id, date: p.datePaiement, ref: p.reference,
      libelle: `Droits de douane — ${p.dossier?.numero ?? "—"}`,
      debit: Number(p.montant), credit: 0, compte: "4411",
    })),
    ...cieList.map((p: any) => ({
      id: p.id, date: p.datePaiement, ref: p.reference,
      libelle: `Frais compagnie ${p.compagnie?.replace("_","-")} — ${p.dossier?.numero ?? "—"}`,
      debit: Number(p.montant), credit: 0, compte: "6024",
    })),
    ...virtsList.map((v: any) => ({
      id: v.id, date: v.dateVirement, ref: v.reference,
      libelle: `Virement — ${v.beneficiaire ?? v.dossier?.client ?? "—"}`,
      debit: Number(v.montant), credit: 0, compte: "5211",
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalDebit  = journalEntries.reduce((s, e) => s + e.debit, 0);

  if (isLoading) {
    return (
      <AppLayout title="Comptabilité" subtitle="Module comptable OHADA">
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-secondary" /></div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="Comptabilité"
      subtitle={`${user?.nom ?? ""} — Gestion financière OHADA — Exercice ${year}`}
    >
      {/* ── KPIs ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total charges",     value: totalCharges,       color: "text-destructive", icon: TrendingDown,  fmt: true },
          { label: "Droits douane payés",value: totalDouanePaye,   color: "text-warning",     icon: Receipt,       fmt: true },
          { label: "TVA estimée (19.25%)",value: totalTVA,         color: "text-foreground",  icon: Scale,         fmt: true },
          { label: "Dossiers clôturés",  value: dossiersClotures,  color: "text-success",     icon: CheckCircle,   fmt: false },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }} className="stat-card">
            <s.icon className={`w-5 h-5 ${s.color} mb-2`} />
            <div className={`text-lg font-display font-black ${s.color}`}>
              {s.fmt ? `${(s.value / 1_000_000).toFixed(2)}M` : s.value}
              {s.fmt && <span className="text-xs font-normal text-muted-foreground ml-1">FCFA</span>}
            </div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </motion.div>
        ))}
      </div>

      {/* ── DI enveloppes résumé ─────────────────────────────────── */}
      {diStats && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="stat-card mb-6 grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Enveloppes DI totales</p>
            <p className="text-xl font-display font-black text-foreground">
              {((diStats.totalMontant ?? 0) / 1_000_000).toFixed(2)}M
              <span className="text-xs font-normal text-muted-foreground ml-1">FCFA</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Solde DI restant</p>
            <p className="text-xl font-display font-black text-success">
              {((diStats.totalSolde ?? 0) / 1_000_000).toFixed(2)}M
              <span className="text-xs font-normal text-muted-foreground ml-1">FCFA</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">DI en alerte</p>
            <p className={`text-xl font-display font-black ${(diStats.diEnAlerte ?? 0) > 0 ? "text-warning" : "text-success"}`}>
              {diStats.diEnAlerte ?? 0}
              {(diStats.diEnAlerte ?? 0) > 0 && <AlertTriangle className="inline w-4 h-4 ml-1" />}
            </p>
          </div>
        </motion.div>
      )}

      <Tabs defaultValue="journal">
        <TabsList className="mb-4">
          <TabsTrigger value="journal"    className="gap-1.5"><BookOpen    className="w-3.5 h-3.5" /> Journal ({journalEntries.length})</TabsTrigger>
          <TabsTrigger value="bilan"      className="gap-1.5"><Scale       className="w-3.5 h-3.5" /> Bilan simplifié</TabsTrigger>
          <TabsTrigger value="analyse"    className="gap-1.5"><BarChart3   className="w-3.5 h-3.5" /> Analyse</TabsTrigger>
          <TabsTrigger value="fiscal"     className="gap-1.5"><FileText    className="w-3.5 h-3.5" /> Déclarations fiscales</TabsTrigger>
        </TabsList>

        {/* ── Journal comptable ──────────────────────────────────── */}
        <TabsContent value="journal">
          <div className="stat-card overflow-hidden p-0">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-secondary" />
                Journal des opérations — {year}
              </h3>
              <Button variant="outline" size="sm" className="gap-1.5"
                onClick={() => toast({ title: "Export en cours...", description: "Journal comptable au format Excel" })}>
                <Download className="w-3.5 h-3.5" /> Export Excel
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">N° Compte</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Référence</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Libellé</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Débit</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Crédit</th>
                  </tr>
                </thead>
                <tbody>
                  {journalEntries.slice(0, 100).map((e, i) => (
                    <motion.tr key={e.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.01 }}
                      className="border-b border-border/50 hover:bg-muted/20">
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(e.date).toLocaleDateString("fr-FR")}
                      </td>
                      <td className="px-4 py-2.5 text-xs font-mono text-foreground">{e.compte}</td>
                      <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{e.ref ?? "—"}</td>
                      <td className="px-4 py-2.5 text-sm text-foreground max-w-xs truncate">{e.libelle}</td>
                      <td className="px-4 py-2.5 text-sm text-right font-mono font-medium text-destructive">
                        {e.debit > 0 ? e.debit.toLocaleString("fr-FR") : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-right font-mono font-medium text-success">
                        {e.credit > 0 ? e.credit.toLocaleString("fr-FR") : "—"}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/50">
                    <td colSpan={4} className="px-4 py-3 text-sm font-display font-bold text-foreground">TOTAUX</td>
                    <td className="px-4 py-3 text-sm text-right font-display font-black text-destructive">
                      {totalDebit.toLocaleString("fr-FR")}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-display font-black text-success">0</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* ── Bilan simplifié OHADA ──────────────────────────────── */}
        <TabsContent value="bilan">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ACTIF */}
            <div className="stat-card">
              <h3 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-success" /> ACTIF
              </h3>
              <div className="space-y-2">
                {[
                  { compte: "52", libelle: "Banques et établissements financiers", montant: totalVirements },
                  { compte: "411", libelle: "Clients (créances sur dossiers clôturés)", montant: dossiersClotures * 500_000 },
                  { compte: "4711", libelle: "Avances et acomptes versés", montant: totalDouaneAttente },
                ].map(l => (
                  <div key={l.compte} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40">
                    <div>
                      <span className="text-xs font-mono text-muted-foreground mr-2">{l.compte}</span>
                      <span className="text-sm text-foreground">{l.libelle}</span>
                    </div>
                    <span className="text-sm font-display font-bold text-success">
                      {l.montant.toLocaleString("fr-FR")} FCFA
                    </span>
                  </div>
                ))}
                <div className="flex justify-between p-3 rounded-xl bg-success/10 border border-success/20 mt-2">
                  <span className="font-display font-bold text-foreground">TOTAL ACTIF</span>
                  <span className="font-display font-black text-success">
                    {(totalVirements + dossiersClotures * 500_000 + totalDouaneAttente).toLocaleString("fr-FR")} FCFA
                  </span>
                </div>
              </div>
            </div>

            {/* PASSIF */}
            <div className="stat-card">
              <h3 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-destructive" /> PASSIF / CHARGES
              </h3>
              <div className="space-y-2">
                {[
                  { compte: "6011", libelle: "Achats de marchandises — droits de douane", montant: totalDouanePaye },
                  { compte: "6024", libelle: "Frais de transit et manutention", montant: totalCiePaye },
                  { compte: "4431", libelle: "TVA collectée (19.25%)", montant: totalTVA },
                ].map(l => (
                  <div key={l.compte} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40">
                    <div>
                      <span className="text-xs font-mono text-muted-foreground mr-2">{l.compte}</span>
                      <span className="text-sm text-foreground">{l.libelle}</span>
                    </div>
                    <span className="text-sm font-display font-bold text-destructive">
                      {l.montant.toLocaleString("fr-FR")} FCFA
                    </span>
                  </div>
                ))}
                <div className="flex justify-between p-3 rounded-xl bg-destructive/10 border border-destructive/20 mt-2">
                  <span className="font-display font-bold text-foreground">TOTAL CHARGES</span>
                  <span className="font-display font-black text-destructive">
                    {totalCharges.toLocaleString("fr-FR")} FCFA
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Résultat */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="mt-4 stat-card border-secondary/20 bg-secondary/5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display font-semibold text-foreground">Résultat de l'exercice {year}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Conformité OHADA — SYSCOHADA révisé</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-display font-black text-secondary">
                  {(totalVirements - totalCharges).toLocaleString("fr-FR")} FCFA
                </p>
                <p className="text-xs text-muted-foreground">Résultat net estimé</p>
              </div>
            </div>
          </motion.div>
        </TabsContent>

        {/* ── Analyse graphique ──────────────────────────────────── */}
        <TabsContent value="analyse">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="stat-card">
              <h3 className="font-display font-semibold text-foreground mb-1">Charges par compagnie</h3>
              <p className="text-xs text-muted-foreground mb-4">Douane + frais portuaires</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1_000_000).toFixed(1)}M`} />
                  <Tooltip formatter={(v: number) => [`${v.toLocaleString("fr-FR")} FCFA`]}
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                  <Bar dataKey="douane" fill="hsl(var(--secondary))" radius={[4,4,0,0]} name="Douane" />
                  <Bar dataKey="cie"    fill="hsl(var(--accent))"     radius={[4,4,0,0]} name="Compagnie" />
                </BarChart>
              </ResponsiveContainer>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="stat-card">
              <h3 className="font-display font-semibold text-foreground mb-1">Répartition des charges</h3>
              <p className="text-xs text-muted-foreground mb-4">Structure des coûts opérationnels</p>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={4} strokeWidth={0}>
                    {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => [`${v.toLocaleString("fr-FR")} FCFA`]}
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-1 gap-1.5 mt-2">
                {pieData.map(d => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                      <span className="text-muted-foreground">{d.name}</span>
                    </div>
                    <span className="font-bold text-foreground">{d.value.toLocaleString("fr-FR")} FCFA</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </TabsContent>

        {/* ── Déclarations fiscales ──────────────────────────────── */}
        <TabsContent value="fiscal">
          <div className="space-y-4 max-w-2xl">
            {[
              {
                titre: "Déclaration TVA — Mensuelle",
                statut: "À soumettre",
                echeance: `${new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}`,
                montant: totalTVA,
                urgent: true,
              },
              {
                titre: "Déclaration IS — Impôt sur les Sociétés",
                statut: "En cours",
                echeance: "31/03/2026",
                montant: 0,
                urgent: false,
              },
              {
                titre: "Déclaration CNPS — Cotisations sociales",
                statut: "Conforme",
                echeance: "15 du mois",
                montant: 0,
                urgent: false,
              },
              {
                titre: "DSF — Déclaration Statistique et Fiscale",
                statut: "À préparer",
                echeance: `31/03/${year + 1}`,
                montant: 0,
                urgent: false,
              },
            ].map((d, i) => (
              <motion.div key={d.titre} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
                className={`stat-card flex items-center justify-between ${d.urgent ? "border-warning/30 bg-warning/5" : ""}`}>
                <div className="flex items-start gap-3">
                  {d.urgent
                    ? <AlertTriangle className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" />
                    : <CheckCircle className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                  }
                  <div>
                    <p className="text-sm font-semibold text-foreground">{d.titre}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Échéance : {d.echeance}</p>
                    {d.montant > 0 && (
                      <p className="text-xs font-semibold text-warning mt-0.5">
                        Montant estimé : {d.montant.toLocaleString("fr-FR")} FCFA
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`status-badge ${
                    d.statut === "Conforme"    ? "bg-green-100 text-green-700" :
                    d.statut === "À soumettre" ? "bg-amber-100 text-amber-700" :
                    "bg-blue-100 text-blue-700"
                  }`}>{d.statut}</span>
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7"
                    onClick={() => toast({ title: d.titre, description: "Génération du document en cours..." })}>
                    <Download className="w-3 h-3" /> Générer
                  </Button>
                </div>
              </motion.div>
            ))}

            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5" />
                <strong>OHADA :</strong> Système Comptable OHADA (SYSCOHADA révisé) — Plan comptable applicable au Cameroun
              </p>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
};

export default Comptabilite;
