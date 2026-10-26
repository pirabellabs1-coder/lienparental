import { SUPABASE_ENABLED } from '@/lib/supabase/config'

// Vérification du ton avant envoi (Coach IA). Ne bloque JAMAIS l'envoi :
// en cas d'échec réseau, de quota ou de délai dépassé, on renvoie null et
// le message part tel quel.

export const TONE_THRESHOLD = 40
// Au-delà, le message part sans vérification (ne jamais bloquer l'envoi).
const TIMEOUT_MS = 12000

export type ToneAnalysis = {
  /** 0 à 100 */
  agressivite: number
  reformulation: string
  resume?: string
  source: 'api' | 'local'
}

/**
 * Contrat de /api/coach/analyze : entrée multipart/form-data (champ `text`),
 * sortie en flux SSE terminé par `event: done` { result, demo }, ou erreur JSON
 * avant le flux (401, 413, 415, 422, 429).
 * Réponse de démonstration (`demo: true`, résultat fixe) : on lui préfère
 * l'analyse locale, qui dépend réellement du texte saisi.
 */
export async function analyzeTone(text: string, otherPrenom: string): Promise<ToneAnalysis | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const fallback = () => (SUPABASE_ENABLED ? null : localAnalysis(text, otherPrenom))
  try {
    const form = new FormData()
    form.set('text', text.slice(0, 2000))
    const res = await fetch('/api/coach/analyze', { method: 'POST', body: form, signal: controller.signal })
    if (!res.ok || !res.body) return fallback()

    if (!(res.headers.get('content-type') ?? '').includes('text/event-stream')) {
      const parsed = parseAnalysis(await res.json().catch(() => null))
      return parsed ?? fallback()
    }

    const done = await readDoneEvent(res.body)
    if (!done) return fallback()
    if (done.demo === true) return localAnalysis(text, otherPrenom)
    return parseAnalysis(done.result) ?? fallback()
  } catch {
    return fallback()
  } finally {
    clearTimeout(timer)
  }
}

/** Lit le flux SSE jusqu'à la trame `done` (null si `error` ou fin de flux). */
async function readDoneEvent(body: ReadableStream<Uint8Array>): Promise<{ result?: unknown; demo?: unknown } | null> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) return null
      buffer += decoder.decode(value, { stream: true })
      let sep: number
      while ((sep = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        const event = /^event: (.+)$/m.exec(frame)?.[1]?.trim()
        const data = frame.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('\n')
        if (event === 'error') return null
        if (event === 'done') {
          try { return JSON.parse(data) as { result?: unknown; demo?: unknown } } catch { return null }
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {})
  }
}

function parseAnalysis(v: unknown): ToneAnalysis | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const score = typeof o.agressivite === 'number' ? o.agressivite : Number(o.agressivite)
  if (!Number.isFinite(score)) return null
  const reformulation = typeof o.reformulation === 'string' ? o.reformulation.trim() : ''
  return {
    agressivite: Math.max(0, Math.min(100, Math.round(score))),
    reformulation,
    resume: typeof o.resume === 'string' ? o.resume : undefined,
    source: 'api',
  }
}

// --- Analyse locale de démonstration ---------------------------------------

const MARKERS: Array<[RegExp, number]> = [
  [/\bjamais\b/i, 15],
  [/\btoujours\b/i, 10],
  [/!{2,}|\?!/, 15],
  [/\b(nul|nulle|incapable|menteur|menteuse|irresponsable|égoïste|egoiste|minable|pathétique|ridicule|idiot|idiote|débile|honte)\b/i, 30],
  [/n['’]importe quoi/i, 20],
  [/\bc['’]est (de )?ta faute\b/i, 25],
  [/\btu (ne )?(fais|comprends|écoutes|t['’]occupes) (jamais|rien)\b/i, 20],
  [/\b(tu vas voir|tu (le )?regretteras|je vais te)\b/i, 35],
]

function localAnalysis(text: string, otherPrenom: string): ToneAnalysis {
  let score = 0
  for (const [re, w] of MARKERS) if (re.test(text)) score += w
  const letters = text.replace(/[^A-Za-zÀ-ÿ]/g, '')
  if (letters.length >= 8 && letters.replace(/[^A-ZÀ-Þ]/g, '').length / letters.length > 0.6) score += 25
  score = Math.min(100, score)

  return {
    agressivite: score,
    reformulation: softened(text, otherPrenom),
    resume: score >= TONE_THRESHOLD
      ? 'Certaines expressions peuvent être perçues comme des reproches. Une formulation factuelle facilite la réponse.'
      : undefined,
    source: 'local',
  }
}

/**
 * Reformulation de démonstration : les phrases accusatrices sont retirées
 * (plutôt que déformées), les phrases factuelles conservées, puis le message
 * est encadré par une formulation en « je » tournée vers une solution.
 */
function softened(text: string, otherPrenom: string): string {
  let t = text.trim()
  const letters = t.replace(/[^A-Za-zÀ-ÿ]/g, '')
  if (letters.length >= 8 && letters.replace(/[^A-ZÀ-Þ]/g, '').length / letters.length > 0.6) t = t.toLowerCase()

  const sentences = t
    .replace(/\?!+/g, ' ?')
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.replace(/!+/g, '.').replace(/\s+([,.;:?])/g, '$1').replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean)

  const accusatory = (x: string) => MARKERS.some(([re]) => re.test(x))
  const kept = sentences
    .filter((x) => !accusatory(x))
    .filter((x) => !/^(bonjour|bonsoir|salut)\b[^.?]*[.,]?$/i.test(x))
    .map((x) => {
      const y = x.charAt(0).toUpperCase() + x.slice(1)
      return /[.?]$/.test(y) ? y : `${y}.`
    })

  const parts = [
    `Bonjour ${otherPrenom}, je voudrais qu'on reprenne ce point calmement.`,
    ...kept,
    "J'aimerais qu'on trouve ensemble une solution qui convienne aux enfants.",
    'Peux-tu me dire ce qui te conviendrait ? Merci.',
  ]
  return parts.join(' ')
}
