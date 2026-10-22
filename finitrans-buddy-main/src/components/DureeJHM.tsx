import { Input } from "@/components/ui/input";

/** Saisie d'un délai en jours · heures · minutes (valeur exprimée en minutes). */
export function DureeJHM({ minutes, onChange, disabled, libelle, minimum = 0 }: {
  minutes: number; onChange: (minutes: number) => void; disabled?: boolean; libelle: string; minimum?: number;
}) {
  const t = Math.max(0, Math.round(minutes));
  const j = Math.floor(t / 1440), h = Math.floor((t % 1440) / 60), m = t % 60;
  const maj = (nj: number, nh: number, nm: number) => onChange(Math.max(minimum, nj * 1440 + nh * 60 + nm));
  const champ = (valeur: number, max: number, unite: string, nom: string, set: (n: number) => void) => (
    <label className="flex items-center gap-1">
      <Input type="number" inputMode="numeric" min={0} max={max} value={valeur} disabled={disabled} aria-label={`${nom} — ${libelle}`}
        onChange={e => set(Math.min(max, Math.max(0, Math.floor(Number(e.target.value) || 0))))}
        className="w-12 sm:w-14 h-9 px-1 text-center font-mono text-sm bg-card" />
      <span className="text-[11px] text-muted-foreground">{unite}</span>
    </label>
  );
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {champ(j, 365, "j", "Jours", n => maj(n, h, m))}
      {champ(h, 23, "h", "Heures", n => maj(j, n, m))}
      {champ(m, 59, "min", "Minutes", n => maj(j, h, n))}
    </div>
  );
}
