'use client'

import Link from 'next/link'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ArrowRight, CalendarCheck, CheckCheck, CheckCircle2, Coins, Mail, MessageCircle, Mic, Minus, Phone, PhoneCall, RotateCcw, SendHorizontal, User, UserRound, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useCloseOnBack } from '@/components/ui/useCloseOnBack'
import { safeInternalPath } from '@/lib/ai/assistant-links'
import { localePath, signupPath } from '@/lib/i18n/routing'
import { CONTACT_EMAIL } from '@/lib/seo/site'
import { RobotMascot } from '@/components/coach/RobotMascot'
import { errorMessage, readSse } from '@/components/coach/sse-client'
import { newIdempotencyKey } from '@/components/coach/session'
import { SpeechButton } from '@/components/coach/SpeechButton'
import { useCoachVoice } from '@/components/coach/useCoachVoice'
import { appendDictation, useDictation } from '@/components/coach/useDictation'
import { TalkBadge } from './TalkBadge'
import { AgentFlow, type AgentConfig, type FlowKind, type FlowStart } from './AgentFlows'

// Robot de l’assistant et son panneau de discussion, en deux modes :
//  - public (site) : présentation du produit, réponses de POST /api/assistant ;
//  - coach (espace connecté, via CoachBubble) : le Coach parental lui-même (POST /api/coach/chat,
//    1 crédit par question, mémoire du Coach côté serveur). Le fil est partagé avec la page
//    « Discussion » du Coach (même clé sessionStorage) : « Ouvrir le Coach complet » le reprend.
// Mascotte = celle du Coach (RobotMascot), posée sans fond. Comme le Coach : lecture à voix haute
// (ElevenLabs, voix de l'appareil en repli ; route publique bridée hors connexion) et dictée du champ. Accessibilité : dialogue au focus
// piégé, Échap pour réduire, fil en aria-live, animations coupées en prefers-reduced-motion.

/** Numéros publics (format international, chiffres seuls ou avec espaces). Absents : boutons inactifs. */
const WHATSAPP = (process.env.NEXT_PUBLIC_CONTACT_WHATSAPP ?? '').replace(/[^\d]/g, '')
const PHONE = (process.env.NEXT_PUBLIC_CONTACT_PHONE ?? '').replace(/[^\d+]/g, '')

const MAX_CHARS = 800
export const COACH_MAX_CHARS = 4000
const STORE_KEY = 'lp_assistant_v1'
/** Même clé que CoachChat (persistKey « discussion ») : un seul fil entre la bulle et le Coach. */
const COACH_STORE_KEY = 'lp-coach-chat:discussion'
const PUBLIC_VOICE = { endpoint: '/api/assistant/speech', fixedVoice: true }

export type Msg = { id: string; role: 'user' | 'assistant'; content: string; cta?: boolean; actions?: FlowKind[]; error?: boolean }

export type CoachLink = {
  /** Solde (useCredits du Coach) : seuls le total et le coût d'une question servent ici. */
  credits: { total: number; costs: { chat_question?: number } } | null
  refreshCredits: () => void
  /** Historique envoyé au Coach (limites du serveur, lib/ai/schemas) : fourni par CoachBubble. */
  buildHistory: (msgs: Msg[], question: string) => { role: 'user' | 'assistant'; content: string }[]
}

const uid = () => Math.random().toString(36).slice(2, 10)

function readStore(coach: boolean): Msg[] {
  try {
    const raw = sessionStorage.getItem(coach ? COACH_STORE_KEY : STORE_KEY)
    const list = raw ? (JSON.parse(raw) as unknown[]) : []
    if (!Array.isArray(list)) return []
    if (!coach) {
      return (list as Msg[]).filter((m) => m && typeof m.id === 'string' && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-30)
    }
    // Format de CoachChat : { id, from: 'me' | 'ia', text, tone?, local? }.
    return (list as { id?: unknown; from?: unknown; text?: unknown; tone?: unknown; local?: unknown }[])
      .filter((m) => m && typeof m.text === 'string' && (m.from === 'me' || m.from === 'ia') && !m.local)
      .map((m) => ({ id: typeof m.id === 'string' ? m.id : uid(), role: m.from === 'me' ? 'user' : 'assistant', content: m.text as string, error: m.tone === 'error' || undefined }) satisfies Msg)
      .slice(-40)
  } catch {
    return []
  }
}

