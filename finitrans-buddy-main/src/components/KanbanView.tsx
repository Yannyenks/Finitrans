import { useNavigate } from "react-router-dom";
import { Ship, MapPin, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

const columns = ["reception", "soumission_sgs", "codage", "validation", "paiement", "bon_compagnie", "operations_kribi", "cloture"];

const STATUS_LABELS: Record<string, string> = {
  reception:        "Réception",
  soumission_sgs:   "SGS",
  codage:           "Codage",
  validation:       "Validation",
  paiement:         "Paiement",
  bon_compagnie:    "Bon Cie",
  operations_kribi: "Kribi",
  cloture:          "Clôturé",
};

const STATUS_COLORS: Record<string, string> = {
  reception:        "bg-blue-100 text-blue-700",
  soumission_sgs:   "bg-indigo-100 text-indigo-700",
  codage:           "bg-purple-100 text-purple-700",
  validation:       "bg-amber-100 text-amber-700",
  paiement:         "bg-orange-100 text-orange-700",
  bon_compagnie:    "bg-green-100 text-green-700",
  operations_kribi: "bg-teal-100 text-teal-700",
  cloture:          "bg-gray-100 text-gray-600",
};

const KanbanView = () => {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["dossiers-kanban"],
    queryFn:  () => api.get<any>("/api/dossiers?limit=200"),
  });

  const allDossiers: any[] = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-secondary" />
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 min-h-[60vh]">
      {columns.map(status => {
        const dossiers = allDossiers.filter(d => d.status === status);
        return (
          <div key={status} className="min-w-[240px] w-[240px] flex-shrink-0">
            <div className="flex items-center gap-2 mb-3 px-1">
              <span className={`status-badge ${STATUS_COLORS[status] ?? "bg-gray-100 text-gray-600"}`}>
                {STATUS_LABELS[status] ?? status}
              </span>
              <span className="text-xs font-medium text-muted-foreground">{dossiers.length}</span>
            </div>
            <div className="space-y-2">
              {dossiers.map((d: any, i: number) => (
                <motion.div
                  key={d.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="stat-card p-3 cursor-pointer hover:border-secondary/50"
                  onClick={() => navigate(`/dossiers/${d.id}`)}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-display font-bold text-foreground">{d.numero}</span>
                    <span className={`w-2 h-2 rounded-full ${
                      d.priorite === "haute" ? "bg-destructive" : d.priorite === "moyenne" ? "bg-warning" : "bg-success"
                    }`} />
                  </div>
                  <p className="text-xs text-foreground truncate">{d.client}</p>
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">{d.marchandise}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] text-muted-foreground font-mono">{d.conteneur?.slice(-7)}</span>
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      {d.site === "Kribi" ? <MapPin className="w-2.5 h-2.5" /> : <Ship className="w-2.5 h-2.5" />}
                      {d.site}
                    </span>
                  </div>
                </motion.div>
              ))}
              {dossiers.length === 0 && (
                <div className="text-center py-8 text-xs text-muted-foreground opacity-50">Aucun dossier</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default KanbanView;
