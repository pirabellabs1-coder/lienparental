import { CircleHelp, FolderClosed, Settings, Share2, ShieldCheck, Trash2, Users } from 'lucide-react'
import { ScreenHeader } from '@/components/coffre/ScreenHeader'
import { ListRow } from '@/components/coffre/ListRow'

// Maquette « 4. Menu du coffre-fort »
const ITEMS = [
  { href: '/app/coffre/temoignages', label: 'Témoignages', icon: Users, cls: 'text-iris-500' },
  { href: '/app/coffre/documents', label: 'Documents', icon: FolderClosed, cls: 'text-leaf-500' },
  { href: '/app/coffre/corbeille', label: 'Corbeille', icon: Trash2, cls: 'text-night-700' },
  { href: '/app/coffre/partages', label: 'Partages actifs', icon: Share2, cls: 'text-night-700' },
  { href: '/app/coffre/parametres', label: 'Paramètres', icon: Settings, cls: 'text-night-700' },
  { href: '/app/aide', label: 'Aide & support', icon: CircleHelp, cls: 'text-night-700' },
]

export default function CoffreMenuPage() {
  return (
    <>
      <ScreenHeader title="Coffre-fort" leading="close" backHref="/app/coffre" backLabel="Fermer le menu" />
      <nav aria-label="Menu du coffre-fort" className="px-5 pt-2">
        <ul className="divide-y divide-night-100">
          {ITEMS.map(({ href, label, icon: Icon, cls }) => (
            <li key={href}>
              <ListRow
                variant="plain"
                href={href}
                className="min-h-[60px]"
                icon={<Icon className={`h-[22px] w-[22px] shrink-0 ${cls}`} strokeWidth={1.9} aria-hidden="true" />}
                title={<span className="font-semibold">{label}</span>}
              />
            </li>
          ))}
        </ul>
      </nav>

      <div className="mx-5 mt-8 flex items-start gap-3.5 rounded-2xl border border-night-100 bg-night-50/60 p-4">
        <ShieldCheck className="h-8 w-8 shrink-0 text-leaf-500" strokeWidth={1.8} aria-hidden="true" />
        <div>
          <p className="text-[13px] font-bold text-leaf-600">
            Sécurité <span aria-hidden="true">•</span> Confidentialité <span aria-hidden="true">•</span> Privé
          </p>
          <p className="mt-1 text-[13px] leading-snug text-night-700">
            Vos données sont protégées et ne sont jamais partagées.
          </p>
        </div>
      </div>
    </>
  )
}
