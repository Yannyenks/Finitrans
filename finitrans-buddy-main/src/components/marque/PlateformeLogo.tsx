import { MARQUE } from "@/config/marque";
import { cn } from "@/lib/utils";

/**
 * Logo de la plateforme : un trajet entre un point d'origine et un conteneur d'arrivée.
 * `clair` : version pour fond sombre.
 */
export const PlateformeEmbleme = ({ taille = 32, clair = false, className }: { taille?: number; clair?: boolean; className?: string }) => (
  <svg width={taille} height={taille} viewBox="0 0 40 40" fill="none" aria-hidden="true" className={className}>
    <rect width="40" height="40" rx="10" fill={clair ? "#FFFFFF" : "#0B1A2E"} />
    <path d="M11 28.5C11 20 16 14.5 26 13.5" stroke={clair ? "#0B1A2E" : "#FFFFFF"} strokeWidth="2.4" strokeLinecap="round" />
    <circle cx="11" cy="28.5" r="3.2" fill="#F07B37" />
    <rect x="24.5" y="9.5" width="8" height="8" rx="1.8" fill={clair ? "#0B1A2E" : "#FFFFFF"} />
  </svg>
);

const PlateformeLogo = ({ clair = false, taille = 32, className }: { clair?: boolean; taille?: number; className?: string }) => (
  <span className={cn("inline-flex items-center gap-2.5", className)}>
    <PlateformeEmbleme taille={taille} clair={clair} />
    <span className="flex items-baseline gap-1.5 leading-none">
      <span className={cn("font-display font-semibold tracking-[-0.01em]", clair ? "text-white" : "text-[#0B1A2E]")} style={{ fontSize: taille * 0.5 }}>
        {MARQUE.nomCourt}
      </span>
      <span
        className={cn("font-display font-semibold rounded px-1 py-[1px] tracking-wider", clair ? "text-white/70 border border-white/25" : "text-[#0B1A2E]/60 border border-[#0B1A2E]/20")}
        style={{ fontSize: taille * 0.3 }}
      >
        {MARQUE.sigle}
      </span>
    </span>
  </span>
);

export default PlateformeLogo;
