'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ArrowLeft } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { CoachChat } from '@/components/coach/CoachChat'
import type { ChatMessage } from '@/components/coach/ChatBubble'
import { btn } from '@/components/coach/ui'
import { loadAnalysis } from '@/components/coach/session'
import { mockCoachChat } from '@/lib/mock-data'
import { LIVE } from '@/lib/data/core'

type Props = { aiEnabled: boolean; initialQuestion?: string; analysisId?: string }

export function DiscussionClient({ aiEnabled, initialQuestion, analysisId }: Props) {
  const t = useTranslations('coach.discussion')
  const router = useRouter()
  // undefined = pas encore résolu (lecture du sessionStorage côté client).
  const [target, setTarget] = useState<{ analysisId?: string; title?: string } | undefined>(undefined)
  const [question] = useState(initialQuestion)

  useEffect(() => {
    if (initialQuestion) {
      setTarget({})
      // Retire ?q= de l'URL : un rechargement ne renverra pas la question.
      router.replace('/app/coach/discussion', { scroll: false })
      return
    }
    if (analysisId) return setTarget({ analysisId })
    const last = loadAnalysis()
    setTarget(last && !last.id.startsWith('demo_') ? { analysisId: last.id, title: last.title } : {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const aboutAnalysis = Boolean(target?.analysisId)
  const seed: ChatMessage[] = aboutAnalysis
    ? [{ id: 'greet', from: 'ia', local: true, time: '', text: target?.title ? t('aboutAnalysisTitled', { title: target.title }) : t('aboutAnalysis') }]
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
