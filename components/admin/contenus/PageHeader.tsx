import type { ReactNode } from 'react'
import { Info } from 'lucide-react'

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.01em] text-night-900 sm:text-[30px]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[14px] text-night-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  )
}

/** Rappel du mode de stockage (démonstration = mémoire du serveur). */
export function ModeNotice({ mode }: { mode: 'demo' | 'live' }) {
  if (mode === 'live') return null
  return (
    <p className="mt-4 flex gap-2 rounded-xl border border-night-100 bg-white p-3 text-[13px] text-night-700">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-night-500" aria-hidden="true" />
      Mode démonstration : les modifications sont visibles tout de suite côté parent et sur le blog, et conservées en mémoire du serveur jusqu’à son redémarrage.
    </p>
  )
}

export const newBtn =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-leaf-500 px-4 text-[14px] font-semibold text-white hover:bg-leaf-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2'
