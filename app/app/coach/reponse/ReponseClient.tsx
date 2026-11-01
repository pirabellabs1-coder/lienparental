'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Archive, ClipboardCopy, Check, MessageSquare, RefreshCw } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { RobotMascot } from '@/components/coach/RobotMascot'
import { SpeechButton } from '@/components/coach/SpeechButton'
import { useCoachVoice } from '@/components/coach/useCoachVoice'
import { btn, DemoNote, LegalNote, ScreenTitle } from '@/components/coach/ui'
import { clearAnalysis, clearDraft, loadAnalysis, saveAnalysis, type CoachAnalysisSession } from '@/components/coach/session'
import { errorMessage } from '@/components/coach/sse-client'
import { mockCoachAnalysis } from '@/lib/mock-data'
import { LIVE } from '@/lib/data/core'

const DEMO_SESSION: CoachAnalysisSession = {
  id: 'demo_static',
  title: 'Capture d’écran WhatsApp',
  kind: 'capture',
  demo: true,
  result: {
    type_contenu: 'capture_conversation',
    texte_lu: '',
    ton: 28,
    agressivite: 72,
    mots_blessants: [],
    clarte: 45,
    respect: 30,
    impact: mockCoachAnalysis.about[1] ?? '',
    resume: '',
    nature_reponse: 'reponse_suggeree',
    reformulation: mockCoachAnalysis.proposal,
    conseils: [],
  },
}

const isLocalId = (id: string) => id.startsWith('demo_')

