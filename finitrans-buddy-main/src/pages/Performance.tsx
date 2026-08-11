import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Trophy, Clock, AlertTriangle, CheckCircle2, TrendingUp,
  Users, Timer, Target, ChevronDown, ChevronUp,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, RadialBarChart, RadialBar } from "recharts";

const STEP_LABELS: Record<string, string> = {
  reception:        "Réception",
  soumission_sgs:   "Soumission SGS",
  codage:           "Codage",
  validation:       "Validation",
  paiement:         "Paiement",
  bon_compagnie:    "Bon Compagnie",
  operations_kribi: "Kribi",
  cloture:          "Clôture",
};

const SLA_HOURS: Record<string, number> = {
  reception:        24,
  soumission_sgs:   48,
  codage:           24,
  validation:       48,
  paiement:         72,
  bon_compagnie:    48,
  operations_kribi: 72,
  cloture:          24,
};

const PROFIL_LABELS: Record<string, string> = {
  dg:             "Directeur Général",
  exploitation:   "Resp. Exploitation",
  logistique:     "Resp. Logistique",
  validation:     "Resp. Validation",
  gestion_sorties:"Resp. Gestion Sorties",
  administratif:  "Service Administratif",
  comptabilite:   "Comptable",
  terrain_kribi:  "Terrain Kribi",
};

