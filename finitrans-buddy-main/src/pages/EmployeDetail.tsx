import { useParams, useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ArrowLeft, FolderOpen, Clock, AlertTriangle, Mail, Phone, MapPin, CheckCircle2, BarChart3, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Progress } from "@/components/ui/progress";

const STATUS_LABELS: Record<string, string> = {
  reception: "Réception", codage: "Codage", validation: "Validation",
  paiement: "Paiement", bon_compagnie: "Bon Cie", operations_kribi: "Kribi", cloture: "Clôturé",
};
const STATUS_COLORS: Record<string, string> = {
  reception: "bg-blue-100 text-blue-700", codage: "bg-purple-100 text-purple-700",
  validation: "bg-amber-100 text-amber-700", paiement: "bg-orange-100 text-orange-700",
  bon_compagnie: "bg-green-100 text-green-700", operations_kribi: "bg-teal-100 text-teal-700",
  cloture: "bg-gray-100 text-gray-600",
};

const PERM_LABELS: Record<string, string> = {
  permDossier: "Dossiers", permValidation: "Validation", permFinancier: "Finance",
  permRapports: "Rapports", permAdministration: "Administration",
};

const EmployeDetail = () => {
  const { name } = useParams();
  const navigate = useNavigate();
  const decodedName = decodeURIComponent(name || "");

  const { data: empData, isLoading } = useQuery({
    queryKey: ["employes-list-detail", decodedName],
    queryFn:  () => api.get<any>(`/api/employes?limit=50`),
  });

  const { data: chartsData } = useQuery({
    queryKey: ["dashboard-charts"],
    queryFn:  () => api.get<any>("/api/dashboard/charts"),
  });

  const { data: dossiersData } = useQuery({
    queryKey: ["dossiers-employe", decodedName],
    queryFn:  () => api.get<any>(`/api/dossiers?limit=20`),
  });

  const employes = empData?.data ?? [];
  const employee = employes.find((e: any) => e.nom === decodedName);
  const dossiers = (dossiersData?.data ?? []).filter((d: any) => d.responsable?.nom === decodedName);
  const perf = (chartsData?.tauxRetardParEmploye ?? []).find((e: any) => e.nom === decodedName) ?? { actifs: 0, enRetard: 0, tauxRetard: 0 };

  if (isLoading) {
    return (
      <AppLayout title="Chargement...">
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-secondary" /></div>
      </AppLayout>
    );
  }

  if (!employee) {
    return (
      <AppLayout title="Employé introuvable">
        <div className="text-center py-20">
          <p className="text-muted-foreground mb-4">Cet employé n'existe pas.</p>
          <Button onClick={() => navigate("/employes")} variant="outline">Retour</Button>
        </div>
      </AppLayout>
    );
  }

  const rendement = 100 - perf.tauxRetard;

  return (
    <AppLayout title={employee.nom} subtitle={`${employee.role} — ${employee.site}`}>
      <button onClick={() => navigate("/employes")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> Retour
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="lg:col-span-2 space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: "Dossiers actifs", value: perf.actifs,    icon: FolderOpen,   color: "text-secondary" },
              { label: "En retard",       value: perf.enRetard,  icon: AlertTriangle,color: "text-destructive" },
              { label: "Rendement",       value: `${rendement}%`,icon: CheckCircle2, color: "text-success" },
            ].map((s, i) => (
              <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="stat-card text-center">
                <s.icon className={`w-5 h-5 mx-auto mb-2 ${s.color}`} />
                <div className="text-xl font-display font-bold text-foreground">{s.value}</div>
                <div className="text-[10px] text-muted-foreground">{s.label}</div>
              </motion.div>
            ))}
          </div>

          {/* Performance */}
          <div className="stat-card">
            <h3 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-secondary" /> Indicateurs de performance
            </h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Rendement</span>
                  <span className="font-display font-bold text-foreground">{rendement}%</span>
                </div>
                <Progress value={rendement} className="h-2" />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Taux de retard</span>
                  <span className="font-display font-bold text-foreground">{perf.tauxRetard}%</span>
                </div>
                <Progress value={perf.tauxRetard} className="h-2" />
              </div>
            </div>
          </div>

          {/* Dossiers */}
          <div className="stat-card">
            <h3 className="font-display font-semibold text-foreground mb-4">Dossiers assignés ({dossiers.length})</h3>
            <div className="space-y-2">
              {dossiers.map((d: any) => (
                <div key={d.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 cursor-pointer hover:bg-muted" onClick={() => navigate(`/dossiers/${d.id}`)}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{d.numero}</span>
                      <span className={`status-badge ${STATUS_COLORS[d.status] ?? "bg-gray-100 text-gray-600"}`}>{STATUS_LABELS[d.status]?.split(" ")[0] ?? d.status}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{d.client}</p>
                  </div>
                  <span className={`w-2 h-2 rounded-full ${d.priorite === "haute" ? "bg-destructive" : d.priorite === "moyenne" ? "bg-warning" : "bg-success"}`} />
                </div>
              ))}
              {dossiers.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Aucun dossier assigné</p>}
            </div>
          </div>
        </motion.div>

        {/* Sidebar */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-6">
          <div className="stat-card">
            <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center mx-auto mb-4">
              <span className="text-xl font-bold text-primary-foreground">{employee.nom.split(" ").pop()?.charAt(0)}</span>
            </div>
            <h3 className="text-center font-display font-bold text-foreground">{employee.nom}</h3>
            <p className="text-center text-sm text-muted-foreground mb-4">{employee.role}</p>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground"><MapPin className="w-4 h-4" /> {employee.site}</div>
              <div className="flex items-center gap-2 text-muted-foreground"><Mail className="w-4 h-4" /> {employee.email}</div>
              {employee.telephone && <div className="flex items-center gap-2 text-muted-foreground"><Phone className="w-4 h-4" /> {employee.telephone}</div>}
            </div>
          </div>

          {/* Permissions */}
          <div className="stat-card">
            <h3 className="font-display font-semibold text-foreground mb-3">Droits d'accès</h3>
            <div className="space-y-2">
              {Object.entries(PERM_LABELS).map(([key, label]) => {
                const val = (employee as any)[key] ?? "non";
                return (
                  <div key={key} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className={`status-badge ${val === "complet" ? "bg-green-100 text-green-700" : val === "partiel" ? "bg-amber-100 text-amber-700" : val === "lecture" ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"}`}>{val}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      </div>
    </AppLayout>
  );
};

export default EmployeDetail;
