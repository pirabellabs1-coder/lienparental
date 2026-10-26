import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Props = {
  href: string
  icon?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  className?: string
  /** `card` = carte individuelle ; `plain` = ligne de liste séparée par un filet. */
  variant?: 'card' | 'plain'
}

/** Ligne cliquable « icône · titre/sous-titre · chevron » (menus, catégories, demandes). */
export function ListRow({ href, icon, title, subtitle, trailing, className, variant = 'card' }: Props) {
  return (
    <Link
      href={href}
      className={cn(
        'group flex min-h-[56px] items-center gap-3 transition-colors',
        variant === 'card'
          ? 'rounded-2xl border border-night-100 bg-white px-3.5 py-3 shadow-soft hover:shadow-card'
          : 'px-1 py-3 hover:bg-night-50/60',
        className,
      )}
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-bold text-night-900">{title}</span>
        {subtitle && <span className="block truncate text-[12.5px] text-night-500">{subtitle}</span>}
      </span>
      {trailing}
      <ChevronRight className="h-5 w-5 shrink-0 text-night-400 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  )
}
