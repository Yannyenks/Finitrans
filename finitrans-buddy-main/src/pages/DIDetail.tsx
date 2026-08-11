import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useDI } from "@/hooks/useDI";
import { getStoredUser } from "@/lib/api";
import {
  ArrowLeft, Banknote, ShieldAlert, Settings2, Plus, Loader2,
  BarChart3, TrendingDown, Clock, AlertTriangle, Activity,
  ArrowDownRight, ArrowUpRight, Users, Calendar, RefreshCw,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { motion } from "framer-motion";
import DIHistorique from "@/components/di/DIHistorique";
import DIForm from "@/components/di/DIForm";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number, devise = "FCFA") => `${n.toLocaleString("fr-FR")} ${devise}`;

const alerteClasses = (niveau: string) => ({
  band:  niveau === "critical" ? "from-red-500 to-red-600" : niveau === "warning" ? "from-amber-400 to-orange-500" : "from-green-400 to-green-500",
  text:  niveau === "critical" ? "text-red-600"             : niveau === "warning" ? "text-amber-600"               : "text-success",
  bar:   niveau === "critical" ? "#ef4444"                  : niveau === "warning" ? "#f59e0b"                      : "#22c55e",
  badge: niveau === "critical" ? "bg-red-100 text-red-700"  : niveau === "warning" ? "bg-amber-100 text-amber-700"  : "bg-green-100 text-green-700",
});

// ── Gauge ─────────────────────────────────────────────────────────────────────

const Gauge = ({ pct, color }: { pct: number; color: string }) => {
  const r = 42;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(pct, 100) / 100);
  return (
    <svg viewBox="0 0 110 110" width="130" height="130">
      <circle cx="55" cy="55" r={r} fill="none" stroke="currentColor"
        strokeWidth="10" className="text-muted/30" />
      <circle
        cx="55" cy="55" r={r} fill="none" stroke={color} strokeWidth="10"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform="rotate(-90 55 55)"
        style={{ transition: "stroke-dashoffset 1.4s ease" }}
      />
      <text x="55" y="51" textAnchor="middle" dominantBaseline="middle"
        fill={color} fontSize="17" fontWeight="800" fontFamily="inherit">
        {Math.round(pct)}%
      </text>
      <text x="55" y="67" textAnchor="middle" dominantBaseline="middle"
        fill="currentColor" fontSize="8" opacity={0.45} fontFamily="inherit">
        utilisé
      </text>
    </svg>
  );
};

// ── Evolution chart ───────────────────────────────────────────────────────────

