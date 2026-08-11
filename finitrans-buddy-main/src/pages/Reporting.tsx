import AppLayout from "@/components/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Clock, TrendingUp, AlertTriangle, BarChart3, Timer, CheckCircle2, Loader2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { motion } from "framer-motion";

const STATUS_LABELS: Record<string, string> = {
  reception: "Réception", codage: "Codage", validation: "Validation",
  paiement: "Paiement", bon_compagnie: "Bon Cie", operations_kribi: "Kribi", cloture: "Clôturé",
};

const STATUS_STEP: Record<string, number> = {
  reception: 1, codage: 2, validation: 3, paiement: 4,
  bon_compagnie: 5, operations_kribi: 6, cloture: 7,
};

const Reporting = () => {
  const { data: kpis, isLoading } = useQuery({
    queryKey: ["dashboard-kpis"],
    queryFn: () => api.get<any>("/api/dashboard/kpis"),
  });
  const { data: timingData } = useQuery({
    queryKey: ["reporting-timing"],
    queryFn: () => api.get<any>("/api/reporting/timing"),
  });
  const { data: exploitData } = useQuery({
    queryKey: ["dashboard-exploitation"],
    queryFn: () => api.get<any>("/api/dashboard/exploitation"),
  });
  const { data: reportingData } = useQuery({
    queryKey: ["reporting-dossiers"],
    queryFn: () => api.get<any>("/api/reporting/dossiers"),
  });

  const dossiersEnRetard: any[] = exploitData?.dossiersEnRetard ?? [];

  const timingByEtape = (timingData?.analyse ?? []).map((s: any) => ({
    etape:       STATUS_LABELS[s.etape]?.split(" ")[0] ?? s.etape,
    etapeFull:   STATUS_LABELS[s.etape] ?? s.etape,
    count:       s.totalDossiers,
    moyenne:     Math.round((s.dureeMoyenneHeures / 24) * 10) / 10,
    prevue:      3,
    depassement: s.tauxDepassement > 30,
  }));

  const totalDossiers = kpis?.totalDossiers ?? 0;
  const enCours       = kpis?.dossiersActifs ?? 0;
  const clotures      = kpis?.dossiersClotures30j ?? 0;

  const now = new Date();
  const dossierDurees = (reportingData?.dossiers ?? []).slice(0, 50).map((d: any) => {
    const debut      = new Date(d.dateCreation);
    const dureeJours = Math.ceil((now.getTime() - debut.getTime()) / (1000 * 60 * 60 * 24));
    const retardInfo = dossiersEnRetard.find((r: any) => r.id === d.id);
    const enRetard   = !!retardInfo;
    return { ...d, dureeJours, enRetard, jourRetard: retardInfo?.joursRetard ?? 0 };
  });

  if (isLoading) {
    return (
      <AppLayout title="Reporting & Timing" subtitle="Suivi avancement des dossiers et performance">
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-secondary" /></div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Reporting & Timing" subtitle="Suivi avancement des dossiers et performance">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Dossiers total",  value: totalDossiers,          icon: BarChart3,    color: "text-secondary" },
          { label: "En cours",        value: enCours,                icon: Timer,        color: "text-accent" },
          { label: "Clôturés (30j)",  value: clotures,               icon: CheckCircle2, color: "text-success" },
          { label: "En retard",       value: dossiersEnRetard.length, icon: AlertTriangle, color: "text-destructive" },
        ].map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="stat-card">
            <div className="flex items-center gap-2 mb-2">
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
              <span className="text-xs text-muted-foreground">{stat.label}</span>
            </div>
            <span className="text-2xl font-display font-bold text-foreground">{stat.value}</span>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Timing moyen par étape */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="stat-card">
          <h3 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-secondary" /> Durée moyenne par étape (jours)
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={timingByEtape} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis type="category" dataKey="etape" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={90} />
              <Tooltip
                contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                formatter={(v: number, name: string) => [`${v} jour(s)`, name === "moyenne" ? "Réel" : "Prévu"]}
              />
              <Bar dataKey="prevue" fill="hsl(var(--muted))" radius={[0, 4, 4, 0]} name="Prévu" />
              <Bar dataKey="moyenne" radius={[0, 4, 4, 0]} name="Réel">
                {timingByEtape.map((entry: any, idx: number) => (
                  <Cell key={idx} fill={entry.depassement ? "hsl(var(--destructive))" : "hsl(var(--secondary))"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Dossiers en retard */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="stat-card">
          <h3 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive" /> Dossiers en retard ({dossiersEnRetard.length})
          </h3>
          <div className="space-y-2 max-h-[280px] overflow-y-auto">
            {dossiersEnRetard.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Aucun dossier en retard</p>
            ) : (
              dossiersEnRetard.map((d: any) => (
                <a key={d.id} href={`/dossiers/${d.id}`} className="flex items-center justify-between p-3 rounded-lg bg-destructive/5 border border-destructive/20 hover:bg-destructive/10 transition-colors">
                  <div>
                    <span className="text-sm font-semibold text-foreground">{d.numero}</span>
                    <p className="text-xs text-muted-foreground">{d.client} — {d.marchandise}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {STATUS_LABELS[d.status]}{d.responsable?.nom ? ` — ${d.responsable.nom}` : ""}
                    </p>
                  </div>
                  <span className="status-badge bg-red-100 text-red-700 text-xs whitespace-nowrap">
                    +{d.joursRetard}j retard
                  </span>
                </a>
              ))
            )}
          </div>
        </motion.div>
      </div>

      {/* Avancement détaillé des dossiers */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="stat-card overflow-hidden p-0">
        <div className="p-4 border-b border-border">
          <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-secondary" /> Avancement détaillé des dossiers
          </h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Dossier</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Client</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Étape actuelle</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Durée (j)</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Progression</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Statut</th>
            </tr>
          </thead>
          <tbody>
            {dossierDurees.map((d: any) => {
              const step       = STATUS_STEP[d.status] ?? 1;
              const progressPct = Math.round((step / 7) * 100);
              return (
                <tr key={d.id} className={`border-b border-border/50 hover:bg-muted/30 ${d.enRetard ? "bg-destructive/5" : ""}`}>
                  <td className="px-4 py-3">
                    <a href={`/dossiers/${d.id}`} className="text-sm font-semibold text-foreground hover:text-secondary">{d.numero}</a>
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground">{d.client}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{STATUS_LABELS[d.status]}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-sm font-bold ${d.enRetard ? "text-destructive" : "text-foreground"}`}>{d.dureeJours}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${d.enRetard ? "bg-destructive" : "bg-secondary"}`} style={{ width: `${progressPct}%` }} />
                      </div>
                      <span className="text-[10px] text-muted-foreground w-8">{progressPct}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {d.enRetard ? (
                      <span className="status-badge bg-red-100 text-red-700">+{d.jourRetard}j</span>
                    ) : d.status === "cloture" ? (
                      <span className="status-badge bg-green-100 text-green-700">✓ OK</span>
                    ) : (
                      <span className="status-badge bg-blue-100 text-blue-700">En cours</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {dossierDurees.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">Aucun dossier</td>
              </tr>
            )}
          </tbody>
        </table>
      </motion.div>
    </AppLayout>
  );
};

export default Reporting;
