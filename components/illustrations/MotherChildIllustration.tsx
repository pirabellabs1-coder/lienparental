import { ILLU, a11yProps, type IllustrationProps } from './palette'
import { Face, HeartOutline, Sprig } from './parts'

/** Mother hugging her daughter — "Pensé pour l'intérêt de l'enfant" screen. */
export function MotherChildIllustration({ className, title }: IllustrationProps) {
  return (
    <svg viewBox="0 0 320 240" className={className} {...a11yProps(title)}>
      <ellipse cx="160" cy="236" rx="132" ry="6" fill={ILLU.navyBg} />
      <Sprig x={42} y={234} scale={1.1} />
      <Sprig x={66} y={234} scale={0.68} color={ILLU.leafMid} />
      <Sprig x={282} y={234} scale={1.05} flip />
      <Sprig x={258} y={234} scale={0.6} flip color={ILLU.leafMid} />
      <HeartOutline x={262} y={54} size={26} />

      {/* Mother */}
      <path d="M116 92 C112 64 128 52 146 52 C166 52 178 66 174 92 C172 110 168 126 160 138 L118 142 C112 128 116 108 116 92 Z" fill={ILLU.hair} />
      <path d="M76 238 C78 178 100 142 140 138 C172 142 192 168 196 238 Z" fill={ILLU.green} />
      <rect x="136" y="106" width="15" height="34" rx="6" fill={ILLU.skinShade} />
      <circle cx="145" cy="88" r="25" fill={ILLU.skin} />
      <path d="M120 88 C121 66 137 60 150 62 C162 64 171 73 170 88 C160 77 148 73 136 77 C128 80 123 83 120 88 Z" fill={ILLU.hair} />
      <Face cx={146} cy={92} r={25} closed />

      {/* Girl */}
      <path d="M172 112 C170 92 180 84 193 84 C206 84 214 94 212 112 C214 124 216 132 218 140 L170 140 C172 130 172 122 172 112 Z" fill={ILLU.hair} />
      <path d="M158 238 C160 190 176 162 196 160 C218 162 232 190 232 238 Z" fill={ILLU.shirt} stroke="#dde1f5" strokeWidth="1.5" />
      <rect x="186" y="122" width="12" height="40" rx="5" fill={ILLU.skinShade} />
      <circle cx="192" cy="112" r="20" fill={ILLU.skin} />
      <path d="M173 110 C174 94 183 88 193 88 C204 88 211 96 211 110 C204 100 196 97 188 99 C181 101 176 105 173 110 Z" fill={ILLU.hair} />
      <Face cx={192} cy={114} r={20} closed />

      {/* Girl's arm around mum's neck */}
      <path d="M184 178 C178 170 172 164 167 158" fill="none" stroke={ILLU.shirt} strokeWidth="13" strokeLinecap="round" />
      <path d="M167 158 C161 152 157 147 153 142" fill="none" stroke={ILLU.skin} strokeWidth="10" strokeLinecap="round" />

      {/* Mum's arm wrapping the girl */}
      <path d="M104 178 C120 216 176 224 214 198" fill="none" stroke={ILLU.green} strokeWidth="18" strokeLinecap="round" />
      <circle cx="219" cy="194" r="9" fill={ILLU.skin} />
    </svg>
  )
}
