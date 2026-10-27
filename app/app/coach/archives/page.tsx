import { getTranslations } from 'next-intl/server'
import { TopBar } from '@/components/mobile/TopBar'
import { AnalysisList } from '@/components/coach/AnalysisList'
import { toListItem, type CoachListItem } from '@/components/coach/history-items'
import { getCurrentUser } from '@/lib/auth/session'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { listAnalyses } from '@/lib/ai/analyses'
import { mockCoachArchives } from '@/lib/mock-data'

export const dynamic = 'force-dynamic'

// M09 — Archives des analyses Coach IA (maquette 12.12.07 (3)).
export default async function CoachArchivesPage() {
  const t = await getTranslations('coach.archives')
  const user = await getCurrentUser()
  const real = user ? (await listAnalyses(user, true).catch(() => [])).map(toListItem) : []
  const items: CoachListItem[] = SUPABASE_ENABLED ? real : [...real, ...mockCoachArchives.map((m) => ({ ...m, remote: false }))]

  return (
    <>
      <TopBar title={t('title')} showBack backHref="/app/coach" showBell={false} />
      <div className="w-full px-4 pb-8">
        <p className="mx-auto -mt-1 max-w-[240px] text-center text-[13px] leading-relaxed text-night-700">
          {t('intro')}
        </p>
        <div className="mt-5">
          <AnalysisList initialItems={items} mode="archives" />
        </div>
      </div>
    </>
  )
}
