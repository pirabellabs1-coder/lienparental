import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import {
  AlertTriangle, CircleCheck, CloudOff, CloudUpload, FileDown, Inbox, Loader, RefreshCw,
  Settings, Trash2, Wrench, ChevronRight, type LucideIcon,
} from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { cn } from '@/lib/cn'

export async function generateMetadata() {
  const t = await getTranslations('account.states')
  return { title: t('title') }
}

// Titre et texte traduits au rendu : account.states.items.{slug}.title / text.
type Item = { slug: string; icon: LucideIcon; tone: string }

// Vitrine de revue client : chaque carte ouvre l'état en plein écran (/app/etats/[etat]).
const GENERAUX: Item[] = [
  { slug: 'chargement', icon: Loader, tone: 'bg-leaf-50 text-leaf-600' },
  { slug: 'succes', icon: CircleCheck, tone: 'bg-leaf-50 text-leaf-600' },
  { slug: 'erreur', icon: AlertTriangle, tone: 'bg-alert-50 text-alert-500' },
  { slug: 'hors-connexion', icon: CloudOff, tone: 'bg-night-50 text-night-700' },
  { slug: 'vide', icon: Inbox, tone: 'bg-night-50 text-night-500' },
  { slug: 'maintenance', icon: Wrench, tone: 'bg-night-50 text-night-700' },
]

const OPERATIONS: Item[] = [
  { slug: 'synchronisation', icon: RefreshCw, tone: 'bg-night-50 text-night-800' },
  { slug: 'sauvegarde', icon: CloudUpload, tone: 'bg-leaf-50 text-leaf-600' },
  { slug: 'suppression', icon: Trash2, tone: 'bg-alert-50 text-alert-500' },
  { slug: 'importation', icon: FileDown, tone: 'bg-iris-50 text-iris-600' },
  { slug: 'mise-a-jour', icon: Settings, tone: 'bg-blue-50 text-blue-600' },
  { slug: 'a-jour', icon: CircleCheck, tone: 'bg-leaf-50 text-leaf-600' },
]

async function List({ id, title, items }: { id: string; title: string; items: Item[] }) {
  const t = await getTranslations('account.states.items')
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="mb-2.5 text-[13px] font-bold text-night-900">{title}</h2>
      <ul className="grid gap-2.5 md:grid-cols-2">
        {items.map(({ slug, icon: Icon, tone }) => (
          <li key={slug}>
            <Link
              href={`/app/etats/${slug}`}
              className="flex h-full items-center gap-3.5 rounded-2xl border border-night-100 bg-white p-3.5 shadow-soft transition-colors hover:bg-night-50/40"
            >
              <span aria-hidden="true" className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-xl', tone)}>
                <Icon className="h-6 w-6" strokeWidth={1.8} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold text-night-900">{t(`${slug}.title`)}</span>
                <span className="mt-0.5 block text-[11.5px] leading-snug text-night-600">{t(`${slug}.text`)}</span>
              </span>
              <ChevronRight aria-hidden="true" className="h-[18px] w-[18px] shrink-0 text-night-700" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default async function EtatsPage() {
  const t = await getTranslations('account.states')
  return (
    <>
      <TopBar title={t('title')} showBack backHref="/app" showBell={false} />
      <div className="space-y-6 px-4 pb-6 pt-2">
        <List id="generaux" title={t('general')} items={GENERAUX} />
        <List id="operations" title={t('operations')} items={OPERATIONS} />
      </div>
    </>
  )
}
