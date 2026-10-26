import { ILLU } from './palette'

/** Leafy sprig growing from (x, y). `flip` mirrors it horizontally. */
export function Sprig({
  x,
  y,
  scale = 1,
  flip = false,
  color = ILLU.leafLight,
}: {
  x: number
  y: number
  scale?: number
  flip?: boolean
  color?: string
}) {
  const sx = flip ? -scale : scale
  return (
    <g transform={`translate(${x} ${y}) scale(${sx} ${scale})`}>
      <path d="M0 0 C-4 -30 -2 -60 10 -92" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="-9" cy="-22" rx="11" ry="5" transform="rotate(-35 -9 -22)" fill={color} />
      <ellipse cx="10" cy="-34" rx="11" ry="5" transform="rotate(30 10 -34)" fill={color} />
      <ellipse cx="-8" cy="-50" rx="11" ry="5" transform="rotate(-40 -8 -50)" fill={color} />
      <ellipse cx="13" cy="-62" rx="10" ry="4.5" transform="rotate(25 13 -62)" fill={color} />
      <ellipse cx="-2" cy="-76" rx="9" ry="4.5" transform="rotate(-55 -2 -76)" fill={color} />
      <ellipse cx="14" cy="-92" rx="8" ry="4" transform="rotate(-70 14 -92)" fill={color} />
    </g>
  )
}

/** Small outlined heart (mockup accent), centred on (x, y). */
export function HeartOutline({ x, y, size = 22, color = ILLU.green }: { x: number; y: number; size?: number; color?: string }) {
  const s = size / 24
  return (
    <path
      transform={`translate(${x - 12 * s} ${y - 12 * s}) scale(${s})`}
      d="M12 21 C5 16 2 12.5 2 8.5 C2 5.5 4.5 3 7.5 3 C9.5 3 11 4 12 5.6 C13 4 14.5 3 16.5 3 C19.5 3 22 5.5 22 8.5 C22 12.5 19 16 12 21 Z"
      fill="none"
      stroke={color}
      strokeWidth={2.4}
      strokeLinejoin="round"
    />
  )
}

/** Simple happy face features (eyes + smile) relative to a head centre. */
export function Face({
  cx,
  cy,
  r,
  closed = false,
  blush = true,
}: {
  cx: number
  cy: number
  r: number
  closed?: boolean
  blush?: boolean
}) {
  const ex = r * 0.36
  const ey = cy - r * 0.02
  const k = r / 24
  return (
    <g>
      {closed ? (
        <>
          <path d={`M${cx - ex - 3 * k} ${ey} q${3 * k} ${2.6 * k} ${6 * k} 0`} fill="none" stroke={ILLU.hair} strokeWidth={1.8 * k} strokeLinecap="round" />
          <path d={`M${cx + ex - 3 * k} ${ey} q${3 * k} ${2.6 * k} ${6 * k} 0`} fill="none" stroke={ILLU.hair} strokeWidth={1.8 * k} strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx={cx - ex} cy={ey} r={2.1 * k} fill={ILLU.hair} />
          <circle cx={cx + ex} cy={ey} r={2.1 * k} fill={ILLU.hair} />
        </>
      )}
      {blush && (
        <>
          <ellipse cx={cx - r * 0.55} cy={cy + r * 0.28} rx={3.4 * k} ry={2 * k} fill={ILLU.blush} opacity="0.45" />
          <ellipse cx={cx + r * 0.55} cy={cy + r * 0.28} rx={3.4 * k} ry={2 * k} fill={ILLU.blush} opacity="0.45" />
        </>
      )}
      <path
        d={`M${cx - 6 * k} ${cy + r * 0.34} q${6 * k} ${5.5 * k} ${12 * k} 0`}
        fill="none"
        stroke={ILLU.hair}
        strokeWidth={1.9 * k}
        strokeLinecap="round"
      />
    </g>
  )
}
