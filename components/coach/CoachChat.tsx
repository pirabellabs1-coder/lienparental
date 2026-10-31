'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Coins, FileImage, FileText, HeartPulse, Mic, Plus, Send, Square, Volume2 } from 'lucide-react'
import { ChatBubble, type ChatMessage } from './ChatBubble'
import { DemoNote, LegalNote } from './ui'
import { errorMessage, readSse } from './sse-client'
import { DOC_ACCEPT, IMAGE_ACCEPT, draftFromFile, newIdempotencyKey, prepareCoachFile, saveDraft, setPendingFile } from './session'
import { useCredits } from './CreditCost'
import { useCoachVoice } from './useCoachVoice'
import { appendDictation, useDictation } from './useDictation'
import { COACH_VOICES, type CoachVoiceKey } from '@/lib/ai/voices'
import { cn } from '@/lib/cn'
import { intlLocale } from '@/lib/i18n/config'
import { CHAT_MAX_TOTAL_CHARS, CHAT_MAX_TURNS } from '@/lib/ai/schemas'

const MAX = 4000

function nowLabel(locale: string) {
  return new Date().toLocaleTimeString(intlLocale(locale), { hour: '2-digit', minute: '2-digit' })
}

let seq = 0
const uid = (p: string) => `${p}_${Date.now().toString(36)}_${(seq++).toString(36)}`

type Props = {
  /** Démo (pas de clé API) : réponses simulées + mention discrète. */
  aiEnabled: boolean
  /** Discussion d'une analyse précise. */
  analysisId?: string
  /** Question à envoyer automatiquement à l'ouverture (ex. depuis le dashboard). */
  initialQuestion?: string
  /** Messages d'accueil / d'illustration (jamais renvoyés au serveur). */
  seed?: ChatMessage[]
  suggestions?: string[]
  inputLabel: string
  placeholder?: string
  conversationLabel: string
  /**
   * Conversation libre conservée pour l'onglet (sessionStorage, effacée à sa fermeture) : revenir
   * sur la page ou la recharger garde le fil, donc le contexte envoyé au Coach.
   */
  persistKey?: string
}

const STORE_PREFIX = 'lp-coach-chat:'
const STORE_MAX = 40

function loadStored(key: string | undefined): ChatMessage[] | null {
  if (!key) return null
  try {
    const raw = sessionStorage.getItem(STORE_PREFIX + key)
    const list = raw ? (JSON.parse(raw) as unknown) : null
    if (!Array.isArray(list)) return null
    const ok = list.filter((m): m is ChatMessage => !!m && typeof m === 'object' && typeof (m as ChatMessage).text === 'string' && ((m as ChatMessage).from === 'me' || (m as ChatMessage).from === 'ia'))
    return ok.length ? ok : null
  } catch {
    return null
  }
}

