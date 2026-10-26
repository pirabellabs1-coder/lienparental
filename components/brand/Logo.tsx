import Image from 'next/image'
import { cn } from '@/lib/cn'

type Props = {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** « inline » : version compacte pour les barres de navigation. */
  layout?: 'stacked' | 'inline'
  /** Baseline « Informer • Accompagner • Préserver / Le lien parent-enfant » (logo principal). */
  tagline?: boolean
  /** « light » : version claire pour les fonds sombres (avec baseline uniquement). */
  tone?: 'color' | 'light'
  className?: string
}

// Logo officiel (fichiers vectoriels fournis, recadrés sur leur contenu) : public/brand/*.svg.
const LOGO = { src: '/brand/logo.svg', ratio: 332.2 / 201.4 }
const LOGO_BASELINE = { src: '/brand/logo-baseline.svg', ratio: 394 / 225 }
const LOGO_BASELINE_LIGHT = { src: '/brand/logo-baseline-clair.svg', ratio: 394 / 225 }

// Hauteur affichée en pixels.
const HEIGHTS = {
  stacked: { sm: 46, md: 62, lg: 84, xl: 120 },
  inline: { sm: 40, md: 48, lg: 60, xl: 72 },
  tagline: { sm: 64, md: 88, lg: 118, xl: 160 },
}

export function Logo({ size = 'md', layout = 'stacked', tagline = false, tone = 'color', className }: Props) {
  const file = tagline || tone === 'light' ? (tone === 'light' ? LOGO_BASELINE_LIGHT : LOGO_BASELINE) : LOGO
  const height = tagline || tone === 'light' ? HEIGHTS.tagline[size] : HEIGHTS[layout][size]
  const width = Math.round(height * file.ratio)
  return (
    <span className={cn('inline-flex select-none flex-col', className)}>
      <Image
        src={file.src}
        alt="Lien Parental"
        width={width}
        height={height}
        unoptimized
        priority={size === 'sm'}
        className="block h-auto max-w-full"
        style={{ width, height: 'auto' }}
      />
    </span>
  )
}
