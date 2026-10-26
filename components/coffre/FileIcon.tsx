import { cn } from '@/lib/cn'
import type { VaultTone } from '@/lib/mock-vault'

const STROKE: Record<VaultTone, string> = {
  red: 'text-alert-500', blue: 'text-blue-600', green: 'text-leaf-500', orange: 'text-orange-500',
  violet: 'text-iris-500', pink: 'text-pink-500', gray: 'text-slate-500',
}
const BG: Record<VaultTone, string> = {
  red: 'bg-alert-50', blue: 'bg-blue-50', green: 'bg-leaf-50', orange: 'bg-orange-50',
  violet: 'bg-iris-50', pink: 'bg-pink-50', gray: 'bg-slate-100',
}

type Props = {
  tone: VaultTone
  /** Libellé dans la pastille (PDF, JPG, W…). */
  label?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Fond teinté autour de l'icône (listes). */
  framed?: boolean
  className?: string
}

const DIM = { sm: 'h-7 w-6', md: 'h-8 w-7', lg: 'h-11 w-9', xl: 'h-16 w-14' }
const FRAME = { sm: 'h-9 w-9', md: 'h-10 w-10', lg: 'h-14 w-14', xl: 'h-20 w-20' }

/** Icône « feuille cornée » avec badge d'extension, colorée comme sur les maquettes. Décorative. */
export function FileIcon({ tone, label = 'PDF', size = 'md', framed = false, className }: Props) {
  const svg = (
    <svg viewBox="0 0 28 34" className={cn(DIM[size], STROKE[tone])} aria-hidden="true" focusable="false">
      <path d="M4 1.5h13.5L26.5 10.5V30a2.5 2.5 0 0 1-2.5 2.5H4A2.5 2.5 0 0 1 1.5 30V4A2.5 2.5 0 0 1 4 1.5Z" fill="white" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M17.5 1.5V8a2.5 2.5 0 0 0 2.5 2.5h6.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <rect x="3.5" y="16" width="21" height="10" rx="2" fill="currentColor" />
      <text x="14" y="23.6" textAnchor="middle" fontSize={label.length > 3 ? 5.4 : 6.6} fontWeight="800" fill="white" fontFamily="Montserrat, system-ui, sans-serif">{label}</text>
    </svg>
  )
  if (!framed) return <span aria-hidden="true" className={cn('inline-flex shrink-0', className)}>{svg}</span>
  return (
    <span aria-hidden="true" className={cn('inline-flex shrink-0 items-center justify-center rounded-xl', FRAME[size], BG[tone], className)}>
      {svg}
    </span>
  )
}
