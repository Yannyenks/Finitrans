/* FINITRANS — Service Worker des notifications (Web Push).
 * Affiche les notifications natives du système même quand la plateforme est fermée,
 * et ouvre directement le dossier / la DI concernée au clic. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

self.addEventListener("push", event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { titre: "FINITRANS", message: event.data ? event.data.text() : "" }; }
  const critique = d.priorite === "critique";
  const haute = d.priorite === "haute";
  const titre = (critique ? "🔴 " : haute ? "🟠 " : "") + (d.titre || "FINITRANS");
  const options = {
    body: d.message || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: d.tag || undefined,
    renotify: !!d.tag,
    // Les notifications prioritaires restent affichées jusqu'à une action de l'utilisateur
    requireInteraction: critique || haute,
    vibrate: critique ? [300, 120, 300, 120, 600] : [200, 100, 200],
    timestamp: Date.now(),
    data: { url: d.url || "/notifications", id: d.id || null },
    actions: d.id ? [{ action: "ouvrir", title: "Ouvrir" }, { action: "acquitter", title: "Pris en compte" }] : [{ action: "ouvrir", title: "Ouvrir" }],
  };
  event.waitUntil((async () => {
    await self.registration.showNotification(titre, options);
    // Prévenir les onglets ouverts (actualisation immédiate du centre de notifications)
    const fenetres = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    fenetres.forEach(c => c.postMessage({ type: "ft-push", id: d.id || null }));
  })());
});

self.addEventListener("notificationclick", event => {
  const { url, id } = event.notification.data || {};
  event.notification.close();
  event.waitUntil((async () => {
    const fenetres = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (event.action === "acquitter" && id) {
      // Prise en compte depuis la notification : transmise à un onglet connecté, sinon à la prochaine ouverture
      if (fenetres.length) { fenetres[0].postMessage({ type: "ft-acquitter", id }); return; }
      await self.clients.openWindow(`/notifications?acquitter=${id}`);
      return;
    }
    const cible = new URL(url || "/notifications", self.location.origin).href;
    for (const c of fenetres) {
      if ("focus" in c) {
        await c.focus();
        if ("navigate" in c) { try { await c.navigate(cible); } catch { c.postMessage({ type: "ft-naviguer", url }); } }
        if (id) c.postMessage({ type: "ft-lue", id });
        return;
      }
    }
    await self.clients.openWindow(cible);
  })());
});
