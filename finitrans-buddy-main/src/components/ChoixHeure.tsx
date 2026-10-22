import { Clock, Minus, Plus } from "lucide-react";

/** Heure courante « HH:MM » */
export const heureMaintenant = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const decaler = (h: string, minutes: number) => {
  const [hh, mm] = (/^\d{2}:\d{2}$/.test(h) ? h : heureMaintenant()).split(":").map(Number);
  const t = (((hh * 60 + mm + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

const RACCOURCIS = ["06:00", "08:00", "10:00", "12:00", "14:00", "16:00", "18:00"];

/**
 * Saisie rapide d'une heure : sélecteur natif (roue sur téléphone), bouton « Maintenant »,
 * ajustement par quart d'heure et heures courantes en un geste.
 */
export function ChoixHeure({ valeur, onChange, compact = false, libelle = "Heure" }: {
  valeur: string; onChange: (h: string) => void; compact?: boolean; libelle?: string;
}) {
  const bouton = "h-8 rounded-lg border border-border bg-card text-xs font-semibold hover:bg-muted active:scale-95 transition";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => onChange(decaler(valeur, -15))} className={`${bouton} w-8 flex items-center justify-center`} aria-label="Quinze minutes plus tôt"><Minus className="w-3.5 h-3.5" /></button>
        <div className="relative flex-1">
          <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary pointer-events-none" />
          <input type="time" value={valeur} onChange={e => onChange(e.target.value)} aria-label={libelle}
            className={`w-full ${compact ? "h-8 text-sm" : "h-10 text-lg"} pl-8 pr-2 rounded-lg border border-input bg-muted/40 font-mono font-bold tracking-wider text-center`} />
        </div>
        <button type="button" onClick={() => onChange(decaler(valeur, 15))} className={`${bouton} w-8 flex items-center justify-center`} aria-label="Quinze minutes plus tard"><Plus className="w-3.5 h-3.5" /></button>
        <button type="button" onClick={() => onChange(heureMaintenant())} className={`${bouton} px-2.5 text-secondary border-secondary/40 bg-secondary/5`}>Maintenant</button>
      </div>
      {!compact && (
        <div className="flex flex-wrap gap-1">
          {RACCOURCIS.map(h => (
            <button key={h} type="button" onClick={() => onChange(h)}
              className={`px-2 py-1 rounded-md text-[11px] font-mono transition-colors ${valeur === h ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{h}</button>
          ))}
        </div>
      )}
    </div>
  );
}
