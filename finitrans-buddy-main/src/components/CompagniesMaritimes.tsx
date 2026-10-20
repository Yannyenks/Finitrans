import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Check, Pencil, Plus, Ship, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/permissions";
import type { Compagnie } from "@/lib/compagnies";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

/** Référentiel des compagnies maritimes : ajout, renommage, activation (Direction et Exploitation). */
export default function CompagniesMaritimes() {
  const qc = useQueryClient();
  const { superviseur } = useAuth();
  const { data: liste = [] } = useQuery({ queryKey: ["compagnies"], queryFn: () => api.get<Compagnie[]>("/api/compagnies") });
  const [nom, setNom] = useState("");
  const [edition, setEdition] = useState<{ code: string; nom: string } | null>(null);
  const erreur = (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" });

  const ajouter = useMutation({
    mutationFn: () => api.post<Compagnie>("/api/compagnies", { nom: nom.trim() }),
    onSuccess: c => { qc.invalidateQueries({ queryKey: ["compagnies"] }); setNom(""); toast({ title: "Compagnie ajoutée", description: c.nom }); },
    onError: erreur,
  });
  const modifier = useMutation({
    mutationFn: ({ code, ...corps }: { code: string; nom?: string; actif?: boolean }) =>
      api.patch(`/api/compagnies/${encodeURIComponent(code)}`, corps),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["compagnies"] }); setEdition(null); },
    onError: erreur,
  });

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="stat-card space-y-4">
      <div>
        <h3 className="font-display font-semibold text-foreground mb-1">Compagnies maritimes</h3>
        <p className="text-sm text-muted-foreground">
          Liste proposée à la création des dossiers, des DI et des paiements. Les tâches « Bon compagnie » vont au responsable
          des sorties qui couvre la compagnie, sinon au moins chargé.{" "}
          {!superviseur && <strong>Modifiable par la Direction et le Responsable Exploitation.</strong>}
        </p>
      </div>

      {superviseur && (
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (nom.trim().length >= 2) ajouter.mutate(); }}>
          <Input value={nom} onChange={e => setNom(e.target.value)} placeholder="Ex : Hapag-Lloyd, ONE, Evergreen, Grimaldi…"
            className="bg-card" aria-label="Nouvelle compagnie" />
          <Button type="submit" disabled={nom.trim().length < 2 || ajouter.isPending} className="gap-1.5 bg-secondary text-secondary-foreground">
            <Plus className="w-4 h-4" /> Ajouter
          </Button>
        </form>
      )}

      <div className="rounded-xl border border-border/60 divide-y divide-border/50">
        {liste.map(c => (
          <div key={c.code} className={`flex items-center gap-3 px-4 py-3 ${c.actif ? "" : "opacity-60"}`} data-testid={`compagnie-${c.code}`}>
            <Ship className="w-4 h-4 text-secondary flex-shrink-0" />
            {edition?.code === c.code ? (
              <form className="flex-1 flex gap-2" onSubmit={e => { e.preventDefault(); modifier.mutate({ code: c.code, nom: edition.nom.trim() }); }}>
                <Input autoFocus value={edition.nom} onChange={e => setEdition({ code: c.code, nom: e.target.value })} className="h-8 bg-card" aria-label="Nom de la compagnie" />
                <Button type="submit" size="sm" className="h-8" disabled={edition.nom.trim().length < 2} aria-label="Enregistrer"><Check className="w-3.5 h-3.5" /></Button>
                <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => setEdition(null)} aria-label="Annuler"><X className="w-3.5 h-3.5" /></Button>
              </form>
            ) : (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{c.nom}</p>
                <p className="text-[11px] text-muted-foreground font-mono">
                  {c.code} · {c.dossiers ?? 0} dossier(s){!c.actif && " · désactivée"}
                </p>
              </div>
            )}
            {superviseur && edition?.code !== c.code && (
              <>
                <button className="text-muted-foreground hover:text-secondary" title="Renommer" onClick={() => setEdition({ code: c.code, nom: c.nom })}>
                  <Pencil className="w-4 h-4" />
                </button>
                <Switch checked={c.actif} onCheckedChange={v => modifier.mutate({ code: c.code, actif: v })} aria-label={`${c.nom} active`} />
              </>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}
