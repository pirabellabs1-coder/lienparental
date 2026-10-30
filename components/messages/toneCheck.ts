import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { localToneAnalysis, LOCAL_TONE_THRESHOLD, type ToneLocalLabels } from './toneLocal'

export type { ToneLocalLabels } from './toneLocal'

// Vérification du ton avant envoi (Coach IA). Ne bloque JAMAIS l'envoi :
// en cas d'échec réseau, de crédits ou de délai dépassé, on renvoie un échec
// (avec le message du serveur s'il y en a un) et le message part tel quel ;
// la page l'indique au parent.

export const TONE_THRESHOLD = LOCAL_TONE_THRESHOLD
// Au-delà, le message part sans vérification (ne jamais bloquer l'envoi). Une analyse prend
// 5 à 15 s en production : le délai laisse de la marge.
const TIMEOUT_MS = 30000

export type ToneAnalysis = {
  /** 0 à 100 */
  agressivite: number
  reformulation: string
  resume?: string
  source: 'api' | 'local'
}

/** Vérification impossible : `message` = explication du serveur (crédits, limite…), sinon raison générique. */
export type ToneFailure = { failed: true; message?: string }

/**
 * Contrat de /api/coach/analyze : entrée multipart/form-data (champ `text`),
 * sortie en flux SSE terminé par `event: done` { result, demo }, ou erreur JSON
 * avant le flux (401, 413, 415, 422, 429).
 * Réponse de démonstration (`demo: true`, résultat fixe) : on lui préfère
 * l'analyse locale, qui dépend réellement du texte saisi.
 */
export async function analyzeTone(text: string, otherPrenom: string, labels: ToneLocalLabels): Promise<ToneAnalysis | ToneFailure> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const fallback = (message?: string): ToneAnalysis | ToneFailure => (SUPABASE_ENABLED ? { failed: true, message } : localAnalysis(text, otherPrenom, labels))
  try {
    const form = new FormData()
    form.set('text', text.slice(0, 2000))
    // Brouillon du parent : le Coach propose une reformulation, jamais une « réponse » à son propre message.
    form.set('source', 'draft')
    const res = await fetch('/api/coach/analyze', { method: 'POST', body: form, signal: controller.signal })
    if (!res.ok || !res.body) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: unknown } } | null
      return fallback(typeof body?.error?.message === 'string' ? body.error.message : undefined)
    }

    if (!(res.headers.get('content-type') ?? '').includes('text/event-stream')) {
      const parsed = parseAnalysis(await res.json().catch(() => null))
      return parsed ?? fallback()
    }

    const done = await readDoneEvent(res.body)
    if (!done) return fallback()
    if (done.demo === true) return localAnalysis(text, otherPrenom, labels)
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
  // Seule une reformulation du brouillon est proposée à l'envoi (jamais une « réponse suggérée »).
  const isReformulation = o.nature_reponse === undefined || o.nature_reponse === 'reformulation'
  const reformulation = isReformulation && typeof o.reformulation === 'string' ? o.reformulation.trim() : ''
  return {
    agressivite: Math.max(0, Math.min(100, Math.round(score))),
    reformulation,
    resume: typeof o.resume === 'string' ? o.resume : undefined,
    source: 'api',
  }
}

// --- Analyse locale de démonstration ---------------------------------------
// Logique pure et multilingue dans ./toneLocal (testée) ; libellés dans la langue de l'interface.

function localAnalysis(text: string, otherPrenom: string, labels: ToneLocalLabels): ToneAnalysis {
  return { ...localToneAnalysis(text, otherPrenom, labels), source: 'local' }
}
