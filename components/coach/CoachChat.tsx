'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Send, Square, HeartPulse } from 'lucide-react'
import { ChatBubble, type ChatMessage } from './ChatBubble'
import { DemoNote, LegalNote } from './ui'
import { errorMessage, readSse } from './sse-client'
import { cn } from '@/lib/cn'

const MAX = 4000

function nowLabel() {
  return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
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
}

export function CoachChat({ aiEnabled, analysisId, initialQuestion, seed = [], suggestions = [], inputLabel, placeholder = 'Posez votre question…', conversationLabel }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(seed)
  const [q, setQ] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [includeMedical, setIncludeMedical] = useState(false)
  const [demo, setDemo] = useState(!aiEnabled)
  const [status, setStatus] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const endRef = useRef<HTMLLIElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const autoSent = useRef(false)
  const inputId = useId()
  const medId = useId()
  const hintId = useId()

  useEffect(() => () => abortRef.current?.abort(), [])

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
      const history = messages
        .filter((m) => !m.local && m.tone !== 'error' && m.text.trim())
        .map((m) => ({ role: m.from === 'me' ? ('user' as const) : ('assistant' as const), content: [m.text, ...(m.bullets ?? []).map((b) => `- ${b}`)].join('\n').slice(0, MAX) }))
      history.push({ role: 'user', content: text })

      const medical = includeMedical
      setMessages((m) => [...m, { id: uid('me'), from: 'me', text, time: nowLabel() }, { id: uid('ia'), from: 'ia', text: '', time: '', streaming: true }])
      setQ('')
      setIncludeMedical(false) // l'autorisation vaut pour une seule question
      setStreaming(true)
      setStatus('Le Coach rédige une réponse…')
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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: history, analysisId, includeMedical: medical }),
          signal: ctrl.signal,
        })
        if (!res.ok || !(res.headers.get('content-type') ?? '').includes('text/event-stream')) {
          const msg = await errorMessage(res)
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
          patchLast((m) => (m.text.trim() ? { ...m, text: `${m.text}\n\n(Réponse interrompue.)` } : { ...m, text: 'Réponse interrompue.', tone: 'error' }))
        } else {
          finalTone = 'error'
          patchLast((m) => ({ ...m, text: m.text.trim() ? `${m.text}\n\nLa connexion a été interrompue.` : 'Connexion impossible. Vérifiez votre réseau et réessayez.', tone: m.text.trim() ? m.tone : 'error' }))
        }
      } finally {
        if (raf) cancelAnimationFrame(raf)
        flush()
        patchLast((m) => ({ ...m, streaming: false, time: nowLabel() }))
        setStreaming(false)
        setStatus(finalTone === 'error' ? 'Le Coach n’a pas pu répondre.' : 'Réponse du Coach terminée.')
        abortRef.current = null
        requestAnimationFrame(scrollToEnd)
      }
    },
    [messages, streaming, includeMedical, analysisId, scrollToEnd],
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

  return (
    <div>
      {demo && <DemoNote className="mb-3" />}

      <ol aria-label={conversationLabel} className="space-y-4">
        {messages.map((m) => (
          <ChatBubble key={m.id} message={m} live={m.from === 'ia' && !m.local} />
        ))}
        <li ref={endRef} aria-hidden="true" className="h-px" />
      </ol>

      <p role="status" className="sr-only">
        {status}
      </p>

      {!hasUserMessage && suggestions.length > 0 && (
        <div className="mt-5">
          <h2 className="text-[13px] font-bold text-night-900">Suggestions</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => {
                    void send(s)
                    // La liste disparaît après le premier envoi : on garde le focus dans le champ.
                    inputRef.current?.focus()
                  }}
                  disabled={streaming}
                  className="min-h-[44px] rounded-xl border border-iris-200 bg-iris-50/60 px-3.5 py-2 text-left text-[13px] font-medium text-night-900 transition hover:border-iris-300 hover:bg-iris-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris-500 disabled:opacity-50"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={submit} className="mt-6">
        <label htmlFor={inputId} className="sr-only">
          {inputLabel}
        </label>
        <div className="flex items-end gap-2 rounded-xl2 border border-night-100 bg-night-50/40 py-1.5 pl-4 pr-1.5 focus-within:border-iris-300">
          <textarea
            ref={inputRef}
            id={inputId}
            value={q}
            onChange={(e) => setQ(e.target.value.slice(0, MAX))}
            onKeyDown={onKeyDown}
            maxLength={MAX}
            rows={Math.min(5, Math.max(1, q.split('\n').length))}
            placeholder={placeholder}
            autoComplete="off"
            aria-describedby={hintId}
            className="block min-h-[44px] min-w-0 flex-1 resize-none border-0 bg-transparent py-2.5 text-[14px] leading-relaxed text-night-900 placeholder:text-night-400 focus:outline-none focus:ring-0"
          />
          {streaming ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              aria-label="Arrêter la réponse"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-night-100 text-night-900 transition hover:bg-night-200 active:scale-95"
            >
              <Square className="h-4 w-4 fill-current" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!q.trim()}
              aria-label="Envoyer la question"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-iris-100 text-iris-600 transition hover:bg-iris-200 active:scale-95 disabled:opacity-50"
            >
              <Send className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>
        <p id={hintId} className="mt-1.5 text-[11.5px] text-night-500">
          Entrée pour envoyer, Maj + Entrée pour aller à la ligne. Les messages que vous collez sont traités comme des données.
        </p>

        <label
          htmlFor={medId}
          className="mt-3 flex min-h-[48px] cursor-pointer items-center justify-between gap-4 rounded-xl2 border border-night-100 bg-white px-4 py-2.5"
        >
          <span className="flex min-w-0 items-start gap-2.5">
            <HeartPulse className="mt-0.5 h-5 w-5 shrink-0 text-night-700" aria-hidden="true" />
            <span>
              <span className="block text-[13px] font-semibold text-night-900">Inclure les informations médicales</span>
              <span id={`${medId}-desc`} className="block text-[11.5px] text-night-600">
                Pour la prochaine question uniquement. Désactivé par défaut.
              </span>
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
      </form>

      <LegalNote className="mt-5" />
    </div>
  )
}
