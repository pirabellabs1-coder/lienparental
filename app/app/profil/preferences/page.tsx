import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Bell, ChevronRight, CircleCheck, Paintbrush, Settings } from 'lucide-react'
import { PageTitle } from '@/components/profil/kit'
import { cn } from '@/lib/cn'

const ITEMS = [
  { href: '/app/profil/preferences/general', key: 'general', icon: Settings, tone: 'bg-leaf-50 text-leaf-600' },
  { href: '/app/profil/preferences/notifications', key: 'notifications', icon: Bell, tone: 'bg-iris-50 text-iris-600' },
  { href: '/app/profil/preferences/apparence', key: 'appearance', icon: Paintbrush, tone: 'bg-orange-50 text-orange-500' },
] as const

export default async function PreferencesPage() {
  const t = await getTranslations('account.prefs.home')
  return (
    <>
      <div className="px-5 pb-8 pt-8">
        <PageTitle title={t('title')} subtitle={t('subtitle')} />
        <ul className="mt-10 space-y-4">
          {ITEMS.map(({ href, key, icon: Icon, tone }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex min-h-[96px] items-center gap-5 rounded-xl2 border border-night-100 bg-white px-4 py-4 shadow-soft transition hover:border-night-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400"
              >
                <span aria-hidden className={cn('inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-xl2', tone)}>
                  <Icon className="h-7 w-7" strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold text-night-900">{t(`items.${key}.title`)}</span>
                  <span className="mt-1 block text-[12.5px] leading-relaxed text-night-800">{t(`items.${key}.text`)}</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-night-900" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-16 flex items-center gap-4 rounded-xl2 border border-night-100 bg-leaf-50/40 p-4">
          <CircleCheck className="h-7 w-7 shrink-0 text-leaf-600" strokeWidth={1.8} aria-hidden />
          <p className="text-[12.5px] leading-relaxed text-night-800">{t('synced')}</p>
        </div>
      </div>
    </>
  )
}
