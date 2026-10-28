import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { localePathFor } from '@/lib/i18n/routing'
import { ArrowRight, Smartphone } from 'lucide-react'
import { cn } from '@/lib/cn'
import { CONTAINER } from './ui'

const STEPS = [1, 2, 3] as const

// Bandeau horizontal de la maquette : message PWA à gauche, 3 étapes numérotées à droite.
export async function Pwa() {
  const t = await getTranslations('pwa')
  const lp = localePathFor(await getLocale())
  return (
    <section aria-labelledby="pwa-title" className="py-6 lg:py-8">
      <div className={CONTAINER}>
        <div className="grid grid-cols-1 gap-8 rounded-[28px] bg-[#F3F8F3] p-6 ring-1 ring-leaf-100 sm:p-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)] lg:items-center lg:gap-10 lg:p-10">
          <div className="flex items-start gap-4">
            <span aria-hidden className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-leaf-500 text-white">
              <Smartphone className="h-7 w-7" strokeWidth={1.75} />
            </span>
            <div>
              <h2 id="pwa-title" className="text-[22px] font-extrabold leading-tight tracking-[-0.02em] text-night-900 lg:text-[24px]">{t('title')}</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-night-700">
                {t('lead')}
              </p>
              <Link href={lp('/installer')} className="mt-2 inline-flex min-h-[44px] items-center gap-2 rounded-lg text-[15px] font-semibold text-leaf-600 hover:text-leaf-700">
                {t('guideLink')}<ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>

          <ol className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {STEPS.map(n => (
              <li key={n} className={cn('flex gap-3.5 rounded-2xl bg-white p-4 ring-1 ring-[#E5E7EB] sm:flex-col sm:gap-3')}>
                <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-leaf-500 text-[15px] font-bold text-white">{n}</span>
                <div>
                  <h3 className="text-[15px] font-bold leading-snug text-night-900"><span className="sr-only">{t('stepPrefix', { n })}</span>{t(`step${n}Title`)}</h3>
                  <p className="mt-1 text-[14px] leading-snug text-night-700">{t(`step${n}Text`)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
