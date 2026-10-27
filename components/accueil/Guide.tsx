import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { ArrowRight, Check } from 'lucide-react'
import { PhoneFrame } from '@/components/home/PhoneFrame'
import { cn } from '@/lib/cn'
import { TERRITORIES, TerritoryShape } from '@/components/site/territories'
import { BTN_PRIMARY, CONTAINER, H2, LEAD, SECTION } from './ui'

/** Nombre réel de fiches publiées pour la Guyane (lu au rendu serveur, jamais codé en dur). */
function countGuyaneSheets(): number {
  try {
    return readdirSync(join(process.cwd(), 'content', 'guide', 'guyane', 'fiches')).filter(f => f.endsWith('.json')).length
  } catch {
    return 0
  }
}

export async function Guide() {
  const t = await getTranslations('guide')
  const sheets = countGuyaneSheets()
  const POINTS = [
    sheets > 0 ? t('pointSheets', { count: sheets }) : t('pointSheetsNoCount'),
    t('point2'),
    t('point3'),
  ]
  return (
    <section id="guide" aria-labelledby="guide-title" className={cn(SECTION, 'bg-[#F4F6F9]')}>
      <div className={cn(CONTAINER, 'grid grid-cols-1 items-center gap-14 lg:grid-cols-[1fr_auto] lg:gap-20 [&>*]:min-w-0')}>
        <div>
          <h2 id="guide-title" className={H2}>{t('title')}</h2>
          <p className={cn(LEAD, 'mt-4 max-w-[52ch]')}>
            {t('lead')}
          </p>
          <ul className="mt-7 space-y-3.5">
            {POINTS.map(p => (
              <li key={p} className="flex items-start gap-3 text-[16px] text-night-800">
                <span aria-hidden className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-leaf-50 text-leaf-600"><Check className="h-3.5 w-3.5" strokeWidth={2.5} /></span>
                {p}
              </li>
            ))}
          </ul>

          <h3 className="mt-10 text-[15px] font-bold text-night-900">{t('territoryTitle')}</h3>
          <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {TERRITORIES.map(terr => (
              <li key={terr.code} className={cn('flex items-center gap-3 rounded-2xl p-3 ring-1', terr.available ? 'bg-leaf-50 ring-leaf-300' : 'bg-white ring-[#E5E7EB]')}>
                <TerritoryShape path={terr.path} available={terr.available} className="h-10 w-10 shrink-0" />
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="text-[14.5px] font-semibold text-night-900">{terr.name}</span>
                  <span className={cn('mt-0.5 text-[13.5px]', terr.available ? 'font-semibold text-leaf-700' : 'text-night-600')}>{terr.available ? t('available') : t('soon')}</span>
                </span>
              </li>
            ))}
          </ul>

          <Link href="/app/guide" className={cn(BTN_PRIMARY, 'mt-10')}>
            {t('cta')}<ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        <PhoneFrame
          src="/images/app/mobile-guide.png"
          alt={t('phoneAlt')}
          sizes="260px"
          className="mx-auto w-[220px] lg:w-[260px]"
        />
      </div>
    </section>
  )
}
