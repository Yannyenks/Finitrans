import { AlertTriangle, Anchor, BadgeCheck, Bell, Container, FileText, Landmark, Ship, Truck, Wallet } from "lucide-react";

/** Illustrations du suivi client : pictogramme sur pastille dégradée, avec halo et reflets. */
export const ILLUSTRATIONS: Record<string, { icone: React.ElementType; de: string; a: string; libelle: string }> = {
  info:      { icone: Bell,          de: "#3B82F6", a: "#1D4ED8", libelle: "Information" },
  navire:    { icone: Ship,          de: "#0EA5E9", a: "#0369A1", libelle: "Navire" },
  port:      { icone: Anchor,        de: "#14B8A6", a: "#0F766E", libelle: "Port" },
  douane:    { icone: Landmark,      de: "#8B5CF6", a: "#6D28D9", libelle: "Douane" },
  document:  { icone: FileText,      de: "#6366F1", a: "#4338CA", libelle: "Documents" },
  paiement:  { icone: Wallet,        de: "#F59E0B", a: "#D97706", libelle: "Paiement" },
  camion:    { icone: Truck,         de: "#F07B37", a: "#C2410C", libelle: "Livraison" },
  conteneur: { icone: Container,     de: "#0EA5E9", a: "#1E3A8A", libelle: "Conteneur" },
  valide:    { icone: BadgeCheck,    de: "#22C55E", a: "#15803D", libelle: "Terminé" },
  attention: { icone: AlertTriangle, de: "#F43F5E", a: "#BE123C", libelle: "Attention" },
};

export function Illustration({ type, taille = 44, eteinte = false }: { type: string; taille?: number; eteinte?: boolean }) {
  const ill = ILLUSTRATIONS[type] ?? ILLUSTRATIONS.info;
  const Icone = ill.icone;
  return (
    <span className="relative inline-flex items-center justify-center shrink-0 rounded-2xl overflow-hidden"
      style={{
        width: taille, height: taille,
        background: eteinte ? "linear-gradient(135deg, #E5E9F0, #CBD3DF)" : `linear-gradient(135deg, ${ill.de}, ${ill.a})`,
        boxShadow: eteinte ? "none" : `0 8px 20px -8px ${ill.a}AA, inset 0 1px 0 rgba(255,255,255,0.35)`,
      }}
      aria-hidden>
      <span className="absolute -top-1/3 -right-1/4 w-3/4 h-3/4 rounded-full bg-white/20" />
      <span className="absolute -bottom-1/2 -left-1/4 w-3/4 h-3/4 rounded-full bg-black/10" />
      <Icone className="relative text-white drop-shadow" style={{ width: taille * 0.48, height: taille * 0.48 }} strokeWidth={2} />
    </span>
  );
}
