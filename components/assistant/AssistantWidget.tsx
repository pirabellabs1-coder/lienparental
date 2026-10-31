'use client'

import Link from 'next/link'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ArrowRight, CheckCheck, CheckCircle2, Mail, MessageCircle, Minus, Phone, RotateCcw, SendHorizontal, User, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { safeInternalPath } from '@/lib/ai/assistant-links'
import { localePath, signupPath } from '@/lib/i18n/routing'
import { CONTACT_EMAIL } from '@/lib/seo/site'

// Assistant public du site (bulle « Une question ? ») : réponses de POST /api/assistant.
// Conversation gardée le temps de l'onglet (sessionStorage), jamais côté serveur.
// Accessibilité : dialogue au focus piégé, Échap pour réduire, fil en aria-live, animations coupées
// en prefers-reduced-motion (classes motion-safe).

/** Numéros publics (format international, chiffres seuls ou avec espaces). Absents : boutons inactifs. */
const WHATSAPP = (process.env.NEXT_PUBLIC_CONTACT_WHATSAPP ?? '').replace(/[^\d]/g, '')
const PHONE = (process.env.NEXT_PUBLIC_CONTACT_PHONE ?? '').replace(/[^\d+]/g, '')

const MAX_CHARS = 800
const STORE_KEY = 'lp_assistant_v1'
const TEASER_KEY = 'lp_assistant_teaser_off'

type Msg = { id: string; role: 'user' | 'assistant'; content: string; cta?: boolean; error?: boolean }

const uid = () => Math.random().toString(36).slice(2, 10)

function readStore(): Msg[] {
  try {
    const raw = sessionStorage.getItem(STORE_KEY)
    const list = raw ? (JSON.parse(raw) as Msg[]) : []
    return Array.isArray(list) ? list.filter((m) => m && typeof m.id === 'string' && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-30) : []
  } catch {
    return []
  }
}

/** Avatar du robot : tête sombre, yeux verts, antenne. */
function RobotAvatar({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className={className}>
      <line x1="24" y1="5" x2="24" y2="12" stroke="#0b2d5b" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="24" cy="5" r="3.2" fill="#4caf50" />
      <rect x="5" y="22" width="4" height="10" rx="2" fill="#25497c" />
      <rect x="39" y="22" width="4" height="10" rx="2" fill="#25497c" />
      <rect x="8" y="12" width="32" height="29" rx="11" fill="#0b2d5b" />
      <rect x="12" y="17" width="24" height="18" rx="8" fill="#123361" />
      <circle cx="18.5" cy="24.5" r="3.4" fill="#7fc982" />
      <circle cx="29.5" cy="24.5" r="3.4" fill="#7fc982" />
      <path d="M19 30.2q5 4 10 0" fill="none" stroke="#7fc982" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

/** Texte de l'assistant : paragraphes, puces « - » (coches vertes), liens internes [libellé](/chemin). */
function RichText({ text, locale, onNavigate }: { text: string; locale: string; onNavigate: () => void }) {
  const inline = (s: string, key: string) => {
    const out: React.ReactNode[] = []
    const re = /\[([^\]]{1,80})\]\((\/[^)\s]{0,120})\)/g
    let last = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(s))) {
      if (m.index > last) out.push(s.slice(last, m.index))
      const path = safeInternalPath(m[2]!)
      last = m.index + m[0].length
      if (!path) {
        out.push(m[1])
        continue
      }
      out.push(
        <Link key={`${key}-${m.index}`} href={localePath(locale, path)} onClick={onNavigate} className="font-semibold text-iris-700 underline decoration-iris-300 underline-offset-2 hover:decoration-iris-600">
          {m[1]}
        </Link>,
      )
    }
    if (last < s.length) out.push(s.slice(last))
    return out
  }
  const blocks: React.ReactNode[] = []
  let list: string[] = []
  const flush = () => {
    if (!list.length) return
    const items = list
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-leaf-500" aria-hidden />
            <span>{inline(it, `li-${blocks.length}-${i}`)}</span>
          </li>
        ))}
      </ul>,
    )
    list = []
  }
  for (const line of text.replace(/\*\*/g, '').split('\n')) {
    const item = line.match(/^\s*(?:[-•*]|✅)\s+(.*)$/)
    if (item) {
      list.push(item[1]!)
      continue
    }
    flush()
    if (line.trim()) blocks.push(<p key={`p-${blocks.length}`}>{inline(line, `p-${blocks.length}`)}</p>)
  }
  flush()
  return <div className="space-y-2">{blocks}</div>
}

