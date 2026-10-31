import 'server-only'
/**
 * Synthèse vocale ElevenLabs partagée par /api/coach/speech (compte connecté) et
 * /api/assistant/speech (site public, Koraly seule, très bridée). Clé ELEVENLABS_API_KEY côté serveur.
 *
 * Modèle le plus naturel d'ElevenLabs, celui de la vidéo de présentation (multilingue, langue
 * détectée dans le texte) ; 1 crédit ElevenLabs par caractère. Réglages : voix posée, timbre fidèle.
 */
const MODEL = 'eleven_multilingual_v2'
const VOICE_SETTINGS = { stability: 0.45, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true, speed: 1.0 }

/**
 * Flux MP3 (128 kb/s) du texte lu par `voiceId`, ou null si le service est indisponible : clé absente,
 * quota épuisé (401 quota_exceeded / 429), clé invalide, panne. `log` : préfixe du journal serveur
 * (jamais de détail fournisseur renvoyé au client).
 */
export async function elevenLabsSpeech(text: string, voiceId: string, log: string): Promise<ReadableStream<Uint8Array> | null> {
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) return null
  let upstream: Response
  try {
    upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: MODEL, voice_settings: VOICE_SETTINGS }),
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    return null
  }
  if (!upstream.ok || !upstream.body) {
    console.error(`[${log}] ElevenLabs`, upstream.status)
    return null
  }
  return upstream.body
}

export const AUDIO_HEADERS = { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, no-store' } as const
