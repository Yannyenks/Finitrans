import { toast } from '@/hooks/use-toast'
import { playSound, SoundType } from '@/lib/sound'

export interface NotifyOptions {
  sound?:       SoundType
  title:        string
  description?: string
  variant?:     'default' | 'destructive'
}

export function notify({ sound, title, description, variant = 'default' }: NotifyOptions) {
  if (sound) playSound(sound)
  toast({ title, description, variant })
}

// ── Presets par événement ──────────────────────────────────────────────────────

export const notif = {

  // Avancement principal du dossier (étape → étape suivante)
  dossierAvance: (de: string, vers: string) => notify({
    sound:       'success',
    title:       'Dossier avancé',
    description: `Étape "${de}" terminée — passage à "${vers}"`,
  }),

  // Validation d'une sous-étape
  sousEtapeValidee: (label: string) => notify({
    sound:       'success',
    title:       'Sous-étape validée',
    description: `"${label}" marquée comme validée`,
  }),

  // Rejet d'une sous-étape
  sousEtapeRejetee: (label: string) => notify({
    sound:       'error',
    title:       'Sous-étape rejetée',
    description: `"${label}" a été rejetée — une correction est requise`,
    variant:     'destructive',
  }),

  // Démarrage d'une sous-étape
  sousEtapeDemarree: (label: string) => notify({
    sound:       'start',
    title:       'Sous-étape démarrée',
    description: `"${label}" est maintenant en cours de traitement`,
  }),

  // Relance d'une sous-étape rejetée
  sousEtapeRelancee: (label: string) => notify({
    sound:       'info',
    title:       'Sous-étape relancée',
    description: `"${label}" est de nouveau en cours`,
  }),

  // Révision d'une sous-étape validée
  sousEtapeRevisee: (label: string) => notify({
    sound:       'warning',
    title:       'Sous-étape rouverte',
    description: `"${label}" a été rouverte pour révision`,
  }),

  // Assignation d'un responsable
  responsableAssigne: (label: string, nom: string) => notify({
    sound:       'assign',
    title:       'Responsable assigné',
    description: `${nom} est maintenant responsable de "${label}"`,
  }),

  // Affectation reçue (vue par le responsable)
  youreAssigned: (label: string, etape: string) => notify({
    sound:       'assign',
    title:       'Vous avez été assigné',
    description: `Vous êtes responsable de "${label}" (étape ${etape})`,
  }),

  // Délai défini ou modifié
  delaiDefini: (label: string, date: string) => notify({
    sound:       'info',
    title:       'Délai enregistré',
    description: `Délai pour "${label}" fixé au ${date}`,
  }),

  // Preuve / document joint
  preuveJointe: (label: string, filename: string) => notify({
    sound:       'upload',
    title:       'Preuve enregistrée',
    description: `"${filename}" joint à "${label}"`,
  }),

  // Informations de l'étape sauvegardées
  infoSauvegardee: (label: string) => notify({
    sound:       'info',
    title:       'Informations sauvegardées',
    description: `Les données de "${label}" ont été mises à jour`,
  }),

  // Retard sur une sous-étape unique
  retardUnique: (label: string) => notify({
    sound:       'retard',
    title:       'Retard détecté',
    description: `"${label}" a dépassé son délai cible — action requise`,
    variant:     'destructive',
  }),

  // Retard sur plusieurs sous-étapes
  retardMultiple: (count: number) => notify({
    sound:       'retard',
    title:       `${count} sous-étape${count > 1 ? 's' : ''} en retard`,
    description: `Ce dossier a ${count} sous-étape${count > 1 ? 's' : ''} ayant dépassé leur délai`,
    variant:     'destructive',
  }),

  // Avancement bloqué (sous-étapes incomplètes)
  avancementBloque: (etapeLabel: string) => notify({
    sound:       'warning',
    title:       'Avancement bloqué',
    description: `Toutes les sous-étapes de "${etapeLabel}" doivent être validées avant de continuer`,
    variant:     'destructive',
  }),

  // Document / facture uploadé
  documentUploade: (nom: string) => notify({
    sound:       'upload',
    title:       'Document enregistré',
    description: `"${nom}" a été joint au dossier`,
  }),

  // Facture DI déduire
  factureAppliquee: (montant: number, devise: string) => notify({
    sound:       'success',
    title:       'Déduction appliquée',
    description: `${montant.toLocaleString('fr-FR')} ${devise} déduit du solde DI`,
  }),

  // Erreur générique
  erreur: (msg?: string) => notify({
    sound:       'error',
    title:       'Erreur',
    description: msg ?? 'Une erreur est survenue. Veuillez réessayer.',
    variant:     'destructive',
  }),
}
