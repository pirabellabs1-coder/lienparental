import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { cn } from '@/lib/cn'
import { CARD, CONTAINER, IconBubble } from './ui'
import { MODULE_BAR } from './modules'

// Barre des 8 modules sous le héros : icône ronde + libellé, chaque entrée mène à sa présentation sur la page.
export async function ModuleBar() {
  const t = await getTranslations('home')
  return (
    <nav aria-label={t('modulesNav')} className={cn(CONTAINER, 'relative z-10')}>
      <ul className={cn(CARD, 'grid grid-cols-2 gap-1 p-2 sm:grid-cols-4 sm:gap-y-2 sm:px-3 sm:py-4 lg:grid-cols-8 lg:py-5')}>
        {MODULE_BAR.map(({ key, icon: Icon, href }) => (
          <li key={key} className="min-w-0">
            <Link
              href={href}
              className="group flex h-full min-h-[48px] items-center gap-2.5 rounded-xl p-2 text-left text-[14px] font-semibold leading-tight text-night-900 transition-colors duration-200 hover:bg-[#F3F8F3] sm:flex-col sm:gap-2 sm:px-1 sm:text-center"
            >
              <IconBubble className="h-10 w-10 transition-transform duration-200 group-hover:-translate-y-0.5 sm:h-12 sm:w-12 [&>svg]:h-[18px] [&>svg]:w-[18px] sm:[&>svg]:h-[22px] sm:[&>svg]:w-[22px]"><Icon strokeWidth={1.75} /></IconBubble>
              <span className="min-w-0 [hyphens:none] [text-wrap:balance]">{t(`moduleBar.${key}`)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
