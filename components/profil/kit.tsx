// Briques visuelles partagées des écrans Profil / Premium / Aide (cf. maquettes).
// Composants sans état : utilisables depuis des pages serveur comme client.
import Link from 'next/link'
import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowLeft, Bell, Check, ChevronRight, Lock } from 'lucide-react'
import { Logo } from '@/components/brand/Logo'
import { cn } from '@/lib/cn'

/* ------------------------------------------------------------------ */
/* Boutons (classes partagées pour <button> et <Link>)                 */
/* ------------------------------------------------------------------ */

// Système de boutons unique — voir docs/DESIGN_SYSTEM.md.
const btnBase =
  'inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-semibold transition duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none active:scale-[0.98] motion-reduce:active:scale-100 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-leaf-500 disabled:cursor-not-allowed disabled:opacity-50'

const primary = cn(btnBase, 'bg-leaf-500 text-white shadow-[0_8px_20px_-10px_rgba(46,125,50,.55)] hover:bg-leaf-600')
const secondary = cn(btnBase, 'border border-night-200 bg-white text-night-900 hover:bg-night-50')

export const btn = {
  primary,
  secondary,
  danger: cn(btnBase, 'bg-alert-500 text-white hover:bg-alert-600 focus-visible:ring-alert-300'),
  dangerOutline: cn(btnBase, 'border border-alert-300 bg-white text-alert-600 hover:bg-alert-50 focus-visible:ring-alert-300'),
  // Alias historiques — suivent désormais le système.
  /** @deprecated utiliser `primary` */
  leaf: primary,
  /** @deprecated utiliser `primary` (le bleu nuit est réservé aux textes) */
  night: primary,
  /** @deprecated utiliser `secondary` */
  outline: secondary,
  /** @deprecated utiliser `secondary` */
  soft: secondary,
}

/* ------------------------------------------------------------------ */
/* En-têtes                                                            */
/* ------------------------------------------------------------------ */

/** Logo en haut à gauche + cloche (écrans racine : Profil, Sécurité, Infos perso…). */
export function BrandHeader({
  title,
  bell = true,
  notifications = 0,
}: { title?: string; bell?: boolean; notifications?: number }) {
  const t = useTranslations('account.kit')
  return (
    <header
      className="flex items-center gap-4 px-5 pb-2"
      data-safe-top style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
    >
      <Link href="/app" aria-label={t('homeAria')} className="rounded-lg md:invisible focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400">
        <Logo size="sm" />
      </Link>
      {title && <p className="flex-1 truncate text-[17px] font-bold text-night-900">{title}</p>}
      {bell && <BellLink count={notifications} className={title ? '' : 'ml-auto'} />}
    </header>
  )
}

export function BellLink({ count = 0, className }: { count?: number; className?: string }) {
  const t = useTranslations('account.kit')
  return (
    <Link
      href="/app/notifications"
      aria-label={count > 0 ? t('notificationsUnread', { count }) : t('notifications')}
      className={cn('relative -mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-night-900 hover:bg-night-50', className)}
    >
      <Bell className="h-[22px] w-[22px]" aria-hidden />
      {count > 0 && <span aria-hidden className="absolute bottom-2.5 right-2.5 h-2.5 w-2.5 rounded-full bg-leaf-500 ring-2 ring-white" />}
    </Link>
  )
}

/** Flèche retour + titre aligné à gauche (Préférences, Informations personnelles). */
export function TitleBar({
  title,
  backHref,
  size = 'lg',
  subtitle,
  right,
  onBack,
}: { title: string; backHref: string; size?: 'md' | 'lg'; subtitle?: ReactNode; right?: ReactNode; onBack?: () => void }) {
  const t = useTranslations('account.kit')
  const backCls = '-ml-2.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-night-900 hover:bg-night-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400'
  return (
    <div className="px-5 pt-3">
      <div className="flex items-center gap-2">
        {onBack ? (
          <button type="button" onClick={onBack} aria-label={t('prevStep')} className={backCls}>
            <ArrowLeft className="h-[22px] w-[22px]" aria-hidden />
          </button>
        ) : (
          <Link href={backHref} aria-label={t('back')} className={backCls}>
            <ArrowLeft className="h-[22px] w-[22px]" aria-hidden />
          </Link>
        )}
        <h1 className={cn('min-w-0 flex-1 truncate font-bold text-night-900', size === 'lg' ? 'text-[22px]' : 'text-[16px]')}>{title}</h1>
        {right}
      </div>
      {subtitle && <p className="mt-2 pl-[42px] text-[13px] leading-relaxed text-night-700">{subtitle}</p>}
    </div>
  )
}

