'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { MAX_VOICE_MS, MIN_VOICE_MS, baseMime } from '@/lib/messages'

export type VoicePhase = 'idle' | 'requesting' | 'recording' | 'preview'
export type VoiceClip = { blob: Blob; url: string; durationMs: number; mime: string }

export const VOICE_BARS = 32

/** Format pris en charge par le navigateur (Chrome/Firefox : webm/ogg, Safari : mp4). */
function pickMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return undefined
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/aac'].find((m) => MediaRecorder.isTypeSupported(m))
}

export function voiceSupported(): boolean {
  return typeof window !== 'undefined'
    && typeof MediaRecorder !== 'undefined'
    && Boolean(navigator.mediaDevices?.getUserMedia)
}

/** Clés de messaging.voice (traduites au rendu). */
type VoiceErrorKey = 'unsupported' | 'denied' | 'notFound' | 'busy' | 'failed' | 'tooShort'

function micError(err: unknown): VoiceErrorKey {
  const name = (err as { name?: string } | null)?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'notFound'
  if (name === 'NotReadableError') return 'busy'
  return 'failed'
}

/**
 * Enregistrement d'une note vocale (MediaRecorder) : niveau sonore en direct,
 * arrêt automatique à 3 minutes, réécoute avant envoi, annulation.
 * Tout reste en mémoire jusqu'à l'envoi ; micro et AudioContext sont libérés
 * dès l'arrêt et au démontage.
 */
export function useVoiceRecorder(opts: { maxMs?: number; onAutoStop?: () => void } = {}) {
  const maxMs = opts.maxMs ?? MAX_VOICE_MS
  const [phase, setPhase] = useState<VoicePhase>('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [levels, setLevels] = useState<number[]>(() => Array(VOICE_BARS).fill(0))
  const [clip, setClip] = useState<VoiceClip | null>(null)
  const tv = useTranslations('messaging.voice')
  const [error, setError] = useState<VoiceErrorKey | null>(null)

  const recRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number | null>(null)
  const startedRef = useRef(0)
  const cancelledRef = useRef(false)
  const stopAskedRef = useRef(false)
  const clipRef = useRef<VoiceClip | null>(null)
  const autoStopRef = useRef(opts.onAutoStop)
  autoStopRef.current = opts.onAutoStop

  const releaseInputs = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    void ctxRef.current?.close().catch(() => {})
    ctxRef.current = null
  }, [])

  const setClipSafe = useCallback((c: VoiceClip | null) => {
    if (clipRef.current && clipRef.current !== c) URL.revokeObjectURL(clipRef.current.url)
    clipRef.current = c
    setClip(c)
  }, [])

  // Démontage : micro coupé, URL libérée.
  useEffect(() => () => {
    cancelledRef.current = true
    try { if (recRef.current?.state === 'recording') recRef.current.stop() } catch { /* déjà arrêté */ }
    releaseInputs()
    if (clipRef.current) URL.revokeObjectURL(clipRef.current.url)
  }, [releaseInputs])

  const stop = useCallback(() => {
    const rec = recRef.current
    if (rec && rec.state === 'recording') rec.stop()
    else stopAskedRef.current = true
  }, [])

  const start = useCallback(async () => {
    if (phase === 'recording' || phase === 'requesting') return
    setError(null)
    if (!voiceSupported()) {
      setError('unsupported')
      return
    }
    setClipSafe(null)
    cancelledRef.current = false
    stopAskedRef.current = false
    // Heure de la note précédente effacée : sinon un appui bref sur le micro (relâché pendant la
    // demande d'accès) était pris pour un maintien terminé et arrêtait aussitôt l'enregistrement.
    startedRef.current = 0
    setPhase('requesting')

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    } catch (err) {
      setError(micError(err))
      setPhase('idle')
      return
    }
    if (cancelledRef.current) {
      stream.getTracks().forEach((t) => t.stop())
      setPhase('idle')
      return
    }
    streamRef.current = stream

    const mime = pickMime()
    let rec: MediaRecorder
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32_000 } : undefined)
    } catch {
      releaseInputs()
      setError('failed')
      setPhase('idle')
      return
    }
    recRef.current = rec
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
    rec.onstop = () => {
      const durationMs = Math.min(maxMs, Math.round(performance.now() - startedRef.current))
      releaseInputs()
      recRef.current = null
      if (cancelledRef.current) { setPhase('idle'); return }
      if (durationMs < MIN_VOICE_MS || chunks.length === 0) {
        setError('tooShort')
        setPhase('idle')
        return
      }
      const type = baseMime(rec.mimeType || mime || 'audio/webm')
      const blob = new Blob(chunks, { type })
      setClipSafe({ blob, url: URL.createObjectURL(blob), durationMs, mime: type })
      setPhase('preview')
    }

    // Niveau sonore (visualisation) : AnalyserNode, sans enregistrement supplémentaire.
    let analyser: AnalyserNode | null = null
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (Ctx) {
        const ctx = new Ctx()
        ctxRef.current = ctx
        // iPhone : contexte créé après l'attente du micro, donc « suspendu » (barres de niveau à plat).
        if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
        analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        ctx.createMediaStreamSource(stream).connect(analyser)
      }
    } catch { analyser = null }

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const frameMs = reduce ? 250 : 80
    const data = new Uint8Array(512)
    let lastPush = 0
    const tick = () => {
      const t = performance.now() - startedRef.current
      if (t - lastPush >= frameMs) {
        lastPush = t
        setElapsedMs(Math.min(t, maxMs))
        let level = 0
        if (analyser) {
          analyser.getByteTimeDomainData(data)
          let sum = 0
          for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v }
          level = Math.min(1, Math.sqrt(sum / data.length) * 4)
        }
        setLevels((l) => [...l.slice(1), level])
      }
      if (t >= maxMs) {
        if (rec.state === 'recording') rec.stop()
        autoStopRef.current?.()
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    rec.start(250)
    startedRef.current = performance.now()
    setElapsedMs(0)
    setLevels(Array(VOICE_BARS).fill(0))
    setPhase('recording')
    rafRef.current = requestAnimationFrame(tick)
    if (stopAskedRef.current) rec.stop()
  }, [phase, maxMs, releaseInputs, setClipSafe])

  /** Annule l'enregistrement en cours ou supprime la note en réécoute. */
  const cancel = useCallback(() => {
    cancelledRef.current = true
    const rec = recRef.current
    if (rec && rec.state === 'recording') rec.stop()
    else releaseInputs()
    setClipSafe(null)
    setError(null)
    setPhase('idle')
  }, [releaseInputs, setClipSafe])

  /** Après envoi : libère la note sans message d'erreur. */
  const reset = useCallback(() => {
    setClipSafe(null)
    setPhase('idle')
    setElapsedMs(0)
  }, [setClipSafe])

  return {
    phase, elapsedMs, levels, clip, error: error ? tv(error) : null, start, stop, cancel, reset,
    startedAt: () => startedRef.current,
    clearError: () => setError(null),
  }
}
