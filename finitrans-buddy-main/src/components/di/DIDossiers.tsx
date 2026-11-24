import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FolderOpen, Link2, Loader2, Search, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api } from "@/lib/api";
import { STATUS_LABELS } from "@/lib/permissions";
import { toast } from "@/hooks/use-toast";

/** Dossiers réellement rattachés à une DI (relation Dossier → DI) : liste, ouverture, rattachement, dissociation. */
export default function DIDossiers({ diId, diNumero, canEdit }: { diId: string; diNumero: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: di, isLoading } = useQuery<any>({ queryKey: ["di", diId], queryFn: () => api.get<any>(`/api/di/${diId}`), refetchInterval: 30_000 });
  const [recherche, setRecherche] = useState("");
  const [aDissocier, setADissocier] = useState<any | null>(null);
  const { data: candidats } = useQuery<any>({
    queryKey: ["di-candidats", recherche],
    queryFn: () => api.get<any>(`/api/dossiers?limit=8${recherche.trim() ? `&search=${encodeURIComponent(recherche.trim())}` : ""}`),
    enabled: canEdit && recherche.trim().length >= 2,
  });
  const rafraichir = () => {
    for (const k of [["di", diId], ["di-dashboard", diId], ["di-list"], ["di-stats-resume"], ["dossiers"]]) qc.invalidateQueries({ queryKey: k });
  };
  const lier = useMutation({
    mutationFn: (dossierId: string) => api.post(`/api/di/${diId}/lier-dossier`, { dossierId }),
    onSuccess: () => { rafraichir(); setRecherche(""); toast({ title: "Dossier rattaché", description: `à la DI ${diNumero}` }); },
    onError: (e: any) => toast({ title: "Rattachement impossible", description: e.message, variant: "destructive" }),
  });
  const delier = useMutation({
    mutationFn: (dossierId: string) => api.post(`/api/di/${diId}/delier-dossier`, { dossierId }),
    onSuccess: () => { rafraichir(); setADissocier(null); toast({ title: "Dossier dissocié", description: `de la DI ${diNumero}` }); },
    onError: (e: any) => { setADissocier(null); toast({ title: "Dissociation impossible", description: e.message, variant: "destructive" }); },
  });

  const dossiers: any[] = di?.dossiers ?? [];
  const proposes: any[] = (candidats?.data ?? []).filter((d: any) => !dossiers.some(x => x.id === d.id));

  return (
    <div className="stat-card mb-3" data-testid="di-dossiers">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h4 className="font-display font-semibold text-foreground flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-secondary" /> Dossiers rattachés à la DI {diNumero}
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-secondary/10 text-secondary">{dossiers.length}</span>
        </h4>
      </div>

      {isLoading ? <Loader2 className="w-5 h-5 animate-spin text-secondary" /> : dossiers.length === 0 ? (
        <p className="text-sm text-muted-foreground py-3">Aucun dossier rattaché à cette DI.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] text-muted-foreground border-b border-border">
              <th className="py-2 pr-3">Dossier</th><th className="py-2 pr-3">Client</th><th className="py-2 pr-3">Étape</th>
              <th className="py-2 pr-3">Responsable</th><th className="py-2 pr-3">Mouvements DI</th><th className="py-2"></th>
            </tr></thead>
            <tbody>
              {dossiers.map(d => (
                <tr key={d.id} className="border-b border-border/40">
                  <td className="py-2 pr-3 font-semibold whitespace-nowrap">{d.numero}</td>
                  <td className="py-2 pr-3">{d.client}</td>
                  <td className="py-2 pr-3 text-xs">{d.finaliseLe ? "Terminé" : STATUS_LABELS[d.status] ?? d.status}</td>
                  <td className="py-2 pr-3 text-xs">{d.responsable?.nom ?? "—"}</td>
                  <td className="py-2 pr-3 text-xs">{d._count?.mouvementsDI ?? 0}</td>
                  <td className="py-2 text-right whitespace-nowrap">
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => navigate(`/dossiers/${d.id}`)}><ExternalLink className="w-3 h-3" /> Ouvrir</Button>
                    {canEdit && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-destructive ml-1" disabled={(d._count?.mouvementsDI ?? 0) > 0}
                        title={(d._count?.mouvementsDI ?? 0) > 0 ? "Des mouvements de cette DI concernent ce dossier : dissociation impossible" : "Dissocier de la DI"}
                        onClick={() => setADissocier(d)}><Unlink className="w-3 h-3" /> Dissocier</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <p className="text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1.5"><Link2 className="w-3.5 h-3.5 text-secondary" /> Rattacher un dossier</p>
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="N° de dossier, client, conteneur…" className="pl-9 bg-card" />
          </div>
          {recherche.trim().length >= 2 && (
            <div className="mt-2 space-y-1 max-w-md">
              {proposes.map(d => (
                <button key={d.id} type="button" disabled={lier.isPending} onClick={() => lier.mutate(d.id)}
                  className="w-full flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-muted">
                  <span><span className="font-semibold">{d.numero}</span> — {d.client}{d.diId ? <span className="text-[10px] text-amber-700"> · déjà sur une autre DI</span> : ""}</span>
                  <Link2 className="w-3.5 h-3.5 text-secondary" />
                </button>
              ))}
              {proposes.length === 0 && <p className="text-xs text-muted-foreground">Aucun dossier trouvé</p>}
            </div>
          )}
        </div>
      )}

      <AlertDialog open={!!aDissocier} onOpenChange={o => { if (!o) setADissocier(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dissocier le dossier {aDissocier?.numero} ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le dossier ne sera plus rattaché à la DI {diNumero}. Ses débits futurs ne seront plus imputés sur cette DI. L'opération est tracée dans le journal du dossier.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={e => { e.preventDefault(); if (aDissocier) delier.mutate(aDissocier.id); }}>
              {delier.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Dissocier"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