function writeStore(coach: boolean, msgs: Msg[]) {
  try {
    if (!coach) {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(msgs.slice(-30)))
      return
    }
    const list = msgs.filter((m) => m.content.trim()).slice(-40).map((m) => ({ id: m.id, from: m.role === 'user' ? 'me' : 'ia', text: m.content, time: '', ...(m.error ? { tone: 'error' } : {}) }))
    sessionStorage.setItem(COACH_STORE_KEY, JSON.stringify(list))
  } catch {
    // stockage bloqué : conversation non conservée
  }
}

/** Texte à lire à voix haute : liens [libellé](/chemin) réduits à leur libellé. */
const withoutLinks = (text: string) => text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')

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

export function AssistantWidget({ coach }: { coach?: CoachLink } = {}) {
  const t = useTranslations('public.assistant')
  const locale = useLocale()
  const titleId = useId()
  const isCoach = Boolean(coach)
  const maxChars = isCoach ? COACH_MAX_CHARS : MAX_CHARS
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  // Coach : solde insuffisant signalé par le serveur (402), la question reste dans le champ.
  const [blocked, setBlocked] = useState<string | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  const launcher = useRef<HTMLButtonElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const end = useRef<HTMLDivElement>(null)
  const abort = useRef<AbortController | null>(null)
  const returnFocus = useRef(false)
  const hydrated = useRef(false)
  // Agent d'accueil (site public) : textes du back-office, types de rendez-vous, parcours en cours.
  const [agent, setAgent] = useState<AgentConfig | null>(null)
  const [flow, setFlow] = useState<FlowStart | null>(null)
  const [agentFailed, setAgentFailed] = useState(false)
  const [agentTry, setAgentTry] = useState(0)
  // Plein écran sur mobile (modal) ; panneau de coin sur ordinateur, page restée accessible.
  const [modal, setModal] = useState(true)
  // Hors connexion : route publique, voix Koraly imposée. Connecté : route et voix choisie du Coach.
  const speech = useCoachVoice(isCoach ? {} : PUBLIC_VOICE)
  const dictation = useDictation(locale, useCallback((text: string) => setInput((cur) => appendDictation(cur, text).slice(0, isCoach ? COACH_MAX_CHARS : MAX_CHARS)), [isCoach]))

  // Restauration après hydratation (sessionStorage indisponible au rendu serveur).
  useEffect(() => {
    setMsgs(readStore(isCoach))
    hydrated.current = true
    const mq = window.matchMedia('(min-width: 640px)')
    const sync = () => setModal(!mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [isCoach])

  useEffect(() => {
    if (!hydrated.current || pending) return
    writeStore(isCoach, msgs)
  }, [msgs, isCoach, pending])

  useEffect(() => {
    if (open) end.current?.scrollIntoView({ block: 'end' })
  }, [open, msgs, pending])

  // Ouverture : focus sur le champ (et solde à jour). Fermeture : retour au bouton flottant.
  useEffect(() => {
    if (open) {
      field.current?.focus()
      coach?.refreshCredits()
    } else if (returnFocus.current) {
      returnFocus.current = false
      launcher.current?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => () => abort.current?.abort(), [])

  // Configuration de l'agent chargée à la première ouverture (sans elle : textes par défaut du widget).
  useEffect(() => {
    if (!open || isCoach || agent) return
    let alive = true
    fetch(`/api/assistant/agent?lang=${locale}`)
      .then((r) => (r.ok ? (r.json() as Promise<AgentConfig>) : null))
      .then((c) => {
        if (!alive) return
        if (c?.messages) setAgent(c)
        else setAgentFailed(true)
      })
      .catch(() => { if (alive) setAgentFailed(true) })
    return () => { alive = false }
  }, [open, isCoach, agent, locale, agentTry])

  const startFlow = (f: FlowStart) => {
    speech.stop()
    // Configuration absente (réseau) : nouvel essai au lancement du parcours.
    if (!agent && agentFailed) {
      setAgentFailed(false)
      setAgentTry((n) => n + 1)
    }
    setFlow(f)
  }
  const endFlow = (text?: string) => {
    setFlow(null)
    if (text) setMsgs((prev) => [...prev, { id: uid(), role: 'assistant', content: text }])
  }

  const openPanel = () => setOpen(true)

  const minimize = useCallback(() => {
    returnFocus.current = true
    dictation.stop()
    setOpen(false)
  }, [dictation])

  const close = useCallback(() => {
    abort.current?.abort()
    speech.stop()
    setPending(false)
    minimize()
  }, [minimize, speech])
  // Retour Android : réduit le panneau (comme Échap), la conversation est gardée.
  useCloseOnBack(open, minimize)

  const reset = () => {
    abort.current?.abort()
    speech.stop()
    setPending(false)
    setBlocked(null)
    setMsgs([])
    setFlow(null)
    setInput('')
    field.current?.focus()
  }

  const sendPublic = async (content: string, ctrl: AbortController) => {
    const history = [...msgs.filter((m) => !m.error), { role: 'user' as const, content }]
    const res = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale, messages: history.map(({ role, content: c }) => ({ role, content: c })) }),
      signal: ctrl.signal,
    })
    const data = (await res.json().catch(() => null)) as { text?: string; cta?: boolean; actions?: FlowKind[]; error?: { message?: string } } | null
    const reply = data?.text
    if (!res.ok || !reply) {
      setMsgs((prev) => [...prev, { id: uid(), role: 'assistant', content: data?.error?.message || t('error'), error: true }])
    } else {
      setMsgs((prev) => [...prev, { id: uid(), role: 'assistant', content: reply, cta: Boolean(data?.cta), actions: data?.actions?.filter((a) => a === 'rdv' || a === 'rappel' || a === 'humain') }])
    }
  }

  // Coach : flux SSE de /api/coach/chat, une clé d'idempotence par question (un seul crédit débité).
  const sendCoach = async (content: string, userId: string, ctrl: AbortController) => {
    const aid = uid()
    const patch = (fn: (m: Msg) => Msg) => setMsgs((list) => list.map((m) => (m.id === aid ? fn(m) : m)))
    const res = await fetch('/api/coach/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': newIdempotencyKey() },
      body: JSON.stringify({ messages: coach!.buildHistory(msgs, content) }),
      signal: ctrl.signal,
    })
    if (res.status === 402) {
      // Aucun crédit débité : la question revient dans le champ.
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
      setMsgs((list) => list.filter((m) => m.id !== userId))
      setInput(content)
      setBlocked(body?.error?.message ?? t('coach.noCredits'))
      return
    }
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('text/event-stream')) {
      const msg = await errorMessage(res, t('coach.error'))
      setMsgs((list) => [...list, { id: aid, role: 'assistant', content: msg, error: true }])
      return
    }
    setMsgs((list) => [...list, { id: aid, role: 'assistant', content: '' }])
    await readSse(res, (event, data) => {
      const d = data as Record<string, unknown>
      if (event === 'delta' && typeof d.t === 'string') {
        const chunk = d.t
        patch((m) => ({ ...m, content: m.content + chunk }))
      } else if ((event === 'refusal' || event === 'error') && typeof d.message === 'string') {
        const message = d.message
        patch((m) => (event === 'error' && m.content.trim() ? { ...m, content: `${m.content}\n\n${message}` } : { ...m, content: message, error: true }))
      }
    })
    setMsgs((list) => list.filter((m) => m.id !== aid || m.content.trim()))
  }

  const send = async (text: string) => {
    const content = text.trim().slice(0, maxChars)
    if (!content || pending) return
    dictation.stop()
    const userMsg: Msg = { id: uid(), role: 'user', content }
    setMsgs((prev) => [...prev, userMsg])
    setInput('')
    setBlocked(null)
    setPending(true)
    const ctrl = new AbortController()
    abort.current = ctrl
    try {
      if (isCoach) await sendCoach(content, userMsg.id, ctrl)
      else await sendPublic(content, ctrl)
    } catch {
      if (!ctrl.signal.aborted) setMsgs((prev) => [...prev, { id: uid(), role: 'assistant', content: isCoach ? t('coach.error') : t('error'), error: true }])
    } finally {
      if (abort.current === ctrl) {
        abort.current = null
        setPending(false)
      }
      if (isCoach) coach?.refreshCredits()
    }
  }

  // Focus piégé dans le panneau, Échap pour réduire.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      minimize()
      return
    }
    if (e.key !== 'Tab' || !panel.current) return
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
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
  const answered = (i: number) => msgs.slice(i + 1).some((m) => m.role === 'assistant' && m.content.trim())
  const prefix = isCoach ? 'coach.' : ''
  const suggestions = [t(`${prefix}suggestion1`), t(`${prefix}suggestion2`), t(`${prefix}suggestion3`)]
  const cost = coach?.credits?.costs.chat_question ?? 1
  const outOfCredits = isCoach && Boolean(blocked || (coach?.credits && coach.credits.total < cost))
  // Réponse du Coach en cours : les points de saisie s'affichent tant qu'aucun texte n'est arrivé.
  const typing = pending && !(isCoach && msgs[msgs.length - 1]?.role === 'assistant' && msgs[msgs.length - 1]!.content)

  const contactBtn = 'flex min-h-[48px] w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-[14px] font-semibold ring-1 transition-colors'

  return (
    <>
      {!open && (
        <div
          className={cn(
            'fixed right-3 z-30 flex items-end gap-1 sm:right-5',
            // Espace connecté : au-dessus de la barre d'onglets mobile (h-16 + safe-area), et au-dessus
            // du bouton « + » des écrans qui en ont un (Fab, data-fab).
            isCoach
              ? 'bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:bottom-5 [body:has([data-fab])_&]:bottom-[calc(9.5rem+env(safe-area-inset-bottom,0px))]'
              : 'bottom-[max(0.75rem,env(safe-area-inset-bottom))]',
          )}
        >
          <button
            ref={launcher}
            type="button"
            onClick={openPanel}
            aria-haspopup="dialog"
            aria-label={isCoach ? t('coach.open') : t('open')}
            className="group relative shrink-0 rounded-3xl p-1 pt-3"
          >
            <span className="block drop-shadow-[0_12px_14px_rgba(60,42,163,0.30)] transition-transform duration-200 group-hover:scale-105 motion-safe:animate-float-soft motion-reduce:transition-none motion-reduce:group-hover:scale-100">
              <RobotMascot variant="head" size={72} animated />
            </span>
            <TalkBadge className="absolute -right-2.5 -top-0.5 h-8 w-9" />
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
          className={cn(
            'fixed inset-x-2 top-[max(0.5rem,env(safe-area-inset-top))] z-[60] flex flex-col overflow-hidden rounded-3xl bg-white text-night-900 shadow-2xl ring-1 ring-night-100 motion-safe:animate-fade-up sm:inset-x-auto sm:right-5 sm:top-auto sm:w-[400px]',
            isCoach
              ? 'bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] sm:h-[min(640px,calc(100dvh-6rem))] md:bottom-5 md:h-[min(680px,calc(100dvh-2.5rem))]'
              : 'bottom-[max(0.5rem,env(safe-area-inset-bottom))] sm:bottom-5 sm:h-[min(680px,calc(100dvh-2.5rem))]',
          )}
        >
          <header className="shrink-0 bg-gradient-to-br from-iris-500 via-iris-600 to-iris-800 px-4 pb-3 pt-3.5 text-white">
            <div className="flex items-center gap-3">
              <RobotMascot variant="head" size={46} className="drop-shadow-[0_4px_6px_rgba(20,10,80,0.35)]" />
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="text-[15.5px] font-bold leading-tight">{isCoach ? t('coach.title') : t('title')}</h2>
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
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={reset}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/15 px-3.5 text-[13px] font-semibold ring-1 ring-white/25 hover:bg-white/25"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                {t('newChat')}
              </button>
              {isCoach && coach?.credits && (
                <Link
                  href="/app/coach/credits"
                  onClick={minimize}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-[12.5px] font-bold text-iris-700 hover:bg-iris-50"
                >
                  <Coins className="h-3.5 w-3.5" aria-hidden />
                  {t('coach.balance', { total: coach.credits.total, cost })}
                </Link>
              )}
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 text-[14.5px] leading-relaxed">
            <div role="log" aria-live="polite" aria-relevant="additions" aria-label={t('logLabel')} className="space-y-3">
              <div className="flex items-start gap-2">
                <RobotMascot variant="head" size={30} className="mt-0.5" />
                <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-iris-50 px-3.5 py-2.5 ring-1 ring-iris-100">{isCoach ? t('coach.welcome') : agent?.messages.WELCOME_WEB ?? t('welcome')}</div>
              </div>

              {msgs.length === 0 && !isCoach && !flow && (
                <div className="flex flex-wrap gap-2 pl-9">
                  {/* Accueil du cahier V2 (§4.2) : questions envoyées telles quelles, ou parcours de l'agent. */}
                  {([
                    ['discover', () => send(t('start.discoverQ'))],
                    ['ask', () => field.current?.focus()],
                    ['problem', () => send(t('start.problemQ'))],
                    ['plans', () => send(t('start.plansQ'))],
                    ['rdv', () => startFlow({ kind: 'rdv' })],
                    ['human', () => startFlow({ kind: 'humain' })],
                    ['partner', () => startFlow({ kind: 'rdv', type: 'partenariat' })],
                    ['join', () => startFlow({ kind: 'rdv', type: 'association' })],
                  ] as const).map(([key, run]) => (
                    <button key={key} type="button" onClick={() => void run()} className="rounded-full bg-white px-3 py-1.5 text-left text-[13px] font-semibold text-iris-700 ring-1 ring-iris-200 hover:bg-iris-50">
                      {t(`start.${key}`)}
                    </button>
                  ))}
                </div>
              )}

              {msgs.length === 0 && isCoach && !outOfCredits && (
                <div className="flex flex-wrap gap-2 pl-9">
                  {suggestions.map((s) => (
                    <button key={s} type="button" onClick={() => send(s)} className="rounded-full bg-white px-3 py-1.5 text-left text-[13px] font-semibold text-iris-700 ring-1 ring-iris-200 hover:bg-iris-50">
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
                ) : m.content ? (
                  <div key={m.id} className="space-y-3">
                    <div className="flex items-start gap-2">
                      <RobotMascot variant="head" size={30} className="mt-0.5" />
                      <div className={cn('max-w-[85%] break-words rounded-2xl rounded-tl-md px-3.5 py-2.5 ring-1', m.error ? 'bg-alert-50 text-alert-800 ring-alert-100' : 'bg-iris-50 ring-iris-100')}>
                        <span className="sr-only">{isCoach ? t('coach.title') : t('assistant')} :</span>
                        <RichText text={m.content} locale={locale} onNavigate={minimize} />
                        {!m.error && !(pending && m === msgs[msgs.length - 1]) && (
                          <div className="mt-1">
                            <SpeechButton
                              speech={{
                                playing: speech.state.id === m.id && speech.state.status === 'playing',
                                loading: speech.state.id === m.id && speech.state.status === 'loading',
                                onToggle: () => void speech.toggle(m.id, withoutLinks(m.content)),
                              }}
                              labels={{ listen: t('listen'), listenStop: t('listenStop'), listenLoading: t('listenLoading') }}
                            />
                            {speech.error?.id === m.id && (
                              <p role="status" className="mt-0.5 text-[12px] leading-snug text-night-600">
                                {speech.error.kind === 'limit' ? (
                                  <>
                                    {t('voiceLimit')}{' '}
                                    <Link href={signupPath(locale)} className="font-semibold text-iris-700 underline underline-offset-2">{t('voiceLimitCta')}</Link>
                                  </>
                                ) : t('voiceUnavailable')}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {!isCoach && m.actions?.length && !flow ? (
                      <div className="flex flex-wrap gap-2 pl-9">
                        {m.actions.map((a) => (
                          <button key={a} type="button" onClick={() => startFlow({ kind: a })} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-iris-600 px-3.5 text-[13.5px] font-bold text-white hover:bg-iris-700">
                            {a === 'rdv' ? <CalendarCheck className="h-4 w-4" aria-hidden /> : a === 'rappel' ? <PhoneCall className="h-4 w-4" aria-hidden /> : <UserRound className="h-4 w-4" aria-hidden />}
                            {t(a === 'rdv' ? 'agent.titleRdv' : a === 'rappel' ? 'agent.titleCallback' : 'agent.titleHuman')}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {!isCoach && m.cta && (
                      <div>
                        <Link href={signupPath(locale)} className="flex h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-iris-600 px-4 text-[15px] font-bold text-white shadow-[0_8px_20px_-10px_rgba(74,53,201,0.8)] hover:bg-iris-700">
                          {t('cta')}
                          <ArrowRight className="h-4 w-4" aria-hidden />
                        </Link>
                        <p className="mt-1.5 text-center text-[12px] text-night-500">{t('ctaNote')}</p>
                      </div>
                    )}
                  </div>
                ) : null,
              )}
            </div>
            {typing && (
              <div role="status" className="mt-3 flex items-center gap-2">
                <RobotMascot variant="head" size={30} />
                <div className="flex items-center gap-1 rounded-2xl rounded-tl-md bg-iris-50 px-3.5 py-3 ring-1 ring-iris-100">
                  <span className="sr-only">{t('typing')}</span>
                  {[0, 150, 300].map((d) => (
                    <span key={d} aria-hidden style={{ animationDelay: `${d}ms` }} className="h-2 w-2 rounded-full bg-iris-400 motion-safe:animate-bounce" />
                  ))}
                </div>
              </div>
            )}
            {!isCoach && flow && agent && (
              <AgentFlow
                key={`${flow.kind}-${flow.type ?? ''}-${flow.service ?? ''}`}
                start={flow}
                config={agent}
                locale={locale === 'en' || locale === 'pt' ? locale : 'fr'}
                phone={PHONE}
                whatsapp={WHATSAPP}
                onDone={endFlow}
                onClose={() => endFlow()}
                onSwitch={startFlow}
              />
            )}
            {!isCoach && flow && !agent && (
              agentFailed ? (
                <p role="alert" className="mt-3 rounded-xl bg-alert-50 px-3 py-2 text-[13.5px] text-alert-800">
                  {t('agent.unavailable')} <a className="font-semibold underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
                </p>
              ) : (
                <p role="status" className="mt-3 text-[13.5px] text-night-600">{t('agent.loadingSlots')}</p>
              )
            )}
            {!isCoach && lastBot && !pending && !flow && (
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
                  <button type="button" onClick={() => startFlow({ kind: 'rdv' })} className={cn(contactBtn, 'bg-white text-night-800 ring-night-200 hover:bg-night-50')}>
                    <CalendarCheck className="h-5 w-5 shrink-0 text-iris-600" aria-hidden />
                    {t('agent.titleRdv')}
                  </button>
                  <button type="button" onClick={() => startFlow({ kind: 'rappel' })} className={cn(contactBtn, 'bg-white text-night-800 ring-night-200 hover:bg-night-50')}>
                    <PhoneCall className="h-5 w-5 shrink-0 text-iris-600" aria-hidden />
                    {t('agent.titleCallback')}
                  </button>
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

          {outOfCredits ? (
            <div role="alert" className="shrink-0 border-t border-night-100 bg-gold-50 px-4 py-3 text-[13.5px] text-night-800">
              <p>{blocked ?? t('coach.noCredits')}</p>
              <Link href="/app/coach/credits" onClick={minimize} className="mt-2 flex h-11 items-center justify-center gap-2 rounded-2xl bg-iris-600 px-4 text-[14.5px] font-bold text-white hover:bg-iris-700">
                <Coins className="h-4 w-4" aria-hidden />
                {t('coach.recharge')}
              </Link>
            </div>
          ) : (
            <form
              className={cn('shrink-0 border-t border-night-100 bg-white px-3 pt-3', isCoach ? 'pb-3' : 'pb-[max(0.75rem,env(safe-area-inset-bottom))]')}
              onSubmit={(e) => {
                e.preventDefault()
                void send(input)
              }}
            >
              <p role="status" aria-live="polite" className={cn('text-[12.5px] font-semibold', dictation.listening ? 'mb-2 flex items-center gap-2 text-alert-600' : dictation.error ? 'mb-2 text-alert-700' : 'sr-only')}>
                {dictation.listening && <span aria-hidden className="h-2 w-2 rounded-full bg-alert-500 motion-safe:animate-pulse" />}
                {dictation.listening ? (dictation.interim ? `« ${dictation.interim} »` : t('listening')) : dictation.error ? t(dictation.error === 'denied' ? 'micDenied' : dictation.error === 'nothing' ? 'micNothing' : 'micError') : ''}
              </p>
              <div className="flex items-end gap-2">
                <label htmlFor={`${titleId}-input`} className="sr-only">{t('inputLabel')}</label>
                <textarea
                  ref={field}
                  id={`${titleId}-input`}
                  rows={1}
                  value={input}
                  maxLength={maxChars}
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
                {dictation.supported && (
                  <button
                    type="button"
                    onClick={dictation.toggle}
                    aria-pressed={dictation.listening}
                    aria-label={dictation.listening ? t('micStop') : t('mic')}
                    title={dictation.listening ? t('micStop') : t('mic')}
                    className={cn(
                      'grid h-11 w-11 shrink-0 place-items-center rounded-full ring-1 transition-colors',
                      dictation.listening ? 'bg-alert-500 text-white ring-alert-500 motion-safe:animate-pulse' : 'bg-iris-50 text-iris-700 ring-iris-200 hover:bg-iris-100',
                    )}
                  >
                    <Mic className="h-5 w-5" aria-hidden />
                  </button>
                )}
                <button
                  type="submit"
                  disabled={pending || !input.trim()}
                  aria-label={t('send')}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-iris-600 text-white shadow-md hover:bg-iris-700 disabled:opacity-50"
                >
                  <SendHorizontal className="h-5 w-5" aria-hidden />
                </button>
              </div>
              {isCoach ? (
                <p className="mt-2 text-center text-[11.5px] leading-snug text-night-500">
                  {t('coach.fullHint')}{' '}
                  <Link href="/app/coach/discussion" onClick={minimize} className="font-semibold text-iris-700 underline underline-offset-2">{t('coach.openFull')}</Link>
                  <span className="block">{t('coach.disclaimer')}</span>
                </p>
              ) : (
                <p className="mt-2 text-center text-[11.5px] leading-snug text-night-500">
                  {t('disclaimer')}{' '}
                  <Link href={localePath(locale, '/legal/confidentialite')} onClick={minimize} className="underline underline-offset-2">{t('privacy')}</Link>
                </p>
              )}
            </form>
          )}
        </div>
      )}
    </>
  )
}
