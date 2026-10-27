import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/cn'

export type Crumb = { label: string; href?: string }

/**
 * Fil d'Ariane des dossiers du coffre : liens vers les niveaux parents, dernier
 * élément = page courante (aria-current). Défile horizontalement s'il est long.
 */
export function Breadcrumb({ items, className }: { items: Crumb[]; className?: string }) {
  const t = useTranslations('vault.ui')
  return (
    <nav aria-label={t('breadcrumb')} className={cn('-mx-5 overflow-x-auto px-5 [scrollbar-width:none]', className)}>
      <ol className="flex min-w-max items-center gap-0.5 text-[12.5px]">
        {items.map((c, i) => {
          const last = i === items.length - 1
          return (
            <li key={`${i}-${c.label}`} className="flex items-center gap-0.5">
              {last || !c.href ? (
                <span aria-current={last ? 'page' : undefined} className="max-w-[40vw] truncate px-1 py-2 font-bold text-night-900">{c.label}</span>
              ) : (
                <Link href={c.href} className="inline-flex min-h-[44px] max-w-[40vw] items-center truncate rounded-lg px-1 font-semibold text-leaf-700 hover:bg-leaf-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400">
                  {c.label}
                </Link>
              )}
              {!last && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-night-400" aria-hidden="true" />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
