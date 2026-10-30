// Voix de lecture du Coach IA (ElevenLabs). Partagé client / serveur : aucun secret ici.
// Koraly est la voix de la vidéo de présentation française ; les trois autres ont été ajoutées
// au compte ElevenLabs depuis la bibliothèque (voix françaises calmes, conversationnelles).

export const COACH_VOICES = [
  { key: 'koraly', id: 'rbFGGoDXFHtVghjHuS3E', gender: 'female' },
  { key: 'lucie', id: 'YxrwjAKoUKULGd0g8K9Y', gender: 'female' },
  { key: 'marcel', id: 'kENkNtk0xyzG09WW40xE', gender: 'male' },
  { key: 'fabien', id: 'xlVRtVJbKuO2nwbbopa2', gender: 'male' },
] as const

export type CoachVoiceKey = (typeof COACH_VOICES)[number]['key']

export const DEFAULT_COACH_VOICE: CoachVoiceKey = 'koraly'

export function isCoachVoice(v: unknown): v is CoachVoiceKey {
  return typeof v === 'string' && COACH_VOICES.some((x) => x.key === v)
}

/** Longueur maximale lue (caractères) : une réponse du Coach tient largement dedans. */
export const SPEECH_MAX_CHARS = 3000

/**
 * Texte d'une réponse du Coach → texte à lire : sans mise en forme Markdown ni ligne « Sources : »
 * (la liste des données utilisées n'a pas à être lue), puces transformées en phrases.
 */
export function speechText(raw: string): string {
  const lines = raw.replace(/\*\*/g, '').replace(/^#+\s*/gm, '').split('\n')
  while (lines.length && !lines[lines.length - 1]!.trim()) lines.pop()
  if (lines.length && /^sources\s*:/i.test(lines[lines.length - 1]!.trim())) lines.pop()
  const text = lines
    .map((l) => l.replace(/^\s*(?:[-•*]|\d+[.)])\s+/, '').trim())
    .filter(Boolean)
    .map((l) => (/[.!?…:;]$/.test(l) ? l : `${l}.`))
    .join('\n')
  if (text.length <= SPEECH_MAX_CHARS) return text
  // Coupe à la dernière fin de phrase avant la limite.
  const cut = text.slice(0, SPEECH_MAX_CHARS)
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('\n'), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
  return (end > SPEECH_MAX_CHARS / 2 ? cut.slice(0, end + 1) : cut).trim()
}
