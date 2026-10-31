/**
 * POST /api/assistant/speech { text } : lecture à voix haute d'une réponse de l'assistant public
 * (visiteur sans compte). Voix Koraly uniquement, texte nettoyé (speechText) et borné à 600 caractères.
 *
 * Le forfait ElevenLabs (caractères par mois) est partagé avec le Coach des abonnés : limites strictes,
 * en fail-closed (limiteur indisponible = refus) :
 *  - par IP : 3 lectures par 10 minutes, 10 par jour ;
 *  - global : ASSISTANT_SPEECH_DAILY_CAP lectures par jour, toutes IP confondues (défaut 10).
 * Limite atteinte : 429 `speech_limit` (le widget propose de créer un compte gratuit). Quota, clé absente,
 * panne : 503 `tts_unavailable` (le widget réessaie une fois puis affiche un court message). Jamais de
 * voix de synthèse de l'appareil.
 * Rien n'est enregistré.
 */
import { z } from 'zod'
import { jsonError, rejectCrossSiteJson } from '@/lib/data/server/http'
import { clientIp, ipKey, rateLimit } from '@/lib/data/server/rate-limit'
import { COACH_VOICES, DEFAULT_COACH_VOICE, speechText } from '@/lib/ai/voices'
import { AUDIO_HEADERS, elevenLabsSpeech } from '@/lib/ai/elevenlabs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const PUBLIC_SPEECH_MAX_CHARS = 600
const MAX_BODY = 8_000
const GLOBAL_PER_DAY = Math.max(0, Number(process.env.ASSISTANT_SPEECH_DAILY_CAP) || 10)

const Body = z.object({ text: z.string().trim().min(1).max(4_000) }).strict()

const unavailable = () => jsonError(503, 'tts_unavailable', 'Lecture indisponible.')
const limited = () => jsonError(429, 'speech_limit', 'Limite de lectures atteinte.')

export async function POST(req: Request) {
  const rejected = rejectCrossSiteJson(req)
  if (rejected) return rejected
  if (!process.env.ELEVENLABS_API_KEY) return unavailable()

  if (Number(req.headers.get('content-length') ?? '0') > MAX_BODY) return jsonError(413, 'payload_too_large', 'Requête invalide.')
  const raw = await req.text().catch(() => '')
  if (raw.length > MAX_BODY) return jsonError(413, 'payload_too_large', 'Requête invalide.')
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return jsonError(400, 'bad_json', 'Requête invalide.')
  }
  const parsed = Body.safeParse(json)
  if (!parsed.success) return jsonError(422, 'invalid_body', 'Requête invalide.')
  const text = speechText(parsed.data.text).slice(0, PUBLIC_SPEECH_MAX_CHARS)
  if (!text) return jsonError(422, 'invalid_body', 'Requête invalide.')

  // Comptées seulement pour une requête valide : une erreur de saisie ne consomme pas le quota.
  const ip = clientIp(req.headers)
  const burst = await rateLimit(ipKey('assistant-speech', ip), 3, 10 * 60_000, { failClosed: true })
  if (!burst.ok) return burst.reason === 'limited' ? limited() : unavailable()
  const daily = await rateLimit(ipKey('assistant-speech-day', ip), 10, 86_400_000, { failClosed: true })
  if (!daily.ok) return daily.reason === 'limited' ? limited() : unavailable()
  const global = await rateLimit('assistant-speech-global:all', GLOBAL_PER_DAY, 86_400_000, { failClosed: true })
  if (!global.ok) return global.reason === 'limited' ? limited() : unavailable()

  const voice = COACH_VOICES.find((v) => v.key === DEFAULT_COACH_VOICE)!
  const audio = await elevenLabsSpeech(text, voice.id, 'assistant-speech')
  if (!audio) return unavailable()
  return new Response(audio, { headers: AUDIO_HEADERS })
}
