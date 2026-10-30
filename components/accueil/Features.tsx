import { ArrowRight } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { cn } from '@/lib/cn'
import { CARD, CONTAINER, IconBubble, SECTION, SectionHead } from './ui'
import { FEATURES } from './modules'

// « Fonctionnalités principales » : les 8 cartes de la maquette.
// Le lien « Voir toutes les fonctionnalités » mène aux écrans en images (FeatureTabs, plus bas).
export async function Features() {
  const t = await getTranslations('features')
  return (
    <section id="fonctionnalites" aria-labelledby="features-title" className={SECTION}>
      <div className={CONTAINER}>
        <SectionHead id="features-title" title={t('title')} lead={t('lead')} />
        <ul className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:mt-12 xl:grid-cols-4">
          {FEATURES.map(({ id, icon: Icon, tone }) => {
            const slug = id.replace('fct-', '')
            return (
              <li key={id} id={id} className={cn(CARD, 'flex scroll-mt-28 gap-4 p-6 xl:flex-col xl:gap-0')}>
                <IconBubble tone={tone} className="rounded-2xl"><Icon strokeWidth={1.75} /></IconBubble>
                <div className="min-w-0 xl:mt-4">
                  <h3 className="text-[16.5px] font-bold leading-snug text-night-900">{t(`${slug}Name`)}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-night-700">{t(`${slug}Text`)}</p>
                </div>
              </li>
            )
          })}
        </ul>
        <p className="mt-10 text-center">
          <a href="#en-images" className="inline-flex min-h-[44px] items-center gap-2 rounded-lg text-[16px] font-semibold text-leaf-600 hover:text-leaf-700">
            {t('seeAll')}<ArrowRight className="h-4 w-4" aria-hidden />
          </a>
        </p>
      </div>
    </section>
  )
}
