import { cn } from '@/lib/cn'

type Props = { value: number; max: number; tone?: 'iris' | 'leaf'; label: string; className?: string }

/** Barre d'avancement (« 1 / 2 témoignages reçus »). La largeur est animée via transform. */
export function ProgressBar({ value, max, tone = 'iris', label, className }: Props) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={`${value} sur ${max}`}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-night-100', className)}
    >
      <div
        className={cn('h-full w-full origin-left rounded-full transition-transform duration-500 motion-reduce:transition-none', tone === 'iris' ? 'bg-iris-500' : 'bg-leaf-500')}
        style={{ transform: `scaleX(${ratio})` }}
      />
    </div>
  )
}
