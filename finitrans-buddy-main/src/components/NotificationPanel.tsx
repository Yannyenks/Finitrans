import { useEffect, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Bell, AlertTriangle, DollarSign, Clock, FileWarning, Users, Check, TrendingDown,
  ArrowRightCircle, UserPlus, MessageSquare, CheckCheck, BellRing, X, Activity,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, getStoredUser } from "@/lib/api";
import { playSound, SoundType } from "@/lib/sound";
import { useNavigate } from "react-router-dom";
import CompteARebours from "@/components/CompteARebours";

const typeIcons: Record<string, any> = {
  detention: AlertTriangle,
  paiement:  DollarSign,
  blocage:   Clock,
  document:  FileWarning,
  charge:    Users,
  di_seuil:  TrendingDown,
};

interface Notif {
  id: string; type: "alerte" | "message" | "dossier" | "action_requise"; titre: string; message: string;
  lu: boolean; createdAt: string; dossierId?: string | null; actionUrl?: string | null;
  /** Échéance de la tâche notifiée : compte à rebours affiché dès la réception */
  echeance?: string | null;
  dossier?: { numero: string; client: string } | null;
}

/** Style de chaque type de notification : couleur, icône, son. */
function styleDe(n: Notif): { icon: any; couleur: string; fond: string; son: SoundType; libelle: string } {
  const t = n.titre.toLowerCase();
  if (n.type === "alerte" || t.includes("retard") || t.includes("rejet") || t.includes("bloc"))
    return { icon: AlertTriangle, couleur: "text-destructive", fond: "bg-destructive", son: "retard", libelle: "Alerte" };
  if (t.includes("tâche") || t.includes("confi") || t.includes("attribu") || t.includes("assign"))
    return { icon: UserPlus, couleur: "text-secondary", fond: "bg-secondary", son: "assign", libelle: "Nouvelle assignation" };
  if (n.type === "message")
    return { icon: MessageSquare, couleur: "text-blue-600", fond: "bg-blue-600", son: "info", libelle: "Message" };
  // Action posée par un collègue sur un dossier ou dans un module
  if (n.type === "dossier" && !t.includes("passé à l'étape"))
    return { icon: Activity, couleur: "text-accent", fond: "bg-accent", son: "info", libelle: "Nouvelle action" };
  if (t.includes("prête") || t.includes("clôtur"))
    return { icon: CheckCheck, couleur: "text-success", fond: "bg-success", son: "success", libelle: "Étape prête" };
  return { icon: ArrowRightCircle, couleur: "text-primary", fond: "bg-primary", son: "success", libelle: "Évolution du dossier" };
}

