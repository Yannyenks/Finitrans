import AppLayout from "@/components/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { MapPin, ChevronRight, BarChart3, Loader2, CheckCircle, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Progress } from "@/components/ui/progress";

const PROFIL_LABELS: Record<string, string> = {
  dg:              "Directeur Général",
  exploitation:    "Chef Exploitation",
  operations:      "Responsable Opérations",
  validation:      "Validation & Codage",
  administration:  "Administration",
  comptabilite:    "Comptabilité",
  terrain_kribi:   "Agent Terrain Kribi",
};

const Employes = () => {
  const navigate = useNavigate();

  const { data: empData, isLoading } = useQuery({
    queryKey: ["employes"],
    queryFn:  () => api.get<any>("/api/employes?limit=50&actif=true"),
  });

  const { data: chartsData } = useQuery({
    queryKey: ["dashboard-charts"],
    queryFn:  () => api.get<any>("/api/dashboard/charts"),
  });

  const employes   = empData?.data ?? [];
  const perfMap    = new Map((chartsData?.tauxRetardParEmploye ?? []).map((e: any) => [e.nom, e]));

  return (
    <AppLayout title="Espace Employés" subtitle={`Performance et suivi individuel — ${employes.length} collaborateurs`}>
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-secondary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {employes.map((emp: any, i: number) => {
            const perf: any = perfMap.get(emp.nom) ?? { actifs: 0, enRetard: 0, tauxRetard: 0 };
            const rendement = 100 - perf.tauxRetard;
            return (
              <motion.div
                key={emp.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className="stat-card cursor-pointer hover:border-secondary/50"
                onClick={() => navigate(`/employes/${encodeURIComponent(emp.nom)}`)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-primary-foreground">{emp.nom.split(" ").pop()?.charAt(0)}</span>
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-display font-bold text-foreground truncate">{emp.nom}</h3>
                      <p className="text-xs text-muted-foreground">{emp.role}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="w-3 h-3" /> {emp.site}
                        </div>
                        <div className={`w-1.5 h-1.5 rounded-full ${emp.actif ? "bg-success" : "bg-muted-foreground"}`} />
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>

                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="text-center p-2 rounded-lg bg-muted/50">
                    <div className="text-lg font-display font-bold text-foreground">{perf.actifs}</div>
                    <div className="text-[10px] text-muted-foreground">Actifs</div>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-muted/50">
                    <div className="text-lg font-display font-bold text-destructive">{perf.enRetard}</div>
                    <div className="text-[10px] text-muted-foreground">Retard</div>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-muted/50">
                    <div className={`text-lg font-display font-bold ${rendement >= 80 ? "text-success" : rendement >= 50 ? "text-warning" : "text-destructive"}`}>{rendement}%</div>
                    <div className="text-[10px] text-muted-foreground">Perf.</div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground flex items-center gap-1"><BarChart3 className="w-3 h-3" /> Rendement</span>
                    <span className="font-display font-bold text-foreground">{rendement}%</span>
                  </div>
                  <Progress value={rendement} className="h-1.5" />
                </div>

                <div className="mt-3 pt-3 border-t border-border/50 flex items-center gap-2">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {PROFIL_LABELS[emp.profil] ?? emp.profil}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </AppLayout>
  );
};

export default Employes;
