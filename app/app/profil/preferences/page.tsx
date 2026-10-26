import Link from 'next/link'
import { Bell, ChevronRight, CircleCheck, Paintbrush, Settings } from 'lucide-react'
import { PageTitle } from '@/components/profil/kit'
import { cn } from '@/lib/cn'

const ITEMS = [
  { href: '/app/profil/preferences/general', title: 'Général', text: 'Langue, fuseau horaire, format…', icon: Settings, tone: 'bg-leaf-50 text-leaf-600' },
  { href: '/app/profil/preferences/notifications', title: 'Notifications', text: 'Alertes, rappels, e-mails…', icon: Bell, tone: 'bg-iris-50 text-iris-600' },
  { href: '/app/profil/preferences/apparence', title: 'Apparence', text: 'Thème, couleurs, taille du texte…', icon: Paintbrush, tone: 'bg-orange-50 text-orange-500' },
]

export default function PreferencesPage() {
  return (
    <>
      <div className="px-5 pb-8 pt-8">
        <PageTitle title="Préférences" subtitle="Gérez vos préférences et personnalisez votre expérience." />
        <ul className="mt-10 space-y-4">
          {ITEMS.map(({ href, title, text, icon: Icon, tone }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex min-h-[96px] items-center gap-5 rounded-xl2 border border-night-100 bg-white px-4 py-4 shadow-soft transition hover:border-night-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400"
              >
                <span aria-hidden className={cn('inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-xl2', tone)}>
                  <Icon className="h-7 w-7" strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold text-night-900">{title}</span>
                  <span className="mt-1 block text-[12.5px] leading-relaxed text-night-800">{text}</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-night-900" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-16 flex items-center gap-4 rounded-xl2 border border-night-100 bg-leaf-50/40 p-4">
          <CircleCheck className="h-7 w-7 shrink-0 text-leaf-600" strokeWidth={1.8} aria-hidden />
          <p className="text-[12.5px] leading-relaxed text-night-800">Vos préférences sont synchronisées sur tous vos appareils.</p>
        </div>
      </div>
    </>
  )
}
