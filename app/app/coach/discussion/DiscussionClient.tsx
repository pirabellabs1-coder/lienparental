'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { ArrowLeft } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { CoachChat } from '@/components/coach/CoachChat'
import type { ChatMessage } from '@/components/coach/ChatBubble'
import type { ChatLogTurn } from '@/lib/ai/analyses'
import { btn } from '@/components/coach/ui'
import { loadAnalysis } from '@/components/coach/session'
import { mockCoachChat } from '@/lib/mock-data'
import { LIVE } from '@/lib/data/core'
import { intlLocale } from '@/lib/i18n/config'

type Props = { aiEnabled: boolean; initialQuestion?: string; analysisId?: string }

function toBubble(m: ChatLogTurn, i: number, locale: string): ChatMessage {
  const time = new Date(m.at).toLocaleTimeString(intlLocale(locale), { hour: '2-digit', minute: '2-digit' })
  return { id: `h${i}`, from: m.role === 'user' ? 'me' : 'ia', text: m.content, time: Number.isNaN(Date.parse(m.at)) ? '' : time }
}

export function DiscussionClient({ aiEnabled, initialQuestion, analysisId }: Props) {
  const t = useTranslations('coach.discussion')
  const router = useRouter()
  const locale = useLocale()
  // undefined = pas encore résolu (lecture du sessionStorage côté client).
  const [target, setTarget] = useState<{ analysisId?: string; title?: string; history?: ChatMessage[] } | undefined>(undefined)
  const [question] = useState(initialQuestion)

  useEffect(() => {
    if (initialQuestion) {
      setTarget({})
      // Retire ?q= de l'URL : un rechargement ne renverra pas la question.
      router.replace('/app/coach/discussion', { scroll: false })
      return
    }
    const last = loadAnalysis()
    const id = analysisId ?? (last && !last.id.startsWith('demo_') ? last.id : undefined)
    if (!id) return setTarget({})
    const title = id === last?.id ? last.title : undefined
    // Fil déjà échangé sur cette analyse (enregistré côté serveur) : réaffiché et renvoyé au Coach.
    let alive = true
    void fetch(`/api/coach/history?id=${encodeURIComponent(id)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { analysis?: { title?: string; messages?: ChatLogTurn[] } } | null) => {
        if (!alive) return
        const turns = body?.analysis?.messages ?? []
        setTarget({ analysisId: id, title: title ?? body?.analysis?.title, history: turns.map((m, i) => toBubble(m, i, locale)) })
      })
      .catch(() => { if (alive) setTarget({ analysisId: id, title }) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const aboutAnalysis = Boolean(target?.analysisId)
  const seed: ChatMessage[] = aboutAnalysis
    ? [{ id: 'greet', from: 'ia', local: true, time: '', text: target?.title ? t('aboutAnalysisTitled', { title: target.title }) : t('aboutAnalysis') }, ...(target?.history ?? [])]
    : !aiEnabled && !question && !LIVE
      ? mockCoachChat.map((m) => ({ ...m, local: true }))
      : [{ id: 'greet', from: 'ia', local: true, time: '', text: t('greeting') }]

  return (
    <>
      <TopBar
        title={aboutAnalysis || (!question && !aiEnabled && !LIVE) ? t('titleAnalysis') : t('titleCoach')}
        subtitle={aboutAnalysis ? t('subtitleAnalysis') : t('subtitleCoach')}
        showBack
        backHref={aboutAnalysis ? '/app/coach/reponse' : '/app'}
        showBell={false}
      />

      <div className="w-full px-4 pb-6 pt-4">
        {target === undefined ? (
          <div className="h-24 animate-pulse rounded-xl2 bg-night-50" aria-busy="true" />
        ) : (
          <CoachChat
            key={target.analysisId ?? 'assistant'}
            aiEnabled={aiEnabled}
            analysisId={target.analysisId}
            initialQuestion={question}
            seed={seed}
            inputLabel={aboutAnalysis ? t('inputAnalysis') : t('inputCoach')}
            conversationLabel={t('conversationLabel')}
            persistKey={aboutAnalysis || question ? undefined : 'discussion'}
          />
        )}

        {aboutAnalysis ? (
          <Link href="/app/coach/reponse" className={`${btn.secondary} mt-4`}>
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            {t('backToResponse')}
          </Link>
        ) : (
          <Link href="/app/coach/assistant" className={`${btn.secondary} mt-4`}>
            {t('seeSuggestions')}
          </Link>
        )}
      </div>
    </>
  )
}
