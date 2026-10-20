import { useSyncExternalStore } from "react";
import { AlarmClock, CheckCircle2, Hourglass } from "lucide-react";
import { dateHeure } from "@/lib/temps";

// ── Horloge partagée : un seul minuteur pour toute l'application ─────────────
const abonnes = new Set<() => void>();
let minuteur: ReturnType<typeof setInterval> | null = null;
let maintenant = Date.now();

function abonner(cb: () => void) {
  abonnes.add(cb);
  if (!minuteur) {
    minuteur = setInterval(() => { maintenant = Date.now(); abonnes.forEach(f => f()); }, 1000);
  }
  return () => {
    abonnes.delete(cb);
    if (abonnes.size === 0 && minuteur) { clearInterval(minuteur); minuteur = null; }
  };
}

/** Heure courante, rafraîchie chaque seconde (une seule horloge pour tous les comptes à rebours). */
export function useMaintenant(): number {
  return useSyncExternalStore(abonner, () => maintenant, () => Date.now());
}

// ── Calcul ────────────────────────────────────────────────────────────────────
type Etat = "large" | "attention" | "urgent" | "retard";

function calcul(echeance: string | Date, debut: string | Date | null | undefined, now: number) {
  const fin = new Date(echeance).getTime();
  const depart = debut ? new Date(debut).getTime() : null;
  const reste = fin - now;
  const total = depart && fin > depart ? fin - depart : null;
  const ecoule = total ? Math.min(1, Math.max(0, (now - depart!) / total)) : reste <= 0 ? 1 : 0;
  const ratioRestant = total ? Math.max(0, reste / total) : null;
  let etat: Etat = "large";
  if (reste <= 0) etat = "retard";
  else if ((ratioRestant !== null && ratioRestant < 0.2) || reste < 30 * 60_000) etat = "urgent";
  else if ((ratioRestant !== null && ratioRestant < 0.5) || reste < 2 * 3_600_000) etat = "attention";
  return { reste, ecoule, etat };
}

const STYLE: Record<Etat, { texte: string; fond: string; trait: string; halo: string; libelle: string }> = {
  large:     { texte: "text-emerald-600",   fond: "bg-emerald-50 border-emerald-200",   trait: "#10b981", halo: "shadow-emerald-500/20", libelle: "Dans les temps" },
  attention: { texte: "text-amber-600",     fond: "bg-amber-50 border-amber-200",       trait: "#f59e0b", halo: "shadow-amber-500/20",   libelle: "À surveiller" },
  urgent:    { texte: "text-orange-600",    fond: "bg-orange-50 border-orange-300",     trait: "#f97316", halo: "shadow-orange-500/30",  libelle: "Urgent" },
  retard:    { texte: "text-destructive",   fond: "bg-destructive/10 border-destructive/30", trait: "hsl(0 84% 60%)", halo: "shadow-destructive/30", libelle: "Délai dépassé" },
};

