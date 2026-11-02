/**
 * Offres SaaS. Hypothèses commerciales (à valider) : les limites sont appliquées côté serveur,
 * les prix ne sont pas publiés (offres sur devis tant que la grille n'est pas validée).
 */
import type { PlanAbonnement } from '@prisma/client'
import { ALL_MODULES, type ModuleKey } from './roles'

export interface Plan {
  cle: PlanAbonnement
  libelle: string
  description: string
  /** Utilisateurs actifs maximum ; null = illimité */
  maxUtilisateurs: number | null
  /** Modules ouverts par l'offre (intersectés avec les modules du profil) */
  modules: ModuleKey[]
}

const SANS = (...exclus: ModuleKey[]) => ALL_MODULES.filter(m => !exclus.includes(m))

export const PLANS: Record<PlanAbonnement, Plan> = {
  starter: {
    cle: 'starter', libelle: 'Starter',
    description: 'Petites équipes : dossiers, parcours douanier, documents, suivi client.',
    maxUtilisateurs: 10,
    modules: SANS('comptabilite_avancee', 'crm', 'reporting', 'performance', 'supervision'),
  },
  business: {
    cle: 'business', libelle: 'Business',
    description: 'Workflows complets, pilotage, CRM, reporting et performance des équipes.',
    maxUtilisateurs: 50,
    modules: SANS('comptabilite_avancee'),
  },
  enterprise: {
    cle: 'enterprise', libelle: 'Enterprise',
    description: 'Contrôles avancés, comptabilité SYSCOHADA, configurations spécifiques, accompagnement.',
    maxUtilisateurs: null,
    modules: [...ALL_MODULES],
  },
}

/** Durée de l'essai gratuit à l'inscription (jours). */
export const DUREE_ESSAI_JOURS = 14
