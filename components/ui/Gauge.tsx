import { cn } from '@/lib/cn'

type Props = {
  value: number
  max?: number
  label?: string
  description?: string
  showPercent?: boolean
  warningAt?: number
  dangerAt?: number
  className?: string
}

export function Gauge({ value, max = 100, label, description, showPercent = true, warningAt = 80, dangerAt = 100, className }: Props) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  const level: 'ok' | 'warn' | 'danger' = pct >= dangerAt ? 'danger' : pct >= warningAt ? 'warn' : 'ok'

  const barColor = level === 'danger' ? 'bg-alert-500' : level === 'warn' ? 'bg-gold-300' : 'bg-leaf-500'
  const textColor = level === 'danger' ? 'text-alert-500' : level === 'warn' ? 'text-gold-500' : 'text-night-700 dark:text-night-200'

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        {label && <p className="text-sm font-medium text-night-900 dark:text-night-50">{label}</p>}
        {showPercent && (
          <p className={cn('text-sm tabular-nums font-semibold', textColor)}>
            {Math.round(pct)}%
          </p>
        )}
      </div>
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="relative h-2.5 w-full overflow-hidden rounded-full bg-night-100 dark:bg-night-800"
      >
        <div
          className={cn('absolute inset-y-0 left-0 rounded-full transition-[width] duration-300', barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {description && <p className="mt-1.5 text-xs text-night-500 dark:text-night-300">{description}</p>}
      {level === 'danger' && <p className="mt-1 text-xs font-medium text-alert-500">Quota atteint</p>}
      {level === 'warn' && <p className="mt-1 text-xs font-medium text-gold-500">Attention, limite proche</p>}
    </div>
  )
}
