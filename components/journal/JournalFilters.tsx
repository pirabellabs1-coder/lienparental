import Link from 'next/link'
import { cn } from '@/lib/cn'
import { useTranslations } from 'next-intl'
import { JOURNAL_FILTERS, type JournalFilter } from '@/lib/journal-finances'

/** URL d'un filtre du Journal (`?filtre=`), « Tous » = URL nue. */
export function journalFilterHref(basePath: string, filter: JournalFilter): string {
  return filter === 'tous' ? basePath : `${basePath}?filtre=${filter}`
}

/**
 * Filtres du Journal : Tous | Visites | Appels | Messages | Santé | Finances | Autres.
 * Ce sont des liens (le filtre vit dans l'URL : partageable, fonctionne sans JS) ;
 * l'état courant est exposé par `aria-current` en plus de la couleur.
 */
export function JournalFilters({ basePath, value, className }: { basePath: string; value: JournalFilter; className?: string }) {
  const t = useTranslations('family.finances.labels')
  return (
    <nav aria-label={t('filterJournal')} className={cn('-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)}>
      <ul className="flex gap-2 pb-1">
        {JOURNAL_FILTERS.map((f) => {
          const active = value === f
          return (
            <li key={f} className="shrink-0">
              <Link
                href={journalFilterHref(basePath, f)}
                replace
                scroll={false}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'flex h-11 items-center whitespace-nowrap rounded-lg px-4 text-xs font-semibold transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2',
                  active ? 'bg-leaf-500 text-white shadow-soft' : 'border border-night-100 bg-white text-night-800 hover:bg-night-50',
                )}
              >
                {t(`filters.${f}`)}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
