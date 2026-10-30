import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { cn } from '@/lib/cn'
import { CARD, CONTAINER, IconBubble } from './ui'
import { MODULE_BAR } from './modules'

// Barre des 8 modules sous le héros : icône teintée (une couleur par module) + libellé, chaque entrée mène
// à sa présentation sur la page.
export async function ModuleBar() {
  const t = await getTranslations('home')
  return (
    <nav aria-label={t('modulesNav')} className={cn(CONTAINER, 'relative z-10')}>
      <ul className={cn(CARD, 'grid grid-cols-2 gap-1.5 p-2 sm:grid-cols-4 sm:gap-2 sm:p-3 lg:grid-cols-8 lg:gap-0 lg:divide-x lg:divide-[#EEF0F3] lg:px-2 lg:py-4')}>
        {MODULE_BAR.map(({ key, icon: Icon, tone, href }) => (
          <li key={key} className="min-w-0 lg:px-1.5">
            <Link
              href={href}
              className="group flex h-full min-h-[52px] items-center gap-3 rounded-xl p-2.5 text-left text-[14px] font-semibold leading-tight text-night-900 transition-colors duration-200 hover:bg-[#F6F8FA] sm:flex-col sm:justify-start sm:gap-2.5 sm:px-1.5 sm:py-3 sm:text-center"
            >
              <IconBubble tone={tone} className="h-10 w-10 rounded-xl transition-transform duration-200 group-hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0 sm:h-12 sm:w-12 sm:rounded-2xl [&>svg]:h-[18px] [&>svg]:w-[18px] sm:[&>svg]:h-[22px] sm:[&>svg]:w-[22px]"><Icon strokeWidth={1.75} /></IconBubble>
              <span className="min-w-0 [hyphens:none] [text-wrap:balance] group-hover:text-leaf-700">{t(`moduleBar.${key}`)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
