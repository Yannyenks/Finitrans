import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Hourglass, Loader2, Play, ShieldAlert, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMaintenant } from "@/components/CompteARebours";
import { api } from "@/lib/api";
import { duree, dateHeure } from "@/lib/temps";
import { toast } from "@/hooks/use-toast";

export type Phase = { cle: string; libelle: string; description: string; etat: "a_venir" | "en_attente" | "en_cours" | "terminee"; debut: string | null; fin: string | null };
type Motifs = Record<string, { libelle: string; client: string }>;

const STYLE: Record<Phase["etat"], { badge: string; libelle: string; carte: string }> = {
  a_venir:    { badge: "bg-muted text-muted-foreground",          libelle: "À venir",                   carte: "border-border/60 bg-muted/20" },
  en_attente: { badge: "bg-amber-100 text-amber-700",             libelle: "En attente de démarrage",   carte: "border-amber-300/60 bg-amber-50/60" },
  en_cours:   { badge: "bg-secondary/15 text-secondary",          libelle: "En cours",                  carte: "border-secondary/40 bg-gradient-to-br from-secondary/10 to-transparent" },
  terminee:   { badge: "bg-emerald-100 text-emerald-700",         libelle: "Terminée",                  carte: "border-emerald-300/60 bg-emerald-50/50" },
};

/** Les deux grandes phases du dossier, chacune avec son propre chronomètre. */
export function PhasesBandeau({ phases }: { phases: Phase[] }) {
  const maintenant = useMaintenant();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4" data-testid="phases">
      {phases.map((p, i) => {
        const st = STYLE[p.etat];
        const ms = p.debut ? (p.fin ? new Date(p.fin).getTime() : maintenant) - new Date(p.debut).getTime() : null;
        return (
          <div key={p.cle} className={`rounded-xl border p-3 ${st.carte}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-foreground">
                <span className="text-muted-foreground mr-1">Phase {i + 1}</span> {p.libelle}
              </p>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${st.badge}`}>{st.libelle}</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">{p.description}</p>
            <div className="mt-2 flex items-center gap-1.5 text-sm font-mono font-bold text-foreground">
              {p.etat === "terminee" ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : p.etat === "en_cours" ? <Timer className="w-4 h-4 text-secondary" /> : <Hourglass className="w-4 h-4 text-muted-foreground" />}
              {ms !== null ? duree(ms) : "—"}
            </div>
            {p.debut && <p className="text-[10px] text-muted-foreground mt-0.5">Démarrée le {dateHeure(p.debut)}{p.fin ? ` · terminée le ${dateHeure(p.fin)}` : ""}</p>}
          </div>
        );
      })}
    </div>
  );
}

function ChoixMotif({ motifs, motif, setMotif, optionnel }: { motifs: Motifs; motif: string; setMotif: (m: string) => void; optionnel?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-1.5 max-h-64 overflow-y-auto pr-1">
      {optionnel && (
        <button type="button" onClick={() => setMotif("")}
          className={`text-left rounded-lg border px-3 py-2 text-sm transition ${motif === "" ? "border-emerald-500 bg-emerald-50 text-emerald-800 font-semibold" : "border-border hover:bg-muted"}`}>
          Démarrage normal — aucun imprévu
        </button>
      )}
      {Object.entries(motifs).map(([cle, m]) => (
        <button key={cle} type="button" onClick={() => setMotif(cle)}
          className={`text-left rounded-lg border px-3 py-2 text-sm transition ${motif === cle ? "border-amber-500 bg-amber-50 text-amber-900 font-semibold" : "border-border hover:bg-muted"}`}>
          {m.libelle}
        </button>
      ))}
    </div>
  );
}

function ApercuClient({ motifs, motif, commentaire, informer }: { motifs: Motifs; motif: string; commentaire: string; informer: boolean }) {
  if (!motif || !informer) return null;
  return (
    <div className="rounded-lg border border-secondary/30 bg-secondary/5 p-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-secondary mb-1">Message affiché au client</p>
      <p className="text-xs text-foreground whitespace-pre-line">{motifs[motif]?.client}{commentaire.trim() ? `\n${commentaire.trim()}` : ""}{"\n"}Nous vous tiendrons informé de l'évolution.</p>
    </div>
  );
}

