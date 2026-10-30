/**
 * POST /api/coach/speech { text, voice } : lecture à voix haute d'une réponse du Coach (ElevenLabs).
 *
 * - Compte connecté uniquement ; la clé ElevenLabs reste côté serveur (ELEVENLABS_API_KEY).
 * - Voix limitées aux quatre voix du Coach (lib/ai/voices.ts) ; texte nettoyé et borné.
 * - Limites : 10 lectures par minute, 60 par jour et par compte (forfait de caractères partagé).
 * - Sans clé, quota du fournisseur épuisé ou panne : 503 `tts_unavailable`, le navigateur lit
 *   alors avec la voix de l'appareil (components/coach/useCoachVoice.ts).
 * - Ne débite aucun crédit du Coach.
 */
import { getLocale, getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth/session'
import { jsonError } from '@/lib/data/server/http'
import { rateLimit, userKey } from '@/lib/data/server/rate-limit'
import { COACH_VOICES, SPEECH_MAX_CHARS, isCoachVoice, speechText } from '@/lib/ai/voices'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Modèle rapide et économe (0,5 crédit ElevenLabs par caractère), multilingue (FR / EN / PT).
const MODEL = 'eleven_flash_v2_5'
const MAX_BODY = 20_000

const Body = z.object({
  text: z.string().trim().min(1).max(12_000),
  voice: z.string().refine(isCoachVoice),
}).strict()

export async function POST(req: Request) {
  const t = await getTranslations('ai.errors')
  const user = await getCurrentUser()
  if (!user) return jsonError(401, 'unauthenticated', t('unauthenticated'))

  const key = process.env.ELEVENLABS_API_KEY
  if (!key) return jsonError(503, 'tts_unavailable', t('speechUnavailable'))

  const minute = await rateLimit(userKey('coach-speech', user.id), 10, 60_000)
  if (!minute.ok) return jsonError(429, 'rate_limited', t('speechRateLimited'), { 'Retry-After': String(minute.retryAfter) })
  const day = await rateLimit(userKey('coach-speech-day', user.id), 60, 86_400_000)
  if (!day.ok) return jsonError(429, 'speech_daily_limit', t('speechDailyLimit'), { 'Retry-After': String(day.retryAfter) })

  if (Number(req.headers.get('content-length') ?? '0') > MAX_BODY) return jsonError(413, 'payload_too_large', t('badRequest'))
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError(422, 'invalid_body', t('badRequest'))

  const text = speechText(parsed.data.text).slice(0, SPEECH_MAX_CHARS)
  if (!text) return jsonError(422, 'invalid_body', t('badRequest'))
  const voice = COACH_VOICES.find((v) => v.key === parsed.data.voice)!
  const locale = await getLocale().catch(() => 'fr')

  let upstream: Response
  try {
    upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice.id}?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({
        text,
        model_id: MODEL,
        language_code: ['fr', 'en', 'pt'].includes(locale) ? locale : 'fr',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    return jsonError(503, 'tts_unavailable', t('speechUnavailable'))
  }
  if (!upstream.ok || !upstream.body) {
    // Quota épuisé (401 quota_exceeded / 429), clé invalide, panne : jamais de détail fournisseur au client.
    console.error('[coach-speech] ElevenLabs', upstream.status)
    return jsonError(503, 'tts_unavailable', t('speechUnavailable'))
  }
  return new Response(upstream.body, {
    headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, no-store' },
  })
}
