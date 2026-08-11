import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { DollarSign, RefreshCw, Ship, Landmark, AlertTriangle, Users, Loader2, Download, Banknote } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Progress } from "@/components/ui/progress";

const paiementDouaneLabel: Record<string, string> = { droits: "Droits", taxes: "Taxes", redevances: "Redevances", penalite: "Pénalité" };
const paiementCompagnieLabel: Record<string, string> = { surestaries: "Surestaries", frais_portuaires: "Frais portuaires", manutention: "Manutention", terminal: "Terminal" };
const statutColor: Record<string, string> = { paye: "bg-green-100 text-green-700", en_attente: "bg-amber-100 text-amber-700", en_retard: "bg-red-100 text-red-700" };
const statutLabel: Record<string, string> = { paye: "Payé", en_attente: "En attente", en_retard: "En retard" };

const Finance = () => {
  const { data: stats,  isLoading: statsLoading  } = useQuery({ queryKey: ["finance-stats"],   queryFn: () => api.get<any>("/api/finance/stats") });
  const { data: douane, isLoading: douaneLoading  } = useQuery({ queryKey: ["paiements-douane"],    queryFn: () => api.get<any>("/api/finance/paiements-douane?limit=100") });
  const { data: cie,    isLoading: cieLoading     } = useQuery({ queryKey: ["paiements-compagnie"], queryFn: () => api.get<any>("/api/finance/paiements-compagnie?limit=100") });
  const { data: virts,  isLoading: virtsLoading   } = useQuery({ queryKey: ["virements"],           queryFn: () => api.get<any>("/api/finance/virements?limit=100") });
  const { data: diData                            } = useQuery({ queryKey: ["di-stats"],            queryFn: () => api.get<any>("/api/di/stats/resume") });
  const { data: diListData                        } = useQuery({ queryKey: ["di-finance-list"],     queryFn: () => api.get<any>("/api/di?limit=100&statut=actif"), staleTime: 60_000 });

  const douaneList  = douane?.data     ?? [];
  const cieList     = cie?.data        ?? [];
  const virtsList   = virts?.data      ?? [];
  const diListItems = diListData?.data ?? [];

  const totalDouane    = douaneList.reduce((s: number, p: any) => s + Number(p.montant), 0);
  const douanePaye     = douaneList.filter((p: any) => p.statut === "paye").reduce((s: number, p: any) => s + Number(p.montant), 0);
  const douaneAttente  = douaneList.filter((p: any) => p.statut !== "paye").reduce((s: number, p: any) => s + Number(p.montant), 0);
  const totalCie       = cieList.reduce((s: number, p: any) => s + Number(p.montant), 0);
  const ciePaye        = cieList.filter((p: any) => p.statut === "paye").reduce((s: number, p: any) => s + Number(p.montant), 0);
  const cieAttente     = cieList.filter((p: any) => p.statut !== "paye").reduce((s: number, p: any) => s + Number(p.montant), 0);

  // Chart par compagnie
  const compagnies = ["MSC", "COSCO", "MAERSK", "CMA_CGM"];
  const compagnieData = compagnies.map(c => ({
    compagnie: c.replace("_", "-"),
    douane:       douaneList.filter((p: any) => p.dossier?.compagnie === c || p.compagnie === c).reduce((s: number, p: any) => s + Number(p.montant), 0),
    compagnieFrais: cieList.filter((p: any) => p.compagnie === c).reduce((s: number, p: any) => s + Number(p.montant), 0),
  }));

  const isLoading = statsLoading || douaneLoading || cieLoading;

  return (
    <AppLayout title="Finance & Contrôle" subtitle="Droits de douane, paiements compagnie, suivi DI">
      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-secondary" /></div>
      ) : (
        <>
          {/* KPI Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: "Droits de Douane",     value: totalDouane,   sub: `${douanePaye.toLocaleString("fr-FR")} payé`,  icon: Landmark,       color: "text-secondary" },
              { label: "Paiements Compagnies", value: totalCie,      sub: `${ciePaye.toLocaleString("fr-FR")} payé`,    icon: Ship,           color: "text-accent" },
              { label: "En attente Douane",    value: douaneAttente, sub: `${douaneList.filter((p: any) => p.statut === "en_retard").length} en retard`, icon: AlertTriangle, color: "text-warning" },
              { label: "En attente Compagnies",value: cieAttente,    sub: `${cieList.filter((p: any) => p.statut === "en_retard").length} en retard`,   icon: AlertTriangle, color: "text-destructive" },
            ].map((stat, i) => (
              <motion.div key={stat.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} className="stat-card">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                    <stat.icon className={`w-4 h-4 ${stat.color}`} />
                  </div>
                </div>
                <div className="text-lg font-display font-bold text-foreground">{stat.value.toLocaleString("fr-FR")}</div>
                <div className="text-[10px] text-muted-foreground">{stat.sub}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
              </motion.div>
            ))}
          </div>

          <Tabs defaultValue="douane" className="mb-6">
            <TabsList>
              <TabsTrigger value="douane" className="gap-1.5"><Landmark className="w-3.5 h-3.5" /> Droits de Douane ({douaneList.length})</TabsTrigger>
              <TabsTrigger value="compagnies" className="gap-1.5"><Ship className="w-3.5 h-3.5" /> Paiements Compagnies ({cieList.length})</TabsTrigger>
              <TabsTrigger value="di_client" className="gap-1.5"><Users className="w-3.5 h-3.5" /> Suivi DI</TabsTrigger>
              <TabsTrigger value="transferts" className="gap-1.5"><RefreshCw className="w-3.5 h-3.5" /> Virements ({virtsList.length})</TabsTrigger>
            </TabsList>

            {/* Droits de Douane */}
            <TabsContent value="douane">
              <div className="stat-card overflow-hidden p-0 mt-4">
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
                    <Landmark className="w-4 h-4 text-secondary" /> Paiements Droits de Douane
                  </h3>
                  <Button variant="outline" size="sm" className="gap-1.5"><Download className="w-3.5 h-3.5" /> Export</Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Référence</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Dossier</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Type</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Montant</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Statut</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {douaneList.map((p: any) => (
                        <tr key={p.id} className={`border-b border-border/50 hover:bg-muted/30 ${p.statut === "en_retard" ? "bg-destructive/5" : ""}`}>
                          <td className="px-4 py-3 text-sm font-mono text-foreground">{p.reference}</td>
                          <td className="px-4 py-3 text-sm text-foreground">{p.dossier?.numero ?? "—"}</td>
                          <td className="px-4 py-3 text-sm text-foreground">{paiementDouaneLabel[p.type] ?? p.type}</td>
                          <td className="px-4 py-3 text-sm text-right font-display font-bold text-foreground">{Number(p.montant).toLocaleString("fr-FR")}</td>
                          <td className="px-4 py-3"><span className={`status-badge ${statutColor[p.statut] ?? ""}`}>{statutLabel[p.statut] ?? p.statut}</span></td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{new Date(p.datePaiement).toLocaleDateString("fr-FR")}</td>
                        </tr>
                      ))}
                      {douaneList.length === 0 && (
                        <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">Aucun paiement douane</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>

            {/* Paiements Compagnies */}
            <TabsContent value="compagnies">
              <div className="stat-card overflow-hidden p-0 mt-4">
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
                    <Ship className="w-4 h-4 text-secondary" /> Paiements aux Compagnies Maritimes
                  </h3>
                  <Button variant="outline" size="sm" className="gap-1.5"><Download className="w-3.5 h-3.5" /> Export</Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Référence</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Dossier</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Compagnie</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Type</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Montant</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Statut</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cieList.map((p: any) => (
                        <tr key={p.id} className={`border-b border-border/50 hover:bg-muted/30 ${p.statut === "en_retard" ? "bg-destructive/5" : ""}`}>
                          <td className="px-4 py-3 text-sm font-mono text-foreground">{p.reference}</td>
                          <td className="px-4 py-3 text-sm text-foreground">{p.dossier?.numero ?? "—"}</td>
                          <td className="px-4 py-3 text-sm font-medium text-foreground">{p.compagnie?.replace("_", "-")}</td>
                          <td className="px-4 py-3 text-sm text-foreground">{paiementCompagnieLabel[p.type] ?? p.type}</td>
                          <td className="px-4 py-3 text-sm text-right font-display font-bold text-foreground">{Number(p.montant).toLocaleString("fr-FR")}</td>
                          <td className="px-4 py-3"><span className={`status-badge ${statutColor[p.statut] ?? ""}`}>{statutLabel[p.statut] ?? p.statut}</span></td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{new Date(p.datePaiement).toLocaleDateString("fr-FR")}</td>
                        </tr>
                      ))}
                      {cieList.length === 0 && (
                        <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">Aucun paiement compagnie</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>

            {/* Suivi DI */}
            <TabsContent value="di_client">
              {/* KPI résumé */}
              <div className="grid grid-cols-3 gap-4 mt-4 mb-4">
                {[
                  { label: "Enveloppes totales",  value: Number(diData?.totalMontant ?? 0).toLocaleString("fr-FR"), unit: "FCFA", color: "text-foreground" },
                  { label: "Solde restant total",  value: Number(diData?.totalSolde   ?? 0).toLocaleString("fr-FR"), unit: "FCFA", color: "text-success"   },
                  { label: "DI en alerte",         value: diData?.diEnAlerte ?? 0,                                   unit: "budgets", color: (diData?.diEnAlerte ?? 0) > 0 ? "text-warning" : "text-success" },
                ].map((kpi) => (
                  <div key={kpi.label} className="stat-card text-center py-4">
                    <div className="text-xs text-muted-foreground mb-1">{kpi.label}</div>
                    <div className={`text-xl font-display font-black ${kpi.color}`}>{kpi.value}</div>
                    <div className="text-[10px] text-muted-foreground">{kpi.unit}</div>
                  </div>
                ))}
              </div>

              {/* Tableau DI */}
              <div className="stat-card overflow-hidden p-0">
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
                    <Banknote className="w-4 h-4 text-secondary" /> Suivi des enveloppes DI — déclarations d'importation
                  </h3>
                  <span className="text-xs text-muted-foreground">{diListItems.length} DI actives</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">N° DI</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Client</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Enveloppe</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Solde</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Utilisation</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">État</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diListItems.map((di: any, i: number) => (
                        <motion.tr key={di.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                          className={`border-b border-border/50 hover:bg-muted/30 ${di.alerteNiveau === "critical" ? "bg-destructive/5" : di.alerteNiveau === "warning" ? "bg-warning/5" : ""}`}>
                          <td className="px-4 py-3 text-sm font-mono text-foreground font-medium">{di.numero}</td>
                          <td className="px-4 py-3 text-sm text-foreground">{di.client}</td>
                          <td className="px-4 py-3 text-sm text-right font-display font-bold text-foreground">
                            {Number(di.montant).toLocaleString("fr-FR")}
                            <span className="text-[10px] text-muted-foreground font-normal ml-1">{di.devise ?? "XAF"}</span>
                          </td>
                          <td className={`px-4 py-3 text-sm text-right font-display font-bold ${
                            di.alerteNiveau === "critical" ? "text-destructive" :
                            di.alerteNiveau === "warning"  ? "text-warning"    : "text-success"
                          }`}>
                            {Number(di.soldeActuel).toLocaleString("fr-FR")}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 min-w-[110px]">
                              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    di.alerteNiveau === "critical" ? "bg-destructive" :
                                    di.alerteNiveau === "warning"  ? "bg-warning"    : "bg-success"
                                  }`}
                                  style={{ width: `${Math.min(Number(di.tauxUtilise ?? 0), 100)}%` }}
                                />
                              </div>
                              <span className="text-xs font-medium text-muted-foreground w-9 text-right flex-shrink-0">
                                {Math.round(Number(di.tauxUtilise ?? 0))}%
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`status-badge ${
                              di.alerteNiveau === "critical" ? "bg-red-100 text-red-700" :
                              di.alerteNiveau === "warning"  ? "bg-amber-100 text-amber-700" :
                              "bg-green-100 text-green-700"
                            }`}>
                              {di.alerteNiveau === "critical" ? "Critique" :
                               di.alerteNiveau === "warning"  ? "Alerte"   : "OK"}
                            </span>
                          </td>
                        </motion.tr>
                      ))}
                      {diListItems.length === 0 && (
                        <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">Aucune DI active enregistrée</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Répartition par compagnie */}
              {(diData?.parCompagnie ?? []).length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-display font-semibold text-foreground mb-3">Répartition par compagnie maritime</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(diData?.parCompagnie ?? []).map((c: any, i: number) => (
                      <motion.div key={c.compagnie} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="stat-card">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-display font-semibold text-foreground">{c.compagnie?.replace("_", "-")}</h4>
                          <span className="text-xs text-muted-foreground">{c.count} DI</span>
                        </div>
                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Montant total</span>
                            <span className="font-medium">{Number(c.montantTotal ?? 0).toLocaleString("fr-FR")} FCFA</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Solde restant</span>
                            <span className="font-medium text-success">{Number(c.soldeTotal ?? 0).toLocaleString("fr-FR")} FCFA</span>
                          </div>
                          {c.montantTotal > 0 && (
                            <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-secondary transition-all"
                                style={{ width: `${Math.min(100 - (c.soldeTotal / c.montantTotal) * 100, 100)}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Virements */}
            <TabsContent value="transferts">
              <div className="stat-card overflow-hidden p-0 mt-4">
                <div className="p-4 border-b border-border">
                  <h3 className="font-display font-semibold text-foreground">Virements de fonds</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Référence</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Bénéficiaire</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Montant</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Statut</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {virtsList.map((t: any) => (
                        <tr key={t.id} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="px-4 py-3 text-sm font-mono text-foreground">{t.reference}</td>
                          <td className="px-4 py-3 text-sm text-foreground">{t.beneficiaire ?? t.dossier?.client ?? "—"}</td>
                          <td className="px-4 py-3 text-sm text-right font-display font-bold text-foreground">{Number(t.montant).toLocaleString("fr-FR")}</td>
                          <td className="px-4 py-3">
                            <span className={`status-badge ${t.statut === "effectue" ? "bg-green-100 text-green-700" : t.statut === "en_attente" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                              {t.statut === "effectue" ? "Effectué" : t.statut === "en_attente" ? "En attente" : "Annulé"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{new Date(t.dateVirement).toLocaleDateString("fr-FR")}</td>
                        </tr>
                      ))}
                      {virtsList.length === 0 && (
                        <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">Aucun virement</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* Chart */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="stat-card">
            <h3 className="font-display font-semibold text-foreground mb-4">Douane vs Compagnie — par transporteur</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={compagnieData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="compagnie" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}M`} />
                <Tooltip formatter={(v: number) => [`${v.toLocaleString("fr-FR")} FCFA`]} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                <Bar dataKey="douane"        fill="hsl(var(--secondary))" radius={[4, 4, 0, 0]} name="Droits de Douane" />
                <Bar dataKey="compagnieFrais" fill="hsl(var(--accent))"   radius={[4, 4, 0, 0]} name="Frais Compagnie" />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>
        </>
      )}
    </AppLayout>
  );
};

export default Finance;
