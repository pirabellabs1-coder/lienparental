import { useTranslations } from 'next-intl'
import { CircleHelp, Folder, FolderClosed, Settings, Share2, ShieldCheck, Trash2, Users } from 'lucide-react'
import { ScreenHeader } from '@/components/coffre/ScreenHeader'
import { ListRow } from '@/components/coffre/ListRow'

// Maquette « 4. Menu du coffre-fort »
// labelKey : clé dans l'espace « vault ».
const ITEMS = [
  { href: '/app/coffre/temoignages', labelKey: 'common.testimonials', icon: Users, cls: 'text-iris-500' },
  { href: '/app/coffre/documents', labelKey: 'common.documents', icon: FolderClosed, cls: 'text-leaf-500' },
  { href: '/app/coffre/dossiers', labelKey: 'menu.folders', icon: Folder, cls: 'text-leaf-500' },
  { href: '/app/coffre/corbeille', labelKey: 'menu.trash', icon: Trash2, cls: 'text-night-700' },
  { href: '/app/coffre/partages', labelKey: 'menu.shares', icon: Share2, cls: 'text-night-700' },
  { href: '/app/coffre/parametres', labelKey: 'menu.settings', icon: Settings, cls: 'text-night-700' },
  { href: '/app/aide', labelKey: 'menu.help', icon: CircleHelp, cls: 'text-night-700' },
]

export default function CoffreMenuPage() {
  const t = useTranslations('vault')
  return (
    <>
      <ScreenHeader title={t('common.vault')} leading="close" backHref="/app/coffre" backLabel={t('menu.closeMenu')} />
      <nav aria-label={t('home.menuAria')} className="px-5 pt-2">
        <ul className="divide-y divide-night-100">
          {ITEMS.map(({ href, labelKey, icon: Icon, cls }) => (
            <li key={href}>
              <ListRow
                variant="plain"
                href={href}
                className="min-h-[60px]"
                icon={<Icon className={`h-[22px] w-[22px] shrink-0 ${cls}`} strokeWidth={1.9} aria-hidden="true" />}
                title={<span className="font-semibold">{t(labelKey)}</span>}
              />
            </li>
          ))}
        </ul>
      </nav>

      <div className="mx-5 mt-8 flex items-start gap-3.5 rounded-2xl border border-night-100 bg-night-50/60 p-4">
        <ShieldCheck className="h-8 w-8 shrink-0 text-leaf-500" strokeWidth={1.8} aria-hidden="true" />
        <div>
          <p className="text-[13px] font-bold text-leaf-600">
            {t('menu.securityTitle')} <span aria-hidden="true">•</span> {t('menu.privacyTitle')} <span aria-hidden="true">•</span> {t('menu.privateTitle')}
          </p>
          <p className="mt-1 text-[13px] leading-snug text-night-700">
            {t('menu.securityText')}
          </p>
        </div>
      </div>
    </>
  )
}
