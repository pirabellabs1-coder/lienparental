'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { locales, LOCALE_META, type Locale } from '@/lib/i18n/config'
import { setLocale } from '@/lib/i18n/actions'
import { Flag } from './Flags'
import { cn } from '@/lib/cn'

/**
 * Sélecteur de langue FR / EN / PT (drapeaux circulaires + code).
 * Mémorise le choix dans le cookie lp_locale puis rafraîchit la page serveur
 * pour re-rendre tout le contenu dans la nouvelle langue.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const active = useLocale() as Locale
  const t = useTranslations('lang')
  const router = useRouter()
  const [pending, start] = useTransition()

  const pick = (loc: Locale) => {
    if (loc === active || pending) return
    start(async () => {
      await setLocale(loc)
      router.refresh()
    })
  }

  return (
    <div role="group" aria-label={t('label')} className={cn('flex items-center gap-1', className)}>
      {locales.map((loc) => {
        const meta = LOCALE_META[loc]
        const isActive = loc === active
        return (
          <button
            key={loc}
            type="button"
            onClick={() => pick(loc)}
            disabled={pending}
            aria-pressed={isActive}
            aria-label={isActive ? t('current', { name: meta.native }) : t('switchTo', { name: meta.native })}
            className="group flex flex-col items-center gap-0.5 rounded-lg px-1 py-0.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 disabled:cursor-wait"
          >
            {/* Pastille compacte (plus petite que le logo) : contour vert si sélectionnée, gris léger sinon. */}
            <span className={cn(
              'h-[22px] w-[22px] overflow-hidden rounded-full ring-offset-1 ring-offset-white transition-all duration-200',
              isActive
                ? 'ring-2 ring-leaf-500 shadow-[0_4px_9px_-4px_rgba(76,175,80,0.6)]'
                : 'ring-1 ring-night-200 group-hover:ring-night-300',
            )}>
              <Flag flag={meta.flag} />
            </span>
            <span className={cn('text-[9px] font-bold leading-none tracking-wide', isActive ? 'text-leaf-600' : 'text-night-500')}>{meta.code}</span>
          </button>
        )
      })}
    </div>
  )
}
