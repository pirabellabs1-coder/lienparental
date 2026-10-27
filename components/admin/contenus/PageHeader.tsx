import type { ReactNode } from 'react'
import { FlaskConical } from 'lucide-react'

export function PageHeader({ title, description, actions, icon }: {
  title: string
  description?: ReactNode
  actions?: ReactNode
  /** Petite icône décorative à gauche du titre (optionnelle). */
  icon?: ReactNode
}) {
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

/** Rappel compact du mode de stockage (démonstration = mémoire du serveur). */
export function ModeNotice({ mode }: { mode: 'demo' | 'live' }) {
  if (mode === 'live') return null
  return (
    <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-gold-200 bg-gold-50 px-3 py-1.5 text-[12.5px] font-medium text-gold-800">
      <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      Mode démonstration — modifications en mémoire du serveur jusqu’à son redémarrage.
    </div>
  )
}

export const newBtn =
  'inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-leaf-500 px-4 text-[14px] font-semibold text-white shadow-[0_6px_16px_-8px_rgba(46,125,50,0.6)] transition-all hover:bg-leaf-600 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2'
