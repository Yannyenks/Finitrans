import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, ExternalLink, FileText, Loader2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, openDocument } from "@/lib/api";
import { STATUS_LABELS } from "@/lib/permissions";
import { toast } from "@/hooks/use-toast";

const ETAT: Record<string, { libelle: string; cls: string }> = {
  valide:   { libelle: "Obtenu", cls: "bg-emerald-100 text-emerald-700" },
  en_cours: { libelle: "En cours", cls: "bg-blue-100 text-blue-700" },
  rejete:   { libelle: "Bloqué", cls: "bg-red-100 text-red-700" },
  todo:     { libelle: "À faire", cls: "bg-muted text-muted-foreground" },
};

/** Suivi des bons de la compagnie maritime (bon compagnie, bon à délivrer, bon de livraison) et de leurs documents. */
export default function BonsCompagnie() {
  const navigate = useNavigate();
  const { data = [], isLoading } = useQuery<any[]>({
    queryKey: ["bons-compagnie"], queryFn: () => api.get<any[]>("/api/dossiers/suivi/bons-compagnie"), refetchInterval: 30_000,
  });
  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-secondary" /></div>;
  if (data.length === 0) return <p className="text-sm text-muted-foreground text-center py-10">Aucun bon de compagnie en cours.</p>;

  return (
    <div className="space-y-3" data-testid="bons-compagnie">
      {data.map(({ dossier, documents }) => (
        <div key={dossier.id} className="stat-card">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div>
              <p className="font-semibold text-foreground">{dossier.numero} — {dossier.client}</p>
              <p className="text-xs text-muted-foreground">{dossier.compagnie} · {dossier.site} · {STATUS_LABELS[dossier.status] ?? dossier.status}</p>
            </div>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => navigate(`/dossiers/${dossier.id}`)}><ExternalLink className="w-3.5 h-3.5" /> Ouvrir le dossier</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {documents.map((d: any) => {
              const etat = ETAT[d.statut] ?? ETAT.todo;
              return (
                <div key={d.cle} className="rounded-xl border border-border/60 bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-secondary" /> {d.libelle}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${etat.cls}`}>{etat.libelle}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {d.numero ? `N° ${d.numero}` : "N° non saisi"}{d.date ? ` · ${new Date(`${d.date}T12:00:00`).toLocaleDateString("fr-FR")}` : ""}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                    {d.statut === "valide" ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <Clock className="w-3 h-3" />} {d.responsable ?? "Non attribué"}
                  </p>
                  {d.preuveUrl ? (
                    <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-secondary hover:underline"
                      onClick={() => openDocument(d.preuveUrl).catch((e: Error) => toast({ title: "Document indisponible", description: e.message, variant: "destructive" }))}>
                      <Paperclip className="w-3.5 h-3.5" /> {d.preuveNom ?? "Voir le document"}
                    </button>
                  ) : <p className="mt-2 text-[11px] text-amber-700">Document non joint</p>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
