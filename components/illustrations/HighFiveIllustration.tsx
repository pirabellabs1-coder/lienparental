import { ILLU, a11yProps, type IllustrationProps } from './palette'
import { Face, HeartOutline, Sprig } from './parts'

/** Parents giving each other a high five, daughter in front — "Prêt(e) à commencer ?" screen. */
export function HighFiveIllustration({ className, title }: IllustrationProps) {
  return (
    <svg viewBox="0 0 320 240" className={className} {...a11yProps(title)}>
      <ellipse cx="160" cy="236" rx="136" ry="6" fill={ILLU.navyBg} />
      <Sprig x={30} y={234} scale={0.95} />
      <Sprig x={292} y={234} scale={0.9} flip />
      <HeartOutline x={282} y={58} size={26} />

      {/* Clap lines */}
      <g stroke="#b9c0ea" strokeWidth="2.5" strokeLinecap="round">
        <path d="M146 26 L141 17" />
        <path d="M160.5 22 L160.5 11" />
        <path d="M175 26 L180 17" />
      </g>

      {/* Mum — hair behind */}
      <path d="M188 104 C186 76 200 62 216 62 C234 62 246 76 244 104 C244 128 248 144 254 156 C242 162 228 160 222 154 L208 154 C200 160 186 162 176 156 C182 144 188 128 188 104 Z" fill={ILLU.hair} />

      {/* Dad */}
      <path d="M60 238 C60 184 76 142 108 138 C140 142 154 180 156 238 Z" fill={ILLU.green} />
      <path d="M98 138 L108 152 L118 138 Z" fill={ILLU.greenDark} />
      <rect x="100" y="112" width="16" height="28" rx="6" fill={ILLU.skinShade} />
      <circle cx="84" cy="100" r="5" fill={ILLU.skin} />
      <circle cx="132" cy="100" r="5" fill={ILLU.skin} />
      <circle cx="108" cy="96" r="24" fill={ILLU.skin} />
      <path d="M84 94 C83 74 96 66 110 66 C125 66 135 76 133 94 C129 84 121 80 111 81 C100 82 90 86 84 96 Z" fill={ILLU.hair} />
      <path d="M86 102 C87 120 97 129 108 129 C119 129 130 120 131 102 C127 112 119 116 108 116 C97 116 90 112 86 102 Z" fill={ILLU.hair} />
      <circle cx="99.5" cy="96" r="2.1" fill={ILLU.hair} />
      <circle cx="116.5" cy="96" r="2.1" fill={ILLU.hair} />
      <path d="M102 117 q6 4.5 12 0" fill="none" stroke={ILLU.white} strokeWidth="2" strokeLinecap="round" />
      <path d="M134 152 C142 120 150 84 155 58" fill="none" stroke={ILLU.green} strokeWidth="16" strokeLinecap="round" />
      <circle cx="156" cy="46" r="10" fill={ILLU.skin} />

      {/* Mum */}
      <path d="M166 238 C168 188 184 150 214 146 C244 150 258 188 260 238 Z" fill={ILLU.navy} />
      <rect x="206" y="116" width="16" height="32" rx="6" fill={ILLU.skinShade} />
      <circle cx="214" cy="100" r="22" fill={ILLU.skin} />
      <path d="M192 100 C193 78 207 72 220 74 C232 76 240 86 238 102 C230 90 218 84 206 88 C200 90 195 94 192 100 Z" fill={ILLU.hair} />
      <Face cx={214} cy={102} r={22} />
      <path d="M188 158 C180 124 172 88 167 58" fill="none" stroke={ILLU.navy} strokeWidth="16" strokeLinecap="round" />
      <circle cx="166" cy="46" r="10" fill={ILLU.skin} />

      {/* Girl */}
      <circle cx="140" cy="178" r="7" fill={ILLU.hair} />
      <circle cx="180" cy="178" r="7" fill={ILLU.hair} />
      <path d="M144 172 C142 154 150 148 160 148 C171 148 178 154 176 172 Z" fill={ILLU.hair} />
      <path d="M130 238 C130 212 142 198 160 196 C178 198 190 212 190 238 Z" fill={ILLU.shirt} stroke="#dde1f5" strokeWidth="1.5" />
      <rect x="155" y="180" width="10" height="18" rx="4" fill={ILLU.skinShade} />
      <circle cx="160" cy="170" r="17" fill={ILLU.skin} />
      <path d="M143 168 C144 156 152 150 160 150 C169 150 177 156 177 168 C171 161 164 158 157 159 C151 160 146 163 143 168 Z" fill={ILLU.hair} />
      <Face cx={160} cy={172} r={17} />
    </svg>
  )
}
