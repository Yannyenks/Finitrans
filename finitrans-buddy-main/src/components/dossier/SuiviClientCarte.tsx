import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Link2, Loader2, MessageCircle, RefreshCw, Send, Share2, Trash2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { ILLUSTRATIONS, Illustration } from "@/components/suivi/Illustration";

const CHOIX = ["info", "navire", "port", "douane", "document", "paiement", "camion", "valide", "attention"];

/** Lien de suivi à partager avec le client + messages publiés sur sa page. */
export default function SuiviClientCarte({ dossierId, numero, client }: { dossierId: string; numero: string; client: string }) {
  const qc = useQueryClient();
  const cle = ["suivi-client", dossierId];
  const { data, isLoading } = useQuery({ queryKey: cle, queryFn: () => api.get<any>(`/api/dossiers/${dossierId}/suivi-client`), retry: false });
  const [message, setMessage] = useState("");
  const [illustration, setIllustration] = useState("info");
  const erreur = (e: any) => toast({ title: "Erreur", description: e?.message, variant: "destructive" });
  const rafraichir = () => qc.invalidateQueries({ queryKey: cle });

  const lien = data?.token ? `${window.location.origin}/suivi/${data.token}` : "";
  const creer = useMutation({ mutationFn: (renouveler?: boolean) => api.post<any>(`/api/dossiers/${dossierId}/suivi-client`, { renouveler }), onSuccess: rafraichir, onError: erreur });
  const desactiver = useMutation({ mutationFn: () => api.delete(`/api/dossiers/${dossierId}/suivi-client`), onSuccess: () => { rafraichir(); toast({ title: "Lien désactivé", description: "Le client ne peut plus consulter le suivi." }); }, onError: erreur });
  const publier = useMutation({
    mutationFn: () => api.post(`/api/dossiers/${dossierId}/suivi-client/actualites`, { message: message.trim(), illustration }),
    onSuccess: () => { setMessage(""); rafraichir(); toast({ title: "Message publié", description: "Visible immédiatement sur la page du client." }); },
    onError: erreur,
  });
  const retirer = useMutation({ mutationFn: (aid: string) => api.delete(`/api/dossiers/${dossierId}/suivi-client/actualites/${aid}`), onSuccess: rafraichir, onError: erreur });

  const texteInvitation = `Bonjour, suivez l'avancement de votre dossier ${numero} (${client}) en temps réel : ${lien}`;
  const copier = async () => {
    try { await navigator.clipboard.writeText(lien); toast({ title: "Lien copié", description: "Collez-le dans un message au client." }); }
    catch { window.prompt("Copiez le lien :", lien); }
  };
  const partager = async () => {
    if (navigator.share) { try { await navigator.share({ title: `Suivi du dossier ${numero}`, text: texteInvitation, url: lien }); return; } catch { /* annulé */ } }
    copier();
  };

  if (isLoading || !data) return null;

  return (
    <div className="stat-card" data-testid="suivi-client">
      <h3 className="font-display font-semibold text-foreground mb-1 flex items-center gap-2">
        <Share2 className="w-4 h-4 text-secondary" /> Suivi client
      </h3>
      <p className="text-xs text-muted-foreground mb-3">Une page élégante où le client suit son dossier, sans compte ni mot de passe.</p>

      {!data.token ? (
        <Button onClick={() => creer.mutate(false)} disabled={creer.isPending} className="w-full gap-2 bg-secondary text-secondary-foreground">
          {creer.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />} Créer le lien de suivi
        </Button>
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 rounded-lg bg-muted/50 border border-border px-2.5 py-2">
            <Link2 className="w-3.5 h-3.5 text-secondary shrink-0" />
            <span className="text-[11px] font-mono truncate flex-1" title={lien}>{lien}</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={copier}><Copy className="w-3.5 h-3.5" /> Copier</Button>
            <Button size="sm" className="h-8 text-xs gap-1 bg-[#25D366] hover:bg-[#1fbd59] text-white" asChild>
              <a href={`https://wa.me/?text=${encodeURIComponent(texteInvitation)}`} target="_blank" rel="noreferrer"><MessageCircle className="w-3.5 h-3.5" /> WhatsApp</a>
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1" asChild><a href={lien} target="_blank" rel="noreferrer"><ExternalLink className="w-3.5 h-3.5" /> Voir la page</a></Button>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={partager}><Share2 className="w-3.5 h-3.5" /> Partager</Button>
          </div>
          <div className="flex justify-between">
            <button type="button" className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              onClick={() => confirm("Renouveler le lien ? L'ancien lien ne fonctionnera plus.") && creer.mutate(true)}><RefreshCw className="w-3 h-3" /> Renouveler</button>
            <button type="button" className="text-[11px] text-destructive hover:underline inline-flex items-center gap-1"
              onClick={() => confirm("Désactiver le lien de suivi ?") && desactiver.mutate()}><Unlink className="w-3 h-3" /> Désactiver</button>
          </div>
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-border/60 space-y-2">
        <p className="text-xs font-semibold text-foreground">Message pour le client</p>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Illustration">
          {CHOIX.map(c => (
            <button key={c} type="button" role="radio" aria-checked={illustration === c} title={ILLUSTRATIONS[c].libelle} onClick={() => setIllustration(c)}
              className={`rounded-2xl transition ${illustration === c ? "ring-2 ring-secondary ring-offset-2 ring-offset-card scale-105" : "opacity-60 hover:opacity-100"}`}>
              <Illustration type={c} taille={30} />
            </button>
          ))}
        </div>
        <Textarea value={message} onChange={e => setMessage(e.target.value)} maxLength={1500} rows={3}
          placeholder="Ex. : Bonne nouvelle, votre conteneur a été inspecté. La déclaration est en cours de préparation."
          className="text-sm bg-muted/40 resize-none" />
        <Button size="sm" className="w-full gap-1.5 bg-primary text-primary-foreground" disabled={message.trim().length < 2 || publier.isPending} onClick={() => publier.mutate()}>
          {publier.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Publier sur la page du client
        </Button>
        {data.actualites?.length > 0 && (
          <ul className="space-y-2 pt-1 max-h-72 overflow-y-auto">
            {data.actualites.map((a: any) => (
              <li key={a.id} className="flex gap-2 rounded-lg bg-muted/40 p-2">
                <Illustration type={a.illustration} taille={26} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground whitespace-pre-line">{a.message}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{a.auteurNom} · {new Date(a.createdAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                </div>
                <button type="button" aria-label="Retirer le message" onClick={() => retirer.mutate(a.id)} className="text-muted-foreground hover:text-destructive self-start"><Trash2 className="w-3.5 h-3.5" /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