const quand = (iso: string) => {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

/**
 * Notifications déjà présentées, conservées pour la session : l'en-tête est remonté à chaque
 * changement de page, il ne faut pas réafficher les mêmes alertes.
 */
function vuesSession(userId: string): { set: Set<string>; nouveau: boolean } {
  const cle = `ft_notifs_vues_${userId}`;
  const g = window as unknown as { __ftNotifs?: Record<string, Set<string>> };
  g.__ftNotifs ??= {};
  if (g.__ftNotifs[userId]) return { set: g.__ftNotifs[userId], nouveau: false };
  let ids: string[] | null = null;
  try { ids = JSON.parse(sessionStorage.getItem(cle) ?? "null"); } catch { /* stockage indisponible */ }
  g.__ftNotifs[userId] = new Set(ids ?? []);
  return { set: g.__ftNotifs[userId], nouveau: ids === null };
}
function memoriserVues(userId: string, set: Set<string>) {
  try { sessionStorage.setItem(`ft_notifs_vues_${userId}`, JSON.stringify([...set].slice(-200))); } catch { /* stockage indisponible */ }
}

const TITRE_PAGE = typeof document !== "undefined" ? document.title.replace(/^\(\d+\)\s*/, "") : "FINITRANS";

/**
 * Notifications personnelles en direct : interrogées toutes les 10 s.
 * Chaque nouvelle notification déclenche une alerte visible et sonore (et une notification
 * du navigateur si l'onglet est en arrière-plan), puis l'interface se met à jour.
 */
function useNotificationsLive(onOuvrir: (n: Notif) => void) {
  const qc = useQueryClient();
  const premierPassage = useRef(true);
  const userId = getStoredUser()?.id;

  const query = useQuery({
    queryKey: ["mes-notifications", userId],
    queryFn:  () => api.get<{ data: Notif[]; nonLues: number }>("/api/notifications?limit=30"),
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    enabled: !!userId,
  });

  useEffect(() => {
    const liste = query.data?.data;
    if (!liste || !userId) return;
    const { set: vues, nouveau } = vuesSession(userId);
    if (nouveau && premierPassage.current) {
      // Ouverture de session : pas d'alerte pour l'historique, seulement un rappel des non lues récentes
      premierPassage.current = false;
      liste.forEach(n => vues.add(n.id));
      memoriserVues(userId, vues);
      liste.filter(n => !n.lu && Date.now() - new Date(n.createdAt).getTime() < 15 * 60_000).slice(0, 3).reverse().forEach((n, i) => afficher(n, i === 0));
      return;
    }
    premierPassage.current = false;
    const nouvelles = liste.filter(n => !vues.has(n.id));
    if (nouvelles.length === 0) return;
    nouvelles.forEach(n => vues.add(n.id));
    memoriserVues(userId, vues);
    nouvelles.slice(0, 6).reverse().forEach((n, i) => afficher(n, i === 0));
    if (nouvelles.length > 6) toast(`${nouvelles.length - 6} autre(s) notification(s)`, { description: "Ouvrez la cloche pour tout voir." });
    // Quelqu'un a fait avancer un dossier : toutes les données affichées sont rechargées
    qc.invalidateQueries({ predicate: q => q.queryKey[0] !== "mes-notifications" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  // Compteur dans le titre de l'onglet
  useEffect(() => {
    const n = query.data?.nonLues ?? 0;
    document.title = n > 0 ? `(${n}) ${TITRE_PAGE}` : TITRE_PAGE;
  }, [query.data?.nonLues]);

  function afficher(n: Notif, avecSon = true) {
    const st = styleDe(n);
    // Un seul son par arrivée de notifications (évite la cacophonie quand plusieurs arrivent ensemble)
    if (avecSon) playSound(st.son);
    const Icon = st.icon;
    toast.custom(id => (
      <div className="w-[380px] max-w-[calc(100vw-32px)] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden" role="alert">
        <div className={`h-1.5 ${st.fond}`} />
        <div className="p-4 flex gap-3">
          <div className={`w-10 h-10 rounded-xl ${st.fond} text-white flex items-center justify-center flex-shrink-0 animate-pulse`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-[10px] font-bold uppercase tracking-wider ${st.couleur}`}>{st.libelle}</p>
            <p className="text-sm font-semibold text-foreground leading-snug">{n.titre}</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.message}</p>
            {n.echeance && <CompteARebours variant="barre" echeance={n.echeance} debut={n.createdAt} className="mt-2.5" />}
            <div className="flex gap-2 mt-2.5">
              {(n.actionUrl || n.dossierId) && (
                <button className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${st.fond} text-white hover:opacity-90`}
                  onClick={() => { toast.dismiss(id); onOuvrir(n); }}>
                  Ouvrir
                </button>
              )}
              <button className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted" onClick={() => toast.dismiss(id)}>
                Plus tard
              </button>
            </div>
          </div>
          <button className="text-muted-foreground hover:text-foreground self-start" onClick={() => toast.dismiss(id)} aria-label="Fermer">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    ), { duration: n.echeance ? 20_000 : n.type === "dossier" ? 9_000 : 12_000, position: window.matchMedia?.("(max-width: 1023px)").matches ? "bottom-center" : "top-right" });

    // Onglet en arrière-plan : notification du système
    if (document.hidden && "Notification" in window && Notification.permission === "granted") {
      try {
        const sys = new Notification(n.titre, { body: n.message, tag: n.id, icon: "/favicon.svg" });
        sys.onclick = () => { window.focus(); onOuvrir(n); sys.close(); };
      } catch { /* navigateur sans support */ }
    }
  }

  return query;
}

const NotificationPanel = () => {
  const [open, setOpen] = useState(false);
  const [onglet, setOnglet] = useState<"moi" | "alertes">("moi");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [permission, setPermission] = useState(() => ("Notification" in window ? Notification.permission : "denied"));

  const lire = useMutation({
    mutationFn: (id: string) => api.patch(`/api/notifications/${id}/lire`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mes-notifications"] }),
  });
  const toutLire = useMutation({
    mutationFn: () => api.patch("/api/notifications/tout-lire"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mes-notifications"] }),
  });

  const ouvrir = (n: Notif) => {
    if (!n.lu) lire.mutate(n.id);
    const url = n.actionUrl || (n.dossierId ? `/dossiers/${n.dossierId}` : null);
    if (url) navigate(url);
    setOpen(false);
  };

  const { data: mes } = useNotificationsLive(ouvrir);
  const { data } = useQuery({
    queryKey: ["notifications-panel"],
    queryFn:  () => api.get<any>("/api/alertes?limit=30"),
    refetchInterval: 60_000,
  });

  const notifs = mes?.data ?? [];
  const nonLuesMoi = mes?.nonLues ?? 0;
  const alertes = data?.data ?? [];
  const unread  = nonLuesMoi + (data?.nonLues ?? 0);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button className="relative p-2 rounded-lg hover:bg-muted transition-colors" aria-label="Notifications">
          {nonLuesMoi > 0 ? <BellRing className="w-5 h-5 text-secondary animate-pulse" /> : <Bell className="w-5 h-5 text-muted-foreground" />}
          {unread > 0 && (
            <span className={`absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 text-[10px] font-bold rounded-full flex items-center justify-center ${nonLuesMoi > 0 ? "bg-secondary text-secondary-foreground" : "bg-destructive text-destructive-foreground"}`}>
              {unread > 99 ? "99+" : unread}
            </span>
          )}
          {nonLuesMoi > 0 && <span className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-secondary/60 animate-ping" />}
        </button>
      </SheetTrigger>
      <SheetContent className="bg-card w-[420px] max-w-full">
        <SheetHeader>
          <SheetTitle className="font-display flex items-center justify-between">
            Notifications
            <span className="text-xs font-normal text-muted-foreground">{unread} non lues</span>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-3 flex gap-1 p-1 rounded-xl bg-muted/60">
          {([["moi", `Pour moi${nonLuesMoi ? ` (${nonLuesMoi})` : ""}`], ["alertes", `Alertes${data?.nonLues ? ` (${data.nonLues})` : ""}`]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setOnglet(k)}
              className={`flex-1 text-xs font-semibold py-1.5 rounded-lg transition-colors ${onglet === k ? "bg-card shadow text-foreground" : "text-muted-foreground"}`}>
              {l}
            </button>
          ))}
        </div>

        {onglet === "moi" && (
          <div className="mt-2 flex items-center justify-between gap-2">
            {permission === "default" ? (
              <button className="text-[11px] font-semibold text-secondary hover:underline"
                onClick={() => Notification.requestPermission().then(setPermission)}>
                Activer les notifications du navigateur
              </button>
            ) : <span />}
            {nonLuesMoi > 0 && (
              <button className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1" onClick={() => toutLire.mutate()}>
                <Check className="w-3 h-3" /> Tout marquer comme lu
              </button>
            )}
          </div>
        )}

        <div className="mt-3 space-y-2 overflow-y-auto max-h-[calc(100vh-170px)]">
          {onglet === "moi" && notifs.map(n => {
            const st = styleDe(n);
            const Icon = st.icon;
            return (
              <button key={n.id} type="button" onClick={() => ouvrir(n)}
                className={`w-full text-left p-3 rounded-xl transition-colors flex gap-3 ${n.lu ? "bg-muted/30 hover:bg-muted/50" : "bg-muted/70 hover:bg-muted border-l-4 border-l-secondary"}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${n.lu ? "bg-muted text-muted-foreground" : `${st.fond} text-white`}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-snug ${n.lu ? "text-muted-foreground" : "text-foreground font-semibold"}`}>{n.titre}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-[10px] text-muted-foreground/70">{quand(n.createdAt)}</span>
                    {n.echeance && !n.lu && <CompteARebours echeance={n.echeance} debut={n.createdAt} />}
                  </div>
                </div>
              </button>
            );
          })}
          {onglet === "moi" && notifs.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Aucune notification</p>
          )}

          {onglet === "alertes" && alertes.map((alert: any) => {
            const Icon = typeIcons[alert.type] ?? Bell;
            return (
              <div
                key={alert.id}
                className={`p-3 rounded-lg cursor-pointer transition-colors ${
                  alert.lu ? "bg-muted/30" : "bg-muted/70 border-l-2 border-l-secondary"
                }`}
                onClick={() => {
                  if (alert.dossierId) {
                    navigate(`/dossiers/${alert.dossierId}`);
                    setOpen(false);
                  }
                }}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    alert.severity === "critical" ? "bg-destructive/10 text-destructive" :
                    alert.severity === "warning"  ? "bg-warning/10 text-warning" :
                    "bg-secondary/10 text-secondary"
                  }`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground leading-snug">{alert.message}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">{new Date(alert.createdAt).toLocaleDateString("fr-FR")}</span>
                      {alert.lu && <Check className="w-3 h-3 text-success" />}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {onglet === "alertes" && alertes.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Aucune alerte</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default NotificationPanel;