const EvolutionChart = ({ diId, devise }: { diId: string; devise: string }) => {
  const { data } = useQuery<any>({
    queryKey:  ["di-evolution", diId],
    queryFn:   () => api.get(`/api/di/${diId}/evolution?jours=60`),
    staleTime: 60_000,
  });

  if (!data?.evolution?.length) return (
    <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
      Pas encore de données d'évolution
    </div>
  );

  const last30 = data.evolution.slice(-30);

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={last30} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="soldeGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#1A9AD6" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#1A9AD6" stopOpacity={0}    />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
        <XAxis dataKey="date"
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickFormatter={d => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickFormatter={v => `${(v / 1_000_000).toFixed(0)}M`}
        />
        <Tooltip
          formatter={(v: any) => [`${Number(v).toLocaleString("fr-FR")} ${devise}`, "Solde"]}
          labelFormatter={l => new Date(l).toLocaleDateString("fr-FR")}
          contentStyle={{
            background:   "hsl(var(--card))",
            border:       "1px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize:     12,
          }}
        />
        <Area type="monotone" dataKey="solde" stroke="#1A9AD6" strokeWidth={2}
          fill="url(#soldeGrad)" dot={false} activeDot={{ r: 4 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
};

// ── DIDetail ──────────────────────────────────────────────────────────────────

export default function DIDetail() {
  const { id }  = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user     = getStoredUser();

  const canEdit     = user?.permFinancier === "complet" || user?.permFinancier === "partiel";
  const canRecharge = user?.permFinancier === "complet";

  const { di, dashboard, isLoading } = useDI(id ?? null);
  const [activeTab,  setActiveTab]   = useState("overview");
  const [showForm,   setShowForm]    = useState<"recharge" | "debit" | null>(null);

  if (isLoading) {
    return (
      <AppLayout title="Chargement...">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-secondary" />
        </div>
      </AppLayout>
    );
  }

  if (!di) {
    return (
      <AppLayout title="DI introuvable">
        <div className="text-center py-20">
          <p className="text-muted-foreground mb-4">Déclaration d'Importation introuvable.</p>
          <Button onClick={() => navigate("/di")} variant="outline">Retour aux DI</Button>
        </div>
      </AppLayout>
    );
  }

  const niveau = di.alerteNiveau;
  const cls    = alerteClasses(niveau);
  const devise = di.devise ?? "FCFA";
  const prev   = dashboard?.previsions;

  return (
    <AppLayout title={di.numero} subtitle={`${di.client} — DI ${di.statut}`}>
      <button onClick={() => navigate("/di")}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Retour aux DI
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Main (2/3) ──────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2 space-y-6"
        >
          {/* ── Hero card ─────────────────────────────────────── */}
          <div className="stat-card overflow-hidden relative">
            <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${cls.band}`} />
            <div className="pt-2">
              {/* Header */}
              <div className="flex items-start justify-between mb-5">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-8 h-8 rounded-lg bg-secondary/15 flex items-center justify-center">
                      <Banknote className="w-4 h-4 text-secondary" />
                    </div>
                    <h2 className="text-lg font-display font-black text-foreground">{di.numero}</h2>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      di.statut === "actif" ? "bg-green-100 text-green-700" :
                      di.statut === "cloture" ? "bg-gray-100 text-gray-600" :
                      "bg-amber-100 text-amber-700"
                    }`}>
                      {di.statut === "actif" ? "Actif" : di.statut === "cloture" ? "Clôturé" : "Suspendu"}
                    </span>
                    {niveau !== "ok" && (
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${cls.badge}`}>
                        <ShieldAlert className="w-3 h-3" />
                        {niveau === "critical" ? "SOLDE CRITIQUE" : "SOLDE FAIBLE"}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground ml-10">Client : <strong className="text-foreground">{di.client}</strong></p>
                  {di.gestionnaire && (
                    <p className="text-xs text-muted-foreground ml-10">Gestionnaire : {di.gestionnaire.nom}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  {canEdit && di.statut === "actif" && (
                    <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5"
                      onClick={() => setShowForm(showForm === "debit" ? null : "debit")}>
                      <ArrowDownRight className="w-3.5 h-3.5" />
                      Débit
                    </Button>
                  )}
                  {canRecharge && di.statut === "actif" && (
                    <Button size="sm" className="h-8 text-xs gap-1.5 bg-secondary text-secondary-foreground hover:opacity-90"
                      onClick={() => setShowForm(showForm === "recharge" ? null : "recharge")}>
                      <RefreshCw className="w-3.5 h-3.5" />
                      Ajuster
                    </Button>
                  )}
                </div>
              </div>

              {/* Form inline */}
              {showForm && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="mb-5 p-4 rounded-xl border border-border bg-muted/30"
                >
                  <DIForm
                    mode={showForm}
                    diId={id}
                    soldeActuel={di.soldeNum}
                    devise={devise}
                    onSuccess={() => setShowForm(null)}
                    onCancel={() => setShowForm(null)}
                  />
                </motion.div>
              )}

              {/* Gauge + stats */}
              <div className="flex gap-6 items-center mb-5">
                <Gauge pct={di.tauxUtilise} color={cls.bar} />
                <div className="flex-1 space-y-4">
                  {/* Stats grid */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Enveloppe totale", val: di.montantNum, icon: BarChart3,      cls: "text-muted-foreground" },
                      { label: "Montant utilisé",  val: di.utiliseNum,  icon: ArrowDownRight, cls: "text-orange-500"       },
                      { label: "Solde disponible", val: di.soldeNum,    icon: ArrowUpRight,   cls: cls.text                },
                    ].map(({ label, val, icon: Icon, cls: c }) => (
                      <div key={label} className="bg-muted/50 rounded-lg p-2.5">
                        <div className="flex items-center gap-1 mb-1">
                          <Icon className={`w-3 h-3 ${c}`} />
                          <span className="text-[10px] text-muted-foreground">{label}</span>
                        </div>
                        <p className={`text-sm font-display font-bold ${c}`}>
                          {val.toLocaleString("fr-FR")}
                          <span className="text-[10px] font-normal ml-0.5 text-muted-foreground">{devise}</span>
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Progress bar */}
                  <div>
                    <div className="relative h-3 rounded-full bg-muted overflow-visible mb-1.5">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(di.tauxUtilise, 100)}%` }}
                        transition={{ duration: 1.2, ease: "easeOut" }}
                        className="absolute top-0 left-0 h-full rounded-full"
                        style={{ background: cls.bar }}
                      />
                      {[
                        { pct: 100 - di.seuilAlerte1, col: "#f59e0b" },
                        { pct: 100 - di.seuilAlerte2, col: "#ef4444" },
                      ].map((m) => (
                        <div key={m.pct}
                          className="absolute top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full"
                          style={{ left: `${m.pct}%`, background: m.col }}
                        />
                      ))}
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>0%</span>
                      <span className="text-amber-500 font-medium">⚠ {100 - di.seuilAlerte1}%</span>
                      <span className="text-red-500 font-medium">🔴 {100 - di.seuilAlerte2}%</span>
                      <span>100%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Prévisions */}
              {prev && (
                <div className="grid grid-cols-2 gap-3 pt-4 border-t border-border">
                  {prev.joursRestants !== null && (
                    <div className="rounded-xl bg-muted/50 p-3 flex items-center gap-2.5">
                      <Clock className="w-4 h-4 text-secondary flex-shrink-0" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Jours restants estimés</p>
                        <p className="text-base font-display font-bold text-foreground">{prev.joursRestants} j</p>
                      </div>
                    </div>
                  )}
                  {prev.tauxConsoJournalier > 0 && (
                    <div className="rounded-xl bg-muted/50 p-3 flex items-center gap-2.5">
                      <TrendingDown className="w-4 h-4 text-orange-500 flex-shrink-0" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Consommation journalière</p>
                        <p className="text-base font-display font-bold text-foreground">
                          {prev.tauxConsoJournalier.toLocaleString("fr-FR")} {devise}
                        </p>
                      </div>
                    </div>
                  )}
                  {prev.dateRupture && (
                    <div className={`rounded-xl p-3 flex items-center gap-2.5 col-span-2 ${
                      prev.alertePrevisionnel ? "bg-red-50 border border-red-200" : "bg-muted/50"
                    }`}>
                      <AlertTriangle className={`w-4 h-4 flex-shrink-0 ${prev.alertePrevisionnel ? "text-red-500" : "text-muted-foreground"}`} />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Date de rupture prévisionnelle</p>
                        <p className={`text-base font-display font-bold ${prev.alertePrevisionnel ? "text-red-600" : "text-foreground"}`}>
                          {new Date(prev.dateRupture).toLocaleDateString("fr-FR", {
                            weekday: "long", day: "numeric", month: "long", year: "numeric",
                          })}
                          {prev.alertePrevisionnel && " — Recharge nécessaire"}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Tabs ──────────────────────────────────────────── */}
          <div className="stat-card">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-5">
                <TabsTrigger value="overview"   className="gap-1.5"><Activity className="w-3.5 h-3.5" /> Évolution</TabsTrigger>
                <TabsTrigger value="historique" className="gap-1.5"><BarChart3 className="w-3.5 h-3.5" /> Historique</TabsTrigger>
                <TabsTrigger value="dossiers"   className="gap-1.5"><Users className="w-3.5 h-3.5" /> Dossiers liés</TabsTrigger>
              </TabsList>

              <TabsContent value="overview">
                <h4 className="text-sm font-semibold text-foreground mb-4">
                  Évolution du solde DI — 30 derniers jours
                </h4>
                <EvolutionChart diId={id!} devise={devise} />
              </TabsContent>

              <TabsContent value="historique">
                <DIHistorique mouvements={di.mouvements ?? []} devise={devise} />
              </TabsContent>

              <TabsContent value="dossiers">
                {dashboard?.dossiers?.length ? (
                  <div className="space-y-2">
                    {dashboard.dossiers.map((d: any) => (
                      <div key={d.id}
                        className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors cursor-pointer"
                        onClick={() => navigate(`/dossiers/${d.id}`)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full bg-secondary" />
                          <div>
                            <p className="text-sm font-semibold text-foreground">{d.numero}</p>
                            <p className="text-xs text-muted-foreground">{d.client} · {d.status}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          {d.budgetPrevisionnel > 0 && (
                            <p className="text-xs text-muted-foreground">
                              Budget : {d.budgetPrevisionnel.toLocaleString("fr-FR")} {devise}
                            </p>
                          )}
                          {d.tauxConso > 0 && (
                            <div className="w-20 h-1 rounded-full bg-muted mt-1 overflow-hidden">
                              <div className="h-full rounded-full bg-secondary"
                                style={{ width: `${Math.min(d.tauxConso, 100)}%` }} />
                            </div>
                          )}
                        </div>
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground ml-3" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Aucun dossier lié à cette DI
                  </p>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </motion.div>

        {/* ── Sidebar (1/3) ───────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="space-y-5"
        >
          {/* Infos */}
          <div className="stat-card space-y-3">
            <h3 className="font-display font-semibold text-foreground text-sm">Informations</h3>
            {[
              { icon: Calendar, label: "Création",    val: new Date(di.createdAt).toLocaleDateString("fr-FR") },
              ...(di.dateExpiration ? [{ icon: AlertTriangle, label: "Expiration", val: new Date(di.dateExpiration).toLocaleDateString("fr-FR") }] : []),
              { icon: Users, label: "Gestionnaire", val: di.gestionnaire?.nom ?? "—" },
              { icon: BarChart3, label: "Seuil alerte", val: `${di.seuilAlerte1}% restant` },
              { icon: ShieldAlert, label: "Seuil critique", val: `${di.seuilAlerte2}% restant` },
            ].map(({ icon: Icon, label, val }) => (
              <div key={label} className="flex items-start gap-2.5">
                <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                  <p className="text-xs font-medium text-foreground">{val}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Ventilation par catégorie */}
          {dashboard?.ventilationCategorie?.length > 0 && (
            <div className="stat-card">
              <h3 className="font-display font-semibold text-foreground text-sm mb-3">
                Ventilation des débits
              </h3>
              <div className="space-y-2">
                {dashboard.ventilationCategorie.map((v: any) => (
                  <div key={v.categorie}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="text-muted-foreground capitalize">
                        {v.categorie.replace(/_/g, " ")}
                      </span>
                      <span className="font-medium text-foreground">{v.pourcentage}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-secondary/70"
                        style={{ width: `${v.pourcentage}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Prévisions à 30/60/90 j */}
          {prev && (
            <div className="stat-card">
              <h3 className="font-display font-semibold text-foreground text-sm mb-3">
                Prévisions de consommation
              </h3>
              <div className="space-y-2.5">
                {[
                  { label: "À 30 jours", data: prev.a30jours },
                  { label: "À 60 jours", data: prev.a60jours },
                  { label: "À 90 jours", data: prev.a90jours },
                ].map(({ label, data: p }) => p && (
                  <div key={label} className={`rounded-lg p-2.5 ${
                    p.atteintSeuil2 ? "bg-red-50 border border-red-100" :
                    p.atteintSeuil1 ? "bg-amber-50 border border-amber-100" : "bg-muted/40"
                  }`}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-foreground">{label}</span>
                      <span className={p.atteintSeuil2 ? "text-red-600 font-bold" : p.atteintSeuil1 ? "text-amber-600 font-bold" : "text-success"}>
                        {(p.soldePrevu / 1_000_000).toFixed(1)}M {devise}
                      </span>
                    </div>
                    {(p.atteintSeuil1 || p.atteintSeuil2) && (
                      <p className="text-[10px] text-muted-foreground">
                        {p.atteintSeuil2 ? "⚠️ Seuil critique atteint" : "⚠️ Seuil alerte atteint"}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AppLayout>
  );
}
