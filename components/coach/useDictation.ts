'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Dictée du champ de message (Coach et bulle de l'assistant) : reconnaissance vocale du navigateur
// (Web Speech API, SpeechRecognition / webkitSpeechRecognition). Aucun son n'est envoyé à nos
// serveurs : seul le texte reconnu est inséré dans le champ, l'utilisateur relit puis envoie.
// Navigateur sans prise en charge : `supported` faux, le bouton n'est pas affiché.
//
// Le texte n'est écrit dans le champ qu'UNE fois, à la fin de l'écoute ; pendant l'écoute, la phrase
// reconnue est affichée en direct (`interim`). Elle est recalculée à chaque événement depuis TOUS les
// résultats (transcriptFromResults), jamais ajoutée morceau par morceau :
//  - Android (Chrome) renvoie des résultats cumulatifs (« bonjour », puis « bonjour j'espère »…) et
//    rejoue des résultats définitifs : ajouter chaque résultat répétait la phrase des dizaines de fois ;
//  - iPhone (Safari) laisse les résultats « provisoires » (isFinal jamais vrai).
// Téléphones : une phrase à la fois (continuous = false), un nouvel appui pour continuer.

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

function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iP(hone|ad|od)|Android/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/**
 * Texte reconnu à partir de la liste COMPLÈTE des résultats. Un segment qui reprend tout le texte déjà
 * reconnu (résultat cumulatif d'Android) le remplace ; un segment identique au dernier est ignoré ;
 * sinon il s'ajoute (segments successifs de Chrome sur ordinateur). Exporté pour les tests.
 */
export function transcriptFromResults(segments: readonly string[]): string {
  let acc = ''
  let last = ''
  for (const raw of segments) {
    const seg = raw.trim()
    if (!seg) continue
    const n = norm(seg)
    if (n === norm(last)) continue
    if (acc && n.startsWith(norm(acc))) acc = seg
    else if (acc && norm(acc).endsWith(n)) continue
    else acc = acc ? `${acc} ${seg}` : seg
    last = seg
  }
  return acc
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
    r.continuous = !isMobile()
    r.maxAlternatives = 1

    let heard = ''        // texte reconnu de toute l'écoute, recalculé à chaque événement
    let failed: DictationError | null = null

    r.onresult = (e) => {
      const segments: string[] = []
      for (let i = 0; i < e.results.length; i++) segments.push(e.results[i]![0].transcript)
      heard = transcriptFromResults(segments)
      setInterim(heard)
    }
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') failed = 'denied'
      else if (e.error === 'no-speech') failed = 'nothing'
      else if (e.error !== 'aborted') failed = 'other'
    }
    r.onend = () => {
      // Écrit une seule fois, à la fin : jamais de doublon dans le champ.
      if (heard) onTextRef.current(heard)
      rec.current = null
      setInterim('')
      setListening(false)
      setError(heard ? null : failed ?? 'nothing')
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