export function AssistantWidget() {
  const t = useTranslations('public.assistant')
  const locale = useLocale()
  const titleId = useId()
  const [open, setOpen] = useState(false)
  const [teaser, setTeaser] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const launcher = useRef<HTMLButtonElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const end = useRef<HTMLDivElement>(null)
  const abort = useRef<AbortController | null>(null)
  const returnFocus = useRef(false)
  const hydrated = useRef(false)
  // Plein écran sur mobile (modal) ; panneau de coin sur ordinateur, page restée accessible.
  const [modal, setModal] = useState(true)

  // Restauration après hydratation (sessionStorage indisponible au rendu serveur).
  useEffect(() => {
    setMsgs(readStore())
    hydrated.current = true
    const mq = window.matchMedia('(min-width: 640px)')
    const sync = () => setModal(!mq.matches)
    sync()
    mq.addEventListener('change', sync)
    let off = false
    try {
      off = sessionStorage.getItem(TEASER_KEY) === '1'
    } catch {
      // stockage bloqué : bulle affichée
    }
    const timer = off ? undefined : setTimeout(() => setTeaser(true), 1200)
    return () => {
      clearTimeout(timer)
      mq.removeEventListener('change', sync)
    }
  }, [])

  useEffect(() => {
    if (!hydrated.current) return
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(msgs.slice(-30)))
    } catch {
      // stockage bloqué : conversation non conservée
    }
  }, [msgs])

  useEffect(() => {
    if (open) end.current?.scrollIntoView({ block: 'end' })
  }, [open, msgs, pending])

  // Ouverture : focus sur le champ. Fermeture : retour au bouton flottant (remonté entre-temps).
  useEffect(() => {
    if (open) field.current?.focus()
    else if (returnFocus.current) {
      returnFocus.current = false
      launcher.current?.focus()
    }
  }, [open])

  useEffect(() => () => abort.current?.abort(), [])

  const hideTeaser = () => {
    setTeaser(false)
    try {
      sessionStorage.setItem(TEASER_KEY, '1')
    } catch {
      // sans effet
    }
  }

  const openPanel = () => {
    hideTeaser()
    setOpen(true)
  }

  const minimize = useCallback(() => {
    returnFocus.current = true
    setOpen(false)
  }, [])

  const close = useCallback(() => {
    abort.current?.abort()
    setPending(false)
    minimize()
  }, [minimize])

  const reset = () => {
    abort.current?.abort()
    setPending(false)
    setMsgs([])
    setInput('')
    field.current?.focus()
  }

  const send = async (text: string) => {
    const content = text.trim().slice(0, MAX_CHARS)
    if (!content || pending) return
    const userMsg: Msg = { id: uid(), role: 'user', content }
    const history = [...msgs.filter((m) => !m.error), userMsg]
    setMsgs((prev) => [...prev, userMsg])
    setInput('')
    setPending(true)
    const ctrl = new AbortController()
    abort.current = ctrl
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale, messages: history.map(({ role, content: c }) => ({ role, content: c })) }),
        signal: ctrl.signal,
      })
      const data = (await res.json().catch(() => null)) as { text?: string; cta?: boolean; error?: { message?: string } } | null
      const reply = data?.text
      if (!res.ok || !reply) {
        setMsgs((prev) => [...prev, { id: uid(), role: 'assistant', content: data?.error?.message || t('error'), error: true }])
      } else {
        setMsgs((prev) => [...prev, { id: uid(), role: 'assistant', content: reply, cta: Boolean(data?.cta) }])
      }
    } catch {
      if (!ctrl.signal.aborted) setMsgs((prev) => [...prev, { id: uid(), role: 'assistant', content: t('error'), error: true }])
    } finally {
      if (abort.current === ctrl) {
        abort.current = null
        setPending(false)
      }
    }
  }

  // Focus piégé dans le panneau, Échap pour réduire.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      minimize()
      return
    }
    if (e.key !== 'Tab' || !panel.current) return
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])'))
    if (!items.length) return
    const first = items[0]!
    const last = items[items.length - 1]!
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const lastBot = [...msgs].reverse().find((m) => m.role === 'assistant')
  const answered = (i: number) => msgs.slice(i + 1).some((m) => m.role === 'assistant')
  const suggestions = [t('suggestion1'), t('suggestion2'), t('suggestion3')]

  const contactBtn = 'flex min-h-[48px] w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-[14px] font-semibold ring-1 transition-colors'

  return (
    <>
      {!open && (
        <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-30 flex items-center gap-3 sm:right-6">
          {teaser && (
            <button
              type="button"
              onClick={openPanel}
              className="relative rounded-2xl rounded-br-md bg-white px-4 py-2.5 text-[14.5px] font-semibold text-night-900 shadow-card ring-1 ring-night-100 motion-safe:animate-fade-up"
            >
              {t('teaser')}
            </button>
          )}
          <button
            ref={launcher}
            type="button"
            onClick={openPanel}
            aria-haspopup="dialog"
            aria-label={t('open')}
            className="relative grid h-16 w-16 shrink-0 place-items-center rounded-full bg-white shadow-[0_10px_30px_-8px_rgba(60,42,163,0.45)] ring-2 ring-iris-100 transition-transform hover:scale-105 motion-reduce:transition-none motion-reduce:hover:scale-100"
          >
            <RobotAvatar className="h-11 w-11" />
            <span aria-hidden className="absolute -right-0.5 -top-0.5 grid h-6 min-w-6 place-items-center rounded-full bg-iris-600 px-1.5 text-[13px] font-bold leading-none text-white ring-2 ring-white">
              …
            </span>
          </button>
        </div>
      )}

      {open && (
        <div
          ref={panel}
          role="dialog"
          aria-modal={modal}
          aria-labelledby={titleId}
          onKeyDown={onKeyDown}
          className="fixed inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] top-[max(0.5rem,env(safe-area-inset-top))] z-[60] flex flex-col overflow-hidden rounded-3xl bg-white text-night-900 shadow-2xl ring-1 ring-night-100 motion-safe:animate-fade-up sm:inset-x-auto sm:right-5 sm:top-auto sm:h-[min(680px,calc(100dvh-2.5rem))] sm:w-[400px]"
        >
          <header className="shrink-0 bg-gradient-to-br from-iris-500 via-iris-600 to-iris-800 px-4 pb-3 pt-3.5 text-white">
            <div className="flex items-center gap-3">
              <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white">
                <RobotAvatar className="h-8 w-8" />
                <span aria-hidden className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-leaf-400 ring-2 ring-white" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="text-[15.5px] font-bold leading-tight">{t('title')}</h2>
                <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-iris-100">
                  <span aria-hidden className="h-2 w-2 rounded-full bg-leaf-400" />
                  {t('online')}
                </p>
              </div>
              <button type="button" onClick={minimize} aria-label={t('minimize')} className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/15">
                <Minus className="h-5 w-5" aria-hidden />
              </button>
              <button type="button" onClick={close} aria-label={t('close')} className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/15">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <button
              type="button"
              onClick={reset}
              className="mt-2.5 inline-flex h-9 items-center gap-1.5 rounded-full bg-white/15 px-3.5 text-[13px] font-semibold ring-1 ring-white/25 hover:bg-white/25"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              {t('newChat')}
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 text-[14.5px] leading-relaxed">
            <div role="log" aria-live="polite" aria-relevant="additions" aria-label={t('logLabel')} className="space-y-3">
              <div className="flex items-start gap-2">
                <RobotAvatar className="mt-0.5 h-7 w-7 shrink-0" />
                <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-iris-50 px-3.5 py-2.5 ring-1 ring-iris-100">{t('welcome')}</div>
              </div>

              {msgs.length === 0 && (
                <div className="flex flex-wrap gap-2 pl-9">
                  {suggestions.map((s) => (
                    <button key={s} type="button" onClick={() => send(s)} className="rounded-full bg-white px-3 py-1.5 text-[13px] font-semibold text-iris-700 ring-1 ring-iris-200 hover:bg-iris-50">
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {msgs.map((m, i) =>
                m.role === 'user' ? (
                  <div key={m.id} className="flex items-end justify-end gap-2">
                    <div className="flex max-w-[80%] flex-col items-end">
                      <span className="sr-only">{t('you')} :</span>
                      <div className="whitespace-pre-wrap break-words rounded-2xl rounded-tr-md bg-iris-600 px-3.5 py-2.5 text-white">{m.content}</div>
                      <CheckCheck className={cn('mt-0.5 h-4 w-4', answered(i) ? 'text-leaf-500' : 'text-night-300')} aria-hidden />
                    </div>
                    <span aria-hidden className="mb-5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-night-100 text-night-600">
                      <User className="h-4 w-4" />
                    </span>
                  </div>
                ) : (
                  <div key={m.id} className="space-y-3">
                    <div className="flex items-start gap-2">
                      <RobotAvatar className="mt-0.5 h-7 w-7 shrink-0" />
                      <div className={cn('max-w-[85%] break-words rounded-2xl rounded-tl-md px-3.5 py-2.5 ring-1', m.error ? 'bg-alert-50 text-alert-800 ring-alert-100' : 'bg-iris-50 ring-iris-100')}>
                        <span className="sr-only">{t('assistant')} :</span>
                        <RichText text={m.content} locale={locale} onNavigate={minimize} />
                      </div>
                    </div>
                    {m.cta && (
                      <div>
                        <Link href={signupPath(locale)} className="flex h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-iris-600 px-4 text-[15px] font-bold text-white shadow-[0_8px_20px_-10px_rgba(74,53,201,0.8)] hover:bg-iris-700">
                          {t('cta')}
                          <ArrowRight className="h-4 w-4" aria-hidden />
                        </Link>
                        <p className="mt-1.5 text-center text-[12px] text-night-500">{t('ctaNote')}</p>
                      </div>
                    )}
                  </div>
                ),
              )}

            </div>
              {pending && (
                <div role="status" className="mt-3 flex items-center gap-2">
                  <RobotAvatar className="h-7 w-7 shrink-0" />
                  <div className="flex items-center gap-1 rounded-2xl rounded-tl-md bg-iris-50 px-3.5 py-3 ring-1 ring-iris-100">
                    <span className="sr-only">{t('typing')}</span>
                    {[0, 150, 300].map((d) => (
                      <span key={d} aria-hidden style={{ animationDelay: `${d}ms` }} className="h-2 w-2 rounded-full bg-iris-400 motion-safe:animate-bounce" />
                    ))}
                  </div>
                </div>
              )}
              {lastBot && !pending && (
                <div className="mt-3 rounded-2xl bg-white p-3 ring-1 ring-night-100">
                  <p className="mb-2 text-[13px] font-bold text-night-700">{t('otherWays')}</p>
                  <div className="space-y-2">
                    {WHATSAPP ? (
                      <a href={`https://wa.me/${WHATSAPP}`} target="_blank" rel="noopener noreferrer" className={cn(contactBtn, 'bg-leaf-50 text-leaf-800 ring-leaf-200 hover:bg-leaf-100')}>
                        <MessageCircle className="h-5 w-5 shrink-0 text-leaf-600" aria-hidden />
                        {t('whatsapp')}
                      </a>
                    ) : (
                      <button type="button" disabled className={cn(contactBtn, 'cursor-not-allowed bg-night-50 text-night-400 ring-night-100')}>
                        <MessageCircle className="h-5 w-5 shrink-0" aria-hidden />
                        <span className="flex flex-col leading-tight">{t('whatsapp')}<span className="text-[12px] font-medium">{t('soon')}</span></span>
                      </button>
                    )}
                    {PHONE ? (
                      <a href={`tel:${PHONE}`} className={cn(contactBtn, 'bg-iris-50 text-iris-800 ring-iris-100 hover:bg-iris-100')}>
                        <Phone className="h-5 w-5 shrink-0 text-iris-600" aria-hidden />
                        {t('call')}
                      </a>
                    ) : (
                      <button type="button" disabled className={cn(contactBtn, 'cursor-not-allowed bg-night-50 text-night-400 ring-night-100')}>
                        <Phone className="h-5 w-5 shrink-0" aria-hidden />
                        <span className="flex flex-col leading-tight">{t('call')}<span className="text-[12px] font-medium">{t('soon')}</span></span>
                      </button>
                    )}
                    <a href={`mailto:${CONTACT_EMAIL}`} className={cn(contactBtn, 'bg-white text-night-800 ring-night-200 hover:bg-night-50')}>
                      <Mail className="h-5 w-5 shrink-0 text-night-600" aria-hidden />
                      <span className="flex min-w-0 flex-col leading-tight">
                        {t('write')}
                        <span className="truncate text-[12.5px] font-medium text-night-500">{CONTACT_EMAIL}</span>
                      </span>
                    </a>
                  </div>
                </div>
              )}
            <div ref={end} />
          </div>

          <form
            className="shrink-0 border-t border-night-100 bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"
            onSubmit={(e) => {
              e.preventDefault()
              void send(input)
            }}
          >
            <div className="flex items-end gap-2">
              <label htmlFor={`${titleId}-input`} className="sr-only">{t('inputLabel')}</label>
              <textarea
                ref={field}
                id={`${titleId}-input`}
                rows={1}
                value={input}
                maxLength={MAX_CHARS}
                placeholder={t('placeholder')}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    void send(input)
                  }
                }}
                className="max-h-28 min-h-[44px] flex-1 resize-none rounded-2xl bg-night-50 px-4 py-2.5 text-[15px] text-night-900 ring-1 ring-night-100 placeholder:text-night-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-iris-400"
              />
              <button
                type="submit"
                disabled={pending || !input.trim()}
                aria-label={t('send')}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-iris-600 text-white shadow-md hover:bg-iris-700 disabled:opacity-50"
              >
                <SendHorizontal className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <p className="mt-2 text-center text-[11.5px] leading-snug text-night-500">
              {t('disclaimer')}{' '}
              <Link href={localePath(locale, '/legal/confidentialite')} onClick={minimize} className="underline underline-offset-2">{t('privacy')}</Link>
            </p>
          </form>
        </div>
      )}
    </>
  )
}
