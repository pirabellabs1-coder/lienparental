import { getTranslations } from 'next-intl/server'
import { TopBar } from '@/components/mobile/TopBar'
import { CoachChat } from '@/components/coach/CoachChat'
import { RobotMascot } from '@/components/coach/RobotMascot'
import { AI_ENABLED } from '@/lib/supabase/config'

export async function generateMetadata() {
  const t = await getTranslations('coach.assistant')
  return { title: t('title') }
}

const SUGGESTIONS = ['month', 'jaf', 'custody', 'owed'] as const

// Assistant général : questions libres sur l'espace du parent (base de connaissances).
export default async function CoachAssistantPage() {
  const t = await getTranslations('coach.assistant')
  return (
    <>
      <TopBar title={t('title')} showBack backHref="/app/coach" showBell={false} />
      <div className="w-full px-4 pb-8 pt-3">
        <div className="flex items-center gap-3 rounded-xl2 bg-iris-50 p-4">
          <RobotMascot variant="head" size={44} />
          <p className="text-[13px] leading-relaxed text-night-800">
            {t('intro')}
          </p>
        </div>
        <div className="mt-5">
          <CoachChat
            aiEnabled={AI_ENABLED}
            suggestions={SUGGESTIONS.map((k) => t(`suggestions.${k}`))}
            seed={[{ id: 'greet', from: 'ia', local: true, time: '', text: t('greeting') }]}
            inputLabel={t('inputLabel')}
            placeholder={t('placeholder')}
            conversationLabel={t('conversationLabel')}
            persistKey="assistant"
          />
        </div>
      </div>
    </>
  )
}