/** « 02:14:07 » ou « 3 j 04:12:09 » */
function horloge(ms: number) {
  const s = Math.floor(Math.abs(ms) / 1000);
  const j = Math.floor(s / 86400);
  const p = (n: number) => String(n).padStart(2, "0");
  const hms = `${p(Math.floor((s % 86400) / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
  return j > 0 ? `${j} j ${hms}` : hms;
}

const Anneau = ({ ratio, couleur, taille, epaisseur, pulse }: { ratio: number; couleur: string; taille: number; epaisseur: number; pulse?: boolean }) => {
  const r = (taille - epaisseur) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={taille} height={taille} className={`-rotate-90 flex-shrink-0 ${pulse ? "animate-pulse" : ""}`} aria-hidden>
      <circle cx={taille / 2} cy={taille / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={epaisseur} />
      <circle cx={taille / 2} cy={taille / 2} r={r} fill="none" stroke={couleur} strokeWidth={epaisseur} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * ratio} style={{ transition: "stroke-dashoffset 1s linear, stroke 0.6s" }} />
    </svg>
  );
};

interface Props {
  echeance: string | Date | null | undefined;
  debut?: string | Date | null;
  /** Tâche terminée : affiche le temps de traitement au lieu du compte à rebours */
  terminee?: string | Date | null;
  variant?: "pastille" | "anneau" | "barre";
  className?: string;
}

/**
 * Compte à rebours en temps réel jusqu'à l'échéance d'une tâche. Il démarre dès que la tâche
 * arrive chez son responsable (aucune action requise) et passe en « retard » une fois le délai dépassé.
 */
export default function CompteARebours({ echeance, debut, terminee, variant = "pastille", className = "" }: Props) {
  const now = useMaintenant();
  if (!echeance) return null;

  if (terminee) {
    const dansLesTemps = new Date(terminee).getTime() <= new Date(echeance).getTime();
    return (
      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${dansLesTemps ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-destructive/10 border-destructive/30 text-destructive"} ${className}`}>
        <CheckCircle2 className="w-3 h-3" /> {dansLesTemps ? "Terminée dans les délais" : "Terminée hors délai"}
      </span>
    );
  }

  const { reste, ecoule, etat } = calcul(echeance, debut, now);
  const st = STYLE[etat];
  const retard = etat === "retard";

  if (variant === "pastille") {
    return (
      <span data-testid="compte-a-rebours" title={`Échéance : ${dateHeure(echeance)}`}
        className={`inline-flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full border text-[11px] font-semibold tabular-nums ${st.fond} ${st.texte} ${retard ? "animate-pulse" : ""} ${className}`}>
        <Anneau ratio={ecoule} couleur={st.trait} taille={16} epaisseur={2.5} />
        {retard ? <>Retard {horloge(reste)}</> : <>{horloge(reste)}</>}
      </span>
    );
  }

  if (variant === "barre") {
    return (
      <div data-testid="compte-a-rebours" className={`rounded-xl border px-3 py-2 ${st.fond} ${className}`}>
        <div className="flex items-center justify-between gap-2">
          <span className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${st.texte}`}>
            {retard ? <AlarmClock className="w-3 h-3" /> : <Hourglass className="w-3 h-3" />}
            {retard ? "Délai dépassé de" : "Temps restant"}
          </span>
          <span className={`font-mono text-sm font-bold tabular-nums ${st.texte}`}>{horloge(reste)}</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/70 mt-1.5 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${Math.round(ecoule * 100)}%`, background: st.trait, transition: "width 1s linear" }} />
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">Échéance {dateHeure(echeance)}</p>
      </div>
    );
  }

  // Anneau : version détaillée (carte de la tâche)
  const s = Math.floor(Math.abs(reste) / 1000);
  const parties = [
    { v: Math.floor(s / 86400), u: "jours" },
    { v: Math.floor((s % 86400) / 3600), u: "heures" },
    { v: Math.floor((s % 3600) / 60), u: "min" },
    { v: s % 60, u: "sec" },
  ].filter((x, i) => i > 0 || x.v > 0);
  return (
    <div data-testid="compte-a-rebours" className={`relative overflow-hidden rounded-2xl border p-4 flex items-center gap-4 shadow-lg ${st.fond} ${st.halo} ${className}`}>
      <div className="relative flex-shrink-0">
        <Anneau ratio={ecoule} couleur={st.trait} taille={76} epaisseur={7} pulse={retard} />
        <div className={`absolute inset-0 flex items-center justify-center ${st.texte}`}>
          {retard ? <AlarmClock className="w-6 h-6" /> : <span className="text-sm font-black tabular-nums">{Math.round((1 - ecoule) * 100)}%</span>}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-[10px] font-bold uppercase tracking-[0.18em] ${st.texte}`}>
          {retard ? "Délai dépassé depuis" : `${st.libelle} · temps restant`}
        </p>
        <div className="flex items-end gap-2.5 mt-1">
          {parties.map(p => (
            <div key={p.u} className="text-center">
              <div className={`font-display text-2xl sm:text-3xl font-black tabular-nums leading-none ${st.texte}`}>{String(p.v).padStart(2, "0")}</div>
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground mt-1">{p.u}</div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          Échéance {dateHeure(echeance)}{debut ? <> · démarrée {dateHeure(debut)}</> : null}
        </p>
      </div>
    </div>
  );
}
