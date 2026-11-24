import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { AlertTriangle, BellRing, Check, CheckCheck, ExternalLink, Loader2, MonitorSmartphone, Send, ShieldCheck } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { activerPush, etatPermission, pushActif, pushSupporte } from "@/lib/push";
import { toast } from "@/hooks/use-toast";

type Filtre = "non_lues" | "urgentes" | "lues" | "toutes";
const ONGLETS: { cle: Filtre; libelle: string }[] = [
  { cle: "non_lues", libelle: "Non lues" }, { cle: "urgentes", libelle: "Urgentes" },
  { cle: "lues", libelle: "Lues" }, { cle: "toutes", libelle: "Historique" },
];
const PRIORITE: Record<string, { libelle: string; cls: string }> = {
  critique: { libelle: "Urgent", cls: "bg-destructive text-destructive-foreground" },
  haute:    { libelle: "Important", cls: "bg-amber-500 text-white" },
  normale:  { libelle: "Info", cls: "bg-muted text-muted-foreground" },
};
const quand = (d: string) => new Date(d).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Centre de notifications : non lues, urgentes, lues, historique ; prise en compte et accès direct. */
export default function Notifications() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [filtre, setFiltre] = useState<Filtre>("non_lues");
  const [page, setPage] = useState(1);
  const [permission, setPermission] = useState(etatPermission());
  const { data, isLoading } = useQuery({
    queryKey: ["centre-notifications", filtre, page],
    queryFn: () => api.get<any>(`/api/notifications?filtre=${filtre}&limit=25&page=${page}`),
    refetchInterval: 15_000,
  });
  const { data: etat } = useQuery({ queryKey: ["push-etat"], queryFn: () => api.get<any>("/api/push/etat") });
  const rafraichir = () => { qc.invalidateQueries({ queryKey: ["centre-notifications"] }); qc.invalidateQueries({ queryKey: ["mes-notifications"] }); };

  const acquitter = useMutation({ mutationFn: (id: string) => api.post(`/api/notifications/${id}/acquitter`, {}), onSuccess: rafraichir });
  const lire = useMutation({ mutationFn: (id: string) => api.patch(`/api/notifications/${id}/lire`), onSuccess: rafraichir });
  const toutLire = useMutation({ mutationFn: () => api.patch("/api/notifications/tout-lire"), onSuccess: rafraichir });
  const activer = useMutation({
    mutationFn: async () => { const ok = await activerPush(); if (ok) await api.post("/api/push/test", {}); return ok; },
    onSuccess: ok => {
      setPermission(etatPermission());
      qc.invalidateQueries({ queryKey: ["push-etat"] });
      toast(ok ? { title: "Notifications activées sur ce PC", description: "Une notification d'essai vient d'être envoyée." }
        : { title: "Notifications non autorisées", description: "Autorisez-les dans les réglages du navigateur (icône 🔒 à gauche de l'adresse).", variant: "destructive" });
    },
    onError: (e: any) => toast({ title: "Activation impossible", description: e.message, variant: "destructive" }),
  });

  // Prise en compte demandée depuis une notification système (plateforme fermée)
  useEffect(() => {
    const id = params.get("acquitter");
    if (id) { acquitter.mutate(id); params.delete("acquitter"); setParams(params, { replace: true }); toast({ title: "Notification prise en compte" }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const liste: any[] = data?.data ?? [];
  const ouvrir = (n: any) => {
    if (!n.lu) lire.mutate(n.id);
    navigate(n.actionUrl || (n.dossierId ? `/dossiers/${n.dossierId}` : "/notifications"));
  };
  const actifIci = permission === "granted" && pushActif();

  return (
    <AppLayout title="Centre de notifications" subtitle={`${data?.nonLues ?? 0} non lue(s) · ${data?.urgentes ?? 0} urgente(s)`}>
      <div className="max-w-4xl space-y-4">
        {/* Notifications sur ce PC */}
        <div className={`rounded-2xl border p-4 flex flex-wrap items-center gap-4 ${actifIci ? "border-emerald-300/60 bg-emerald-50/60" : "border-amber-300/70 bg-amber-50/70"}`}>
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-white ${actifIci ? "bg-emerald-500" : "bg-amber-500"}`}>
            {actifIci ? <ShieldCheck className="w-5 h-5" /> : <MonitorSmartphone className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-[14rem]">
            <p className="font-semibold text-foreground">{actifIci ? "Notifications actives sur ce PC" : "Recevez les notifications sur ce PC"}</p>
            <p className="text-xs text-muted-foreground">
              {!pushSupporte() ? "Ce navigateur ne gère pas les notifications système : utilisez Chrome ou Edge."
                : permission === "denied" ? "Les notifications sont bloquées : cliquez sur l'icône 🔒 à gauche de l'adresse, autorisez « Notifications », puis rechargez la page."
                : actifIci ? `Tâches, validations, retards et messages s'affichent même plateforme fermée. Appareils abonnés : ${etat?.appareils ?? 1}.`
                : "Les notifications natives de Windows s'affichent même lorsque FINITRANS est fermé ou en arrière-plan."}
            </p>
          </div>
          {pushSupporte() && permission !== "denied" && (
            <Button onClick={() => activer.mutate()} disabled={activer.isPending} className={actifIci ? "gap-1.5" : "gap-1.5 bg-secondary text-secondary-foreground"} variant={actifIci ? "outline" : "default"}>
              {activer.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : actifIci ? <Send className="w-4 h-4" /> : <BellRing className="w-4 h-4" />}
              {actifIci ? "Envoyer une notification d'essai" : "Activer les notifications"}
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex rounded-xl bg-muted p-1">
            {ONGLETS.map(o => (
              <button key={o.cle} type="button" onClick={() => { setFiltre(o.cle); setPage(1); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filtre === o.cle ? "bg-card shadow text-foreground" : "text-muted-foreground"}`}>
                {o.libelle}
                {o.cle === "non_lues" && data?.nonLues ? ` (${data.nonLues})` : ""}
                {o.cle === "urgentes" && data?.urgentes ? ` (${data.urgentes})` : ""}
              </button>
            ))}
          </div>
          {(data?.nonLues ?? 0) > 0 && (
            <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={() => toutLire.mutate()}><CheckCheck className="w-3.5 h-3.5" /> Tout marquer comme lu</Button>
          )}
        </div>

        {isLoading ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-secondary" /></div> : (
          <div className="space-y-2">
            {liste.map((n, i) => {
              const p = PRIORITE[n.priorite] ?? PRIORITE.normale;
              return (
                <motion.div key={n.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.02 }}
                  className={`rounded-xl border p-3.5 flex flex-wrap gap-3 ${n.lu ? "bg-card border-border/60" : n.priorite === "critique" ? "bg-destructive/5 border-destructive/30" : "bg-secondary/5 border-secondary/30"}`}>
                  <div className="flex-1 min-w-[14rem]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${p.cls}`}>{p.libelle}</span>
                      <p className={`text-sm ${n.lu ? "text-muted-foreground" : "font-semibold text-foreground"}`}>{n.titre}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{n.message}</p>
                    <p className="text-[11px] text-muted-foreground/80 mt-1.5">
                      {quand(n.createdAt)}
                      {n.origineNom ? ` · par ${n.origineNom}` : ""}
                      {n.dossier ? ` · ${n.dossier.numero} (${n.dossier.client})` : ""}
                      {n.relances ? ` · ${n.relances} rappel(s)` : ""}
                      {n.acquitteLe ? ` · pris en compte le ${quand(n.acquitteLe)}` : n.lu && n.luAt ? ` · lu le ${quand(n.luAt)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 self-center">
                    {!n.acquitteLe && (n.priorite === "critique" || n.priorite === "haute") && (
                      <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => acquitter.mutate(n.id)}><Check className="w-3.5 h-3.5" /> Pris en compte</Button>
                    )}
                    {!n.lu && n.priorite === "normale" && (
                      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => lire.mutate(n.id)}>Marquer lu</Button>
                    )}
                    <Button size="sm" className="h-8 text-xs gap-1 bg-secondary text-secondary-foreground" onClick={() => ouvrir(n)}><ExternalLink className="w-3.5 h-3.5" /> Ouvrir</Button>
                  </div>
                </motion.div>
              );
            })}
            {liste.length === 0 && (
              <div className="text-center py-14 text-muted-foreground">
                {filtre === "urgentes" ? <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-40" /> : <CheckCheck className="w-8 h-8 mx-auto mb-2 opacity-40" />}
                <p className="text-sm">{filtre === "non_lues" ? "Tout est à jour" : filtre === "urgentes" ? "Aucune urgence" : "Aucune notification"}</p>
              </div>
            )}
          </div>
        )}
        {(data?.meta?.totalPages ?? 1) > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Page {page} / {data.meta.totalPages}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Précédent</Button>
              <Button size="sm" variant="outline" disabled={page >= data.meta.totalPages} onClick={() => setPage(p => p + 1)}>Suivant</Button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
