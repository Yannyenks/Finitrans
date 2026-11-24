import { api } from "@/lib/api";

/**
 * Notifications natives du système (Web Push) : service worker + abonnement du navigateur.
 * Fonctionne dans Chrome, Edge, Firefox (PC) et sur Android ; sur iPhone, une fois la plateforme
 * ajoutée à l'écran d'accueil (iOS 16.4+). Les autorisations du navigateur sont toujours respectées.
 */

export const pushSupporte = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export const etatPermission = (): NotificationPermission | "non_supporte" =>
  pushSupporte() ? Notification.permission : "non_supporte";

const versUint8 = (base64: string) => {
  const b = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const brut = atob(b);
  return Uint8Array.from([...brut].map(c => c.charCodeAt(0)));
};

async function enregistrement() {
  return (await navigator.serviceWorker.getRegistration("/")) ?? navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

/** Abonne ce navigateur (après autorisation) et enregistre l'abonnement côté serveur. */
export async function activerPush(): Promise<boolean> {
  if (!pushSupporte()) return false;
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission !== "granted") return false;
  const reg = await enregistrement();
  await navigator.serviceWorker.ready;
  const { publicKey } = await api.get<{ publicKey: string }>("/api/push/cle");
  let abonnement = await reg.pushManager.getSubscription();
  // Clé serveur changée : on se réabonne
  if (abonnement && abonnement.options?.applicationServerKey) {
    const actuelle = btoa(String.fromCharCode(...new Uint8Array(abonnement.options.applicationServerKey as ArrayBuffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    if (actuelle !== publicKey) { await abonnement.unsubscribe(); abonnement = null; }
  }
  abonnement ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: versUint8(publicKey) });
  const json = abonnement.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await api.post("/api/push/abonnements", { endpoint: json.endpoint, keys: json.keys, navigateur: navigator.userAgent.slice(0, 250) });
  try { localStorage.setItem("ft_push_actif", "1"); } catch { /* stockage indisponible */ }
  return true;
}

/** Au chargement : si l'autorisation est déjà accordée, (re)synchronise l'abonnement de ce compte. */
export async function synchroniserPush() {
  if (!pushSupporte()) return;
  try {
    await enregistrement();
    if (Notification.permission === "granted") await activerPush();
  } catch { /* hors ligne ou navigateur restrictif : nouvel essai au prochain chargement */ }
}

/** Déconnexion : ce navigateur ne reçoit plus les notifications du compte. */
export async function desactiverPush() {
  if (!pushSupporte()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const abonnement = await reg?.pushManager.getSubscription();
    if (abonnement) {
      await api.post("/api/push/abonnements/retirer", { endpoint: abonnement.endpoint }).catch(() => null);
      await abonnement.unsubscribe();
    }
    localStorage.removeItem("ft_push_actif");
  } catch { /* sans conséquence */ }
}

export const pushActif = () => { try { return localStorage.getItem("ft_push_actif") === "1" && Notification.permission === "granted"; } catch { return false; } };
