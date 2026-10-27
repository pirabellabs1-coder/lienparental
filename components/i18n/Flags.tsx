import type { FlagKey } from '@/lib/i18n/config'

// Drapeaux circulaires compacts (24×24), détourés en cercle par le conteneur
// (rounded-full overflow-hidden). Décoratifs : aria-hidden, le libellé porte le sens.

function FlagFR() {
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden="true">
      <rect width="8" height="24" fill="#0055A4" />
      <rect x="8" width="8" height="24" fill="#fff" />
      <rect x="16" width="8" height="24" fill="#EF4135" />
    </svg>
  )
}

function FlagGB() {
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden="true">
      <rect width="24" height="24" fill="#012169" />
      <path d="M0 0 L24 24 M24 0 L0 24" stroke="#fff" strokeWidth="4.8" />
      <path d="M0 0 L24 24 M24 0 L0 24" stroke="#C8102E" strokeWidth="2" />
      <path d="M12 0 V24 M0 12 H24" stroke="#fff" strokeWidth="7" />
      <path d="M12 0 V24 M0 12 H24" stroke="#C8102E" strokeWidth="4" />
    </svg>
  )
}

function FlagBR() {
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden="true">
      <rect width="24" height="24" fill="#009C3B" />
      <path d="M12 3 L21 12 L12 21 L3 12 Z" fill="#FFDF00" />
      <circle cx="12" cy="12" r="4.3" fill="#002776" />
    </svg>
  )
}

const FLAGS: Record<FlagKey, () => React.ReactElement> = { fr: FlagFR, gb: FlagGB, br: FlagBR }

export function Flag({ flag }: { flag: FlagKey }) {
  const C = FLAGS[flag]
  return <C />
}
