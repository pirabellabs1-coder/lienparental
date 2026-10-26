import { cn } from '@/lib/cn'

type Props = {
  /** 0 → 100 */
  value: number
  size?: number
  stroke?: number
  label?: string
  className?: string
}

// Anneau de progression (analyse IA). La transition du tracé est désactivée
// quand l'utilisateur demande moins d'animations (motion-safe).
export function ProgressRing({ value, size = 148, stroke = 12, label = 'Analyse', className }: Props) {
  const v = Math.max(0, Math.min(100, Math.round(value)))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c - (v / 100) * c

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v}
      aria-label={`${label} : ${v} %`}
      className={cn('relative inline-grid place-items-center', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2dcfd" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#5b45e3"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-200 motion-safe:ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
        <span className="text-[15px] font-semibold text-night-900">{label}</span>
        <span className="text-[30px] font-extrabold leading-tight tracking-tight text-night-900 tabular-nums">{v}%</span>
      </div>
    </div>
  )
}
