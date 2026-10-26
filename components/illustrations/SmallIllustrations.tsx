import { ILLU, a11yProps, type IllustrationProps } from './palette'
import { Face, Sprig } from './parts'

/** Envelope with a protective shield badge — witness intro. */
export function EnvelopeShieldIcon({ className, title }: IllustrationProps) {
  return (
    <svg viewBox="0 0 120 120" className={className} {...a11yProps(title)}>
      <circle cx="60" cy="60" r="56" fill={ILLU.leafBg} />
      <circle cx="60" cy="60" r="42" fill={ILLU.leafLight} opacity="0.55" />
      <rect x="32" y="40" width="50" height="36" rx="7" fill={ILLU.green} />
      <path d="M36 46 L57 61 L78 46" fill="none" stroke={ILLU.white} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="82" cy="78" r="16" fill={ILLU.white} />
      <path
        d="M82 67 L91 70.5 V77 C91 83 87 87 82 89 C77 87 73 83 73 77 V70.5 Z"
        fill={ILLU.green}
      />
      <path d="M78 78 L81 81 L86.5 75" fill="none" stroke={ILLU.white} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Green padlock among leaves — witness end screen. */
export function LockLeavesIllustration({ className, title }: IllustrationProps) {
  return (
    <svg viewBox="0 0 220 160" className={className} {...a11yProps(title)}>
      <ellipse cx="110" cy="84" rx="78" ry="70" fill={ILLU.leafBg} />
      <Sprig x={56} y={150} scale={0.95} color={ILLU.leafMid} />
      <Sprig x={40} y={150} scale={0.7} />
      <Sprig x={164} y={150} scale={0.95} flip color={ILLU.leafMid} />
      <Sprig x={180} y={150} scale={0.7} flip />
      <path d="M86 74 V56 C86 42 96 32 110 32 C124 32 134 42 134 56 V74" fill="none" stroke={ILLU.greenDark} strokeWidth="11" strokeLinecap="round" />
      <rect x="72" y="70" width="76" height="66" rx="12" fill={ILLU.green} />
      <rect x="72" y="70" width="76" height="10" rx="5" fill={ILLU.greenDark} opacity="0.35" />
      <circle cx="110" cy="98" r="8" fill={ILLU.white} />
      <rect x="106" y="100" width="8" height="18" rx="4" fill={ILLU.white} />
    </svg>
  )
}

/** Document with ticked lines + green check badge — "Vérifiez vos informations". */
export function ChecklistIllustration({ className, title }: IllustrationProps) {
  return (
    <svg viewBox="0 0 120 120" className={className} {...a11yProps(title)}>
      <circle cx="58" cy="58" r="52" fill={ILLU.navyBg} />
      <rect x="34" y="22" width="48" height="64" rx="7" fill={ILLU.white} stroke="#dde1f5" strokeWidth="2" />
      <rect x="48" y="17" width="20" height="9" rx="4" fill="#b9c0ea" />
      {[38, 52, 66].map((y) => (
        <g key={y}>
          <path d={`M41 ${y} l3 3 l5 -6`} fill="none" stroke={ILLU.green} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="54" y={y - 2} width="21" height="4" rx="2" fill="#dde1f5" />
        </g>
      ))}
      <circle cx="84" cy="84" r="17" fill={ILLU.green} stroke={ILLU.white} strokeWidth="4" />
      <path d="M76.5 84.5 L82 90 L92 79" fill="none" stroke={ILLU.white} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Two people forming a heart — "Votre espace est prêt !". */
export function FamilyHeartIcon({ className, title }: IllustrationProps) {
  return (
    <svg viewBox="0 0 120 120" className={className} {...a11yProps(title)}>
      <circle cx="60" cy="60" r="56" fill={ILLU.leafBg} />
      <circle cx="43" cy="38" r="10" fill={ILLU.green} />
      <circle cx="77" cy="38" r="10" fill={ILLU.green} />
      <path
        d="M60 94 C40 82 26 70 26 58 C26 51 31 47 38 49 C46 51 53 57 60 66 C67 57 74 51 82 49 C89 47 94 51 94 58 C94 70 80 82 60 94 Z"
        fill={ILLU.green}
      />
      <path d="M60 66 C56 72 52 76 47 79" fill="none" stroke={ILLU.leafBg} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M60 66 C64 72 68 76 73 79" fill="none" stroke={ILLU.leafBg} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

/** Friendly child face used as a photo placeholder. */
export function ChildAvatarIllustration({ className, title }: IllustrationProps) {
  return (
    <svg viewBox="0 0 80 80" className={className} {...a11yProps(title)}>
      <circle cx="40" cy="40" r="40" fill={ILLU.leafBg} />
      <path d="M21 44 C18 22 28 14 40 14 C53 14 62 22 59 44 C60 52 62 58 64 62 L16 62 C18 58 20 52 21 44 Z" fill={ILLU.hair} />
      <path d="M13.5 70 C18 62 27 58 40 57 C53 58 62 62 66.5 70 A40 40 0 0 1 13.5 70 Z" fill={ILLU.green} />
      <rect x="35" y="48" width="10" height="11" rx="4" fill={ILLU.skinShade} />
      <circle cx="40" cy="38" r="15" fill={ILLU.skin} />
      <path d="M25 37 C26 25 33 21 40 21 C48 21 55 26 55 37 C50 31 44 28 37 29 C32 30 28 33 25 37 Z" fill={ILLU.hair} />
      <Face cx={40} cy={40} r={15} />
    </svg>
  )
}

/** Celebration confetti around a central area (decorative). */
export function ConfettiBurst({ className }: { className?: string }) {
  const pieces: Array<[number, number, string, number]> = [
    [30, 40, ILLU.green, 20], [62, 18, '#e9a21b', -30], [100, 10, '#5b45e3', 10],
    [150, 16, '#e8474d', 40], [190, 34, ILLU.green, -15], [208, 74, '#e9a21b', 25],
    [16, 86, '#5b45e3', -40], [200, 118, '#72bf88', 60], [24, 130, '#e8474d', 15],
    [120, 4, ILLU.navy, 0], [176, 8, '#72bf88', -60], [44, 12, ILLU.navy, 45],
  ]
  return (
    <svg viewBox="0 0 220 150" className={className} aria-hidden focusable={false}>
      {pieces.map(([x, y, c, r], i) =>
        i % 3 === 0 ? (
          <circle key={i} cx={x} cy={y} r="3" fill={c} />
        ) : (
          <rect key={i} x={x - 4} y={y - 1.5} width="8" height="3" rx="1.5" fill={c} transform={`rotate(${r} ${x} ${y})`} />
        ),
      )}
    </svg>
  )
}
