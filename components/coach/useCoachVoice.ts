'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_COACH_VOICE, isCoachVoice, type CoachVoiceKey } from '@/lib/ai/voices'

// Lecture à voix haute des réponses du Coach : voix ElevenLabs uniquement (route /api/coach/speech),
// jamais de voix de synthèse de l'appareil (jugée trop robotique).
//  - Déverrouillage pendant le geste : au clic, l'élément Audio joue un court silence AVANT le fetch
//    (Safari iOS refuse sinon un play() lancé après une attente réseau).
//  - Lecture en flux : la réponse MP3 est poussée dans une MediaSource au fil de l'eau (premier son
//    dès les premiers octets) ; sans MediaSource pour l'audio (iPhone), lecture du fichier complet.
//    Le texte reste dans le corps d'un POST : jamais dans une URL (journaux, données personnelles).
//  - Cache par message et par voix pendant la page (une relecture ne coûte rien).
//  - Échec : une nouvelle tentative automatique, puis `error` (message court, bouton rétabli).
// Assistant public du site : `endpoint` /api/assistant/speech et voix Koraly imposée (`fixedVoice`) ;
// limite atteinte (429 speech_limit) → `error.kind === 'limit'`.

const VOICE_KEY = 'lp-coach-voice'
/** WAV de 0,01 s de silence : sert à déverrouiller l'audio pendant le geste de l'utilisateur. */
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='

export type SpeechState = { id: string | null; status: 'idle' | 'loading' | 'playing' }
export type SpeechError = { id: string; kind: 'unavailable' | 'limit' }

class LimitError extends Error {}

function readVoice(): CoachVoiceKey {
  try {
    const v = localStorage.getItem(VOICE_KEY)
    return isCoachVoice(v) ? v : DEFAULT_COACH_VOICE
  } catch {
    return DEFAULT_COACH_VOICE
  }
}

const canStream = () => typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported('audio/mpeg')

