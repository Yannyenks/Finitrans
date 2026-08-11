import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { AlertTriangle, TrendingDown, Receipt, Clock, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface DITrackerProps {
  dossierId: string;
  diId?: string;
}

const DITracker = ({ dossierId, diId }: DITrackerProps) => {
  const { data: diList } = useQuery({
    queryKey: ["di-by-dossier", dossierId],
    queryFn:  () => api.get<any>(`/api/di?dossierId=${dossierId}&limit=5`),
    enabled: !!dossierId,
  });

  const dis = diList?.data ?? [];
  if (!dis.length) return null;

  return (
    <div className="space-y-4">
      {dis.map((di: any) => {
        const montant    = Number(di.montant);
        const solde      = Number(di.soldeActuel);
        const utilise    = montant - solde;
        const pctRestant = montant > 0 ? (solde / montant) * 100 : 100;
        const consommePct = 100 - pctRestant;
        const isAlerte   = pctRestant <= 20;
        const isCritique = pctRestant <= 10;

        return (
          <div key={di.id} className="stat-card space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
                <Receipt className="w-4 h-4 text-secondary" />
                DI — {di.numero}
              </h3>
              {isAlerte && (
                <span className={`status-badge text-xs flex items-center gap-1 ${isCritique ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                  <AlertTriangle className="w-3 h-3" />
                  {isCritique ? "Critique" : `Seuil ${Math.round(pctRestant)}%`}
                </span>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Consommé</span>
                <span className="font-medium">{consommePct.toFixed(1)}%</span>
              </div>
              <Progress
                value={consommePct}
                className={`h-3 ${isAlerte ? "[&>div]:bg-destructive" : consommePct > 60 ? "[&>div]:bg-amber-500" : "[&>div]:bg-success"}`}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>0 FCFA</span>
                <span>{montant.toLocaleString("fr-FR")} FCFA</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-muted/50 p-2 text-center">
                <p className="text-[10px] text-muted-foreground">Montant</p>
                <p className="text-xs font-bold text-foreground">{montant.toLocaleString("fr-FR")}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2 text-center">
                <p className="text-[10px] text-muted-foreground">Utilisé</p>
                <p className="text-xs font-bold text-foreground">{utilise.toLocaleString("fr-FR")}</p>
              </div>
              <div className={`rounded-lg p-2 text-center ${isAlerte ? "bg-destructive/10" : "bg-success/10"}`}>
                <p className="text-[10px] text-muted-foreground">Solde</p>
                <p className={`text-xs font-bold ${isAlerte ? "text-destructive" : "text-success"}`}>{solde.toLocaleString("fr-FR")}</p>
              </div>
            </div>

            {isAlerte && (
              <div className={`rounded-lg p-3 flex items-start gap-2 ${isCritique ? "bg-destructive/10 border border-destructive/20" : "bg-amber-50 border border-amber-200"}`}>
                <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isCritique ? "text-destructive" : "text-amber-600"}`} />
                <div>
                  <p className={`text-xs font-semibold ${isCritique ? "text-destructive" : "text-amber-700"}`}>
                    {isCritique ? "Solde DI critique !" : "Solde DI bas"}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Il reste {pctRestant.toFixed(1)}% ({solde.toLocaleString("fr-FR")} FCFA).
                  </p>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default DITracker;
