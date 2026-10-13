import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PROFIL_LABELS } from "@/lib/permissions";
import { toast } from "@/hooks/use-toast";
import { Check, CheckCircle2, Loader2, Search, UserCog, UserPlus, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Personne = { id: string; nom: string; role?: string | null; profil?: string };
type EtapeEquipe = {
  etape: string; label: string; position: number; terminee: boolean; courante: boolean; modifiable: boolean;
  affectation: { responsable: Personne; assignePar: string; note?: string | null; updatedAt: string } | null;
  titulaires: (Personne & { taches: number })[];
  tachesOuvertes: number;
};

/**
 * Équipe du parcours : qui traite chaque étape du dossier. Les responsables du dossier
 * (et la Direction) confient à l'avance une étape à l'employé de leur choix.
 */
const EquipeParcours = ({ dossierId, employes }: { dossierId: string; employes: Personne[] }) => {
  const qc = useQueryClient();
  const [cible, setCible] = useState<EtapeEquipe | null>(null);
  const [choix, setChoix] = useState("");
  const [note, setNote] = useState("");
  const [recherche, setRecherche] = useState("");

  const { data: etapes = [], isLoading } = useQuery({
    queryKey: ["dossier-affectations", dossierId],
    queryFn: () => api.get<EtapeEquipe[]>(`/api/dossiers/${dossierId}/affectations`),
  });

  const rafraichir = () => {
    for (const k of ["dossier-affectations", "sous-etapes", "dossier", "dossier-next", "dossier-audit"]) qc.invalidateQueries({ queryKey: [k, dossierId] });
    qc.invalidateQueries({ queryKey: ["mes-taches"] });
  };
  const erreur = (e: any) => toast({ title: "Affectation impossible", description: e?.message, variant: "destructive" });
  const affecter = useMutation({
    mutationFn: () => api.put<any>(`/api/dossiers/${dossierId}/affectations/${cible!.etape}`, { responsableId: choix, note: note.trim() || undefined }),
    onSuccess: (r: any) => {
      rafraichir();
      toast({ title: `Étape « ${cible?.label} » confiée à ${r.responsable?.nom}`, description: `${r.tachesAttribuees} tâche(s) transmise(s) — la personne est notifiée.` });
      setCible(null);
    },
    onError: erreur,
  });
  const retirer = useMutation({
    mutationFn: (etape: string) => api.delete(`/api/dossiers/${dossierId}/affectations/${etape}`),
    onSuccess: () => { rafraichir(); toast({ title: "Désignation retirée" }); setCible(null); },
    onError: erreur,
  });

  const ouvrir = (e: EtapeEquipe) => {
    setCible(e);
    setChoix(e.affectation?.responsable.id ?? "");
    setNote("");
    setRecherche("");
  };

  const titulairesIds = useMemo(() => new Set(cible?.titulaires.map(t => t.id) ?? []), [cible]);
  const liste = employes
    .filter(u => !recherche || `${u.nom} ${u.role ?? ""} ${PROFIL_LABELS[u.profil ?? ""] ?? ""}`.toLowerCase().includes(recherche.toLowerCase()))
    .sort((a, b) => Number(titulairesIds.has(b.id)) - Number(titulairesIds.has(a.id)) || a.nom.localeCompare(b.nom));

  return (
    <div className="stat-card" data-testid="equipe-parcours">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-semibold text-foreground flex items-center gap-2"><Users className="w-4 h-4 text-secondary" /> Équipe du parcours</h3>
        <span className="text-[10px] text-muted-foreground">qui traite chaque étape</span>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
      ) : (
        <ol className="relative space-y-0.5">
          {etapes.map((e, i) => {
            const qui = e.affectation?.responsable ?? [...e.titulaires].sort((a, b) => b.taches - a.taches)[0];
            return (
              <li key={e.etape} className={cn("relative flex items-start gap-3 rounded-lg px-2 py-2", e.courante && "bg-secondary/5")} data-etape={e.etape}>
                {i < etapes.length - 1 && <span className="absolute left-[17px] top-7 bottom-[-6px] w-px bg-border" aria-hidden />}
                <span className={cn(
                  "relative z-10 mt-0.5 flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full border-2",
                  e.terminee ? "border-success bg-success text-white" : e.courante ? "border-secondary bg-background" : "border-border bg-background",
                )}>
                  {e.terminee ? <Check className="w-2.5 h-2.5" /> : e.courante ? <span className="h-1.5 w-1.5 rounded-full bg-secondary animate-pulse" /> : null}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className={cn("text-xs font-semibold", e.terminee ? "text-muted-foreground" : "text-foreground")}>{e.label}</p>
                    {e.courante && <span className="text-[9px] font-bold uppercase tracking-wide text-secondary">en cours</span>}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate" title={e.affectation?.note ?? undefined}>
                    {qui ? <span className={cn(e.affectation && "font-semibold text-foreground")}>{qui.nom}</span> : "Non attribuée"}
                    {e.affectation ? <span> · désigné par {e.affectation.assignePar}</span> : qui ? <span> · attribution auto</span> : null}
                  </p>
                </div>
                {e.modifiable && (
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] gap-1 text-secondary" onClick={() => ouvrir(e)} aria-label={`Assigner l'étape ${e.label}`}>
                    {e.affectation ? <UserCog className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                    {e.affectation ? "Changer" : "Assigner"}
                  </Button>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <Dialog open={!!cible} onOpenChange={o => !o && setCible(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confier l'étape « {cible?.label} »</DialogTitle>
            <DialogDescription>
              La personne choisie reçoit les {cible?.tachesOuvertes ?? 0} tâche(s) ouverte(s) de l'étape et sera proposée au passage d'étape.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8 h-9 text-sm" placeholder="Rechercher un employé…" value={recherche} onChange={ev => setRecherche(ev.target.value)} />
          </div>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-border divide-y divide-border/60" role="listbox" aria-label="Employés">
            {liste.map(u => (
              <button key={u.id} type="button" role="option" aria-selected={choix === u.id} onClick={() => setChoix(u.id)}
                className={cn("flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/50", choix === u.id && "bg-secondary/10")}>
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">
                  {u.nom.replace(/^(Mr|Mme|M\.)\s+/i, "").slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground truncate">{u.nom}</span>
                  <span className="block text-[11px] text-muted-foreground truncate">{u.role ?? PROFIL_LABELS[u.profil ?? ""] ?? ""}</span>
                </span>
                {titulairesIds.has(u.id) && <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">titulaire actuel</span>}
                {choix === u.id && <CheckCircle2 className="w-4 h-4 text-secondary" />}
              </button>
            ))}
            {liste.length === 0 && <p className="px-3 py-6 text-center text-xs text-muted-foreground">Aucun employé trouvé</p>}
          </div>
          <Textarea rows={2} className="text-sm" placeholder="Consignes pour la personne désignée (facultatif)" value={note} onChange={ev => setNote(ev.target.value)} />
          <div className="flex items-center justify-between gap-2">
            {cible?.affectation ? (
              <Button variant="ghost" size="sm" className="text-destructive gap-1" disabled={retirer.isPending} onClick={() => retirer.mutate(cible.etape)}>
                <X className="w-3.5 h-3.5" /> Retirer la désignation
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setCible(null)}>Annuler</Button>
              <Button disabled={!choix || affecter.isPending} onClick={() => affecter.mutate()}>
                {affecter.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />} Confier l'étape
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EquipeParcours;
