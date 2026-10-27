/**
 * Primitives d'affichage des écrans opérationnels (comptes, support, journaux, témoignages,
 * paramètres). Composants SERVEUR (aucun état) : utilisables dans les pages et dans les
 * composants client. Styles alignés sur le back-office contenus (cibles 44 px, focus visible).
 */
import Link from 'next/link'
import type { ReactNode } from 'react'
import { FlaskConical, Info } from 'lucide-react'
import { cn } from '@/lib/cn'
import { DEFAULT_TZ } from '@/lib/tz'

export const fieldCls =
  'w-full min-h-[44px] rounded-xl border border-night-200 bg-white px-3.5 py-2.5 text-[14.5px] text-night-900 shadow-soft placeholder:text-night-400 focus-visible:border-leaf-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500/30'
export const btnPrimaryCls =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-leaf-500 px-4 text-[14px] font-semibold text-white hover:bg-leaf-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
export const btnSecondaryCls =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-night-200 bg-white px-4 text-[14px] font-semibold text-night-900 hover:bg-night-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 disabled:cursor-not-allowed disabled:opacity-50'
export const btnDangerCls =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-alert-200 bg-white px-4 text-[14px] font-semibold text-alert-600 hover:bg-alert-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alert-400 disabled:cursor-not-allowed disabled:opacity-50'
export const linkCls = 'font-semibold text-night-900 underline-offset-2 hover:text-leaf-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 rounded'

const dtf = new Intl.DateTimeFormat('fr-FR', { timeZone: DEFAULT_TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const df = new Intl.DateTimeFormat('fr-FR', { timeZone: DEFAULT_TZ, day: '2-digit', month: '2-digit', year: 'numeric' })
const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

export const fmtDateTime = (iso: string | null | undefined) => (iso && !Number.isNaN(Date.parse(iso)) ? dtf.format(new Date(iso)) : '')
export const fmtDate = (iso: string | null | undefined) => (iso && !Number.isNaN(Date.parse(iso)) ? df.format(new Date(iso)) : '')
export function fmtMb(mb: number): string {
  return mb >= 1024 ? `${nf.format(mb / 1024)} Go` : `${nf.format(mb)} Mo`
}

/** Identifiant raccourci (lisible, sans exposer plus que nécessaire). */
export const shortId = (id: string) => (id.length > 12 ? `${id.slice(0, 8)}…` : id)

export function OpsHeader({ title, description, actions, icon }: { title: string; description?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3.5">
        {icon && (
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl2 bg-leaf-50 text-leaf-600 ring-1 ring-inset ring-leaf-100">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-[24px] font-extrabold leading-tight tracking-[-0.01em] text-night-900 sm:text-[28px]">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-night-500">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  )
}

export function DemoNotice({ mode, children }: { mode: 'demo' | 'live'; children?: ReactNode }) {
  if (mode === 'live') return null
  return (
    <p role="note" className="mt-4 flex gap-2 rounded-xl border border-gold-200 bg-gold-50 p-3 text-[13px] text-night-800">
      <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-gold-700" aria-hidden="true" />
      <span>
        <strong className="text-night-900">Données de démonstration.</strong>{' '}
        {children ?? 'Comptes et événements fictifs, conservés en mémoire du serveur jusqu’à son redémarrage. Les vraies données s’affichent dès que Supabase est configuré.'}
      </span>
    </p>
  )
}

export function Note({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'privacy' }) {
  return (
    <p role="note" className={cn('mt-4 flex gap-2 rounded-xl border p-3 text-[13px]',
      tone === 'privacy' ? 'border-night-200 bg-night-50 text-night-800' : 'border-night-100 bg-white text-night-700')}>
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-night-500" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}

export function Panel({ title, icon, children, className, actions }: { title: string; icon?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={cn('rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-soft sm:p-5', className)} aria-label={title}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[16px] font-extrabold text-night-900">{icon}{title}</h2>
        {actions}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  )
}

export function KV({ items }: { items: { k: string; v: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-night-100 text-[14px]">
      {items.map(({ k, v }) => (
        <div key={k} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
          <dt className="text-night-600">{k}</dt>
          <dd className="min-w-0 break-words text-right font-semibold text-night-900">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

const TONES = {
  neutral: 'bg-night-100 text-night-800',
  ok: 'bg-leaf-100 text-leaf-800',
  warn: 'bg-gold-100 text-gold-800',
  danger: 'bg-alert-100 text-alert-700',
  info: 'bg-iris-100 text-iris-800',
  dark: 'bg-night-900 text-white',
} as const
export type Tone = keyof typeof TONES

export function Pill({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-semibold', TONES[tone])}>{children}</span>
}

/** Champ de filtre libellé (formulaire GET, fonctionne sans JavaScript). */
export function FilterField({ label, children, htmlFor }: { label: string; children: ReactNode; htmlFor: string }) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="mb-1 block text-[12.5px] font-bold text-night-800">{label}</label>
      {children}
    </div>
  )
}

export function FilterBar({ action, children, resetHref }: { action: string; children: ReactNode; resetHref: string }) {
  return (
    <form method="get" action={action} role="search" className="mt-5 rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-soft">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">{children}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="submit" className={btnPrimaryCls}>Filtrer</button>
        <Link href={resetHref} className={btnSecondaryCls}>Réinitialiser</Link>
      </div>
    </form>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-night-200 bg-white px-4 py-10 text-center text-[14px] text-night-600">{children}</p>
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <p role="alert" className="mt-5 rounded-2xl border border-alert-200 bg-alert-50 p-4 text-[14px] font-semibold text-alert-700">{message}</p>
  )
}

/** Construit une URL de liste en conservant les filtres (valeurs vides retirées). */
export function hrefWith(base: string, params: Record<string, string | number | null | undefined>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v))
  const s = q.toString()
  return s ? `${base}?${s}` : base
}
