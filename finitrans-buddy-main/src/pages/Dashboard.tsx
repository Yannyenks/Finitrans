import { useEffect, useCallback } from "react";
import AppLayout from "@/components/AppLayout";
import {
  FolderOpen, CheckCircle, Clock, AlertTriangle, TrendingUp,
  Ship, MapPin, Users, BarChart3, Loader2, Zap, Banknote,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api, getStoredUser } from "@/lib/api";
import { useDIStats } from "@/hooks/useDI";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area
} from "recharts";
import { motion, useMotionValue, useTransform, animate as framerAnimate } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Progress } from "@/components/ui/progress";

/* ─── Animated counter ──────────────────────────────────────── */
const AnimatedCounter = ({ value, className = "" }: { value: number; className?: string }) => {
  const count  = useMotionValue(0);
  const display = useTransform(count, v => Math.round(v).toLocaleString("fr-FR"));
  useEffect(() => {
    const ctrl = framerAnimate(count, value, { duration: 1.4, ease: "easeOut" });
    return ctrl.stop;
  }, [value, count]);
  return <motion.span className={className}>{display}</motion.span>;
};

/* ─── 3D tilt card ───────────────────────────────────────────── */
const TiltCard = ({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) => {
  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el   = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x    = ((e.clientY - rect.top)  / rect.height - 0.5) * 14;
    const y    = -((e.clientX - rect.left) / rect.width  - 0.5) * 14;
    el.style.transform    = `perspective(700px) rotateX(${x}deg) rotateY(${y}deg) translateZ(8px)`;
    el.style.boxShadow    = `${-y * 0.6}px ${x * 0.6}px 32px rgba(0,0,0,0.14)`;
    el.style.transition   = "transform 0.12s ease, box-shadow 0.12s ease";
  }, []);
  const onLeave = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    el.style.transform  = "perspective(700px) rotateX(0deg) rotateY(0deg) translateZ(0px)";
    el.style.boxShadow  = "";
    el.style.transition = "transform 0.35s ease, box-shadow 0.35s ease";
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 22, scale: 0.96 }}
      animate={{ opacity: 1, y: 0,  scale: 1 }}
      transition={{ delay, type: "spring", stiffness: 180, damping: 22 }}
    >
      <div
        className={`stat-card h-full ${className}`}
        style={{ transformStyle: "preserve-3d", willChange: "transform" }}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
      >
        {children}
      </div>
    </motion.div>
  );
};

/* ─── Constants ─────────────────────────────────────────────── */
const COMPAGNIE_COLORS: Record<string, string> = {
  MSC: "#F07B37", COSCO: "#1A9AD6", MAERSK: "#22c55e", CMA_CGM: "#a855f7",
};

const STATUS_LABELS: Record<string, string> = {
  reception: "Réception", codage: "Codage", validation: "Validation",
  paiement: "Paiement", bon_compagnie: "Bon Compagnie",
  operations_kribi: "Kribi", cloture: "Clôturé",
};

const STATUS_COLORS: Record<string, string> = {
  reception: "bg-blue-100 text-blue-700",   codage: "bg-purple-100 text-purple-700",
  validation: "bg-amber-100 text-amber-700", paiement: "bg-orange-100 text-orange-700",
  bon_compagnie: "bg-green-100 text-green-700", operations_kribi: "bg-teal-100 text-teal-700",
  cloture: "bg-gray-100 text-gray-600",
};

