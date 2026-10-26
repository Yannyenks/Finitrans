import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { AlertTriangle, CalendarClock, CheckCircle2, DatabaseBackup, Download, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, downloadFile } from "@/lib/api";
import { useAuth } from "@/lib/permissions";
import { toast } from "@/hooks/use-toast";

const taille = (o?: number | null) => !o ? "—" : o < 1_048_576 ? `${Math.max(1, Math.round(o / 1024))} Ko` : `${(o / 1_048_576).toFixed(1)} Mo`;
const quand = (d: string) => new Date(d).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Prochain lundi 02:00 (heure de Douala) — sauvegarde hebdomadaire automatique */
function prochaine() {
  const d = new Date();
  const lundi = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 1, 0, 0));
  const ecart = (8 - lundi.getUTCDay()) % 7 || (d.getTime() >= lundi.getTime() ? 7 : 0);
  lundi.setUTCDate(lundi.getUTCDate() + ecart);
  return lundi;
}

/** Sauvegardes de la base : hebdomadaires (automatiques) et manuelles. */
export default function Sauvegardes() {
  const qc = useQueryClient();
  const { superviseur } = useAuth();
  const { data, isLoading, error } = useQuery({ queryKey: ["sauvegardes"], queryFn: () => api.get<any>("/api/sauvegardes"), enabled: superviseur });
  const lancer = useMutation({
    mutationFn: () => api.post<any>("/api/sauvegardes", {}),
    onSuccess: (s: any) => { qc.invalidateQueries({ queryKey: ["sauvegardes"] }); toast({ title: "Sauvegarde effectuée", description: taille(s.tailleOctets) }); },
    onError: (e: any) => { qc.invalidateQueries({ queryKey: ["sauvegardes"] }); toast({ title: "Échec de la sauvegarde", description: e.message, variant: "destructive" }); },
  });

  if (!superviseur) return <p className="text-sm text-muted-foreground">Réservé à la Direction et au Responsable Exploitation.</p>;
  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-secondary" /></div>;
  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;

  const liste: any[] = data?.sauvegardes ?? [];
  const derniere = data?.derniereReussie ? new Date(data.derniereReussie) : null;
  const ageJours = derniere ? (Date.now() - derniere.getTime()) / 86_400_000 : Infinity;
  const enRetard = ageJours > 8;
  const dernierEchec = liste.find(s => s.statut === "echec");
  const echecRecent = dernierEchec && (!derniere || new Date(dernierEchec.createdAt) > derniere);

  return (
    <div className="space-y-4 max-w-4xl">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className={`rounded-2xl border p-5 ${enRetard || echecRecent ? "border-destructive/40 bg-destructive/5" : "border-emerald-300/60 bg-gradient-to-br from-emerald-50 to-transparent"}`}>
        <div className="flex flex-wrap items-center gap-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${enRetard || echecRecent ? "bg-destructive text-white" : "bg-emerald-500 text-white"}`}>
            {enRetard || echecRecent ? <AlertTriangle className="w-6 h-6" /> : <ShieldCheck className="w-6 h-6" />}
          </div>
          <div className="flex-1 min-w-[14rem]">
            <p className="font-display font-bold text-foreground">
              {echecRecent ? "La dernière sauvegarde a échoué" : enRetard ? "Aucune sauvegarde récente" : "Données protégées"}
            </p>
            <p className="text-sm text-muted-foreground">
              {derniere ? `Dernière sauvegarde réussie : ${quand(derniere.toISOString())}` : "Aucune sauvegarde réussie pour l'instant."}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" /> Sauvegarde automatique chaque lundi à 02:00 — prochaine : {quand(prochaine().toISOString())} · {data?.conservees ?? 8} dernières conservées</p>
          </div>
          <Button onClick={() => lancer.mutate()} disabled={lancer.isPending} className="gap-2 bg-secondary text-secondary-foreground">
            {lancer.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <DatabaseBackup className="w-4 h-4" />} Sauvegarder maintenant
          </Button>
        </div>
        {echecRecent && <p className="mt-3 text-xs text-destructive">Erreur : {dernierEchec.message}</p>}
      </motion.div>

      <div className="stat-card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground border-b border-border bg-muted/40">
            <th className="py-2 px-3">Date</th><th className="py-2 px-3">Type</th><th className="py-2 px-3">Statut</th>
            <th className="py-2 px-3">Contenu</th><th className="py-2 px-3">Taille</th><th className="py-2 px-3"></th>
          </tr></thead>
          <tbody>
            {liste.map(s => {
              const lignes = s.lignes ? Object.values(s.lignes as Record<string, number>).reduce((a, b) => a + b, 0) : 0;
              return (
                <tr key={s.id} className="border-b border-border/40">
                  <td className="py-2 px-3 text-xs whitespace-nowrap">{quand(s.createdAt)}</td>
                  <td className="py-2 px-3 text-xs">{s.declencheur === "hebdomadaire" ? "Hebdomadaire" : `Manuelle (${s.auteur})`}</td>
                  <td className="py-2 px-3">
                    {s.statut === "ok"
                      ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" /> Réussie</span>
                      : <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive" title={s.message}><AlertTriangle className="w-3.5 h-3.5" /> Échec</span>}
                  </td>
                  <td className="py-2 px-3 text-xs text-muted-foreground">{s.lignes ? `${lignes.toLocaleString("fr-FR")} enregistrements · ${s.lignes.dossiers ?? 0} dossiers` : s.message?.slice(0, 60)}</td>
                  <td className="py-2 px-3 text-xs font-mono">{taille(s.tailleOctets)}</td>
                  <td className="py-2 px-3 text-right">
                    {s.statut === "ok" && (
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                        onClick={() => downloadFile(`/api/sauvegardes/${s.id}/fichier`, `sauvegarde-finitrans-${s.createdAt.slice(0, 10)}.json.gz`).catch((e: Error) => toast({ title: "Téléchargement impossible", description: e.message, variant: "destructive" }))}>
                        <Download className="w-3.5 h-3.5" /> Télécharger
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {liste.length === 0 && <tr><td colSpan={6} className="text-center py-10 text-muted-foreground text-sm">Aucune sauvegarde pour l'instant</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Chaque sauvegarde contient toutes les données (dossiers, documents, finance, comptes…). En cas de problème, un échec est signalé par une alerte critique et une notification à la Direction.
        La restauration se fait avec le script <span className="font-mono">npm run db:restaurer -- &lt;sauvegarde&gt; --confirmer</span>.
      </p>
    </div>
  );
}
