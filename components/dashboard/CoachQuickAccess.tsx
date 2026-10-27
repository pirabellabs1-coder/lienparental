'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { ArrowRight, Camera, Mic, Paperclip, Sparkles } from 'lucide-react'
import { RobotMascot } from '@/components/coach/RobotMascot'
import {
  DOC_ACCEPT,
  IMAGE_ACCEPT,
  draftFromFile,
  fileErrorCode,
  saveDraft,
  setPendingFile,
} from '@/components/coach/session'
import { cn } from '@/lib/cn'

// Typage minimal de la Web Speech API (non incluse dans lib.dom).
type Recognition = {
  lang: string
  interimResults: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}
type RecognitionCtor = new () => Recognition

function getRecognition(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

// M03 — Accès rapide au Coach parental IA.
export function CoachQuickAccess() {
  const t = useTranslations('dash')
  const tc = useTranslations('coach.common')
  const locale = useLocale()
  const router = useRouter()
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [listening, setListening] = useState(false)
  const [canDictate, setCanDictate] = useState(false)
  const recRef = useRef<Recognition | null>(null)
  const photoRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const errorId = useId()

  useEffect(() => {
    setCanDictate(getRecognition() !== null)
    return () => recRef.current?.stop()
  }, [])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const q = value.trim()
    if (!q) return
    // Réponse du Coach sur la base de connaissances du parent (chat en streaming).
    router.push(`/app/coach/discussion?q=${encodeURIComponent(q.slice(0, 2000))}`)
  }

  const onFile = (file: File | undefined, kind: 'image' | 'doc') => {
    if (!file) return
    const code = fileErrorCode(file, kind)
    if (code) return setError(tc(`fileErrors.${code}`))
    setError('')
    setPendingFile(file)
    saveDraft(draftFromFile(file))
    router.push('/app/coach/document')
  }

  const toggleDictation = () => {
    if (listening) {
      recRef.current?.stop()
      return
    }
    const Ctor = getRecognition()
    if (!Ctor) return
    const rec = new Ctor()
    rec.lang = locale === 'en' ? 'en-US' : locale === 'pt' ? 'pt-BR' : 'fr-FR'
    rec.interimResults = false
    rec.onresult = (e) => {
      const t = e.results[0]?.[0]?.transcript ?? ''
      if (t) setValue((v) => (v ? `${v} ${t}` : t))
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recRef.current = rec
    setListening(true)
    rec.start()
  }

  const iconBtn =
    'grid h-11 w-11 place-items-center rounded-full text-night-900 transition hover:bg-iris-50 active:scale-95 disabled:opacity-40'

  return (
    <section aria-labelledby="coach-title" className="relative rounded-xl3 bg-iris-50 p-4 pt-5">
      <div className="pr-[110px]">
        <h2 id="coach-title" className="flex items-center gap-1.5 text-[19px] font-bold text-night-900">
          {t('coachTitle')}
          <Sparkles className="h-[18px] w-[18px] text-night-900" strokeWidth={1.8} aria-hidden="true" />
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-night-800">
          {t('coachLead')}
        </p>
      </div>

      <div className="pointer-events-none absolute right-3 top-1">
        <RobotMascot size={100} bubble />
      </div>

      <form onSubmit={submit} className="relative mt-4 rounded-xl2 bg-white px-3.5 pb-2.5 pt-3 shadow-soft">
        <label htmlFor={inputId} className="sr-only">
          {t('coachInputLabel')}
        </label>
        <input
          id={inputId}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={2000}
          placeholder={t('coachPlaceholder')}
          autoComplete="off"
          aria-describedby={error ? errorId : undefined}
          className="h-9 w-full border-0 bg-transparent p-0 text-[14px] text-night-900 placeholder:text-night-400 focus:outline-none focus:ring-0"
        />
        <div className="mt-1.5 flex items-center justify-between border-t border-night-50 pt-1.5">
          <div className="-ml-2.5 flex items-center">
            <button type="button" onClick={() => photoRef.current?.click()} aria-label={t('coachAddPhoto')} className={iconBtn}>
              <Camera className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} aria-label={t('coachAttach')} className={iconBtn}>
              <Paperclip className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={toggleDictation}
              disabled={!canDictate}
              aria-pressed={listening}
              aria-label={canDictate ? (listening ? t('coachStopDictation') : t('coachDictate')) : t('coachDictateUnavailable')}
              className={cn(iconBtn, listening && 'bg-leaf-50 text-leaf-600')}
            >
              <Mic className={cn('h-5 w-5', listening && 'motion-safe:animate-pulse')} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>
          <button
            type="submit"
            disabled={!value.trim()}
            aria-label={t('coachSend')}
            className="grid h-11 w-11 place-items-center rounded-full bg-leaf-500 text-white shadow-[0_6px_14px_-6px_rgba(46,125,50,0.7)] transition hover:bg-leaf-600 active:scale-95 disabled:bg-leaf-500/60"
          >
            <ArrowRight className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>

        <input
          ref={photoRef}
          type="file"
          accept={IMAGE_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            onFile(e.target.files?.[0], 'image')
            e.target.value = ''
          }}
        />
        <input
          ref={fileRef}
          type="file"
          accept={DOC_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            onFile(e.target.files?.[0], 'doc')
            e.target.value = ''
          }}
        />
      </form>
      {error && (
        <p id={errorId} role="alert" className="mt-2 text-[12px] font-medium text-alert-600">
          {error}
        </p>
      )}
    </section>
  )
}
