// Web Audio API — sound engine for platform notifications

let _ctx: AudioContext | null = null

function ctx(): AudioContext {
  if (!_ctx || _ctx.state === 'closed') {
    _ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
  }
  return _ctx
}

function note(
  ac: AudioContext,
  freq:    number,
  start:   number,
  dur:     number,
  type:    OscillatorType = 'sine',
  vol:     number = 0.18,
) {
  const osc  = ac.createOscillator()
  const gain = ac.createGain()
  osc.connect(gain)
  gain.connect(ac.destination)
  osc.type = type
  osc.frequency.setValueAtTime(freq, ac.currentTime + start)
  gain.gain.setValueAtTime(0, ac.currentTime + start)
  gain.gain.linearRampToValueAtTime(vol, ac.currentTime + start + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + start + dur)
  osc.start(ac.currentTime + start)
  osc.stop(ac.currentTime + start + dur + 0.05)
}

export type SoundType =
  | 'success'   // étape validée, dossier avancé
  | 'assign'    // responsable assigné
  | 'start'     // étape démarrée
  | 'info'      // informations sauvegardées, délai défini
  | 'upload'    // preuve / document joint
  | 'warning'   // sous-étape rouverte / révisée
  | 'retard'    // délai dépassé — urgent
  | 'error'     // erreur / rejet

const SOUNDS: Record<SoundType, (ac: AudioContext) => void> = {
  // Accord ascendant C5-E5-G5 — validation réussie
  success: ac => {
    note(ac, 523, 0,    0.18, 'sine', 0.20)
    note(ac, 659, 0.12, 0.18, 'sine', 0.20)
    note(ac, 784, 0.24, 0.25, 'sine', 0.20)
  },

  // Double ping aigu — assignation
  assign: ac => {
    note(ac, 880,  0,    0.14, 'sine', 0.16)
    note(ac, 1046, 0.18, 0.18, 'sine', 0.14)
  },

  // Montée rapide — démarrage
  start: ac => {
    note(ac, 523, 0,    0.10, 'sine', 0.15)
    note(ac, 784, 0.12, 0.16, 'sine', 0.15)
  },

  // Ping neutre unique — info
  info: ac => {
    note(ac, 784, 0, 0.22, 'sine', 0.14)
  },

  // Ping aigu bref — upload fichier
  upload: ac => {
    note(ac, 1318, 0,    0.07, 'sine', 0.14)
    note(ac, 1046, 0.09, 0.14, 'sine', 0.12)
  },

  // Descente triangle — avertissement / révision
  warning: ac => {
    note(ac, 660, 0,    0.18, 'triangle', 0.20)
    note(ac, 523, 0.22, 0.20, 'triangle', 0.20)
  },

  // Trois pulsations graves et urgentes — retard
  retard: ac => {
    note(ac, 392, 0,    0.09, 'square', 0.18)
    note(ac, 392, 0.16, 0.09, 'square', 0.18)
    note(ac, 330, 0.32, 0.22, 'square', 0.18)
  },

  // Descente sawtooth — rejet / erreur
  error: ac => {
    note(ac, 330, 0,    0.14, 'sawtooth', 0.18)
    note(ac, 247, 0.18, 0.22, 'sawtooth', 0.16)
  },
}

export function playSound(type: SoundType): void {
  try {
    const ac = ctx()
    const fire = () => SOUNDS[type](ac)
    if (ac.state === 'suspended') {
      ac.resume().then(fire).catch(() => {})
    } else {
      fire()
    }
  } catch {
    // Web Audio non disponible — ignore silencieusement
  }
}