export function CoachChat({ aiEnabled, analysisId, initialQuestion, seed = [], suggestions = [], inputLabel, placeholder, conversationLabel, persistKey }: Props) {
  const t = useTranslations('coach.chat')
  const tc = useTranslations('coach.common')
  const th = useTranslations('coach.home')
  const locale = useLocale()
  const router = useRouter()
  const [messages, setMessages] = useState<ChatMessage[]>(seed)
  const [q, setQ] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [includeMedical, setIncludeMedical] = useState(false)
  const [demo, setDemo] = useState(!aiEnabled)
  const [status, setStatus] = useState('')
  // Solde insuffisant (402) : message + packs proposés ; la question reste dans le champ.
  const [blocked, setBlocked] = useState<string | null>(null)
  // Formule Gratuite (champ `upgrade` du 402) : l'offre Premium est proposée en plus des packs.
  const [upgrade, setUpgrade] = useState(false)
  const { data: credits, refresh: refreshCredits } = useCredits()
  const chatCost = credits?.costs.chat_question ?? 1
  const speechCtl = useCoachVoice()
  // Dictée : la reconnaissance vocale du navigateur écrit dans le champ ; rien n'est envoyé à nos serveurs.
  const dictation = useDictation(locale, useCallback((text: string) => setQ((cur) => appendDictation(cur, text).slice(0, MAX)), []))
  const stopDictation = dictation.stop
  const voiceId = useId()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const endRef = useRef<HTMLLIElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const autoSent = useRef(false)
  const inputId = useId()
  const medId = useId()
  const hintId = useId()
  const attachId = useId()
  // Pièce jointe : le chat n'envoie que du texte ; une image ou un document passe par l'analyse du Coach
  // (contrôle du format côté serveur, coût selon le type), dont on peut ensuite discuter.
  const [attachOpen, setAttachOpen] = useState(false)
  const [fileError, setFileError] = useState('')
  const imageRef = useRef<HTMLInputElement>(null)
  const docRef = useRef<HTMLInputElement>(null)

  const onFile = async (picked: File | undefined, accept: 'image' | 'doc') => {
    if (!picked) return
    const ready = await prepareCoachFile(picked, accept)
    if ('error' in ready) {
      setFileError(tc(`fileErrors.${ready.error}`))
      return
    }
    const file = ready.file
    setFileError('')
    setPendingFile(file)
    // La question en cours de saisie accompagne le fichier (limite du serveur : 2 000 caractères).
    const question = q.trim().slice(0, 2000)
    saveDraft({ ...draftFromFile(file), ...(question ? { text: question } : {}) })
    router.push('/app/coach/document')
  }

  useEffect(() => () => abortRef.current?.abort(), [])

  // Fil conservé de l'onglet : restauré au montage (après l'hydratation), puis réenregistré
  // seulement une fois la restauration appliquée (sinon l'accueil seul écraserait le fil).
  const [restored, setRestored] = useState(false)
  useEffect(() => {
    const stored = loadStored(persistKey)
    if (stored) setMessages(stored)
    setRestored(true)
  }, [persistKey])
  useEffect(() => {
    if (!persistKey || !restored || streaming) return
    try {
      const keep = messages.filter((m) => !m.streaming).slice(-STORE_MAX).map(({ streaming: _s, ...m }) => m)
      sessionStorage.setItem(STORE_PREFIX + persistKey, JSON.stringify(keep))
    } catch {
      // stockage indisponible (navigation privée) : la conversation reste en mémoire
    }
  }, [messages, persistKey, restored, streaming])

  const scrollToEnd = useCallback(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    endRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'end' })
  }, [])

  const patchLast = (fn: (m: ChatMessage) => ChatMessage) =>
    setMessages((list) => {
      const i = list.length - 1
      if (i < 0 || list[i]!.from !== 'ia') return list
      const next = list.slice()
      next[i] = fn(list[i]!)
      return next
    })

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim().slice(0, MAX)
      if (!text || streaming) return
      let history = messages
        .filter((m) => !m.local && m.tone !== 'error' && m.text.trim())
        .map((m) => ({ role: m.from === 'me' ? ('user' as const) : ('assistant' as const), content: [m.text, ...(m.bullets ?? []).map((b) => `- ${b}`)].join('\n').slice(0, MAX) }))
      // Fil long (réaffiché ou conservé) : seuls les derniers tours partent, dans les limites du serveur.
      history = history.slice(-(CHAT_MAX_TURNS - 1))
      let total = history.reduce((n, h) => n + h.content.length, text.length)
      while (history.length && (total > CHAT_MAX_TOTAL_CHARS || history[0]!.role !== 'user')) {
        total -= history[0]!.content.length
        history = history.slice(1)
      }
      history.push({ role: 'user', content: text })

      stopDictation()
      const medical = includeMedical
      // Une clé par question : une relance réseau ou un double envoi ne débite qu'un crédit.
      const key = newIdempotencyKey()
      setBlocked(null)
      setMessages((m) => [...m, { id: uid('me'), from: 'me', text, time: nowLabel(locale) }, { id: uid('ia'), from: 'ia', text: '', time: '', streaming: true }])
      setQ('')
      setIncludeMedical(false) // l'autorisation vaut pour une seule question
      setStreaming(true)
      setStatus(t('statusWriting'))
      requestAnimationFrame(scrollToEnd)

      const ctrl = new AbortController()
      abortRef.current = ctrl
      let buffer = ''
      let raf = 0
      const flush = () => {
        raf = 0
        if (!buffer) return
        const chunk = buffer
        buffer = ''
        patchLast((m) => ({ ...m, text: m.text + chunk }))
      }

      let finalTone: 'error' | undefined
      try {
        const res = await fetch('/api/coach/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
          body: JSON.stringify({ messages: history, analysisId, includeMedical: medical }),
          signal: ctrl.signal,
        })
        if (res.status === 402) {
          // Aucun crédit débité : la question revient dans le champ, les bulles sont retirées.
          const body = (await res.json().catch(() => null)) as { error?: { message?: string }; upgrade?: boolean } | null
          const msg = body?.error?.message ?? t('insufficient')
          setUpgrade(body?.upgrade === true)
          setMessages((list) => list.slice(0, -2))
          setQ(text)
          setBlocked(msg)
          setStatus(msg)
          finalTone = 'error'
          return
        }
        if (!res.ok || !(res.headers.get('content-type') ?? '').includes('text/event-stream')) {
          const msg = await errorMessage(res, tc('errors.generic'), { sessionExpired: tc('errors.sessionExpired'), tooLarge: tc('errors.tooLarge') })
          finalTone = 'error'
          patchLast((m) => ({ ...m, text: msg, tone: 'error' }))
          setStatus(msg)
          return
        }
        await readSse(res, (event, data) => {
          const d = data as Record<string, unknown>
          if (event === 'delta' && typeof d.t === 'string') {
            buffer += d.t
            if (!raf) raf = requestAnimationFrame(flush)
          } else if (event === 'refusal' && typeof d.message === 'string') {
            buffer = ''
            finalTone = 'error'
            patchLast((m) => ({ ...m, text: d.message as string, tone: 'error' }))
          } else if (event === 'error' && typeof d.message === 'string') {
            flush()
            finalTone = 'error'
            patchLast((m) => (m.text.trim() ? { ...m, text: `${m.text}\n\n${d.message as string}` } : { ...m, text: d.message as string, tone: 'error' }))
          } else if (event === 'done') {
            if (d.demo === true) setDemo(true)
          }
        })
      } catch {
        if (ctrl.signal.aborted) {
          patchLast((m) => (m.text.trim() ? { ...m, text: `${m.text}\n\n${t('interruptedSuffix')}` } : { ...m, text: t('interrupted'), tone: 'error' }))
        } else {
          finalTone = 'error'
          patchLast((m) => ({ ...m, text: m.text.trim() ? `${m.text}\n\n${t('connectionLost')}` : t('connectionFailed'), tone: m.text.trim() ? m.tone : 'error' }))
        }
      } finally {
        if (raf) cancelAnimationFrame(raf)
        flush()
        patchLast((m) => (m.streaming ? { ...m, streaming: false, time: nowLabel(locale) } : m))
        setStreaming(false)
        setStatus(finalTone === 'error' ? t('statusFailed') : t('statusDone'))
        abortRef.current = null
        refreshCredits()
        requestAnimationFrame(scrollToEnd)
      }
    },
    [messages, streaming, includeMedical, analysisId, scrollToEnd, t, tc, locale, refreshCredits, stopDictation],
  )

  // Question transmise par le dashboard : envoyée une seule fois.
  useEffect(() => {
    if (autoSent.current || !initialQuestion?.trim()) return
    autoSent.current = true
    void send(initialQuestion)
    // `send` change à chaque message ; l'envoi automatique ne doit se produire qu'au montage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    void send(q)
    inputRef.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void send(q)
    }
  }

  const hasUserMessage = messages.some((m) => m.from === 'me')

  const outOfCredits = Boolean(blocked || (credits && credits.total < chatCost))
  const panelClose = () => setAttachOpen(false)

  // Mise en page « messagerie » : la conversation occupe l'écran, la zone de saisie reste collée en bas
  // (au-dessus de la barre d'onglets sur mobile) ; pièces jointes, voix et informations médicales sont
  // regroupées dans le menu « + ».
  return (
    <div className="flex min-h-[calc(100dvh-12rem)] flex-col lg:min-h-[calc(100dvh-10rem)]">
      {demo && <DemoNote className="mb-3" />}
      <LegalNote className="mb-4 text-center" />

      <ol aria-label={conversationLabel} className="flex-1 space-y-4 pb-4">
        {messages.map((m) => (
          <ChatBubble
            key={m.id}
            message={m}
            live={m.from === 'ia' && !m.local}
            speech={m.from === 'ia' && !m.streaming && m.tone !== 'error' && m.text.trim() ? {
              playing: speechCtl.state.id === m.id && speechCtl.state.status === 'playing',
              loading: speechCtl.state.id === m.id && speechCtl.state.status === 'loading',
              onToggle: () => void speechCtl.toggle(m.id, [m.text, ...(m.bullets ?? [])].join('\n')),
            } : undefined}
          />
        ))}
        <li ref={endRef} aria-hidden="true" className="h-px" />
      </ol>

      <p role="status" className="sr-only">
        {status}
      </p>

      <form
        onSubmit={submit}
        className="sticky z-20 -mx-4 border-t border-night-100 bg-white/95 px-3 pb-2 pt-2 backdrop-blur [bottom:calc(4rem+env(safe-area-inset-bottom,0px))] lg:mx-0 lg:rounded-2xl lg:border lg:px-3 lg:[bottom:1rem]"
      >
        {!hasUserMessage && suggestions.length > 0 && (
          <div className="mb-2">
            <h2 className="sr-only">{t('suggestions')}</h2>
            <ul className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none]">
              {suggestions.map((s) => (
                <li key={s} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      void send(s)
                      inputRef.current?.focus()
                    }}
                    disabled={streaming}
                    className="min-h-[40px] max-w-[260px] truncate rounded-full border border-iris-200 bg-iris-50/70 px-3.5 text-[13px] font-medium text-night-900 transition hover:border-iris-300 hover:bg-iris-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris-500 disabled:opacity-50"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {outOfCredits ? (
          <div role="alert" className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-alert-50 px-3 py-2 text-[12.5px] leading-snug text-night-900">
            <span className="min-w-0 flex-1">{blocked ?? t('noCreditsShort')}</span>
            <Link href="/app/coach/credits#packs" className="inline-flex items-center gap-1 font-semibold underline underline-offset-2">
              <Coins className="h-4 w-4" aria-hidden="true" />
              {t('buyCredits')}
            </Link>
            <Link href="/app/abonnement" className="font-semibold underline underline-offset-2">{upgrade ? t('upgradePlan') : t('seePlans')}</Link>
          </div>
        ) : credits && credits.total <= chatCost * 3 ? (
          <p role="status" className="mb-2 rounded-xl bg-gold-50 px-3 py-1.5 text-[12px] font-semibold text-gold-900">
            {t('lowCredits', { total: credits.total })}{' '}
            <Link href="/app/coach/credits#packs" className="underline underline-offset-2">{t('buyCredits')}</Link>
          </p>
        ) : null}

        {attachOpen && (
          <div id={attachId} className="mb-2 space-y-2 rounded-2xl border border-night-100 bg-white p-2 shadow-soft">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => imageRef.current?.click()}
                disabled={streaming}
                className="flex min-h-[48px] items-center gap-2.5 rounded-xl bg-iris-50/60 px-3 py-2 text-left transition hover:bg-iris-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris-500 disabled:opacity-50"
              >
                <FileImage className="h-5 w-5 shrink-0 text-iris-600" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold leading-tight text-night-900">{t('attachImage')}</span>
                  <span className="block text-[11px] text-night-600">{th('addCaptureHint')}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => docRef.current?.click()}
                disabled={streaming}
                className="flex min-h-[48px] items-center gap-2.5 rounded-xl bg-iris-50/60 px-3 py-2 text-left transition hover:bg-iris-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris-500 disabled:opacity-50"
              >
                <FileText className="h-5 w-5 shrink-0 text-iris-600" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold leading-tight text-night-900">{t('attachDoc')}</span>
                  <span className="block text-[11px] text-night-600">{th('addDocHint')}</span>
                </span>
              </button>
            </div>
            <p className="px-1 text-[11px] leading-snug text-night-600">{t('attachNote')}</p>

            <div className="flex items-center justify-between gap-3 border-t border-night-100 px-1 pt-2">
              <label htmlFor={voiceId} className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-night-900">
                <Volume2 className="h-4 w-4 shrink-0 text-night-700" aria-hidden="true" />
                {t('voiceTitle')}
              </label>
              <select
                id={voiceId}
                value={speechCtl.voice}
                onChange={(e) => speechCtl.setVoice(e.target.value as CoachVoiceKey)}
                className="min-h-[40px] rounded-lg border border-night-200 bg-white px-2.5 text-[13px] font-semibold text-night-900 focus:border-iris-400 focus:outline-none focus:ring-2 focus:ring-iris-200"
              >
                {(['female', 'male'] as const).map((g) => (
                  <optgroup key={g} label={t(`voiceGroup.${g}`)}>
                    {COACH_VOICES.filter((v) => v.gender === g).map((v) => (
                      <option key={v.key} value={v.key}>{t(`voices.${v.key}`)}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <label htmlFor={medId} className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 border-t border-night-100 px-1 pt-2">
              <span className="flex min-w-0 items-start gap-2">
                <HeartPulse className="mt-0.5 h-4 w-4 shrink-0 text-night-700" aria-hidden="true" />
                <span>
                  <span className="block text-[13px] font-semibold text-night-900">{t('medicalTitle')}</span>
                  <span id={`${medId}-desc`} className="block text-[11px] text-night-600">{t('medicalDesc')}</span>
                </span>
              </span>
              <span className="relative inline-flex shrink-0">
                <input
                  id={medId}
                  type="checkbox"
                  role="switch"
                  checked={includeMedical}
                  onChange={(e) => setIncludeMedical(e.target.checked)}
                  aria-describedby={`${medId}-desc`}
                  className="peer sr-only"
                />
                <span aria-hidden="true" className="h-7 w-12 rounded-full bg-night-200 transition-colors peer-checked:bg-leaf-500 peer-focus-visible:ring-2 peer-focus-visible:ring-leaf-400 peer-focus-visible:ring-offset-2" />
                <span aria-hidden="true" className={cn('absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow-soft transition-transform duration-200 motion-reduce:transition-none', includeMedical && 'translate-x-5')} />
              </span>
            </label>

            <input
              ref={imageRef}
              type="file"
              accept={IMAGE_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                panelClose()
                void onFile(e.target.files?.[0], 'image')
                e.target.value = ''
              }}
            />
            <input
              ref={docRef}
              type="file"
              accept={DOC_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                panelClose()
                void onFile(e.target.files?.[0], 'doc')
                e.target.value = ''
              }}
            />
          </div>
        )}

        {includeMedical && !attachOpen && (
          <p className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-leaf-50 px-3 py-1 text-[12px] font-semibold text-leaf-700">
            <HeartPulse className="h-3.5 w-3.5" aria-hidden="true" />
            {t('medicalOn')}
          </p>
        )}

        <label htmlFor={inputId} className="sr-only">
          {inputLabel}
        </label>
        <div className="flex items-end gap-1.5">
          <button
            type="button"
            onClick={() => setAttachOpen((o) => !o)}
            aria-expanded={attachOpen}
            aria-controls={attachOpen ? attachId : undefined}
            aria-label={t('options')}
            title={t('options')}
            className={cn(
              'grid h-11 w-11 shrink-0 place-items-center rounded-full text-iris-600 transition hover:bg-iris-50 active:scale-95',
              attachOpen && 'bg-iris-100',
            )}
          >
            <Plus className={cn('h-6 w-6 transition-transform duration-200 motion-reduce:transition-none', attachOpen && 'rotate-45')} aria-hidden="true" />
          </button>
          <textarea
            ref={inputRef}
            id={inputId}
            value={q}
            onChange={(e) => setQ(e.target.value.slice(0, MAX))}
            onKeyDown={onKeyDown}
            maxLength={MAX}
            rows={Math.min(5, Math.max(1, q.split('\n').length))}
            placeholder={placeholder ?? t('placeholder')}
            autoComplete="off"
            aria-describedby={hintId}
            className="block max-h-40 min-h-[44px] min-w-0 flex-1 resize-none rounded-[22px] border border-night-100 bg-night-50/60 px-4 py-2.5 text-[15px] leading-snug text-night-900 placeholder:text-night-400 focus:border-iris-300 focus:bg-white focus:outline-none focus:ring-0"
          />
          {dictation.supported && !streaming && (
            <button
              type="button"
              onClick={dictation.toggle}
              aria-pressed={dictation.listening}
              aria-label={dictation.listening ? t('micStop') : t('mic')}
              title={dictation.listening ? t('micStop') : t('mic')}
              className={cn(
                'grid h-11 w-11 shrink-0 place-items-center rounded-full transition active:scale-95',
                dictation.listening ? 'bg-alert-500 text-white motion-safe:animate-pulse' : 'text-iris-600 hover:bg-iris-50',
              )}
            >
              <Mic className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
          {streaming ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              aria-label={t('stop')}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-night-100 text-night-900 transition hover:bg-night-200 active:scale-95"
            >
              <Square className="h-4 w-4 fill-current" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!q.trim() || outOfCredits}
              aria-label={t('send')}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-iris-600 text-white transition hover:bg-iris-700 active:scale-95 disabled:bg-iris-100 disabled:text-iris-400"
            >
              <Send className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>
        <p role="status" aria-live="polite" className={cn('px-1 text-[12px] font-semibold', dictation.listening ? 'mt-1 flex items-center gap-2 text-alert-600' : dictation.error ? 'mt-1 text-alert-700' : 'sr-only')}>
          {dictation.listening && <span aria-hidden="true" className="h-2 w-2 rounded-full bg-alert-500 motion-safe:animate-pulse" />}
          {dictation.listening ? (dictation.interim ? `« ${dictation.interim} »` : t('listening')) : dictation.error ? t(dictation.error === 'denied' ? 'micDenied' : dictation.error === 'nothing' ? 'micNothing' : 'micError') : ''}
        </p>
        {fileError && (
          <p role="alert" className="mt-1 px-1 text-[12px] font-medium text-alert-600">
            {fileError}
          </p>
        )}
        {speechCtl.error && (
          <p role="status" className="mt-1 px-1 text-[11px] leading-snug text-night-600">{t('voiceUnavailable')}</p>
        )}
        <p id={hintId} className="mt-1 truncate px-1 text-[11px] text-night-500">
          <span className="sr-only">{t('hint')} </span>
          {t('costHint', { count: chatCost })}
          {credits ? ` ${t('balanceHint', { total: credits.total })}` : ''}
        </p>
      </form>
    </div>
  )
}
