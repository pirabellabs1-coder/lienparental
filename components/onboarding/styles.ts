// Shared class recipes for the mockup-faithful flows (onboarding, witness, children).
// Follows the single button system documented in docs/DESIGN_SYSTEM.md.
const btnBase =
  'inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-semibold transition-[transform,background-color,box-shadow,color] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 motion-reduce:transition-none motion-reduce:active:scale-100'

const primary = `${btnBase} bg-leaf-500 text-white shadow-[0_8px_20px_-10px_rgba(46,125,50,0.55)] hover:bg-leaf-600`
const secondary = `${btnBase} border border-night-200 bg-white text-night-900 hover:bg-night-50`

export const btn = {
  primary,
  secondary,
  // Legacy keys kept as aliases so existing screens follow the system automatically.
  /** @deprecated use `primary` (navy is for text only) */
  night: primary,
  /** @deprecated use `primary` */
  leaf: primary,
  /** @deprecated use `secondary` */
  outlineLeaf: secondary,
  /** @deprecated use `secondary` */
  outlineNight: secondary,
} as const

/** Green text link / text button (≥ 44px tap target when used as a button). */
export const linkLeaf =
  'font-semibold text-leaf-600 underline-offset-4 hover:underline focus-visible:underline'
