/**
 * Identité de la plateforme SaaS — nom provisoire, centralisé ici pour pouvoir être changé en un seul endroit.
 * L'identité de chaque entreprise cliente (raison sociale, logo) vient de son espace.
 */
export const MARQUE = {
  nom: "Transit Intelligence OS",
  nomCourt: "Transit Intelligence",
  sigle: "OS",
  /** Organisation historique dont le logo (navire) est fourni avec l'application */
  slugHistorique: "finitrans",
  annee: new Date().getFullYear(),
} as const;
