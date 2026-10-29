'use client'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/cn'

/**
 * Onboarding steps, in order: welcome carousel 1-4, connexion or inscription 5 (two alternative routes),
 * verification 6, profil 7, enfant 8, recap 9, coparent 10, pret 11.
 */
export const ONBOARDING_TOTAL_STEPS = 11

type Props = {
  /** Current step (1-based). */
  current: number
  total?: number
  /** Number of visual dots (mockup shows 4). The last dot stays active past that step. */
  dots?: number
  /** Hide the "n / total" counter (e.g. for sub-flows). */
  hideCounter?: boolean
  /** Dot colour for the active step. */
  tone?: 'leaf' | 'night'
  className?: string
}

/**
 * Onboarding progress — small dots bottom-left (current = green) and "n / total" bottom-right,
 * as in the mockups. Visual dots are decorative; the counter carries the accessible text.
 */
export function ProgressDots({ current, total = ONBOARDING_TOTAL_STEPS, dots = 4, hideCounter = false, tone = 'leaf', className }: Props) {
  const t = useTranslations('onb')
  const safe = Math.min(Math.max(current, 1), total)
  const activeDot = Math.min(safe, dots)
  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      <div className="flex items-center gap-1.5" aria-hidden="true">
        {Array.from({ length: dots }).map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-1.5 w-1.5 rounded-full transition-colors duration-300 motion-reduce:transition-none',
              i + 1 === activeDot ? (tone === 'leaf' ? 'bg-leaf-500' : 'bg-night-900') : 'bg-night-100',
            )}
          />
        ))}
      </div>
      {hideCounter ? (
        <span className="sr-only">
          {t('step', { step: safe, total })}
        </span>
      ) : (
        <p className="text-xs font-semibold tabular-nums text-night-600">
          <span aria-hidden="true">
            {safe} / {total}
          </span>
          <span className="sr-only">
            {t('step', { step: safe, total })}
          </span>
        </p>
      )}
    </div>
  )
}
