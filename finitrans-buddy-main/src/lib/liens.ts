import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export type LienExterne = { label: string; url: string };

/**
 * Portails externes ouverts depuis une sous-étape (clé « etape.cle »).
 * Valeurs par défaut, modifiables par la Direction dans Paramètres → Liens & portails.
 */
export const LIENS_DEFAUT: Record<string, LienExterne> = {
  "soumission_sgs.ff_soumission": { label: "Portail de soumission SGS", url: "https://www.sgs.com/fr-cm" },
};

export function useLiensExternes(): Record<string, LienExterne> {
  const { data } = useQuery({
    queryKey: ["parametres"],
    queryFn: () => api.get<Record<string, unknown>>("/api/parametres"),
    staleTime: 5 * 60_000,
  });
  const personnalises = (data?.liens_externes ?? null) as Record<string, LienExterne> | null;
  return personnalises ?? LIENS_DEFAUT;
}

/** N'autorise que des liens web (http/https). */
export function urlValide(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}