export function ReponseClient({ id }: { id?: string }) {
  const t = useTranslations('coach.response')
  const tc = useTranslations('coach.common')
  const tchat = useTranslations('coach.chat')
  const voice = useCoachVoice()
  const router = useRouter()
  const [session, setSession] = useState<CoachAnalysisSession | null>(null)
  const [loadError, setLoadError] = useState('')
  const [copied, setCopied] = useState(false)
  const [archived, setArchived] = useState(false)
  const [status, setStatus] = useState('')
  const [empty, setEmpty] = useState(false)

  useEffect(() => {
    const local = loadAnalysis()
    if (!id || local?.id === id) {
      // Compte réel sans analyse en cours : état vide (jamais l'analyse d'exemple).
      if (!local && LIVE) setEmpty(true)
      else setSession(local ?? DEMO_SESSION)
      return
    }
    let cancelled = false
    fetch(`/api/coach/history?id=${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await errorMessage(res, t('notFound'), { sessionExpired: tc('errors.sessionExpired'), tooLarge: tc('errors.tooLarge') }))
        const body = (await res.json()) as { analysis: { id: string; title: string; kind: CoachAnalysisSession['kind']; demo: boolean; archived: boolean; result: CoachAnalysisSession['result'] } }
        if (cancelled) return
        const s: CoachAnalysisSession = { id: body.analysis.id, title: body.analysis.title, kind: body.analysis.kind, demo: body.analysis.demo, result: body.analysis.result }
        saveAnalysis(s)
        setArchived(body.analysis.archived)
        setSession(s)
      })
      .catch((e: Error) => !cancelled && setLoadError(e.message))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2500)
    return () => window.clearTimeout(timer)
  }, [copied])

  if (loadError) {
    return (
      <>
        <TopBar title={t('topTitle')} showBack backHref="/app/coach/historique" showBell={false} />
        <div className="w-full px-5 pt-8">
          <p role="alert" className="rounded-xl2 border border-alert-200 bg-alert-50 p-4 text-[13.5px] text-night-900">
            {loadError}
          </p>
          <Link href="/app/coach/historique" className={`${btn.secondary} mt-4`}>
            {t('backToHistory')}
          </Link>
        </div>
      </>
    )
  }

  if (empty) {
    return (
      <>
        <TopBar title={t('topTitle')} showBack backHref="/app/coach" showBell={false} />
        <div className="w-full px-5 pt-8">
          <ScreenTitle title={t('emptyTitle')} subtitle={t('emptySubtitle')} />
          <Link href="/app/coach" className={`${btn.primary} mt-6`}>
            {t('analyzeContent')}
          </Link>
          <Link href="/app/coach/historique" className={`${btn.secondary} mt-3`}>
            {t('seeHistory')}
          </Link>
        </div>
      </>
    )
  }

  if (!session) {
    return (
      <>
        <TopBar title={t('topTitle')} showBack backHref="/app/coach" showBell={false} />
        <div className="w-full px-5 pt-10" aria-busy="true">
          <div className="mx-auto h-6 w-48 animate-pulse rounded bg-night-50" />
          <div className="mt-6 h-40 animate-pulse rounded-xl2 bg-night-50" />
        </div>
      </>
    )
  }

  const r = session.result
  const proposalTitle = r.nature_reponse === 'reformulation' ? t('rephrased') : t('proposed')
  const hasProposal = r.nature_reponse !== 'aucune' && r.reformulation.trim().length > 0

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(r.reformulation)
      setCopied(true)
      setStatus(t('copiedStatus'))
    } catch {
      setStatus(t('copyFailed'))
    }
  }

  const archive = async () => {
    if (archived) return
    if (isLocalId(session.id)) {
      setArchived(true)
      setStatus(t('archivedStatus'))
      return
    }
    const res = await fetch('/api/coach/history', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: session.id, archived: true }),
    }).catch(() => null)
    if (res?.ok) {
      setArchived(true)
      setStatus(t('archivedStatus'))
    } else {
      setStatus(res ? await errorMessage(res, t('archiveFailed'), { sessionExpired: tc('errors.sessionExpired'), tooLarge: tc('errors.tooLarge') }) : t('connectionFailed'))
    }
  }

  const about = [t(`types.${r.type_contenu}`), r.resume, r.impact].filter((p) => p && p.trim())
  const discussHref = isLocalId(session.id) ? '/app/coach/discussion' : `/app/coach/discussion?analysis=${encodeURIComponent(session.id)}`

  return (
    <>
      <TopBar title={t('topTitle')} showBack backHref="/app/coach" showBell={false} />

      <div className="w-full px-5 pb-8 pt-3">
        <ScreenTitle title={t('title')} subtitle={t('subtitle')} />
        {session.demo && <DemoNote className="mt-3" />}

        {hasProposal && (
          <section aria-labelledby="proposal-title" className="mt-6 rounded-xl2 bg-night-50/70 p-4">
            <div className="flex items-center gap-2.5">
              <RobotMascot variant="head" size={28} />
              <h3 id="proposal-title" className="text-[14px] font-bold text-leaf-600">
                {proposalTitle}
              </h3>
            </div>
            <p className="mt-3 whitespace-pre-line text-[13.5px] leading-[1.7] text-night-900">{r.reformulation}</p>
            <div className="mt-2">
              <SpeechButton
                speech={{
                  playing: voice.state.id === 'proposal' && voice.state.status === 'playing',
                  loading: voice.state.id === 'proposal' && voice.state.status === 'loading',
                  onToggle: () => void voice.toggle('proposal', r.reformulation),
                }}
                labels={{ listen: tchat('listen'), listenStop: tchat('listenStop'), listenLoading: tchat('listenLoading') }}
              />
              {voice.error && <p role="status" className="mt-1 text-[11px] leading-snug text-night-600">{tchat('voiceUnavailable')}</p>}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={copy}
                className="inline-flex h-11 items-center justify-center gap-3 rounded-xl border border-night-100 bg-white text-[13px] font-semibold text-night-900 shadow-soft hover:border-iris-200"
              >
                {copied ? t('copied') : t('copy')}
                {copied ? <Check className="h-[18px] w-[18px] text-leaf-500" aria-hidden="true" /> : <ClipboardCopy className="h-[18px] w-[18px] text-iris-500" aria-hidden="true" />}
              </button>
              <button
                type="button"
                onClick={archive}
                aria-pressed={archived}
                className="inline-flex h-11 items-center justify-center gap-3 rounded-xl border border-night-100 bg-white text-[13px] font-semibold text-night-900 shadow-soft hover:border-iris-200"
              >
                {archived ? t('archived') : t('archive')}
                {archived ? <Check className="h-[18px] w-[18px] text-leaf-500" aria-hidden="true" /> : <Archive className="h-[18px] w-[18px] text-iris-500" aria-hidden="true" />}
              </button>
            </div>
          </section>
        )}
        <p role="status" aria-live="polite" className="sr-only">
          {status}
        </p>

        <section aria-labelledby="scores-title" className="mt-3 rounded-xl2 bg-night-50/70 p-4">
          <h3 id="scores-title" className="text-[14px] font-bold text-night-900">
            {t('scoresTitle')}
          </h3>
          <ul className="mt-3 space-y-3">
            <Score label={t('scores.calm')} value={r.ton} />
            <Score label={t('scores.aggressiveness')} value={r.agressivite} inverse />
            <Score label={t('scores.clarity')} value={r.clarte} />
            <Score label={t('scores.respect')} value={r.respect} />
          </ul>
          {r.mots_blessants.length > 0 && (
            <div className="mt-4">
              <h4 className="text-[13px] font-bold text-night-900">{t('hurtfulWords')}</h4>
              <ul className="mt-2 flex flex-wrap gap-2">
                {r.mots_blessants.map((m) => (
                  <li key={m} className="rounded-lg bg-alert-50 px-2.5 py-1 text-[12.5px] text-alert-700">
                    {t('quoted', { word: m })}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {about.length > 0 && (
          <section aria-labelledby="about-title" className="mt-3 rounded-xl2 bg-night-50/70 p-4">
            <h3 id="about-title" className="text-[14px] font-bold text-night-900">
              {t('aboutTitle')}
            </h3>
            <div className="mt-3 space-y-3 text-[13.5px] leading-[1.7] text-night-800">
              {about.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
            {r.texte_lu.trim() && (
              <details className="mt-3 rounded-xl bg-white px-3 py-2">
                <summary className="min-h-[44px] cursor-pointer py-2.5 text-[13px] font-semibold text-night-900">{t('recognizedText')}</summary>
                <p className="whitespace-pre-line pb-2 text-[12.5px] leading-relaxed text-night-700">{r.texte_lu}</p>
              </details>
            )}
          </section>
        )}

        {r.conseils.length > 0 && (
          <section aria-labelledby="tips-title" className="mt-3 rounded-xl2 bg-leaf-50 p-4">
            <h3 id="tips-title" className="text-[14px] font-bold text-leaf-700">
              {t('tips')}
            </h3>
            <ul className="mt-2 space-y-1.5 text-[13.5px] leading-relaxed text-night-800">
              {r.conseils.map((c) => (
                <li key={c} className="flex gap-2.5">
                  <span aria-hidden="true" className="mt-[10px] h-1 w-1 shrink-0 rounded-full bg-leaf-600" />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-6 space-y-3.5">
          <Link href={discussHref} className={btn.primary}>
            <MessageSquare className="h-5 w-5" aria-hidden="true" />
            {t('ask')}
          </Link>
          <button
            type="button"
            onClick={() => {
              clearDraft()
              clearAnalysis()
              router.push('/app/coach')
            }}
            className={btn.secondary}
          >
            <RefreshCw className="h-5 w-5" aria-hidden="true" />
            {t('newAnalysis')}
          </button>
        </div>

        <LegalNote className="mt-5" />
      </div>
    </>
  )
}

function Score({ label, value, inverse = false }: { label: string; value: number; inverse?: boolean }) {
  const t = useTranslations('coach.response')
  const v = Math.max(0, Math.min(100, Math.round(value)))
  const good = inverse ? v <= 35 : v >= 65
  const bad = inverse ? v >= 65 : v <= 35
  return (
    <li>
      <div className="flex items-center justify-between text-[13px]" aria-hidden="true">
        <span className="text-night-800">{label}</span>
        <span className="font-bold tabular-nums text-night-900">{v}/100</span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={v}
        aria-valuetext={t('scoreValueText', { value: v })}
        className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-night-100"
      >
        <div className={good ? 'h-full rounded-full bg-leaf-500' : bad ? 'h-full rounded-full bg-alert-400' : 'h-full rounded-full bg-gold-400'} style={{ width: `${v}%` }} />
      </div>
    </li>
  )
}
