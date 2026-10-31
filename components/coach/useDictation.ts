'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Dictée du champ de message (Coach et bulle de l'assistant) : reconnaissance vocale du navigateur
// (Web Speech API, SpeechRecognition / webkitSpeechRecognition). Aucun son n'est envoyé à nos
// serveurs : seul le texte reconnu est inséré dans le champ, l'utilisateur relit puis envoie.
// Navigateur sans prise en charge : `supported` faux, le bouton n'est pas affiché.

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } }
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> }
type Recognition = {
  lang: string
  interimResults: boolean
  continuous: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: RecognitionEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}
type RecognitionCtor = new () => Recognition

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const LANG: Record<string, string> = { fr: 'fr-FR', en: 'en-US', pt: 'pt-BR' }

export function useDictation(locale: string, onText: (text: string) => void) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState(false)
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
    r.interimResults = false
    r.continuous = true
    r.onresult = (e) => {
      let text = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]!
        if (res.isFinal) text += res[0].transcript
      }
      if (text.trim()) onTextRef.current(text.trim())
    }
    r.onerror = (e) => {
      if (e.error !== 'aborted' && e.error !== 'no-speech') setError(true)
    }
    r.onend = () => {
      rec.current = null
      setListening(false)
    }
    setError(false)
    try {
      r.start()
      rec.current = r
      setListening(true)
    } catch {
      setError(true)
    }
  }, [locale])

  const stop = useCallback(() => rec.current?.stop(), [])

  return { supported, listening, error, toggle, stop }
}

/** Ajoute le texte dicté à la saisie en cours (espace de séparation si besoin). */
export function appendDictation(current: string, text: string): string {
  return current.trim() ? `${current.replace(/\s+$/, '')} ${text}` : text
}
