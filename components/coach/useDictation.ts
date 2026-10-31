'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Dictée du champ de message (Coach et bulle de l'assistant) : reconnaissance vocale du navigateur
// (Web Speech API, SpeechRecognition / webkitSpeechRecognition). Aucun son n'est envoyé à nos
// serveurs : seul le texte reconnu est inséré dans le champ, l'utilisateur relit puis envoie.
// Navigateur sans prise en charge : `supported` faux, le bouton n'est pas affiché.
//
// iPhone (Safari / WebKit) : l'écoute continue y livre des résultats restés « provisoires »
// (isFinal jamais vrai) ; ne garder que les résultats définitifs n'écrivait donc rien. On écoute
// une phrase à la fois, on affiche le texte provisoire en direct et on l'écrit à la fin de l'écoute.

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } }
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> }
type Recognition = {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: RecognitionEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}
type RecognitionCtor = new () => Recognition

/** Cause d'un échec, pour un message utile : micro refusé, rien entendu, autre. */
export type DictationError = 'denied' | 'nothing' | 'other'

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

function isAppleMobile(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

const LANG: Record<string, string> = { fr: 'fr-FR', en: 'en-US', pt: 'pt-BR' }

export function useDictation(locale: string, onText: (text: string) => void) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<DictationError | null>(null)
  /** Texte reconnu en cours, pas encore écrit dans le champ (affiché en direct). */
  const [interim, setInterim] = useState('')
  const rec = useRef<Recognition | null>(null)
  const onTextRef = useRef(onText)

  useEffect(() => {
    onTextRef.current = onText
  }, [onText])

  useEffect(() => {
    setSupported(Boolean(recognitionCtor()))
    return () => rec.current?.abort()
  }, [])

  /** Démarre l'écoute, ou l'arrête si elle est en cours. */
  const toggle = useCallback(() => {
    if (rec.current) {
      rec.current.stop()
      return
    }
    const Ctor = recognitionCtor()
    if (!Ctor) return
    const r = new Ctor()
    r.lang = LANG[locale] ?? 'fr-FR'
    r.interimResults = true
    r.continuous = !isAppleMobile()
    r.maxAlternatives = 1

    let pending = ''      // texte provisoire de la phrase en cours
    let wrote = false     // au moins un texte écrit dans le champ
    let failed: DictationError | null = null

    r.onresult = (e) => {
      let finals = ''
      pending = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]!
        if (res.isFinal) finals += res[0].transcript
        else pending += res[0].transcript
      }
      if (finals.trim()) {
        onTextRef.current(finals.trim())
        wrote = true
      }
      setInterim(pending.trim())
    }
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') failed = 'denied'
      else if (e.error === 'no-speech') failed = 'nothing'
      else if (e.error !== 'aborted') failed = 'other'
    }
    r.onend = () => {
      // Phrase restée provisoire (cas de l'iPhone) : écrite telle quelle à la fin de l'écoute.
      if (pending.trim()) {
        onTextRef.current(pending.trim())
        wrote = true
      }
      rec.current = null
      setInterim('')
      setListening(false)
      setError(failed ?? (wrote ? null : 'nothing'))
    }
    setError(null)
    setInterim('')
    try {
      r.start()
      rec.current = r
      setListening(true)
    } catch {
      setError('other')
    }
  }, [locale])

  const stop = useCallback(() => rec.current?.stop(), [])

  return { supported, listening, error, interim, toggle, stop }
}

/** Ajoute le texte dicté à la saisie en cours (espace de séparation si besoin). */
export function appendDictation(current: string, text: string): string {
  return current.trim() ? `${current.replace(/\s+$/, '')} ${text}` : text
}
