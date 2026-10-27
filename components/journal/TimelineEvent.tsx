import Link from 'next/link'
import { cn } from '@/lib/cn'
import { JournalTypeIcon } from './journalTypes'
import { fmtMonthShort, fmtPlage, parseDay, type JournalItem } from './journalData'
import { fluxOf } from '@/lib/journal-finances'
import { useFinanceLabels } from './financeLabels'

type Props = {
  entry: JournalItem
  isLast?: boolean
  className?: string
}

/** Ligne de la chronologie : date | icône sur rail vertical | titre, horaire, résumé. */
export function TimelineEvent({ entry, isLast = false, className }: Props) {
  const fl = useFinanceLabels()
  const day = parseDay(entry.date)
  const plage = fmtPlage(entry, fl.locale)
  return (
    <li className={cn('relative', className)}>
      <Link
        href={`/app/journal/${entry.id}`}
        className="group grid grid-cols-[2.25rem_2.75rem_1fr] gap-x-3 rounded-xl py-1 pr-1 transition-colors hover:bg-night-50/40"
      >
        <span className="pt-1 text-center leading-none text-night-900">
          <span className="block text-[15px] font-extrabold tabular-nums">{String(day.getUTCDate()).padStart(2, '0')}</span>
          <span className="mt-1 block text-[10px] font-bold text-night-700">{fmtMonthShort(day, fl.locale)}</span>
        </span>

        <span className="relative flex justify-center" aria-hidden="true">
          {!isLast && <span className="absolute bottom-[-0.5rem] top-11 w-px bg-night-100" />}
          <JournalTypeIcon type={entry.type} size="md" className="relative ring-4 ring-white" />
        </span>

        <span className={cn('min-w-0', isLast ? 'pb-3' : 'pb-6')}>
          <span className="block text-[13px] font-bold text-night-900">
            {entry.title}
            <span className="sr-only"> ({fl.type(entry.type)})</span>
          </span>
          {entry.depense ? (
            <span className="mt-1 block text-xs text-night-700">
              <span className="font-semibold tabular-nums text-night-900">
                {fluxOf(entry.depense) === 'entree' && <span className="text-leaf-700">+</span>}
                {fl.money(entry.depense.montantCents, entry.depense.devise)}
              </span>
              {' · '}{fl.category(entry.depense.categorie)}
            </span>
          ) : (
            plage && <span className="mt-1 block text-xs tabular-nums text-night-700">{plage}</span>
          )}
          {entry.description && (
            <span className="mt-1.5 line-clamp-2 block text-xs leading-relaxed text-night-600">{entry.description}</span>
          )}
        </span>
      </Link>
    </li>
  )
}
