import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { AlertTriangle, Clock, FileWarning, DollarSign, Bell, Users, Filter, Settings, Eye, TrendingDown, Loader2, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

const alertIcons: Record<string, any> = {
  detention:  AlertTriangle,
  paiement:   DollarSign,
  blocage:    Clock,
  document:   FileWarning,
  charge:     Users,
  di_seuil:   TrendingDown,
};

const severityStyles: Record<string, string> = {
  critical: "border-l-destructive bg-red-50",
  warning:  "border-l-warning bg-amber-50",
  info:     "border-l-secondary bg-blue-50",
};

const Alertes = () => {
  const navigate     = useNavigate();
  const qc           = useQueryClient();
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterType, setFilterType]         = useState("all");

  const params = new URLSearchParams({ limit: "100" });
  if (filterSeverity !== "all") params.set("severity", filterSeverity);
  if (filterType !== "all")     params.set("type",     filterType);

  const { data, isLoading } = useQuery({
    queryKey: ["alertes", filterSeverity, filterType],
    queryFn:  () => api.get<any>(`/api/alertes?${params}`),
  });

  const { data: configs } = useQuery({
    queryKey: ["alertes-config"],
    queryFn:  () => api.get<any[]>("/api/alertes/config"),
  });

  const lireTout = useMutation({
    mutationFn: () => api.patch("/api/alertes/lire-tout"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alertes"] }),
  });

  const lireAlerte = useMutation({
    mutationFn: (id: string) => api.patch(`/api/alertes/${id}/lire`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alertes"] }),
  });

  const alertes    = data?.data ?? [];
  const nonLues    = data?.nonLues ?? 0;
  const critiques  = alertes.filter((a: any) => a.severity === "critical").length;
  const warnings   = alertes.filter((a: any) => a.severity === "warning").length;

  return (
    <AppLayout title="Alertes & Anticipation" subtitle="Gestion proactive des risques">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total alertes",   value: alertes.length, color: "text-secondary" },
          { label: "Critiques",       value: critiques,      color: "text-destructive" },
          { label: "Avertissements",  value: warnings,       color: "text-warning" },
          { label: "Non lues",        value: nonLues,        color: "text-foreground" },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="stat-card">
            <div className="text-2xl font-display font-bold text-foreground">{s.value}</div>
            <div className={`text-sm ${s.color}`}>{s.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)} className="h-9 px-3 rounded-lg border border-border bg-card text-xs text-foreground">
          <option value="all">Toutes sévérités</option>
          <option value="critical">Critique</option>
          <option value="warning">Attention</option>
          <option value="info">Info</option>
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="h-9 px-3 rounded-lg border border-border bg-card text-xs text-foreground">
          <option value="all">Tous types</option>
          <option value="detention">Détention</option>
          <option value="paiement">Paiement</option>
          <option value="blocage">Blocage</option>
          <option value="document">Document</option>
          <option value="charge">Charge</option>
          <option value="di_seuil">DI Seuil</option>
        </select>
        {nonLues > 0 && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => lireTout.mutate()} disabled={lireTout.isPending}>
            <CheckCheck className="w-3.5 h-3.5" /> Tout marquer lu
          </Button>
        )}
        <Button variant="outline" size="sm" className="gap-1.5 ml-auto" onClick={() => navigate("/parametres")}>
          <Settings className="w-3.5 h-3.5" /> Configurer seuils
        </Button>
      </div>

      {/* Alert list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-secondary" />
        </div>
      ) : (
        <div className="space-y-3 max-w-3xl">
          {alertes.map((alert: any, i: number) => {
            const Icon = alertIcons[alert.type] ?? Bell;
            return (
              <motion.div
                key={alert.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className={`stat-card border-l-4 ${severityStyles[alert.severity] ?? ""} flex items-start gap-4 ${!alert.lu ? "ring-1 ring-secondary/20" : ""}`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  alert.severity === "critical" ? "bg-destructive/10 text-destructive" :
                  alert.severity === "warning"  ? "bg-warning/10 text-warning" :
                  "bg-secondary/10 text-secondary"
                }`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">{alert.message}</p>
                    {!alert.lu && <span className="w-2 h-2 rounded-full bg-secondary flex-shrink-0 mt-1" />}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {alert.dossier && (
                      <button onClick={() => navigate(`/dossiers/${alert.dossierId}`)} className="text-xs text-secondary hover:underline flex items-center gap-1">
                        <Eye className="w-3 h-3" /> {alert.dossier.numero}
                      </button>
                    )}
                    <span className="text-xs text-muted-foreground">{new Date(alert.createdAt).toLocaleDateString("fr-FR")}</span>
                    <span className={`status-badge ml-auto text-[10px] ${
                      alert.severity === "critical" ? "bg-red-100 text-red-700" :
                      alert.severity === "warning"  ? "bg-amber-100 text-amber-700" :
                      "bg-blue-100 text-blue-700"
                    }`}>
                      {alert.severity === "critical" ? "Critique" : alert.severity === "warning" ? "Attention" : "Info"}
                    </span>
                    {!alert.lu && (
                      <button onClick={() => lireAlerte.mutate(alert.id)} className="text-xs text-muted-foreground hover:text-foreground">Marquer lu</button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}

          {alertes.length === 0 && (
            <div className="text-center py-20 text-muted-foreground">
              <Bell className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p>Aucune alerte pour ces filtres</p>
            </div>
          )}
        </div>
      )}

      {/* Configs actives */}
      {(configs ?? []).length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="stat-card mt-6 max-w-3xl">
          <h3 className="font-display font-semibold text-foreground mb-3">Règles d'alertes actives</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(configs ?? []).filter((c: any) => c.actif).map((c: any) => (
              <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <div className="w-2 h-2 rounded-full bg-success" />
                <div className="flex-1">
                  <p className="text-sm text-foreground">{c.label}</p>
                  <p className="text-xs text-muted-foreground">{c.seuil} {c.unite}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </AppLayout>
  );
};

export default Alertes;
