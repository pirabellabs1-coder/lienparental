import { cn } from '@/lib/cn'

type Props = {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  layout?: 'stacked' | 'inline'
  /** Baseline « Informer • Accompagner • Préserver / Le lien parent-enfant » (logo principal). */
  tagline?: boolean
  className?: string
}

// Logo selon le guide d'identité visuelle : « Lien » en Montserrat bleu marine, point du i vert,
// « Parental » en Allura vert qui chevauche légèrement le mot du dessus.
// À remplacer par le fichier SVG officiel dès qu'il est fourni.
const SIZES = {
  sm: { lien: 'text-[24px]', parental: 'text-[38px] -mt-[0.2em] ml-[0.1em]', dot: 'h-[0.2em] w-[0.2em]' },
  md: { lien: 'text-[32px]', parental: 'text-[50px] -mt-[0.2em] ml-[0.1em]', dot: 'h-[0.2em] w-[0.2em]' },
  lg: { lien: 'text-[46px]', parental: 'text-[72px] -mt-[0.2em] ml-[0.1em]', dot: 'h-[0.2em] w-[0.2em]' },
  xl: { lien: 'text-[64px]', parental: 'text-[100px] -mt-[0.2em] ml-[0.1em]', dot: 'h-[0.2em] w-[0.2em]' },
}

function Lien({ className, dot }: { className: string; dot: string }) {
  return (
    <span className={cn('font-sans font-extrabold leading-none tracking-[-0.03em] text-night-900', className)}>
      L
      <span className="relative inline-block">
        ı
        <span className={cn('absolute left-1/2 top-[0.06em] -translate-x-1/2 rounded-full bg-leaf-400', dot)} />
      </span>
      en
    </span>
  )
}

export function Logo({ size = 'md', layout = 'stacked', tagline = false, className }: Props) {
  const s = SIZES[size]
  return (
    <span role="img" className={cn('inline-flex select-none flex-col', className)} aria-label="Lien Parental">
      {layout === 'stacked' ? (
        <span aria-hidden className="flex flex-col leading-none">
          <Lien className={s.lien} dot={s.dot} />
          <span className={cn('font-script leading-none text-leaf-400', s.parental)}>Parental</span>
        </span>
      ) : (
        <span aria-hidden className="flex items-baseline gap-1.5 leading-none">
          <Lien className={s.lien} dot={s.dot} />
          <span className={cn('font-script leading-none text-leaf-400', s.parental.replace(/-mt-\S+|ml-\S+/g, ''))}>Parental</span>
        </span>
      )}
      {tagline && (
        <span aria-hidden className="mt-2 flex flex-col gap-0.5 text-[9px] font-semibold uppercase tracking-[0.22em]">
          <span className="text-night-900">Informer • Accompagner • Préserver</span>
          <span className="text-leaf-500">Le lien parent-enfant</span>
        </span>
      )}
    </span>
  )
}
