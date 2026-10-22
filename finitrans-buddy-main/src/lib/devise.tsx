import { Fragment, ReactNode, useSyncExternalStore } from "react";

/**
 * Devise d'affichage des montants (suivi) : FCFA, dollar ou euro.
 * Les montants sont enregistrés en FCFA ; ils sont convertis à l'affichage selon les taux
 * définis par la Direction (Paramètres → Devises, paramètre « taux_change » : FCFA pour 1 unité).
 */
export type Devise = "XAF" | "USD" | "EUR";

export const DEVISES: { code: Devise; symbole: string; libelle: string }[] = [
  { code: "XAF", symbole: "FCFA", libelle: "Franc CFA" },
  { code: "USD", symbole: "$",    libelle: "Dollar US" },
  { code: "EUR", symbole: "€",    libelle: "Euro" },
];

/** Taux par défaut : parité fixe de l'euro (655,957 FCFA) et taux indicatif du dollar. */
export const TAUX_DEFAUT: Record<Exclude<Devise, "XAF">, number> = { EUR: 655.957, USD: 605 };

const CLE = "ft_devise";
const abonnes = new Set<() => void>();
let devise: Devise = (() => {
  try { const v = localStorage.getItem(CLE); return v === "USD" || v === "EUR" ? v : "XAF"; } catch { return "XAF"; }
})();
let taux = { ...TAUX_DEFAUT };

const notifier = () => abonnes.forEach(f => f());
const abonner = (f: () => void) => { abonnes.add(f); return () => { abonnes.delete(f); }; };

export function choisirDevise(d: Devise) {
  devise = d;
  try { localStorage.setItem(CLE, d); } catch { /* stockage indisponible */ }
  notifier();
}

/** Taux venant des paramètres serveur (FCFA pour 1 USD / 1 EUR). */
export function definirTaux(t: Partial<Record<"USD" | "EUR", number>> | null | undefined) {
  const suivant = {
    USD: Number(t?.USD) > 0 ? Number(t!.USD) : TAUX_DEFAUT.USD,
    EUR: Number(t?.EUR) > 0 ? Number(t!.EUR) : TAUX_DEFAUT.EUR,
  };
  if (suivant.USD !== taux.USD || suivant.EUR !== taux.EUR) { taux = suivant; notifier(); }
}

export function useDevise() {
  const d = useSyncExternalStore(abonner, () => devise, () => "XAF" as Devise);
  const t = useSyncExternalStore(abonner, () => taux, () => taux);
  return { devise: d, taux: t, choisirDevise };
}

/** Montant en FCFA → texte dans la devise d'affichage (« 1 250 000 FCFA », « 2 066,12 $ », « 1 905,62 € »). */
export function montant(xaf: number | string | null | undefined, d: Devise = devise): string {
  const n = Number(xaf ?? 0);
  if (!Number.isFinite(n)) return "—";
  if (d === "XAF") return `${Math.round(n).toLocaleString("fr-FR")} FCFA`;
  const v = n / taux[d];
  return `${v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${d === "USD" ? "$" : "€"}`;
}

/** Symbole de la devise d'affichage (en-têtes de colonnes, unités). */
export const symboleDevise = (d: Devise = devise) => DEVISES.find(x => x.code === d)!.symbole;

/** Rejoue l'affichage de toute l'application quand la devise change (les montants sont recalculés). */
export function AffichageDevise({ children }: { children: ReactNode }) {
  const { devise: d, taux: t } = useDevise();
  return <Fragment key={`${d}-${t.USD}-${t.EUR}`}>{children}</Fragment>;
}

/** Sélecteur FCFA / $ / € */
export function SelecteurDevise({ className = "" }: { className?: string }) {
  const { devise: d } = useDevise();
  return (
    <div role="radiogroup" aria-label="Devise d'affichage" className={`inline-flex items-center rounded-lg bg-muted p-0.5 text-[11px] font-bold ${className}`}>
      {DEVISES.map(x => (
        <button key={x.code} type="button" role="radio" aria-checked={d === x.code} title={x.libelle}
          onClick={() => choisirDevise(x.code)}
          className={`px-2 h-7 rounded-md transition-colors ${d === x.code ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          {x.symbole}
        </button>
      ))}
    </div>
  );
}

/** Taux en vigueur (FCFA pour 1 USD / 1 EUR). */
export const tauxActuels = (): Record<"USD" | "EUR", number> => ({ ...taux });
