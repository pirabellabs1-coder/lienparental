import Link from 'next/link'
import { cn } from '@/lib/cn'

// Primitives de la page d'accueil (maquette client, octobre 2026).
// Charte claire : fond blanc / #F7F9FC, titres marine night-900, accents leaf-400, boutons leaf-500, bordures #E5E7EB.

export const CONTAINER = 'mx-auto w-full max-w-[1200px] px-5 sm:px-8'
export const SECTION = 'scroll-mt-20 py-16 lg:py-24'
/** H2 de section : 27 px mobile, 32 px desktop. */
export const H2 = 'text-[27px] font-extrabold leading-[1.18] tracking-[-0.025em] text-night-900 [text-wrap:balance] lg:text-[32px]'
export const LEAD = 'text-[17px] leading-relaxed text-night-700'
export const CARD = 'rounded-2xl bg-white ring-1 ring-[#E5E7EB] shadow-[0_1px_2px_rgba(11,45,91,0.04),0_12px_32px_-20px_rgba(11,45,91,0.18)]'

const BTN = 'inline-flex min-h-[48px] items-center justify-center gap-2 whitespace-nowrap rounded-full px-6 text-[15px] font-semibold transition-colors duration-200'
export const BTN_PRIMARY = cn(BTN, 'bg-leaf-500 text-white hover:bg-leaf-600')
export const BTN_OUTLINE = cn(BTN, 'bg-white text-night-900 ring-1 ring-inset ring-night-900/20 hover:bg-night-50')

export function ButtonLink({ href, children, variant = 'primary', className }: { href: string; children: React.ReactNode; variant?: 'primary' | 'outline'; className?: string }) {
  return (
    <Link href={href} className={cn(variant === 'primary' ? BTN_PRIMARY : BTN_OUTLINE, className)}>
      {children}
    </Link>
  )
}

/** Titre de section centré avec sous-titre facultatif. */
export function SectionHead({ id, title, lead, className }: { id: string; title: React.ReactNode; lead?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('mx-auto max-w-[680px] text-center', className)}>
      <h2 id={id} className={H2}>{title}</h2>
      {lead && <p className={cn(LEAD, 'mt-3')}>{lead}</p>}
    </div>
  )
}

/** Pastille d'icône ronde teintée. */
export function IconBubble({ children, tone = 'leaf', size = 'md', className }: { children: React.ReactNode; tone?: Tone; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full',
        TONES[tone],
        size === 'sm' && 'h-10 w-10 [&>svg]:h-[18px] [&>svg]:w-[18px]',
        size === 'md' && 'h-12 w-12 [&>svg]:h-[22px] [&>svg]:w-[22px]',
        size === 'lg' && 'h-14 w-14 [&>svg]:h-6 [&>svg]:w-6',
        className,
      )}
    >
      {children}
    </span>
  )
}

export type Point = { key: string; icon: React.ComponentType<{ strokeWidth?: number }>; tone: Tone; title: string; text: string }

/**
 * Liste d'atouts d'une section (messagerie, album) : une carte, une ligne par atout séparée d'un filet.
 * Une seule colonne pour que le texte respire à côté du visuel (la grille à deux colonnes l'écrasait).
 */
export function PointList({ points, className }: { points: Point[]; className?: string }) {
  return (
    <ul className={cn(CARD, 'divide-y divide-[#EEF0F3] overflow-hidden', className)}>
      {points.map(({ key, icon: Icon, tone, title, text }) => (
        <li key={key} className="flex items-start gap-4 px-5 py-4 transition-colors duration-200 hover:bg-[#FAFBFC] sm:px-6">
          <IconBubble size="sm" tone={tone} className="mt-0.5 rounded-xl"><Icon strokeWidth={1.75} /></IconBubble>
          <div className="min-w-0">
            <h3 className="text-[15.5px] font-bold leading-snug text-night-900">{title}</h3>
            <p className="mt-0.5 text-[14.5px] leading-relaxed text-night-700">{text}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

export type Tone = 'leaf' | 'night' | 'gold' | 'iris' | 'rose' | 'sky'
// Couleurs d'icône sur fond pâle : toutes au-dessus de 3:1 (éléments graphiques, WCAG 1.4.11).
export const TONES: Record<Tone, string> = {
  leaf: 'bg-leaf-50 text-leaf-600',
  night: 'bg-night-50 text-night-700',
  gold: 'bg-gold-50 text-gold-700',
  iris: 'bg-iris-50 text-iris-600',
  rose: 'bg-alert-50 text-alert-600',
  sky: 'bg-[#E8F4FD] text-[#1565A6]',
}

/** Logo recoloré pour fond marine. */
export const LOGO_ON_DARK = '[&>span>span:first-child]:!text-white [&>span>span:last-child]:!text-leaf-300'