export function useCoachVoice(opts: { endpoint?: string; fixedVoice?: boolean } = {}) {
  const endpoint = opts.endpoint ?? '/api/coach/speech'
  const fixedVoice = opts.fixedVoice ?? false
  const [voice, setVoiceState] = useState<CoachVoiceKey>(DEFAULT_COACH_VOICE)
  const [state, setState] = useState<SpeechState>({ id: null, status: 'idle' })
  const [error, setError] = useState<SpeechError | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const cache = useRef(new Map<string, string>())
  const ctrl = useRef<AbortController | null>(null)
  const streamUrl = useRef<string | null>(null)

  useEffect(() => {
    if (!fixedVoice) setVoiceState(readVoice())
  }, [fixedVoice])

  const releaseStream = () => {
    if (streamUrl.current) URL.revokeObjectURL(streamUrl.current)
    streamUrl.current = null
  }

  const stop = useCallback(() => {
    ctrl.current?.abort()
    ctrl.current = null
    audioRef.current?.pause()
    setState({ id: null, status: 'idle' })
  }, [])

  // Libère l'audio et les URL en quittant la page.
  useEffect(() => {
    const urls = cache.current
    return () => {
      ctrl.current?.abort()
      audioRef.current?.pause()
      releaseStream()
      urls.forEach((u) => URL.revokeObjectURL(u))
      urls.clear()
    }
  }, [])

  const setVoice = useCallback((v: CoachVoiceKey) => {
    stop()
    setVoiceState(v)
    try {
      localStorage.setItem(VOICE_KEY, v)
    } catch {
      // navigation privée : le choix vaut pour la page
    }
  }, [stop])

  /** Élément Audio unique, déverrouillé pendant le geste (silence joué puis mis en pause). */
  const unlockAudio = useCallback((): HTMLAudioElement => {
    const audio = audioRef.current ?? new Audio()
    audioRef.current = audio
    try {
      audio.src = SILENCE
      const p = audio.play()
      // Pause seulement si la vraie lecture n'a pas déjà pris la place du silence.
      if (p) p.then(() => { if (audio.src === SILENCE) audio.pause() }).catch(() => undefined)
    } catch {
      // déverrouillage impossible : la lecture sera tentée quand même
    }
    return audio
  }, [])

  /** Une tentative : POST, puis lecture en flux (MediaSource) ou du fichier complet. Renvoie l'URL à mettre en cache. */
  const attempt = useCallback(async (id: string, text: string, audio: HTMLAudioElement, signal: AbortSignal): Promise<string> => {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fixedVoice ? { text } : { text, voice }),
      signal,
    })
    if (res.status === 429) {
      const body = (await res.json().catch(() => null)) as { error?: { code?: string } } | null
      if (body?.error?.code === 'speech_limit') throw new LimitError()
    }
    if (!res.ok || !res.body || !(res.headers.get('content-type') ?? '').startsWith('audio/')) throw new Error(String(res.status))

    const onEnd = () => setState((s) => (s.id === id ? { id: null, status: 'idle' } : s))
    audio.onended = onEnd
    audio.onerror = onEnd

    if (!canStream()) {
      const url = URL.createObjectURL(await res.blob())
      if (signal.aborted) throw new DOMException('aborted', 'AbortError')
      audio.src = url
      await audio.play()
      setState({ id, status: 'playing' })
      return url
    }

    releaseStream()
    const ms = new MediaSource()
    streamUrl.current = URL.createObjectURL(ms)
    audio.src = streamUrl.current
    await new Promise<void>((resolve) => ms.addEventListener('sourceopen', () => resolve(), { once: true }))
    const sb = ms.addSourceBuffer('audio/mpeg')
    const idle = () => (sb.updating ? new Promise<void>((r) => sb.addEventListener('updateend', () => r(), { once: true })) : Promise.resolve())
    const reader = res.body.getReader()
    const chunks: BlobPart[] = []
    let started = false
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      if (signal.aborted) throw new DOMException('aborted', 'AbortError')
      chunks.push(value)
      await idle()
      sb.appendBuffer(value)
      await idle()
      if (!started) {
        started = true
        await audio.play()
        setState({ id, status: 'playing' })
      }
    }
    await idle()
    if (ms.readyState === 'open') ms.endOfStream()
    if (!started) throw new Error('empty')
    // Fichier complet gardé pour une relecture instantanée.
    return URL.createObjectURL(new Blob(chunks, { type: 'audio/mpeg' }))
  }, [endpoint, fixedVoice, voice])

  /** Lance la lecture du message, ou l'arrête si elle est en cours. */
  const toggle = useCallback(async (id: string, text: string) => {
    if (state.id === id) return stop()
    stop()
    setError(null)
    const audio = unlockAudio()
    const cacheKey = `${voice}:${id}`
    const cached = cache.current.get(cacheKey)
    if (cached) {
      audio.onended = () => setState({ id: null, status: 'idle' })
      audio.src = cached
      setState({ id, status: 'playing' })
      void audio.play().catch(() => {
        setState({ id: null, status: 'idle' })
        setError({ id, kind: 'unavailable' })
      })
      return
    }
    const c = new AbortController()
    ctrl.current = c
    setState({ id, status: 'loading' })
    for (let tries = 0; tries < 2; tries++) {
      try {
        const url = await attempt(id, text, audio, c.signal)
        cache.current.set(cacheKey, url)
        if (ctrl.current === c) ctrl.current = null
        return
      } catch (e) {
        if (c.signal.aborted) return
        if (e instanceof LimitError) {
          setError({ id, kind: 'limit' })
          break
        }
        if (tries === 1) setError({ id, kind: 'unavailable' })
      }
    }
    if (ctrl.current === c) ctrl.current = null
    audio.pause()
    setState({ id: null, status: 'idle' })
  }, [attempt, state.id, stop, unlockAudio, voice])

  return { voice, setVoice, state, toggle, stop, error }
}
