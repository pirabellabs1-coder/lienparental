import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/cn'

type Props = {
  steps: string[]
  /** Index 1-based de l'étape courante. */
  current: number
  tone?: 'leaf' | 'iris'
  className?: string
}

/**
 * Indicateur d'étapes numérotées relié par des pointillés (maquette « Ajouter un document »).
 * Étape courante : pastille pleine + libellé en couleur ; étapes passées : coche.
 */
export function Stepper({ steps, current, tone = 'leaf', className }: Props) {
  const t = useTranslations('vault.ui.stepper')
  const solid = tone === 'leaf' ? 'bg-leaf-500 text-white ring-leaf-100' : 'bg-iris-500 text-white ring-iris-100'
  const done = tone === 'leaf' ? 'bg-leaf-50 text-leaf-600 border-leaf-200' : 'bg-iris-50 text-iris-600 border-iris-200'
  const label = tone === 'leaf' ? 'text-leaf-600' : 'text-iris-600'
  const dots = tone === 'leaf' ? 'border-leaf-300' : 'border-iris-300'

  return (
    <nav aria-label={t('label')} className={className}>
      <ol className="flex items-start">
        {steps.map((s, i) => {
          const n = i + 1
          const state = n < current ? 'done' : n === current ? 'current' : 'todo'
          return (
            <li key={s} className="relative flex flex-1 flex-col items-center" aria-current={state === 'current' ? 'step' : undefined}>
              {i > 0 && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute top-[14px] border-t-2 border-dotted',
                    n <= current ? dots : 'border-night-200',
                  )}
                  style={{ left: 'calc(-50% + 20px)', right: 'calc(50% + 20px)' }}
                />
              )}
              <span
                className={cn(
                  'relative z-10 flex h-[30px] w-[30px] items-center justify-center rounded-full text-[13px] font-bold',
                  state === 'current' && cn(solid, 'ring-4'),
                  state === 'done' && cn(done, 'border'),
                  state === 'todo' && 'border border-night-200 bg-white text-night-500',
                )}
              >
                {state === 'done' ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" /> : n}
              </span>
              <span className={cn('mt-1.5 text-[11px] font-semibold', state === 'current' ? label : 'text-night-400')}>
                {s}
                <span className="sr-only">{state === 'done' ? t('done') : state === 'current' ? t('current') : ''}</span>
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
