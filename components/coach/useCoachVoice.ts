'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_COACH_VOICE, isCoachVoice, speechText, type CoachVoiceKey } from '@/lib/ai/voices'

// Lecture à voix haute des réponses du Coach : voix ElevenLabs (route /api/coach/speech), mise en
// cache par message et par voix pendant la page (une relecture ne coûte rien). Si le service est
// indisponible (quota, panne, démo), la voix de l'appareil (speechSynthesis) prend le relais.
// Assistant public du site : `endpoint` /api/assistant/speech et voix Koraly imposée (`fixedVoice`).

const VOICE_KEY = 'lp-coach-voice'

export type SpeechState = { id: string | null; status: 'idle' | 'loading' | 'playing' }

function readVoice(): CoachVoiceKey {
  try {
    const v = localStorage.getItem(VOICE_KEY)
    return isCoachVoice(v) ? v : DEFAULT_COACH_VOICE
  } catch {
    return DEFAULT_COACH_VOICE
  }
}

export function useCoachVoice(locale: string, opts: { endpoint?: string; fixedVoice?: boolean } = {}) {
  const endpoint = opts.endpoint ?? '/api/coach/speech'
  const fixedVoice = opts.fixedVoice ?? false
  const [voice, setVoiceState] = useState<CoachVoiceKey>(DEFAULT_COACH_VOICE)
  const [state, setState] = useState<SpeechState>({ id: null, status: 'idle' })
  const [fallback, setFallback] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const cache = useRef(new Map<string, string>())
  const ctrl = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!fixedVoice) setVoiceState(readVoice())
  }, [fixedVoice])

  const stop = useCallback(() => {
    ctrl.current?.abort()
    ctrl.current = null
    audioRef.current?.pause()
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
    setState({ id: null, status: 'idle' })
  }, [])

  // Libère l'audio et les URL en quittant la page.
  useEffect(() => {
    const urls = cache.current
    return () => {
      ctrl.current?.abort()
      audioRef.current?.pause()
      if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
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

  const playUrl = useCallback((id: string, url: string) => {
    const audio = audioRef.current ?? new Audio()
    audioRef.current = audio
    audio.onended = () => setState({ id: null, status: 'idle' })
    audio.onerror = () => setState({ id: null, status: 'idle' })
    audio.src = url
    setState({ id, status: 'playing' })
    void audio.play().catch(() => setState({ id: null, status: 'idle' }))
  }, [])

  const speakWithDevice = useCallback((id: string, text: string) => {
    if (typeof speechSynthesis === 'undefined') {
      setState({ id: null, status: 'idle' })
      return
    }
    setFallback(true)
    const u = new SpeechSynthesisUtterance(speechText(text))
    u.lang = locale === 'en' ? 'en-US' : locale === 'pt' ? 'pt-BR' : 'fr-FR'
    u.onend = () => setState({ id: null, status: 'idle' })
    u.onerror = () => setState({ id: null, status: 'idle' })
    speechSynthesis.cancel()
    setState({ id, status: 'playing' })
    speechSynthesis.speak(u)
  }, [locale])

  /** Lance la lecture du message, ou l'arrête s'il est déjà en cours. */
  const toggle = useCallback(async (id: string, text: string) => {
    if (state.id === id) return stop()
    stop()
    const cacheKey = `${voice}:${id}`
    const cached = cache.current.get(cacheKey)
    if (cached) return playUrl(id, cached)
    const c = new AbortController()
    ctrl.current = c
    setState({ id, status: 'loading' })
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fixedVoice ? { text } : { text, voice }),
        signal: c.signal,
      })
      if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('audio/')) throw new Error(String(res.status))
      const url = URL.createObjectURL(await res.blob())
      cache.current.set(cacheKey, url)
      if (ctrl.current === c) playUrl(id, url)
    } catch {
      if (c.signal.aborted) return
      speakWithDevice(id, text)
    } finally {
      if (ctrl.current === c) ctrl.current = null
    }
  }, [endpoint, fixedVoice, playUrl, speakWithDevice, state.id, stop, voice])

  return { voice, setVoice, state, toggle, stop, fallback }
}
