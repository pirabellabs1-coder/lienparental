import Link from 'next/link'
import { cn } from '@/lib/cn'

const TABS = [
  { href: '/admin/contenus/faq', label: 'FAQ' },
  { href: '/admin/contenus/tutoriels', label: 'Tutoriels' },
  { href: '/admin/contenus/conseils', label: 'Conseils du jour' },
  { href: '/admin/modeles', label: 'Modèles PDF' },
] as const

/** Onglets des contenus du centre d'aide (les modèles PDF ont leur propre écran). */
export function ContenusNav({ current }: { current: (typeof TABS)[number]['href'] }) {
  return (
    <nav aria-label="Sections de contenu" className="mt-5 flex flex-wrap gap-1.5 text-[14px]">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.href === current ? 'page' : undefined}
          className={cn(
            'inline-flex min-h-[44px] items-center rounded-full px-4 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500',
            t.href === current ? 'bg-leaf-500 text-white' : 'border border-[#E5E7EB] bg-white text-night-700 hover:bg-night-50',
          )}>
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
