import Link from 'next/link'
import {
  AlertTriangle, CircleCheck, CloudOff, CloudUpload, FileDown, Inbox, Loader, RefreshCw,
  Settings, Trash2, Wrench, ChevronRight, type LucideIcon,
} from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { cn } from '@/lib/cn'

export const metadata = { title: 'États système' }

type Item = { slug: string; title: string; text: string; icon: LucideIcon; tone: string }

// Vitrine de revue client : chaque carte ouvre l'état en plein écran (/app/etats/[etat]).
const GENERAUX: Item[] = [
  { slug: 'chargement', title: 'Chargement', text: "Indique que l'application est en train de traiter une demande.", icon: Loader, tone: 'bg-leaf-50 text-leaf-600' },
  { slug: 'succes', title: 'Succès', text: "Confirme que l'action a été réalisée correctement.", icon: CircleCheck, tone: 'bg-leaf-50 text-leaf-600' },
  { slug: 'erreur', title: 'Erreur', text: "Informe d'un problème et propose des solutions immédiates.", icon: AlertTriangle, tone: 'bg-alert-50 text-alert-500' },
  { slug: 'hors-connexion', title: 'Hors connexion', text: "Alerte sur l'absence de connexion et propose un mode d'utilisation adapté.", icon: CloudOff, tone: 'bg-night-50 text-night-700' },
  { slug: 'vide', title: 'Aucune donnée', text: "Indique qu'aucun élément n'est encore disponible.", icon: Inbox, tone: 'bg-night-50 text-night-500' },
  { slug: 'maintenance', title: 'Maintenance', text: 'Signale une maintenance en cours et invite à réessayer ultérieurement.', icon: Wrench, tone: 'bg-night-50 text-night-700' },
]

const OPERATIONS: Item[] = [
  { slug: 'synchronisation', title: 'Synchronisation', text: 'Indique que vos données se synchronisent entre vos appareils.', icon: RefreshCw, tone: 'bg-night-50 text-night-800' },
  { slug: 'sauvegarde', title: 'Sauvegarde', text: 'Confirme que vos données sont enregistrées en toute sécurité.', icon: CloudUpload, tone: 'bg-leaf-50 text-leaf-600' },
  { slug: 'suppression', title: 'Suppression', text: "Affiche le nombre d'éléments en cours de suppression et la progression.", icon: Trash2, tone: 'bg-alert-50 text-alert-500' },
  { slug: 'importation', title: 'Importation', text: "Montre l'avancement de l'importation et le nombre de fichiers restants.", icon: FileDown, tone: 'bg-iris-50 text-iris-600' },
  { slug: 'mise-a-jour', title: 'Mise à jour', text: "Informe du téléchargement et de l'installation d'une nouvelle version.", icon: Settings, tone: 'bg-blue-50 text-blue-600' },
  { slug: 'a-jour', title: 'Tout est à jour', text: "Confirme que l'application est à jour et fonctionne de manière optimale.", icon: CircleCheck, tone: 'bg-leaf-50 text-leaf-600' },
]

function List({ id, title, items }: { id: string; title: string; items: Item[] }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="mb-2.5 text-[13px] font-bold text-night-900">{title}</h2>
      <ul className="grid gap-2.5 md:grid-cols-2">
        {items.map(({ slug, title: t, text, icon: Icon, tone }) => (
          <li key={slug}>
            <Link
              href={`/app/etats/${slug}`}
              className="flex h-full items-center gap-3.5 rounded-2xl border border-night-100 bg-white p-3.5 shadow-soft transition-colors hover:bg-night-50/40"
            >
              <span aria-hidden="true" className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-xl', tone)}>
                <Icon className="h-6 w-6" strokeWidth={1.8} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold text-night-900">{t}</span>
                <span className="mt-0.5 block text-[11.5px] leading-snug text-night-600">{text}</span>
              </span>
              <ChevronRight aria-hidden="true" className="h-[18px] w-[18px] shrink-0 text-night-700" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function EtatsPage() {
  return (
    <>
      <TopBar title="États système" showBack backHref="/app" showBell={false} />
      <div className="space-y-6 px-4 pb-6 pt-2">
        <List id="generaux" title="Chargement, succès, erreur et hors connexion" items={GENERAUX} />
        <List id="operations" title="Opérations longues" items={OPERATIONS} />
      </div>
    </>
  )
}
