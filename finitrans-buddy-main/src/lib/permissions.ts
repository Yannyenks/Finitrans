import { useEffect, useState } from "react";
import { AuthUser, getStoredUser, onUserChange } from "./api";

export type Module =
  | "dashboard" | "mon_espace" | "bibliotheque" | "repertoire" | "supervision" | "exploitation" | "dossiers" | "codage"
  | "sorties" | "logistique" | "messagerie" | "alertes" | "finance" | "di" | "comptabilite"
  | "comptabilite_avancee" | "administratif" | "employes" | "kribi" | "reporting"
  | "performance" | "administration" | "parametres" | "crm";

const RANK: Record<string, number> = { complet: 3, partiel: 2, lecture: 1, non: 0 };

export type PermKey = "permDossier" | "permValidation" | "permFinancier" | "permRapports" | "permAdministration";
export type Level = "lecture" | "partiel" | "complet";

/** Modules par défaut si la session date d'avant le système de rôles (repli). */
const FALLBACK: Record<string, Module[]> = {
  dg: ["dashboard", "mon_espace", "supervision", "exploitation", "dossiers", "codage", "sorties", "logistique", "messagerie", "bibliotheque", "repertoire", "alertes", "finance", "di", "comptabilite", "comptabilite_avancee", "administratif", "employes", "kribi", "reporting", "performance", "administration", "parametres", "crm"],
  exploitation: ["dashboard", "mon_espace", "supervision", "exploitation", "dossiers", "codage", "sorties", "logistique", "messagerie", "bibliotheque", "repertoire", "alertes", "finance", "di", "comptabilite", "administratif", "employes", "kribi", "reporting", "performance", "parametres", "crm"],
};

export function userModules(user: AuthUser | null): Module[] {
  if (!user) return [];
  if (user.modules?.length) return user.modules as Module[];
  return FALLBACK[user.profil] ?? ["dashboard", "mon_espace", "messagerie", "bibliotheque", "repertoire", "alertes", "dossiers"];
}

export function hasModule(user: AuthUser | null, module: Module): boolean {
  return userModules(user).includes(module);
}

export function isSupervisor(user: AuthUser | null): boolean {
  return !!user && (user.superviseur ?? (user.profil === "dg" || user.profil === "exploitation"));
}

export function can(user: AuthUser | null, perm: PermKey, level: Level = "lecture"): boolean {
  if (!user) return false;
  if (isSupervisor(user)) return true;
  return (RANK[user[perm]] ?? 0) >= RANK[level];
}

/** Utilisateur courant, mis à jour automatiquement après un changement de rôle. */
export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());
  useEffect(() => onUserChange(() => setUser(getStoredUser())), []);
  return {
    user,
    modules: userModules(user),
    superviseur: isSupervisor(user),
    hasModule: (m: Module) => hasModule(user, m),
    can: (p: PermKey, l: Level = "lecture") => can(user, p, l),
  };
}

export const PROFIL_LABELS: Record<string, string> = {
  dg:              "Directeur Général",
  exploitation:    "Responsable Exploitation",
  logistique:      "Responsable Logistique",
  validation:      "Responsable Validation",
  gestion_sorties: "Responsable Gestion Sorties",
  administration:  "Service Administratif",
  comptabilite:    "Comptable",
  terrain_kribi:   "Responsable Douanier Kribi",
  operations:      "Agent d'opérations",
};

export const STATUS_LABELS: Record<string, string> = {
  reception:        "Réception",
  soumission_sgs:   "Soumission SGS",
  codage:           "Codage",
  validation:       "Validation",
  paiement:         "Paiement",
  bon_compagnie:    "Bon Compagnie",
  operations_douala: "Opérations Douala", operations_kribi: "Opérations Kribi",
  cloture:          "Clôture", facturation: "Facturation client",
};

export const fcfa = (n: number | string | null | undefined) =>
  `${Math.round(Number(n ?? 0)).toLocaleString("fr-FR")} FCFA`;
