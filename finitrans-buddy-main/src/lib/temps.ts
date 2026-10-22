/** Affichage précis des horodatages et des durées (jusqu'à la seconde). */

/** « 15/10/2026 à 14:03:27 » */
export function dateHeure(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("fr-FR")} à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
}

/** « 2 j 03 h 12 min 05 s », « 12 min 05 s », « 42 s » */
export function duree(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  const j = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  if (j > 0) return `${j} j ${p(h)} h ${p(m)} min ${p(sec)} s`;
  if (h > 0) return `${h} h ${p(m)} min ${p(sec)} s`;
  if (m > 0) return `${m} min ${p(sec)} s`;
  return `${sec} s`;
}

/** Durée entre deux instants (fin absente = maintenant). */
export function dureeEntre(debut: string | Date | null | undefined, fin?: string | Date | null): string {
  if (!debut) return "—";
  return duree((fin ? new Date(fin).getTime() : Date.now()) - new Date(debut).getTime());
}

/** Délai SLA lisible à partir d'un nombre de minutes : « 1 j 4 h 30 min », « 2 h », « 45 min ». */
export function delaiJHM(minutes: number): string {
  const t = Math.max(0, Math.round(minutes));
  const j = Math.floor(t / 1440), h = Math.floor((t % 1440) / 60), m = t % 60;
  const parts = [j && `${j} j`, h && `${h} h`, m && `${m} min`].filter(Boolean);
  return parts.length ? parts.join(" ") : "0 min";
}
