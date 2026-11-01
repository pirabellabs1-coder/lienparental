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
// Téléphones : une phrase à la fois (continuous = false). Le navigateur coupe l'écoute à la première
// pause (une dizaine de secondes) : on la relance aussitôt, jusqu'à l'appui sur le micro, deux écoutes
// de suite sans parole ou MAX_LISTEN_MS. Le texte de toutes les écoutes est écrit en une fois à la fin.

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

/** Durée maximale d'une dictée (relances comprises). */
const MAX_LISTEN_MS = 3 * 60_000
/** Écoutes consécutives sans aucune parole avant d'arrêter (silence prolongé). */
const MAX_SILENT_RUNS = 2

// Pas de lookbehind dans ces expressions : non pris en charge par Safari avant iOS 16.4 (le module
// entier ne se chargerait pas).
const BRAND_VARIANTS = /(^|[^\p{L}])((?:le|du|au|un|ce|the|o|do)\s+)?(liens?|lyon|l[ée]on|lean|lian(?:n?e)?|lient|l['’]\s?hymne|l['’]\s?ien)\s+parent(?:al|ale|aux|als)(?![\p{L}])/giu
const BRAND_DROPPED_FR_PT = /(^|[^\p{L}])(sur|à|avec|via|dans|chez|pour|em|no|na|com|pelo)\s+parental(?![\p{L}])/giu
const BRAND_DROPPED_EN = /(^|[^\p{L}])(on|with|at|to|from|joined|use|using)\s+parental(?=\s*(?:$|[.,;:!?]|app\b))/giu

/**
 * Nom de la marque, souvent déformé par la reconnaissance vocale : « Lyon parental », « l'hymne
 * parental », ou « lien » avalé (« je me suis inscrit sur parental »). « le lien parental » (la notion
 * juridique) est laissé tel quel. Exporté pour les tests.
 */
export function fixBrandNames(text: string, locale: string): string {
  let out = text.replace(BRAND_VARIANTS, (all, pre: string, article: string | undefined, word: string) =>
    article && /^liens?$/i.test(word) ? all : `${pre}${article ?? ''}Lien Parental`)
  out = out.replace(locale === 'en' ? BRAND_DROPPED_EN : BRAND_DROPPED_FR_PT, (_all, pre: string, prep: string) => `${pre}${prep} Lien Parental`)
  return out
}

export function useDictation(locale: string, onText: (text: string) => void) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<DictationError | null>(null)
  /** Texte reconnu en cours, pas encore écrit dans le champ (affiché en direct). */
  const [interim, setInterim] = useState('')
  const rec = useRef<Recognition | null>(null)
  /** Faux dès que l'utilisateur arrête : plus de relance. */
  const wanted = useRef(false)
  const onTextRef = useRef(onText)

  useEffect(() => {
    onTextRef.current = onText
  }, [onText])

  useEffect(() => {
    setSupported(Boolean(recognitionCtor()))
    return () => {
      wanted.current = false
      rec.current?.abort()
    }
  }, [])

  /** Démarre l'écoute, ou l'arrête si elle est en cours. */
  const toggle = useCallback(() => {
    if (rec.current) {
      wanted.current = false
      rec.current.stop()
      return
    }
    const Ctor = recognitionCtor()
    if (!Ctor) return

    const startedAt = Date.now()
    let done = ''         // texte des écoutes terminées
    let silentRuns = 0
    const join = (heard: string) => fixBrandNames([done, heard].filter(Boolean).join(' '), locale)

    const finish = (failed: DictationError | null) => {
      wanted.current = false
      rec.current = null
      const text = join('')
      // Écrit une seule fois, à la fin : jamais de doublon dans le champ.
      if (text) onTextRef.current(text)
      setInterim('')
      setListening(false)
      setError(text ? null : failed ?? 'nothing')
    }

    const listen = (): boolean => {
      const r = new Ctor()
      r.lang = LANG[locale] ?? 'fr-FR'
      r.interimResults = true
      r.continuous = !isMobile()
      r.maxAlternatives = 1

      let heard = ''        // texte de cette écoute, recalculé à chaque événement
      let failed: DictationError | null = null

      r.onresult = (e) => {
        const segments: string[] = []
        for (let i = 0; i < e.results.length; i++) segments.push(e.results[i]![0].transcript)
        heard = transcriptFromResults(segments)
        setInterim(join(heard))
      }
      r.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') failed = 'denied'
        else if (e.error === 'no-speech') failed = 'nothing'
        else if (e.error !== 'aborted') failed = 'other'
      }
      r.onend = () => {
        if (heard) {
          done = [done, heard].join(' ').trim()
          silentRuns = 0
        } else silentRuns++
        const again = wanted.current && failed !== 'denied' && failed !== 'other'
          && silentRuns < MAX_SILENT_RUNS && Date.now() - startedAt < MAX_LISTEN_MS
        // Coupure du navigateur à la première pause : on reprend l'écoute sans nouvel appui.
        if (!(again && listen())) finish(failed)
      }
      try {
        r.start()
        rec.current = r
        return true
      } catch {
        return false
      }
    }

    wanted.current = true
    setError(null)
    setInterim('')
    if (listen()) setListening(true)
    else {
      wanted.current = false
      setError('other')
    }
  }, [locale])

  const stop = useCallback(() => {
    wanted.current = false
    rec.current?.stop()
  }, [])

  return { supported, listening, error, interim, toggle, stop }
}

/** Ajoute le texte dicté à la saisie en cours (espace de séparation si besoin). */
export function appendDictation(current: string, text: string): string {
  return current.trim() ? `${current.replace(/\s+$/, '')} ${text}` : text
}
