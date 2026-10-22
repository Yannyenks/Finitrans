/**
 * Le parcours d'un dossier en deux grandes phases chronométrées séparément :
 *   1. PRÉ-DÉDOUANEMENT — de la réception à l'obtention du RVC (soumission SGS)
 *   2. DÉDOUANEMENT     — du codage à la fin du dossier
 * Chaque étape démarre par un bouton « Démarrer » (avec un motif en cas d'imprévu),
 * ce qui isole les temps d'attente imprévus des temps de traitement.
 */
import { DossierStatus, Site } from '@prisma/client'
import { stagesForSite } from './workflow'

export const PHASES = [
  { cle: 'pre_dedouanement', libelle: 'Pré-dédouanement', description: 'De la réception du dossier à l\'obtention du RVC', etapes: ['reception', 'soumission_sgs'] as DossierStatus[] },
  { cle: 'dedouanement',     libelle: 'Dédouanement',     description: 'Du codage à la libération et à la facturation',  etapes: ['codage', 'validation', 'paiement', 'bon_compagnie', 'operations_douala', 'operations_kribi', 'cloture', 'facturation'] as DossierStatus[] },
] as const

export const phaseDe = (etape: string) => PHASES.find(p => (p.etapes as string[]).includes(etape))!

/** Motifs d'imprévu : libellé interne et formulation professionnelle pour le client. */
export const MOTIFS_IMPREVU: Record<string, { libelle: string; client: string }> = {
  documents_client:  { libelle: 'En attente de documents du client',            client: 'Nous attendons des documents complémentaires de votre part pour poursuivre les opérations.' },
  navire_retard:     { libelle: 'Retard d\'arrivée du navire',                   client: 'L\'arrivée du navire est retardée par la compagnie maritime ; nous suivons son nouvel horaire.' },
  inspection:        { libelle: 'Inspection complémentaire (SGS / douane)',       client: 'Une inspection complémentaire a été demandée par les autorités. Nous l\'accompagnons de près.' },
  administration:    { libelle: 'Délai de l\'administration douanière',          client: 'Le traitement par l\'administration douanière prend plus de temps que prévu. Nous suivons le dossier quotidiennement.' },
  paiement:          { libelle: 'En attente d\'un règlement',                     client: 'Un règlement est attendu pour poursuivre les formalités. Votre chargé de dossier reste à votre disposition.' },
  systemes:          { libelle: 'Indisponibilité des systèmes (douane / port)',  client: 'Les systèmes informatiques de la douane ou du port sont momentanément indisponibles. Les opérations reprendront dès leur rétablissement.' },
  terminal:          { libelle: 'Congestion au terminal portuaire',               client: 'Le terminal portuaire connaît une forte affluence, ce qui allonge les délais d\'enlèvement.' },
  compagnie:         { libelle: 'Délai de la compagnie maritime',                 client: 'Nous attendons un retour de la compagnie maritime pour poursuivre.' },
  jour_ferie:        { libelle: 'Jour férié / fermeture des services',            client: 'Les services administratifs sont fermés (jour férié). Les opérations reprendront à leur réouverture.' },
  autre:             { libelle: 'Autre imprévu',                                  client: 'Un imprévu ralentit momentanément le traitement de votre dossier. Notre équipe s\'en occupe.' },
}

type Timing = { etape: string; dateDebut: Date; dateFin: Date | null }

export interface EtatPhase {
  cle: string; libelle: string; description: string
  etat: 'a_venir' | 'en_attente' | 'en_cours' | 'terminee'
  debut: Date | null; fin: Date | null
}

/** État et chronométrage de chaque phase d'un dossier. */
export function phasesDossier(d: { status: DossierStatus; site: Site; finaliseLe: Date | null; etapeDemarree: boolean; timings: Timing[] }): EtatPhase[] {
  const parcours = stagesForSite(d.site)
  const iCourant = parcours.indexOf(d.status)
  return PHASES.map(p => {
    const etapes = parcours.filter(e => (p.etapes as string[]).includes(e))
    const iPremiere = parcours.indexOf(etapes[0])
    const iDerniere = parcours.indexOf(etapes[etapes.length - 1])
    const ts = d.timings.filter(t => (etapes as string[]).includes(t.etape))
    const debutPhase = ts.length ? ts.reduce((m, t) => (t.dateDebut < m ? t.dateDebut : m), ts[0].dateDebut) : null
    const terminee = !!d.finaliseLe || iCourant > iDerniere
    if (terminee) {
      const fins = ts.map(t => t.dateFin).filter((x): x is Date => !!x)
      return { ...p, etat: 'terminee' as const, debut: debutPhase, fin: fins.length ? fins.reduce((m, x) => (x > m ? x : m)) : d.finaliseLe }
    }
    if (iCourant < iPremiere) return { ...p, etat: 'a_venir' as const, debut: null, fin: null }
    if (iCourant === iPremiere && !d.etapeDemarree) return { ...p, etat: 'en_attente' as const, debut: null, fin: null }
    return { ...p, etat: 'en_cours' as const, debut: debutPhase, fin: null }
  })
}