/** Bouton « Démarrer l'étape » : démarrage normal, ou avec le motif d'un imprévu. */
export function DemarrerEtapeDialog({ dossierId, etapeLabel, enAttenteDepuis, motifs, onClose }: {
  dossierId: string; etapeLabel: string; enAttenteDepuis?: string | null; motifs: Motifs; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [motif, setMotif] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [informer, setInformer] = useState(true);
  const demarrer = useMutation({
    mutationFn: () => api.post(`/api/dossiers/${dossierId}/demarrer`, { ...(motif ? { motif, commentaire: commentaire.trim() || undefined } : {}), informerClient: informer }),
    onSuccess: () => {
      qc.invalidateQueries();
      toast({ title: `« ${etapeLabel} » démarrée`, description: motif ? "Imprévu enregistré" + (informer ? " et communiqué au client." : ".") : "Le chronomètre de la première tâche tourne." });
      onClose();
    },
    onError: (e: any) => toast({ title: "Démarrage impossible", description: e.message, variant: "destructive" }),
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-card sm:max-w-[480px]">
        <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><Play className="w-4 h-4 text-secondary" /> Démarrer « {etapeLabel} »</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {enAttenteDepuis && <p className="text-xs text-muted-foreground">Étape en attente depuis {dateHeure(enAttenteDepuis)}.</p>}
          <Label className="text-xs font-semibold">Le démarrage est-il normal ?</Label>
          <ChoixMotif motifs={motifs} motif={motif} setMotif={setMotif} optionnel />
          {motif && (
            <>
              <Textarea value={commentaire} onChange={e => setCommentaire(e.target.value)} rows={2} maxLength={900}
                placeholder={motif === "autre" ? "Décrivez l'imprévu (obligatoire)" : "Précisions (facultatif)"} className="text-sm bg-muted/40 resize-none" />
              <label className="flex items-center gap-2 text-xs"><Switch checked={informer} onCheckedChange={setInformer} /> Informer le client sur sa page de suivi</label>
              <ApercuClient motifs={motifs} motif={motif} commentaire={commentaire} informer={informer} />
            </>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button className="gap-1.5 bg-secondary text-secondary-foreground" disabled={demarrer.isPending || (motif === "autre" && !commentaire.trim())} onClick={() => demarrer.mutate()}>
              {demarrer.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Démarrer l'étape
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Signaler un imprévu (Direction prévenue, client informé avec une formulation professionnelle). */
export function ImprevuDialog({ dossierId, motifs, onClose }: { dossierId: string; motifs: Motifs; onClose: () => void }) {
  const qc = useQueryClient();
  const [motif, setMotif] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [informer, setInformer] = useState(true);
  const signaler = useMutation({
    mutationFn: () => api.post(`/api/dossiers/${dossierId}/imprevus`, { motif, commentaire: commentaire.trim() || undefined, informerClient: informer }),
    onSuccess: () => { qc.invalidateQueries(); toast({ title: "Imprévu signalé", description: informer ? "La Direction et le client sont informés." : "La Direction est informée." }); onClose(); },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-card sm:max-w-[480px]">
        <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-amber-600" /> Signaler un imprévu</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <ChoixMotif motifs={motifs} motif={motif} setMotif={setMotif} />
          <Textarea value={commentaire} onChange={e => setCommentaire(e.target.value)} rows={2} maxLength={900}
            placeholder={motif === "autre" ? "Décrivez l'imprévu (obligatoire)" : "Précisions (facultatif)"} className="text-sm bg-muted/40 resize-none" />
          <label className="flex items-center gap-2 text-xs"><Switch checked={informer} onCheckedChange={setInformer} /> Informer le client sur sa page de suivi</label>
          <ApercuClient motifs={motifs} motif={motif} commentaire={commentaire} informer={informer} />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white" disabled={!motif || signaler.isPending || (motif === "autre" && !commentaire.trim())} onClick={() => signaler.mutate()}>
              {signaler.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />} Signaler
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
