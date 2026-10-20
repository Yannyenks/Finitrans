import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

/** Compagnie maritime du référentiel (liste ouverte, gérée par la Direction). */
export interface Compagnie { code: string; nom: string; actif: boolean; dossiers?: number }

const DEFAUT: Compagnie[] = [
  { code: "MSC", nom: "MSC", actif: true }, { code: "COSCO", nom: "COSCO", actif: true },
  { code: "MAERSK", nom: "MAERSK", actif: true }, { code: "CMA_CGM", nom: "CMA CGM", actif: true },
];

/** Palette stable pour les graphiques (couleur déterminée par le code). */
const PALETTE = ["#F07B37", "#1A9AD6", "#22c55e", "#a855f7", "#ef4444", "#14b8a6", "#eab308", "#6366f1", "#ec4899", "#64748b"];
const CONNUES: Record<string, string> = { MSC: "#F07B37", COSCO: "#1A9AD6", MAERSK: "#22c55e", CMA_CGM: "#a855f7" };
export function couleurCompagnie(code: string): string {
  return CONNUES[code] ?? PALETTE[[...code].reduce((s, c) => s + c.charCodeAt(0), 0) % PALETTE.length];
}

export function useCompagnies() {
  const { data } = useQuery({
    queryKey: ["compagnies"],
    queryFn: () => api.get<Compagnie[]>("/api/compagnies"),
    staleTime: 5 * 60_000,
  });
  const liste = data ?? DEFAUT;
  return {
    liste,
    /** Compagnies proposées dans les formulaires */
    actives: liste.filter(c => c.actif),
    nom: (code?: string | null) => (code ? liste.find(c => c.code === code)?.nom ?? code.replace(/_/g, " ") : ""),
  };
}