/** Titre de page principal ("Mon profil", "Sécurité"…). */
export function PageTitle({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div>
      <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.01em] text-night-900">{title}</h1>
      {subtitle && <p className="mt-1.5 text-[13.5px] leading-relaxed text-night-700">{subtitle}</p>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Sections & listes                                                   */
/* ------------------------------------------------------------------ */

export function SectionLabel({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.04em] text-night-700">
      {children}
    </h2>
  )
}

export function SectionTitle({ children, id, className }: { children: ReactNode; id?: string; className?: string }) {
  return (
    <h2 id={id} className={cn('mb-3 text-[15px] font-bold text-night-900', className)}>
      {children}
    </h2>
  )
}

export function Panel({ className, children, as: As = 'div' }: { className?: string; children: ReactNode; as?: 'div' | 'section' | 'ul' }) {
  return <As className={cn('rounded-xl2 border border-night-100 bg-white shadow-soft', className)}>{children}</As>
}

/** Carte contenant des lignes séparées par un filet. */
export function ListGroup({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <ul aria-label={label} className={cn('divide-y divide-night-100 overflow-hidden rounded-xl2 border border-night-100 bg-white shadow-soft', className)}>
      {children}
    </ul>
  )
}

type RowProps = {
  icon?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  right?: ReactNode
  chevron?: boolean
  tone?: 'default' | 'danger'
  href?: string
  onClick?: () => void
  className?: string
  /** Rendu sans <li> (carte isolée). */
  standalone?: boolean
}

/** Ligne de liste : icône à gauche, titre gras + sous-titre gris, chevron à droite. */
export function ListRow({ icon, title, subtitle, right, chevron = true, tone = 'default', href, onClick, className, standalone }: RowProps) {
  const inner = (
    <>
      {icon && (
        <span
          aria-hidden
          className={cn('inline-flex h-10 w-10 shrink-0 items-center justify-center', tone === 'danger' ? 'text-alert-500' : 'text-night-900')}
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1 text-left">
        <span className={cn('block text-[14px] font-bold leading-snug', tone === 'danger' ? 'text-alert-600' : 'text-night-900')}>{title}</span>
        {subtitle && <span className="mt-0.5 block text-[12.5px] leading-snug text-night-600">{subtitle}</span>}
      </span>
      {right}
      {chevron && <ChevronRight className="h-5 w-5 shrink-0 text-night-900" aria-hidden />}
    </>
  )
  const cls = cn(
    'flex w-full min-h-[64px] items-center gap-3 px-4 py-3 transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
    (href || onClick) && 'hover:bg-night-50/60 focus-visible:outline-none focus-visible:bg-night-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-leaf-400',
    standalone && 'rounded-xl2 border bg-white shadow-soft',
    standalone && (tone === 'danger' ? 'border-alert-100 bg-alert-50/40' : 'border-night-100'),
    className,
  )
  const node = href ? (
    <Link href={href} className={cls}>{inner}</Link>
  ) : onClick ? (
    <button type="button" onClick={onClick} className={cls}>{inner}</button>
  ) : (
    <div className={cls}>{inner}</div>
  )
  return standalone ? node : <li>{node}</li>
}

/** Ligne libellé / valeur (récapitulatifs). */
export function DetailRow({ icon, label, value, strong }: { icon?: ReactNode; label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex min-h-[48px] items-center gap-3 px-4 py-2.5">
      {icon && <span aria-hidden className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-night-900">{icon}</span>}
      <dt className={cn('min-w-0 flex-1 text-[13px]', strong ? 'font-bold text-night-900' : 'text-night-800')}>{label}</dt>
      <dd className="text-right text-[13px] text-night-900">{value}</dd>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Bandeaux                                                            */
/* ------------------------------------------------------------------ */

const BANNER_TONES = {
  warm: { box: 'bg-orange-50/70 border-orange-100', icon: 'text-orange-500' },
  green: { box: 'bg-leaf-50 border-leaf-100', icon: 'text-leaf-600' },
  night: { box: 'bg-night-50 border-night-100', icon: 'text-night-900' },
  red: { box: 'bg-alert-50 border-alert-100', icon: 'text-alert-500' },
  gold: { box: 'bg-gold-50 border-gold-100', icon: 'text-gold-500' },
} as const

export function Banner({
  tone = 'warm',
  icon,
  title,
  children,
  className,
  role,
}: { tone?: keyof typeof BANNER_TONES; icon?: ReactNode; title?: ReactNode; children?: ReactNode; className?: string; role?: 'status' | 'note' }) {
  const t = BANNER_TONES[tone]
  return (
    <div role={role} className={cn('flex items-start gap-3.5 rounded-xl2 border p-4', t.box, className)}>
      {icon && <span aria-hidden className={cn('mt-0.5 inline-flex shrink-0', t.icon)}>{icon}</span>}
      <div className="min-w-0 flex-1">
        {title && <p className={cn('text-[13.5px] font-bold', tone === 'green' ? 'text-leaf-700' : 'text-night-900')}>{title}</p>}
        {children && <div className={cn('text-[12.5px] leading-relaxed text-night-700', title && 'mt-1')}>{children}</div>}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Stepper numéroté                                                    */
/* ------------------------------------------------------------------ */

/**
 * Cercles numérotés reliés par un trait.
 * Terminé = cercle vert contour + coche ; en cours = vert plein ; à venir = contour gris.
 */
export function Stepper({ current, total, labels, className }: { current: number; total: number; labels?: string[]; className?: string }) {
  const t = useTranslations('account.kit')
  const steps = Array.from({ length: total }, (_, i) => i + 1)
  const currentLabel = labels?.[current - 1]
  return (
    <div className={cn('w-full', className)}>
      <p className="sr-only">
        {currentLabel ? t('stepWithLabel', { current, total, label: currentLabel }) : t('step', { current, total })}
      </p>
      <ol aria-hidden className={cn('flex items-start', labels && 'px-8 pb-7')}>
        {steps.map((i, idx) => {
          const state = i < current ? 'done' : i === current ? 'current' : 'todo'
          return (
            <li key={i} className={cn('relative flex', idx < steps.length - 1 ? 'flex-1' : '')}>
              <div className="flex w-full items-center">
                <span
                  className={cn(
                    'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-[1.5px] text-[13px] font-bold',
                    state === 'done' && 'border-leaf-500 bg-white text-leaf-600',
                    state === 'current' && 'border-leaf-500 bg-leaf-500 text-white',
                    state === 'todo' && 'border-night-200 bg-white text-night-700',
                  )}
                >
                  {state === 'done' ? <Check className="h-4 w-4" strokeWidth={2.5} /> : i}
                </span>
                {idx < steps.length - 1 && (
                  <span className={cn('mx-1 h-[1.5px] flex-1', i < current ? 'bg-leaf-500' : 'bg-night-100')} />
                )}
              </div>
              {labels?.[idx] && (
                <span className={cn('absolute left-4 top-10 -translate-x-1/2 whitespace-nowrap text-[11px]', state === 'todo' ? 'text-night-600' : 'text-night-800')}>
                  {labels[idx]}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Visuels                                                             */
/* ------------------------------------------------------------------ */

/** Couronne de la maquette (3 pointes à pastilles). */
export function CrownIcon({ className, variant = 'gold' }: { className?: string; variant?: 'gold' | 'outline' }) {
  const gold = variant === 'gold'
  return (
    <svg viewBox="0 0 48 40" className={className} aria-hidden fill="none">
      <path
        d="M8 30 5 13l11 8 8-14 8 14 11-8-3 17H8Z"
        fill={gold ? '#f5bd3a' : 'none'}
        stroke={gold ? '#c98410' : 'currentColor'}
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path d="M8 35h32" stroke={gold ? '#c98410' : 'currentColor'} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="5" cy="11" r="2.6" fill={gold ? '#e9a21b' : 'currentColor'} />
      <circle cx="24" cy="5" r="2.6" fill={gold ? '#e9a21b' : 'currentColor'} />
      <circle cx="43" cy="11" r="2.6" fill={gold ? '#e9a21b' : 'currentColor'} />
      {gold && <path d="M24 17c2 2.6 3 4.6 3 6.4a3 3 0 1 1-6 0c0-1.8 1-3.8 3-6.4Z" fill="#fff8e6" />}
    </svg>
  )
}

/** Grand cercle de validation entouré de confettis. */
export function SuccessBurst({ tone = 'leaf', className }: { tone?: 'leaf' | 'gold'; className?: string }) {
  const dots = [
    { x: 8, y: 30, c: 'bg-orange-400', s: 'h-2 w-2' },
    { x: 18, y: 8, c: 'bg-leaf-500', s: 'h-1.5 w-1.5' },
    { x: 50, y: 0, c: 'bg-leaf-600', s: 'h-1.5 w-1.5' },
    { x: 84, y: 10, c: 'bg-orange-400', s: 'h-2 w-2' },
    { x: 94, y: 36, c: 'bg-leaf-500', s: 'h-1.5 w-1.5' },
    { x: 86, y: 70, c: 'bg-orange-400', s: 'h-2 w-2' },
    { x: 10, y: 72, c: 'bg-leaf-600', s: 'h-1.5 w-1.5' },
    { x: 30, y: 2, c: 'bg-gold-300', s: 'h-1.5 w-3 rotate-45 rounded-sm' },
    { x: 70, y: 4, c: 'bg-alert-400', s: 'h-1.5 w-3 -rotate-12 rounded-sm' },
    { x: 2, y: 50, c: 'bg-iris-400', s: 'h-1.5 w-3 rotate-12 rounded-sm' },
  ]
  return (
    <div aria-hidden className={cn('relative mx-auto h-40 w-48', className)}>
      {dots.map((d, i) => (
        <span key={i} className={cn('absolute rounded-full', d.c, d.s)} style={{ left: `${d.x}%`, top: `${d.y}%` }} />
      ))}
      <span
        className={cn(
          'absolute left-1/2 top-1/2 flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full motion-safe:animate-fade-up',
          tone === 'gold' ? 'bg-gold-400 shadow-[0_12px_30px_-10px_rgba(233,162,27,.7)]' : 'bg-leaf-50',
        )}
      >
        <span
          className={cn(
            'flex items-center justify-center rounded-full',
            tone === 'gold' ? 'h-28 w-28 text-white' : 'h-20 w-20 bg-leaf-600 text-white shadow-[0_10px_24px_-10px_rgba(24,105,47,.8)]',
          )}
        >
          <Check className={tone === 'gold' ? 'h-14 w-14' : 'h-10 w-10'} strokeWidth={3} />
        </span>
      </span>
    </div>
  )
}

/** Barre de progression fine. */
export function ProgressBar({
  value,
  max = 100,
  tone = 'night',
  label,
  className,
}: { value: number; max?: number; tone?: 'night' | 'leaf' | 'alert'; label: string; className?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-night-100', className)}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-300', tone === 'leaf' ? 'bg-leaf-500' : tone === 'alert' ? 'bg-alert-500' : 'bg-night-900')}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function StripeNote({ className }: { className?: string }) {
  const t = useTranslations('account.kit')
  return (
    <p className={cn('flex items-center justify-center gap-1.5 text-[12px] text-night-600', className)}>
      <Lock className="h-3.5 w-3.5" aria-hidden />
      {t('stripe')}
    </p>
  )
}

/** Pastille "Actif", "PREMIUM", "GRATUIT"… */
export function Pill({ tone = 'gold', children, className }: { tone?: 'gold' | 'goldSoft' | 'night' | 'leaf' | 'leafSoft' | 'orange'; children: ReactNode; className?: string }) {
  const tones = {
    gold: 'bg-gold-400 text-white',
    goldSoft: 'bg-gold-100 text-gold-700',
    night: 'bg-night-100 text-night-900',
    leaf: 'bg-leaf-600 text-white',
    leafSoft: 'bg-leaf-50 text-leaf-700',
    orange: 'bg-orange-50 text-orange-700 border border-orange-100',
  }
  return (
    <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-[11.5px] font-bold', tones[tone], className)}>{children}</span>
  )
}

/** Conteneur de page standard. */
export function Screen({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-5 pb-8 pt-3', className)}>{children}</div>
}
