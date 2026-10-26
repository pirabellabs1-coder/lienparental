import { ILLU, a11yProps, type IllustrationProps } from './palette'
import { Face, HeartOutline, Sprig } from './parts'

/** Dad (green sweater), mum (navy) and their little girl — welcome screen. */
export function FamilyIllustration({ className, title }: IllustrationProps) {
  return (
    <svg viewBox="0 0 320 240" className={className} {...a11yProps(title)}>
      <ellipse cx="160" cy="236" rx="132" ry="6" fill={ILLU.navyBg} />
      <Sprig x={40} y={234} scale={1.15} />
      <Sprig x={64} y={234} scale={0.7} color={ILLU.leafMid} />
      <Sprig x={282} y={234} scale={1.1} flip />
      <Sprig x={258} y={234} scale={0.65} flip color={ILLU.leafMid} />
      <HeartOutline x={272} y={54} size={26} />

      {/* Mum — long hair behind */}
      <path
        d="M178 100 C176 72 190 58 206 58 C224 58 236 72 234 100 C234 124 238 140 244 152 C232 158 218 156 212 150 L198 150 C190 156 176 158 166 152 C172 140 178 124 178 100 Z"
        fill={ILLU.hair}
      />

      {/* Dad */}
      <path d="M70 236 C70 180 86 138 118 134 C150 138 166 180 166 236 Z" fill={ILLU.green} />
      <path d="M108 134 L118 148 L128 134 Z" fill={ILLU.greenDark} />
      <rect x="110" y="110" width="16" height="26" rx="6" fill={ILLU.skinShade} />
      <circle cx="94" cy="96" r="5" fill={ILLU.skin} />
      <circle cx="142" cy="96" r="5" fill={ILLU.skin} />
      <circle cx="118" cy="92" r="24" fill={ILLU.skin} />
      <path d="M94 90 C93 70 106 62 120 62 C135 62 145 72 143 90 C139 80 131 76 121 77 C110 78 100 82 94 92 Z" fill={ILLU.hair} />
      <path d="M96 98 C97 116 107 125 118 125 C129 125 140 116 141 98 C137 108 129 112 118 112 C107 112 100 108 96 98 Z" fill={ILLU.hair} />
      <circle cx="109.5" cy="92" r="2.1" fill={ILLU.hair} />
      <circle cx="126.5" cy="92" r="2.1" fill={ILLU.hair} />
      <path d="M112 113 q6 4.5 12 0" fill="none" stroke={ILLU.white} strokeWidth="2" strokeLinecap="round" />

      {/* Mum */}
      <path d="M160 236 C160 184 176 146 204 142 C232 146 248 184 248 236 Z" fill={ILLU.navy} />
      <path d="M195 142 C198 150 210 150 213 142 Z" fill={ILLU.skinShade} />
      <rect x="196" y="112" width="16" height="32" rx="6" fill={ILLU.skinShade} />
      <circle cx="204" cy="96" r="22" fill={ILLU.skin} />
      <path d="M182 96 C183 74 197 68 210 70 C222 72 230 82 228 98 C220 86 208 80 196 84 C190 86 185 90 182 96 Z" fill={ILLU.hair} />
      <Face cx={204} cy={98} r={22} />

      {/* Girl */}
      <path d="M141 166 C138 146 148 136 160 136 C173 136 182 146 179 166 C180 176 184 182 186 188 L134 188 C136 182 140 176 141 166 Z" fill={ILLU.hair} />
      <path d="M128 238 C128 206 142 188 160 186 C178 188 192 206 192 238 Z" fill={ILLU.shirt} stroke="#dde1f5" strokeWidth="1.5" />
      <rect x="154" y="166" width="12" height="22" rx="5" fill={ILLU.skinShade} />
      <circle cx="160" cy="158" r="18" fill={ILLU.skin} />
      <path d="M142 157 C143 143 151 138 160 138 C170 138 178 144 178 157 C172 149 164 146 156 147 C150 148 145 152 142 157 Z" fill={ILLU.hair} />
      <path d="M172 140 L182 134 L181 146 Z M172 140 L163 133 L164 145 Z" fill={ILLU.green} />
      <circle cx="172" cy="140" r="2.6" fill={ILLU.greenDark} />
      <Face cx={160} cy={160} r={18} />

      {/* Parents' hands resting on the girl's shoulders */}
      <circle cx="140" cy="201" r="7" fill={ILLU.skin} />
      <circle cx="181" cy="201" r="7" fill={ILLU.skin} />
    </svg>
  )
}
