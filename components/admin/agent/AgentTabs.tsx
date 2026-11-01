import Link from 'next/link'
import { cn } from '@/lib/cn'

const TABS = [
  ['/admin/agent', 'Vue d’ensemble'],
  ['/admin/agent/base', 'Base de connaissances'],
  ['/admin/agent/equipe', 'Services et représentants'],
  ['/admin/agent/agenda', 'Agenda et rendez-vous'],
  ['/admin/agent/messages', 'Textes par défaut'],
] as const

export const CATEGORY_LABEL: Record<string, string> = {
  presentation: 'Présentation et mission', fonctionnalites: 'Fonctionnalités', tarifs: 'Tarifs et abonnements', compte: 'Inscription et connexion',
  paiement: 'Paiement, renouvellement, résiliation', technique: 'FAQ techniques', partenariats: 'Partenariats et adhésion',
  contact: 'Coordonnées, horaires, délais', escalade: 'Règles d’escalade', liens: 'Liens officiels',
}
export const KB_STATUS: Record<string, { label: string; tone: 'neutral' | 'info' | 'ok' | 'warn' | 'danger' }> = {
  draft: { label: 'Brouillon', tone: 'neutral' }, review: { label: 'À valider', tone: 'warn' }, published: { label: 'Publiée', tone: 'ok' },
  scheduled: { label: 'Programmée', tone: 'info' }, archived: { label: 'Archivée', tone: 'neutral' },
}

export function AgentTabs({ current }: { current: (typeof TABS)[number][0] }) {
  return (
    <nav aria-label="Agent d’accueil" className="mt-6 flex flex-wrap gap-2">
      {TABS.map(([href, label]) => (
        <Link key={href} href={href} aria-current={current === href ? 'page' : undefined}
          className={cn('inline-flex min-h-[40px] items-center rounded-full px-4 text-[14px] font-semibold ring-1', current === href ? 'bg-night-900 text-white ring-night-900' : 'bg-white text-night-800 ring-night-200 hover:bg-night-50')}>
          {label}
        </Link>
      ))}
    </nav>
  )
}
