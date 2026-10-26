import { useId } from 'react'
import { cn } from '@/lib/cn'

type Props = {
  /** Largeur en px (la hauteur suit le ratio). */
  size?: number
  /** `full` = tête + corps, `head` = tête seule (avatar de chat, petits encarts). */
  variant?: 'full' | 'head'
  /** Bulle violette « … » en haut à droite (dashboard). */
  bubble?: boolean
  className?: string
}

// Mascotte du Coach IA : tête arrondie blanche, visière bleu nuit,
// yeux et sourire verts, oreilles violettes. Purement décorative.
export function RobotMascot({ size = 96, variant = 'full', bubble = false, className }: Props) {
  const uid = useId().replace(/:/g, '')
  const shell = `rb-shell-${uid}`
  const visor = `rb-visor-${uid}`

  const viewBox = variant === 'head' ? '10 2 100 84' : bubble ? '0 0 132 128' : '0 0 120 128'
  const [, , vw, vh] = viewBox.split(' ').map(Number)
  const height = Math.round((size * vh) / vw)

  return (
    <svg
      width={size}
      height={height}
      viewBox={viewBox}
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={cn('shrink-0', className)}
    >
      <defs>
        <linearGradient id={shell} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e7e9f6" />
        </linearGradient>
        <linearGradient id={visor} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1f2c7e" />
          <stop offset="1" stopColor="#0b1240" />
        </linearGradient>
      </defs>

      {/* Corps */}
      {variant === 'full' && (
        <g>
          <rect x="50" y="80" width="20" height="8" rx="3" fill="#c6b9fb" />
          <rect x="33" y="86" width="54" height="36" rx="17" fill={`url(#${shell})`} stroke="#d5d9ef" strokeWidth="1.5" />
          <circle cx="60" cy="102" r="5" fill="#5b45e3" />
          <circle cx="60" cy="102" r="2" fill="#e2dcfd" />
        </g>
      )}

      {/* Antenne */}
      <line x1="60" y1="13" x2="60" y2="25" stroke="#a38ff6" strokeWidth="3" strokeLinecap="round" />
      <circle cx="60" cy="10" r="4.5" fill="#5b45e3" />

      {/* Oreilles */}
      <rect x="13" y="40" width="12" height="28" rx="6" fill="#5b45e3" />
      <rect x="95" y="40" width="12" height="28" rx="6" fill="#5b45e3" />

      {/* Tête */}
      <rect x="20" y="24" width="80" height="60" rx="26" fill={`url(#${shell})`} stroke="#d5d9ef" strokeWidth="1.5" />
      <rect x="29" y="35" width="62" height="38" rx="17" fill={`url(#${visor})`} />
      <rect x="34" y="38.5" width="22" height="4" rx="2" fill="#ffffff" opacity="0.12" />

      {/* Yeux + sourire */}
      <path d="M42 56 q6 -8 12 0" stroke="#4ade80" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M66 56 q6 -8 12 0" stroke="#4ade80" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M53 62 q7 6 14 0" stroke="#4ade80" strokeWidth="3" strokeLinecap="round" />

      {/* Bulle « … » */}
      {bubble && variant === 'full' && (
        <g>
          <path d="M104 30 l-4 8 l9 -4 z" fill="#5b45e3" />
          <circle cx="114" cy="18" r="15" fill="#5b45e3" />
          <circle cx="108" cy="18" r="2" fill="#ffffff" />
          <circle cx="114" cy="18" r="2" fill="#ffffff" />
          <circle cx="120" cy="18" r="2" fill="#ffffff" />
        </g>
      )}
    </svg>
  )
}
