'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, Pause, Play } from 'lucide-react'
import { cn } from '@/lib/cn'
import { durationLabel } from '@/lib/messages'
import { needsFallback, toPlayableWav } from './audioFallback'

type Props = {
  /** URL lisible (blob: ou signée) ; undefined = en cours d'obtention, null = indisponible. */
  src: string | null | undefined
  /** Format du fichier : un format que l'appareil ne lit pas (WebM sur iPhone) est converti d'avance. */
  mime?: string
  durationMs: number
  /** Nom accessible : « Note vocale de Thomas, 0:14 ». */
  label: string
  /** Graine des barres décoratives (id du message). */
  seed: string
  tone?: 'mine' | 'theirs' | 'neutral'
  className?: string
}

const PLAY_EVENT = 'lp:audio-play'
const BARS = 28

/** Hauteurs déterministes (décor) : même message, même silhouette. */
function bars(seed: string): number[] {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return Array.from({ length: BARS }, (_, i) => {
    h = Math.imul(h ^ (i + 1), 2654435761)
    const r = ((h >>> 0) % 1000) / 1000
    const env = 0.55 + 0.45 * Math.sin((i / BARS) * Math.PI)
    return Math.max(0.18, Math.min(1, (0.35 + r * 0.65) * env))
  })
}

/**
 * Lecteur de note vocale : lecture / pause, barre de progression manipulable
 * au clavier (curseur natif), durée. Un seul lecteur joue à la fois.
 * Format refusé par le lecteur natif (notes WebM sur iPhone) : conversion en WAV dans le navigateur
 * (audioFallback.ts), lancée dès l'affichage pour que l'appui sur « lecture » démarre aussitôt
 * (Safari refuse un play() lancé après une attente).
 */
export function AudioPlayer({ src, mime, durationMs, label, seed, tone = 'neutral', className }: Props) {
  const t = useTranslations('messaging.audio')
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [failed, setFailed] = useState(false)
  // Version WAV convertie (repli) et conversion en cours.
  const [fallback, setFallback] = useState<string | null>(null)
  const [converting, setConverting] = useState(false)
  const triedFallback = useRef(false)
  const playSrc = fallback ?? src
  const uid = useId()
  const heights = useMemo(() => bars(seed), [seed])
  const total = Math.max(0.5, durationMs / 1000)
  const progress = Math.min(1, current / total)

  // Un seul lecteur actif dans la page.
  useEffect(() => {
    const onOther = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== uid) audioRef.current?.pause()
    }
    window.addEventListener(PLAY_EVENT, onOther)
    return () => window.removeEventListener(PLAY_EVENT, onOther)
  }, [uid])

  const convert = useCallback(() => {
    if (!src || triedFallback.current) return setFailed(true)
    triedFallback.current = true
    setConverting(true)
    void toPlayableWav(src).then((url) => {
      if (url) setFallback(url)
      else setFailed(true)
      setConverting(false)
    })
  }, [src])

  useEffect(() => {
    setPlaying(false)
    setCurrent(0)
    setFailed(false)
    setFallback(null)
    triedFallback.current = false
    if (src && needsFallback(mime)) convert()
  }, [src, mime, convert])

  // URL convertie libérée au changement de fichier et au démontage.
  useEffect(() => () => { if (fallback) URL.revokeObjectURL(fallback) }, [fallback])

  const toggle = async () => {
    const a = audioRef.current
    if (!a || !playSrc || converting) return
    if (!a.paused) { a.pause(); return }
    window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: uid }))
    try {
      if (current >= total - 0.05) a.currentTime = 0
      await a.play()
    } catch (err) {
      // Format refusé : conversion, puis nouvel appui (l'attente sortirait du geste sur iPhone).
      if ((err as { name?: string } | null)?.name === 'NotSupportedError' && !fallback) convert()
      else if ((err as { name?: string } | null)?.name !== 'NotAllowedError') setFailed(true)
    }
  }

  const seek = (v: number) => {
    const a = audioRef.current
    setCurrent(v)
    if (a && Number.isFinite(v)) {
      try { a.currentTime = v } catch { /* métadonnées non chargées */ }
    }
  }

  const unavailable = src === null || failed
  const loading = src === undefined || converting
  const fill = tone === 'mine' ? 'bg-leaf-600' : 'bg-night-700'
  const rest = tone === 'mine' ? 'bg-leaf-200' : 'bg-night-200'

  return (
    <div className={cn('flex min-w-[220px] items-center gap-2.5', className)}>
      {playSrc ? (
        <audio
          ref={audioRef}
          src={playSrc}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); setCurrent(total) }}
          onTimeUpdate={(e) => setCurrent(Math.min(total, e.currentTarget.currentTime))}
          onError={() => (fallback ? setFailed(true) : convert())}
          className="hidden"
        />
      ) : null}

      <button
        type="button"
        onClick={() => void toggle()}
        disabled={!playSrc || failed || converting}
        aria-busy={converting || undefined}
        aria-label={playing ? t('pause', { label }) : t('play', { label })}
        className={cn(
          'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white transition disabled:cursor-not-allowed disabled:opacity-50',
          tone === 'mine' ? 'bg-leaf-500 hover:bg-leaf-600' : 'bg-night-800 hover:bg-night-900',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400 focus-visible:ring-offset-2',
        )}
      >
        {loading ? (
          <Loader2 className="h-5 w-5 motion-safe:animate-spin" aria-hidden="true" />
        ) : playing ? (
          <Pause className="h-5 w-5" aria-hidden="true" fill="currentColor" />
        ) : (
          <Play className="ml-0.5 h-5 w-5" aria-hidden="true" fill="currentColor" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className="relative h-8 rounded-md has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-leaf-400 has-[:focus-visible]:ring-offset-2">
          <div aria-hidden="true" className="absolute inset-0 flex items-center gap-[3px]">
            {heights.map((h, i) => (
              <span
                key={i}
                className={cn('block flex-1 rounded-full', (i + 0.5) / BARS <= progress ? fill : rest)}
                style={{ height: `${Math.round(h * 100)}%` }}
              />
            ))}
          </div>
          <label htmlFor={`${uid}-seek`} className="sr-only">{t('seek')}</label>
          <input
            id={`${uid}-seek`}
            type="range"
            min={0}
            max={total}
            step={0.1}
            value={Math.min(current, total)}
            onChange={(e) => seek(Number(e.target.value))}
            disabled={!playSrc || failed || converting}
            aria-valuetext={t('valueText', { current: durationLabel(current * 1000), total: durationLabel(durationMs) })}
            className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0 disabled:cursor-not-allowed"
          />
        </div>
        <p className="mt-0.5 flex justify-between text-[11px] tabular-nums text-night-600">
          <span>{playing || current > 0 ? durationLabel(current * 1000) : t('voiceNote')}</span>
          <span>{unavailable ? t(failed && triedFallback.current ? 'unsupported' : 'unavailable') : converting ? t('converting') : durationLabel(durationMs)}</span>
        </p>
      </div>
    </div>
  )
}