/* ─── Component ─────────────────────────────────────────────── */
const Dashboard = () => {
  const navigate = useNavigate();
  const user     = getStoredUser();

  const { data: kpis,   isLoading: kpisLoading } = useQuery({ queryKey: ["dashboard-kpis"],    queryFn: () => api.get<any>("/api/dashboard/kpis") });
  const { data: charts }                          = useQuery({ queryKey: ["dashboard-charts"],   queryFn: () => api.get<any>("/api/dashboard/charts") });
  const { data: heatmap }                         = useQuery({ queryKey: ["dashboard-heatmap"],  queryFn: () => api.get<any>("/api/dashboard/heatmap") });
  const { data: recent }                          = useQuery({ queryKey: ["dashboard-recent"],   queryFn: () => api.get<any>("/api/dashboard/recent") });
  const { data: diStats }                         = useDIStats();

  const statCards = [
    { label: "Dossiers actifs",   value: kpis?.dossiersActifs      ?? 0, icon: FolderOpen,   color: "text-secondary",   bg: "bg-secondary/10",   gradient: "from-orange-500/10 to-transparent" },
    { label: "Clôturés ce mois",  value: kpis?.dossiersClotures30j ?? 0, icon: CheckCircle,  color: "text-success",     bg: "bg-success/10",     gradient: "from-green-500/10 to-transparent" },
    { label: "En retard",         value: kpis?.dossiersEnRetard    ?? 0, icon: Clock,         color: "text-warning",     bg: "bg-warning/10",     gradient: "from-amber-500/10 to-transparent" },
    { label: "Alertes critiques", value: kpis?.alertesNonLues      ?? 0, icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10", gradient: "from-red-500/10 to-transparent" },
    { label: "DI en alerte",      value: diStats?.diEnAlerte       ?? 0, icon: Banknote,      color: "text-warning",     bg: "bg-warning/10",     gradient: "from-amber-500/10 to-transparent" },
  ];

  const pieData     = (charts?.parCompagnie ?? []).map((c: any) => ({ name: c.compagnie, value: c.count, color: COMPAGNIE_COLORS[c.compagnie] ?? "#6b7280" }));
  const parSite     = charts?.parSite ?? [];
  const douala      = parSite.find((s: any) => s.site === "Douala") ?? { count: 0 };
  const kribi       = parSite.find((s: any) => s.site === "Kribi")  ?? { count: 0 };
  const heatmapEtapes: string[] = heatmap?.etapes  ?? ["reception","codage","validation","paiement","bon_compagnie","operations_kribi"];
  const heatmapRows: any[]      = heatmap?.heatmap ?? [];
  const perf        = (charts?.tauxRetardParEmploye ?? []).filter((e: any) => e.actifs > 0);
  const evolution   = charts?.evolution ?? [];

  return (
    <AppLayout title="Tableau de Bord" subtitle={`Vue de pilotage stratégique — ${user?.nom ?? ""}`}>
      {kpisLoading ? (
        <div className="flex items-center justify-center py-32">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}>
            <Loader2 className="w-10 h-10 text-secondary" />
          </motion.div>
        </div>
      ) : (
        <>
          {/* ── KPI Cards ─────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            {statCards.map((stat, i) => (
              <TiltCard key={stat.label} delay={i * 0.09}>
                <div className={`absolute inset-0 rounded-xl bg-gradient-to-br ${stat.gradient} pointer-events-none`} />
                <div className="relative">
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-11 h-11 rounded-xl ${stat.bg} flex items-center justify-center`}>
                      <stat.icon className={`w-5 h-5 ${stat.color}`} />
                    </div>
                    <Zap className="w-3.5 h-3.5 text-muted-foreground/30" />
                  </div>
                  <div className={`text-3xl font-display font-black mb-1 ${stat.color}`}>
                    <AnimatedCounter value={stat.value} />
                  </div>
                  <div className="text-sm text-muted-foreground font-medium">{stat.label}</div>
                </div>
              </TiltCard>
            ))}
          </div>

          {/* ── Evolution + Pie ───────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.38, type: "spring", stiffness: 160, damping: 22 }}
              className="lg:col-span-2 stat-card"
            >
              <h3 className="font-display font-semibold text-foreground mb-1">Activité des 30 derniers jours</h3>
              <p className="text-xs text-muted-foreground mb-4">Création vs clôture de dossiers</p>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={evolution}>
                  <defs>
                    <linearGradient id="gradCrees" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#F07B37" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#F07B37" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradClotures" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "10px", fontSize: "12px", boxShadow: "0 8px 32px rgba(0,0,0,0.1)" }} />
                  <Area type="monotone" dataKey="crees"    stroke="#F07B37" strokeWidth={2.5} fill="url(#gradCrees)"    name="Créés" dot={false} activeDot={{ r: 4, fill: "#F07B37" }} />
                  <Area type="monotone" dataKey="clotures" stroke="#22c55e" strokeWidth={2.5} fill="url(#gradClotures)" name="Clôturés" dot={false} activeDot={{ r: 4, fill: "#22c55e" }} />
                </AreaChart>
              </ResponsiveContainer>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.46, type: "spring", stiffness: 160, damping: 22 }}
              className="stat-card"
            >
              <h3 className="font-display font-semibold text-foreground mb-1">Par compagnie</h3>
              <p className="text-xs text-muted-foreground mb-3">Répartition des dossiers actifs</p>
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={42} outerRadius={68} dataKey="value" paddingAngle={5} strokeWidth={0}>
                    {pieData.map((entry: any) => <Cell key={entry.name} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {pieData.map((d: any) => (
                  <div key={d.name} className="flex items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                    <span className="text-muted-foreground truncate">{d.name.replace("_", "-")}</span>
                    <span className="font-bold text-foreground ml-auto">{d.value}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* ── Heatmap + Sites ───────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.54, type: "spring", stiffness: 160, damping: 22 }}
              className="stat-card"
            >
              <h3 className="font-display font-semibold text-foreground mb-1 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-secondary" /> Charge par employé
              </h3>
              <p className="text-xs text-muted-foreground mb-4">Nombre de dossiers par étape</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      <th className="text-left p-2 text-muted-foreground font-medium">Employé</th>
                      {heatmapEtapes.map(e => (
                        <th key={e} className="p-2 text-muted-foreground text-center font-medium">{STATUS_LABELS[e]?.split(" ")[0] ?? e}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {heatmapRows.map((row: any, ri: number) => (
                      <motion.tr
                        key={row.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.6 + ri * 0.05 }}
                      >
                        <td className="p-2 text-foreground font-semibold whitespace-nowrap">{row.nom.split(" ").pop()}</td>
                        {heatmapEtapes.map(e => {
                          const val = row[e] as number ?? 0;
                          return (
                            <td key={e} className="p-2 text-center">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center mx-auto text-xs font-bold transition-transform hover:scale-110 ${
                                val === 0 ? "bg-muted text-muted-foreground" :
                                val === 1 ? "bg-blue-100 text-blue-700"   :
                                val === 2 ? "bg-amber-100 text-amber-700" :
                                "bg-red-100 text-red-700"
                              }`}>{val}</div>
                            </td>
                          );
                        })}
                      </motion.tr>
                    ))}
                    {heatmapRows.length === 0 && (
                      <tr><td colSpan={heatmapEtapes.length + 1} className="text-center py-6 text-muted-foreground">Aucune donnée</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.58, type: "spring", stiffness: 160, damping: 22 }}
              className="stat-card"
            >
              <h3 className="font-display font-semibold text-foreground mb-1 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-secondary" /> Comparaison Douala / Kribi
              </h3>
              <p className="text-xs text-muted-foreground mb-4">Répartition par site opérationnel</p>
              <div className="space-y-4">
                {[
                  { site: "Douala", icon: Ship,   count: douala.count, retard: kpis?.dossiersEnRetard ?? 0, color: "#F07B37" },
                  { site: "Kribi",  icon: MapPin,  count: kribi.count,  retard: 0, color: "#1A9AD6"  },
                ].map((s, si) => (
                  <motion.div
                    key={s.site}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.65 + si * 0.15 }}
                    className="p-4 rounded-xl border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-display font-bold text-foreground flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${s.color}20` }}>
                          <s.icon className="w-4 h-4" style={{ color: s.color }} />
                        </div>
                        {s.site}
                      </span>
                      <span className="text-xs font-medium text-muted-foreground px-2 py-0.5 rounded-full bg-muted">Port</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="text-center p-2 rounded-lg bg-background">
                        <div className="text-xl font-display font-black text-foreground"><AnimatedCounter value={s.count} /></div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">Dossiers actifs</div>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-background">
                        <div className="text-xl font-display font-black text-destructive"><AnimatedCounter value={s.retard} /></div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">En retard</div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* ── Performance + Répartition statuts ────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.63, type: "spring", stiffness: 160, damping: 22 }}
              className="stat-card"
            >
              <h3 className="font-display font-semibold text-foreground mb-1 flex items-center gap-2">
                <Users className="w-4 h-4 text-secondary" /> Performance par employé
              </h3>
              <p className="text-xs text-muted-foreground mb-4">Taux de dossiers dans les délais</p>
              <div className="space-y-4">
                {perf.length === 0 && <p className="text-sm text-muted-foreground py-4">Aucune donnée disponible</p>}
                {perf.map((emp: any, i: number) => {
                  const score = 100 - emp.tauxRetard;
                  return (
                    <motion.div
                      key={emp.nom}
                      initial={{ opacity: 0, x: -15 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.7 + i * 0.07 }}
                      className="flex items-center gap-3"
                    >
                      <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                        <span className="text-[10px] font-black text-primary-foreground">{emp.nom.split(" ").pop()?.charAt(0)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-semibold text-foreground truncate">{emp.nom}</span>
                          <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">{emp.actifs} / {emp.enRetard} retard</span>
                        </div>
                        <Progress value={score} className="h-2" />
                      </div>
                      <span className={`text-sm font-display font-black w-10 text-right flex-shrink-0 ${score > 80 ? "text-success" : score > 50 ? "text-warning" : "text-destructive"}`}>
                        {score}%
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.68, type: "spring", stiffness: 160, damping: 22 }}
              className="stat-card"
            >
              <h3 className="font-display font-semibold text-foreground mb-1 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-secondary" /> Répartition par statut
              </h3>
              <p className="text-xs text-muted-foreground mb-4">Nombre de dossiers à chaque étape</p>
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={charts?.parStatut ?? []} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis type="category" dataKey="status" width={88} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: string) => STATUS_LABELS[v] ?? v} />
                  <Tooltip
                    formatter={(v: any) => [v, "Dossiers"]}
                    labelFormatter={(l: string) => STATUS_LABELS[l] ?? l}
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "10px", fontSize: "12px", boxShadow: "0 8px 32px rgba(0,0,0,0.1)" }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--secondary))" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </motion.div>
          </div>

          {/* ── Alertes + Dossiers récents ────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.73, type: "spring", stiffness: 160, damping: 22 }}
              className="stat-card"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-display font-semibold text-foreground">Alertes prioritaires</h3>
                  <p className="text-xs text-muted-foreground">Nécessitent une action immédiate</p>
                </div>
                <button onClick={() => navigate("/alertes")} className="text-xs font-semibold text-secondary hover:underline">
                  Voir tout →
                </button>
              </div>
              <div className="space-y-2.5">
                {(recent?.alertes ?? []).slice(0, 4).map((alert: any, i: number) => (
                  <motion.div
                    key={alert.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.8 + i * 0.06 }}
                    className={`flex items-start gap-3 p-3 rounded-xl border ${
                      alert.severity === "critical"
                        ? "bg-destructive/5 border-destructive/15"
                        : "bg-warning/5 border-warning/15"
                    }`}
                  >
                    <motion.div
                      className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${alert.severity === "critical" ? "bg-destructive" : "bg-warning"}`}
                      animate={{ scale: [1, 1.4, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground leading-snug">{alert.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">{alert.dossier?.numero ?? ""} • {new Date(alert.createdAt).toLocaleDateString("fr-FR")}</p>
                    </div>
                  </motion.div>
                ))}
                {(recent?.alertes ?? []).length === 0 && (
                  <div className="text-center py-8">
                    <CheckCircle className="w-8 h-8 text-success mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Aucune alerte en cours</p>
                  </div>
                )}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.78, type: "spring", stiffness: 160, damping: 22 }}
              className="stat-card"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-display font-semibold text-foreground">Dossiers récents</h3>
                  <p className="text-xs text-muted-foreground">Dernières créations</p>
                </div>
                <button onClick={() => navigate("/dossiers")} className="text-xs font-semibold text-secondary hover:underline">
                  Voir tout →
                </button>
              </div>
              <div className="space-y-2">
                {(recent?.dossiers ?? []).slice(0, 5).map((d: any, i: number) => (
                  <motion.div
                    key={d.id}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.85 + i * 0.06 }}
                    className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/30 cursor-pointer hover:bg-muted/60 hover:border-secondary/20 transition-all group"
                    onClick={() => navigate(`/dossiers/${d.id}`)}
                  >
                    <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-secondary/20 transition-colors">
                      <FolderOpen className="w-4 h-4 text-secondary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-foreground group-hover:text-secondary transition-colors">{d.numero}</span>
                        <span className={`status-badge ${STATUS_COLORS[d.status] ?? "bg-gray-100 text-gray-600"}`}>{STATUS_LABELS[d.status] ?? d.status}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{d.client}</p>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                      {d.site === "Kribi" ? <MapPin className="w-3 h-3" /> : <Ship className="w-3 h-3" />}
                      {d.site}
                    </div>
                  </motion.div>
                ))}
                {(recent?.dossiers ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground py-6 text-center">Aucun dossier</p>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AppLayout>
  );
};

export default Dashboard;
