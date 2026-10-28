/**
 * Analyse locale du ton (démonstration, et repli quand l'API renvoie sa réponse de démo).
 * Module PUR (sans React, Supabase ni navigateur) : testé par tests/beta-tone.test.ts.
 *
 * - Détection MULTILINGUE (français, anglais, portugais), quelle que soit la langue de
 *   l'interface : un parent peut écrire dans une autre langue que celle de son application.
 * - Insensible aux accents et à la casse (« você » = « voce », « égoïste » = « egoiste »).
 * - La reformulation est encadrée dans la langue de l'INTERFACE (`labels`) et ne reprend
 *   JAMAIS une phrase accusatrice ni un mot blessant du lexique.
 */

export type ToneLocalLabels = {
  /** Ouverture avec le prénom de l'autre parent (« Bonjour {name}, … »). */
  openingNamed: (name: string) => string
  /** Ouverture sans prénom (conversation de groupe, prénom inconnu). */
  opening: string
  /** Phrases de clôture tournées vers une solution. */
  closing: string
  /** Explication affichée dans l'alerte quand le seuil est atteint. */
  resume: string
}

export type LocalToneResult = { agressivite: number; reformulation: string; resume?: string }

export const LOCAL_TONE_THRESHOLD = 40

/** Minuscules, sans accents, apostrophes typographiques normalisées. */
export function normalizeTone(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’`´]/g, "'").toLowerCase()
}

// Motifs écrits SANS accents (appliqués au texte normalisé).
const INSULTS = [
  // français
  'nul', 'nulle', 'incapable', 'menteur', 'menteuse', 'irresponsable', 'egoiste', 'minable', 'pathetique',
  'ridicule', 'idiot', 'idiote', 'debile', 'honte', 'connard', 'connasse', 'abruti', 'abrutie', 'bon a rien',
  // anglais
  'useless', 'stupid', 'idiot', 'liar', 'irresponsible', 'selfish', 'pathetic', 'ridiculous', 'incompetent',
  'worthless', 'loser', 'moron', 'dumb', 'shame on you', 'good for nothing', 'bullshit', 'jerk', 'asshole',
  // portugais
  'inutil', 'idiota', 'estupido', 'estupida', 'mentiroso', 'mentirosa', 'irresponsavel', 'egoista', 'ridiculo',
  'ridicula', 'patetico', 'patetica', 'incompetente', 'imbecil', 'vergonha', 'otario', 'otaria', 'babaca', 'burro', 'burra',
]
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')
const INSULT_RE = new RegExp(`\\b(${INSULTS.map(escape).join('|')})\\b`, 'i')

export const TONE_MARKERS: ReadonlyArray<readonly [RegExp, number]> = [
  // Généralisations « jamais / toujours »
  [/\b(jamais|never|nunca)\b/, 15],
  [/\b(toujours|always|sempre)\b/, 10],
  // Reproche généralisé adressé à l'autre (« tu ne … jamais », « you never », « você nunca »)
  [/\btu (ne |n')?\S+ (jamais|rien|toujours)\b|\btu n'\S+ (jamais|rien)\b|\byou('re| are)? (never|always)\b|\b(voce|tu) (nunca|sempre|nao \S+ nada)\b/, 25],
  [/!{2,}|\?!/, 15],
  [INSULT_RE, 30],
  // Insulte adressée directement (« tu es nul », « you are useless », « você é inútil ») : seuil atteint.
  [new RegExp(`\\b(tu es|t'es|vous etes|you('re| are)|(voce|tu) (e|es)|seu|sua)\\s+(\\S+\\s+)?(${INSULTS.map(escape).join('|')})\\b`), 15],
  [/n'importe quoi|nonsense|whatever you say|palhacada/, 20],
  [/\bc'est (de )?ta faute\b|\b(it's|it is) (all )?your fault\b|\b(a )?culpa (e )?(sua|tua)\b/, 25],
  [/\b(tu vas voir|tu (le )?regretteras|je vais te)\b|\byou('ll| will) (regret|see|pay)\b|\bi('m| am) going to make you\b|\b(vai|voce vai) (se arrepender|ver|pagar)\b|\bvou te\b/, 35],
]

const GREETING = /^(bonjour|bonsoir|salut|coucou|hello|hi|hey|dear|ola|oi|bom dia|boa tarde|boa noite)\b[^.?]*[.,!]?$/

const isShouting = (text: string) => {
  const letters = text.replace(/[^\p{L}]/gu, '')
  return letters.length >= 8 && letters.replace(/[^\p{Lu}]/gu, '').length / letters.length > 0.6
}

export function toneScore(text: string): number {
  const n = normalizeTone(text)
  let score = 0
  for (const [re, w] of TONE_MARKERS) if (re.test(n)) score += w
  if (isShouting(text)) score += 25
  return Math.min(100, score)
}

const accusatory = (sentence: string) => {
  const n = normalizeTone(sentence)
  return TONE_MARKERS.some(([re]) => re.test(n))
}

/**
 * Reformulation : phrases accusatrices retirées (plutôt que déformées), phrases factuelles
 * conservées, cadre en « je » tourné vers une solution dans la langue de l'interface.
 */
export function softenedReformulation(text: string, otherPrenom: string, labels: ToneLocalLabels): string {
  let t = text.trim()
  if (isShouting(t)) t = t.toLowerCase()
  const kept = t
    .replace(/\?!+/g, ' ?')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((x) => x.replace(/!+/g, '.').replace(/\s+([,.;:?])/g, '$1').replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean)
    .filter((x) => !accusatory(x))
    .filter((x) => !GREETING.test(normalizeTone(x)))
    .map((x) => {
      const y = x.charAt(0).toUpperCase() + x.slice(1)
      return /[.?]$/.test(y) ? y : `${y}.`
    })
  const name = otherPrenom.trim()
  return [name ? labels.openingNamed(name) : labels.opening, ...kept, labels.closing].join(' ')
}

export function localToneAnalysis(text: string, otherPrenom: string, labels: ToneLocalLabels): LocalToneResult {
  const score = toneScore(text)
  return {
    agressivite: score,
    reformulation: softenedReformulation(text, otherPrenom, labels),
    resume: score >= LOCAL_TONE_THRESHOLD ? labels.resume : undefined,
  }
}
