import { useId } from 'react'
import { cn } from '@/lib/cn'

type Props = {
  /** Largeur en px (la hauteur suit le ratio). */
  size?: number
  /** `full` = tête + corps, `head` = tête seule (avatar de chat, bulle de l'assistant). */
  variant?: 'full' | 'head'
  /** Bulle violette « … » en haut à droite (dashboard). */
  bubble?: boolean
  /** Clignement discret des yeux (coupé en prefers-reduced-motion). */
  animated?: boolean
  className?: string
}

// Mascotte du Coach IA, partagée avec la bulle de l'assistant (site public et espace connecté) :
// tête arrondie blanche nacrée et brillante, visière bleu nuit, yeux en arcs et sourire verts
// lumineux, oreilles et antenne violettes. Purement décorative.
export function RobotMascot({ size = 96, variant = 'full', bubble = false, animated = false, className }: Props) {
  const uid = useId().replace(/:/g, '')
  const shell = `rb-shell-${uid}`
  const visor = `rb-visor-${uid}`
  const violet = `rb-violet-${uid}`
  const stem = `rb-stem-${uid}`
  const glow = `rb-glow-${uid}`

  const viewBox = variant === 'head' ? '6 0 108 88' : bubble ? '0 0 132 128' : '0 0 120 128'
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
        <radialGradient id={shell} cx="38%" cy="26%" r="80%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.55" stopColor="#f3f1fb" />
          <stop offset="1" stopColor="#d3cfe8" />
        </radialGradient>
        <linearGradient id={visor} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#141a5a" />
          <stop offset="1" stopColor="#0b1240" />
        </linearGradient>
        <radialGradient id={violet} cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#b48cff" />
          <stop offset="0.45" stopColor="#7b2ff2" />
          <stop offset="1" stopColor="#5a18c9" />
        </radialGradient>
        <linearGradient id={`${glow}-eye`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3bff5a" />
          <stop offset="1" stopColor="#22d84a" />
        </linearGradient>
        <linearGradient id={stem} x1="0" x2="1">
          <stop offset="0" stopColor="#9aa1b2" />
          <stop offset="0.45" stopColor="#f4f5f8" />
          <stop offset="1" stopColor="#8a90a2" />
        </linearGradient>
        <filter id={glow} x="-40%" y="-60%" width="180%" height="220%">
          <feGaussianBlur stdDeviation="1.8" />
        </filter>
      </defs>

      {/* Corps */}
      {variant === 'full' && (
        <g>
          <rect x="50" y="80" width="20" height="8" rx="3" fill="#c6b9fb" />
          <rect x="33" y="86" width="54" height="36" rx="17" fill={`url(#${shell})`} stroke="#d5d9ef" strokeWidth="1.5" />
          <circle cx="60" cy="102" r="5" fill={`url(#${violet})`} />
          <circle cx="60" cy="102" r="2" fill="#e2dcfd" />
        </g>
      )}

      {/* Antenne : tige métallique, boule violette brillante */}
      <rect x="57.5" y="11" width="5" height="15" rx="1.8" fill={`url(#${stem})`} />
      <circle cx="60" cy="9" r="6" fill={`url(#${violet})`} />
      <ellipse cx="57.8" cy="6.8" rx="2.2" ry="1.3" fill="#ffffff" opacity="0.75" />

      {/* Oreilles : demi-disques violets brillants, à mi-hauteur */}
      <path d="M24 38 A13 16 0 0 0 24 70 Z" fill={`url(#${violet})`} />
      <path d="M96 38 A13 16 0 0 1 96 70 Z" fill={`url(#${violet})`} />
      <ellipse cx="15.5" cy="47" rx="1.8" ry="4.5" fill="#ffffff" opacity="0.45" />
      <ellipse cx="104.5" cy="47" rx="1.6" ry="4" fill="#ffffff" opacity="0.3" />

      {/* Tête nacrée + reflet */}
      <rect x="20" y="24" width="80" height="60" rx="26" fill={`url(#${shell})`} stroke="#ddd9f0" strokeWidth="1.2" />
      <rect x="22" y="70" width="76" height="13" rx="6.5" fill="#b9b2dc" opacity="0.18" />
      <ellipse cx="44" cy="30.5" rx="17" ry="3.8" fill="#ffffff" opacity="0.95" />

      {/* Visière brillante */}
      <rect x="27.5" y="33.5" width="65" height="41" rx="18.5" fill="#0b1240" />
      <rect x="29" y="35" width="62" height="38" rx="17" fill={`url(#${visor})`} stroke="#3a4592" strokeWidth="0.8" />
      <path d="M35 44c2.2-4.8 7-6.8 13-6.8" stroke="#ffffff" strokeOpacity="0.3" strokeWidth="1.8" strokeLinecap="round" />

      {/* Yeux + sourire lumineux : halo flouté puis trait net */}
      <g className={animated ? 'origin-center [transform-box:fill-box] motion-safe:animate-blink' : undefined}>
        <g filter={`url(#${glow})`} stroke="#3bff5a" strokeWidth="6" strokeLinecap="round" opacity="0.45">
          <path d="M42 56 q6 -8 12 0" />
          <path d="M66 56 q6 -8 12 0" />
        </g>
        <path d="M42 56 q6 -8 12 0" stroke={`url(#${glow}-eye)`} strokeWidth="3.8" strokeLinecap="round" />
        <path d="M66 56 q6 -8 12 0" stroke={`url(#${glow}-eye)`} strokeWidth="3.8" strokeLinecap="round" />
      </g>
      <path d="M54 62 q6 5.5 12 0" stroke="#86efac" strokeWidth="5.5" strokeLinecap="round" opacity="0.6" filter={`url(#${glow})`} />
      <path d="M54 62 q6 5.5 12 0" stroke={`url(#${glow}-eye)`} strokeWidth="3.4" strokeLinecap="round" />

      {/* Bulle « … » */}
      {bubble && variant === 'full' && (
        <g>
          <path d="M104 30 l-4 8 l9 -4 z" fill="#5b45e3" />
          <circle cx="114" cy="18" r="15" fill={`url(#${violet})`} />
          <circle cx="108" cy="18" r="2" fill="#ffffff" />
          <circle cx="114" cy="18" r="2" fill="#ffffff" />
          <circle cx="120" cy="18" r="2" fill="#ffffff" />
        </g>
      )}
    </svg>
  )
}
