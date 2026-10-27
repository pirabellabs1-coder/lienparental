import { useTranslations } from 'next-intl'
import { Check, Lock } from 'lucide-react'
import { cn } from '@/lib/cn'
import { card } from '@/components/ui/kit'

// Libellés : family.coparents.scope.shared.<clé> / private.<clé> (traduits au rendu).
const SHARED = ['profile', 'health', 'calendar', 'documents', 'expenses'] as const
const PRIVATE = ['journal', 'coach', 'testimonies', 'unshared'] as const

/** Rappel clair de ce que voit un adulte lié, et de ce qui ne quitte jamais votre espace. */
export function SharedScope({ className, compact = false }: { className?: string; compact?: boolean }) {
  const t = useTranslations('family.coparents.scope')
  const strong = (chunks: React.ReactNode) => <strong className="font-semibold text-night-800">{chunks}</strong>
  return (
    <section aria-labelledby="scope-title" className={cn(card, 'p-4', className)}>
      <h2 id="scope-title" className="text-[15px] font-bold text-night-900">{t('title')}</h2>
      {!compact && (
        <p className="mt-1 text-[13px] text-night-600">
          {t.rich('intro', { strong })}
        </p>
      )}
      <ul className="mt-3 space-y-2">
        {SHARED.map((s) => (
          <li key={s} className="flex gap-2.5 text-[13px] text-night-800">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" aria-hidden="true" strokeWidth={2.6} />
            {t(`shared.${s}`)}
          </li>
        ))}
      </ul>
      <h3 className="mt-4 text-[14px] font-bold text-night-900">{t('alwaysPrivate')}</h3>
      <ul className="mt-2 space-y-2">
        {PRIVATE.map((s) => (
          <li key={s} className="flex gap-2.5 text-[13px] text-night-800">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-night-600" aria-hidden="true" />
            {t(`private.${s}`)}
          </li>
        ))}
      </ul>
    </section>
  )
}
