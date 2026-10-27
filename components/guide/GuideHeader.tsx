import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ArrowLeft } from 'lucide-react'
import { TerritorySelect } from './TerritorySelect'
import type { Territoire } from '@/lib/guide/types'

type Props = {
  territoire: Territoire
  territoires: Territoire[]
  /** Lien de retour (écrans secondaires). */
  back?: { href: string; label: string }
}

// En-tête commun du Guide : retour éventuel + bandeau « Territoire ».
export function GuideHeader({ territoire, territoires, back }: Props) {
  const t = useTranslations('coach.guide')
  return (
    <div style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}>
      <div className="flex min-h-[44px] items-center justify-between gap-3">
        {back ? (
          <Link
            href={back.href}
            className="-ml-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-2 text-[14px] font-semibold text-night-900 hover:bg-night-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500"
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            {back.label}
          </Link>
        ) : (
          <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-leaf-700">{t('title')}</span>
        )}
        <TerritorySelect current={territoire} territoires={territoires} />
      </div>
    </div>
  )
}
