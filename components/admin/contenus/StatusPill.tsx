import { cn } from '@/lib/cn'
import type { ContentStatus } from '@/lib/contenus/types'

/** Statut éditorial lisible (un article publié avec une date future est « Programmé »). */
export function statusInfo(statut: ContentStatus, publishedAt: string | null, now = Date.now()) {
  if (statut === 'publie' && publishedAt && new Date(publishedAt).getTime() > now) {
    return { label: 'Programmé', cls: 'bg-night-100 text-night-800 ring-night-200' }
  }
  if (statut === 'publie') return { label: 'Publié', cls: 'bg-leaf-50 text-leaf-800 ring-leaf-200' }
  if (statut === 'archive') return { label: 'Archivé', cls: 'bg-[#f1f2f4] text-night-600 ring-[#E5E7EB]' }
  return { label: 'Brouillon', cls: 'bg-gold-50 text-gold-800 ring-gold-200' }
}

export function StatusPill({ statut, publishedAt, className }: { statut: ContentStatus; publishedAt: string | null; className?: string }) {
  const s = statusInfo(statut, publishedAt)
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-bold ring-1 ring-inset', s.cls, className)}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {s.label}
    </span>
  )
}

export const dateTimeFr = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Cayenne' }).format(new Date(iso))
