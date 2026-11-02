import { Link } from "react-router-dom";
import { Clock, Lock } from "lucide-react";
import FinitransLogo from "@/components/FinitransLogo";
import { useAuth } from "@/lib/permissions";
import { MARQUE } from "@/config/marque";
import { cn } from "@/lib/utils";

/** Initiales de l'entreprise pour son monogramme (ex. « Atlas Freight » → « AF »). */
function initiales(nom: string) {
  const mots = nom.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  return (mots.length >= 2 ? mots[0][0] + mots[1][0] : (mots[0] ?? "?").slice(0, 2)).toUpperCase();
}

/**
 * Identité de l'espace de l'utilisateur dans l'application.
 * L'organisation historique garde son logo ; chaque autre entreprise voit son propre nom.
 */
const MarqueEspace = ({ variant = "full", darkBg = false, iconSize = 42 }: { variant?: "full" | "icon"; darkBg?: boolean; iconSize?: number }) => {
  const { user } = useAuth();
  const org = user?.organisation;
  if (!org || org.slug === MARQUE.slugHistorique) return <FinitransLogo variant={variant} darkBg={darkBg} iconSize={iconSize} />;

  const tuile = (
    <span
      className={cn("flex shrink-0 items-center justify-center rounded-xl font-display font-semibold tracking-tight", darkBg ? "bg-white text-[#0B1A2E]" : "bg-[#0B1A2E] text-white")}
      style={{ width: iconSize * 0.86, height: iconSize * 0.86, fontSize: iconSize * 0.34 }}
      aria-hidden="true"
    >
      {initiales(org.nom)}
    </span>
  );
  if (variant === "icon") return <span title={org.nom}>{tuile}</span>;
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      {tuile}
      <span className="min-w-0">
        <span className={cn("block truncate font-display text-[15px] font-semibold leading-tight", darkBg ? "text-white" : "text-[#0B1A2E]")}>{org.nom}</span>
        <span className={cn("block truncate text-[10.5px] leading-tight", darkBg ? "text-white/50" : "text-muted-foreground")}>{MARQUE.nom} · {org.abonnement.libelle}</span>
      </span>
    </span>
  );
};

export default MarqueEspace;

/** Bandeau d'état de l'abonnement : jours d'essai restants, ou lecture seule en cas d'impayé. */
export const BandeauAbonnement = () => {
  const { user } = useAuth();
  const a = user?.organisation?.abonnement;
  if (!a) return null;

  if (a.statut === "impaye") {
    return (
      <div role="status" className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-[13px] text-amber-900">
        <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Espace en lecture seule : l'abonnement est en attente de règlement. Les données restent consultables.
      </div>
    );
  }
  if (a.statut === "essai" && a.finEssai) {
    const jours = Math.ceil((new Date(a.finEssai).getTime() - Date.now()) / 86_400_000);
    if (jours > 14 || jours < 0) return null;
    return (
      <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[#0B1A2E]/10 bg-[#0B1A2E] px-4 py-2 text-[13px] text-white/85">
        <span className="inline-flex items-center gap-2"><Clock className="h-3.5 w-3.5 text-[#F5A06E]" aria-hidden="true" />
          Essai {a.libelle} : {jours <= 1 ? "dernier jour" : `${jours} jours restants`}.
        </span>
        <Link to="/#demo" className="font-semibold text-white underline-offset-4 hover:underline">Activer l'abonnement</Link>
      </div>
    );
  }
  return null;
};