const SLAGauge = ({ pct, status }: { pct: number; status: "ok" | "warning" | "critical" }) => {
  const color =
    status === "critical" ? "#ef4444" :
    status === "warning"  ? "#f59e0b" :
    "#22c55e";
  return (
    <div className="relative w-16 h-16">
      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
        <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" className="text-muted/30" strokeWidth="3" />
        <circle
          cx="18" cy="18" r="15.9" fill="none"
          stroke={color} strokeWidth="3"
          strokeDasharray={`${pct} ${100 - pct}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.8s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[10px] font-bold" style={{ color }}>{pct}%</span>
      </div>
    </div>
  );
};

// Employee performance card
const EmployeeCard = ({ emp, rank }: { emp: any; rank: number }) => {
  const [expanded, setExpanded] = useState(false);
  const totalTasks  = emp.tachesTotal ?? 0;
  const onTime      = emp.tachesEnTemps ?? 0;
  const delayed     = emp.tachesEnRetard ?? 0;
  const rate        = totalTasks > 0 ? Math.round((onTime / totalTasks) * 100) : 0;
  const avgH        = emp.tempsMoyen ?? 0;
  const status: "ok" | "warning" | "critical" =
    rate >= 80 ? "ok" : rate >= 60 ? "warning" : "critical";

  const rankColors = ["text-yellow-500", "text-gray-400", "text-amber-600"];
  const rankBgs    = ["bg-yellow-50 border-yellow-200", "bg-gray-50 border-gray-200", "bg-amber-50 border-amber-200"];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.05 }}
      className="stat-card p-0 overflow-hidden"
    >
      <div
        className="flex items-center gap-4 px-4 py-3.5 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Rang */}
        <div className={`w-8 h-8 rounded-full border flex items-center justify-center flex-shrink-0 ${rankBgs[rank] ?? "bg-muted/30 border-border"}`}>
          <span className={`text-xs font-black ${rankColors[rank] ?? "text-muted-foreground"}`}>
            {rank === 0 ? "🥇" : rank === 1 ? "🥈" : rank === 2 ? "🥉" : `#${rank + 1}`}
          </span>
        </div>

        {/* Avatar + nom */}
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-secondary/30 to-primary/20 flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-display font-black text-foreground">
            {(emp.nom ?? "?").charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{emp.nom}</p>
          <p className="text-xs text-muted-foreground">{PROFIL_LABELS[emp.profil] ?? emp.profil ?? emp.role ?? "—"}</p>
        </div>

        {/* Métriques principales */}
        <div className="hidden sm:flex items-center gap-6 flex-shrink-0">
          <div className="text-center">
            <p className="text-lg font-display font-black text-foreground">{totalTasks}</p>
            <p className="text-[10px] text-muted-foreground">tâches</p>
          </div>
          <div className="text-center">
            <p className={`text-lg font-display font-black ${delayed > 0 ? "text-red-600" : "text-green-600"}`}>{delayed}</p>
            <p className="text-[10px] text-muted-foreground">retards</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-display font-black text-foreground">{avgH}h</p>
            <p className="text-[10px] text-muted-foreground">moy.</p>
          </div>
        </div>

        {/* Jauge SLA */}
        <SLAGauge pct={rate} status={status} />

        {/* Expand chevron */}
        <button className="text-muted-foreground transition-transform duration-200" style={{ transform: expanded ? "rotate(180deg)" : "none" }}>
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-border/50 overflow-hidden"
          >
            <div className="px-4 py-4 space-y-4 bg-muted/20">
              {/* Stats détaillées */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Tâches réalisées", value: totalTasks, color: "text-foreground" },
                  { label: "Dans les délais", value: onTime, color: "text-green-600" },
                  { label: "Retards enregistrés", value: delayed, color: delayed > 0 ? "text-red-600" : "text-muted-foreground" },
                  { label: "Taux de réussite", value: `${rate}%`, color: rate >= 80 ? "text-green-600" : rate >= 60 ? "text-amber-600" : "text-red-600" },
                ].map(s => (
                  <div key={s.label} className="p-3 rounded-lg bg-card border border-border/50 text-center">
                    <p className={`text-xl font-display font-black ${s.color}`}>{s.value}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Étapes détaillées */}
              {emp.etapes && emp.etapes.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Performance par étape</p>
                  <div className="space-y-2">
                    {emp.etapes.map((et: any) => {
                      const slaH  = SLA_HOURS[et.etape] ?? 24;
                      const ratio = et.tempsMoyen > 0 ? Math.min(100, Math.round((et.tempsMoyen / slaH) * 100)) : 0;
                      const col   = ratio >= 100 ? "bg-red-500" : ratio >= 80 ? "bg-amber-500" : "bg-green-500";
                      return (
                        <div key={et.etape} className="flex items-center gap-3 text-xs">
                          <span className="w-28 text-muted-foreground truncate flex-shrink-0">{STEP_LABELS[et.etape] ?? et.etape}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className={`h-full rounded-full ${col}`} style={{ width: `${ratio}%` }} />
                          </div>
                          <span className="w-12 text-right font-mono text-muted-foreground">{et.tempsMoyen}h</span>
                          <span className="w-10 text-right text-muted-foreground">/ {slaH}h</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Motifs de retards */}
              {emp.motifRetards && emp.motifRetards.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Motifs de retards déclarés</p>
                  <div className="flex flex-wrap gap-1.5">
                    {emp.motifRetards.map((m: any) => (
                      <span key={m.motif} className="text-[10px] px-2 py-1 rounded-full bg-red-50 text-red-700 border border-red-100 font-medium">
                        {m.motif} ({m.count})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

const Performance = () => {
  const [period, setPeriod] = useState<"semaine" | "mois" | "trimestre">("mois");

  const { data: perfData, isLoading } = useQuery({
    queryKey: ["perf-employes", period],
    queryFn:  () => api.get<any>(`/api/reporting/performance?periode=${period}`).catch(() => null),
    staleTime: 60_000,
  });

  const { data: slaData } = useQuery({
    queryKey: ["perf-sla", period],
    queryFn:  () => api.get<any>(`/api/reporting/sla?periode=${period}`).catch(() => null),
    staleTime: 60_000,
  });

  const employes: any[] = perfData?.employes ?? [];
  const globalStats     = perfData?.global ?? {};
  const stepSLA: any[]  = slaData?.etapes ?? [];

  // Sort employees by success rate descending
  const sorted = [...employes].sort((a, b) => {
    const rateA = a.tachesTotal > 0 ? a.tachesEnTemps / a.tachesTotal : 0;
    const rateB = b.tachesTotal > 0 ? b.tachesEnTemps / b.tachesTotal : 0;
    return rateB - rateA;
  });

  const globalRate = globalStats.tachesTotal > 0
    ? Math.round((globalStats.tachesEnTemps / globalStats.tachesTotal) * 100)
    : 0;

  const stepChartData = stepSLA.length > 0 ? stepSLA.map((s: any) => ({
    name: STEP_LABELS[s.etape] ?? s.etape,
    sla:  SLA_HOURS[s.etape] ?? 24,
    reel: s.tempsMoyen ?? 0,
    fill: (s.tempsMoyen ?? 0) > (SLA_HOURS[s.etape] ?? 24) ? "#ef4444" :
          (s.tempsMoyen ?? 0) > (SLA_HOURS[s.etape] ?? 24) * 0.8 ? "#f59e0b" : "#22c55e",
  })) : Object.entries(SLA_HOURS).map(([k, v]) => ({
    name: STEP_LABELS[k] ?? k,
    sla:  v,
    reel: 0,
    fill: "#22c55e",
  }));

  const KPI_CARDS = [
    {
      label: "Taux global",
      value: `${globalRate}%`,
      sub:   `${globalStats.tachesEnTemps ?? 0} / ${globalStats.tachesTotal ?? 0} tâches`,
      icon:  Target,
      color: globalRate >= 80 ? "text-green-600" : globalRate >= 60 ? "text-amber-600" : "text-red-600",
      bg:    globalRate >= 80 ? "bg-green-50"    : globalRate >= 60 ? "bg-amber-50"    : "bg-red-50",
    },
    {
      label: "Tâches réalisées",
      value: globalStats.tachesTotal ?? 0,
      sub:   `sur ${period}`,
      icon:  CheckCircle2,
      color: "text-secondary",
      bg:    "bg-secondary/10",
    },
    {
      label: "Retards déclarés",
      value: globalStats.tachesEnRetard ?? 0,
      sub:   "avec motif enregistré",
      icon:  AlertTriangle,
      color: "text-red-600",
      bg:    "bg-red-50",
    },
    {
      label: "Temps moyen / étape",
      value: `${globalStats.tempsMoyen ?? 0}h`,
      sub:   "tous employés confondus",
      icon:  Clock,
      color: "text-blue-600",
      bg:    "bg-blue-50",
    },
  ];

  return (
    <AppLayout title="Performance" subtitle="Suivi des délais et indicateurs par employé">
      {/* Période selector */}
      <div className="flex items-center gap-2 mb-6">
        {(["semaine", "mois", "trimestre"] as const).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              period === p
                ? "bg-secondary text-secondary-foreground shadow-sm"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {KPI_CARDS.map((k, i) => (
          <motion.div
            key={k.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="stat-card flex items-center gap-4"
          >
            <div className={`w-11 h-11 rounded-xl ${k.bg} flex items-center justify-center flex-shrink-0`}>
              <k.icon className={`w-5 h-5 ${k.color}`} />
            </div>
            <div className="min-w-0">
              <p className={`text-2xl font-display font-black ${k.color}`}>{k.value}</p>
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className="text-[10px] text-muted-foreground/70">{k.sub}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* ── Classement employés ─── */}
        <div className="xl:col-span-2 space-y-3">
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="w-4 h-4 text-secondary" />
            <h2 className="font-display font-semibold text-foreground">
              Classement des employés ({sorted.length})
            </h2>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-secondary/30 border-t-secondary rounded-full animate-spin" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="stat-card text-center py-16">
              <Users className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">Aucune donnée de performance disponible</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Les données s'accumuleront avec l'activité sur la plateforme</p>
            </div>
          ) : (
            sorted.map((emp, i) => (
              <EmployeeCard key={emp.id ?? emp.nom} emp={emp} rank={i} />
            ))
          )}
        </div>

        {/* ── SLA par étape ─── */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Timer className="w-4 h-4 text-secondary" />
            <h2 className="font-display font-semibold text-foreground">SLA par étape</h2>
          </div>

          <div className="stat-card">
            <p className="text-xs text-muted-foreground mb-3">Temps moyen réel vs objectif (heures)</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stepChartData} layout="vertical" margin={{ left: 80, right: 16, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(0,0,0,.06)" />
                  <XAxis type="number" tick={{ fontSize: 9 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={78} />
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 8 }}
                    formatter={(v: any, n: string) => [`${v}h`, n === "reel" ? "Réel" : "SLA"]}
                  />
                  <Bar dataKey="sla" fill="rgba(0,0,0,.06)" name="SLA" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="reel" name="Réel" radius={[0, 4, 4, 0]}>
                    {stepChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-4 mt-2 justify-center">
              {[
                { color: "#22c55e", label: "Dans les délais" },
                { color: "#f59e0b", label: "Risque (>80%)" },
                { color: "#ef4444", label: "Retard" },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ background: l.color }} />
                  {l.label}
                </div>
              ))}
            </div>
          </div>

          {/* Configuration SLA rapide */}
          <div className="stat-card">
            <p className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-secondary" /> Objectifs SLA configurés
            </p>
            <div className="space-y-2">
              {Object.entries(SLA_HOURS).map(([key, h]) => (
                <div key={key} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{STEP_LABELS[key]}</span>
                  <span className="font-mono font-semibold text-foreground bg-muted/50 px-2 py-0.5 rounded">
                    {h}h
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground/60 mt-3">
              Modifiable dans Paramètres → SLA
            </p>
          </div>

          {/* Résumé alertes retards */}
          {globalStats.motifsRetards?.length > 0 && (
            <div className="stat-card">
              <p className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500" /> Causes de retards
              </p>
              <div className="space-y-2">
                {globalStats.motifsRetards.slice(0, 5).map((m: any) => (
                  <div key={m.motif} className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground truncate max-w-[160px]">{m.motif}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-red-400"
                          style={{ width: `${Math.min(100, (m.count / (globalStats.tachesEnRetard || 1)) * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-muted-foreground w-4 text-right">{m.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default Performance;
