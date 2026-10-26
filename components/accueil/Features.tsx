import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/cn'
import { CARD, CONTAINER, IconBubble, SECTION, SectionHead } from './ui'
import { FEATURES } from './modules'

// « Fonctionnalités principales » : les 8 cartes de la maquette.
// Le lien « Voir toutes les fonctionnalités » mène aux écrans en images (FeatureTabs, plus bas).
export function Features() {
  return (
    <section id="fonctionnalites" aria-labelledby="features-title" className={SECTION}>
      <div className={CONTAINER}>
        <SectionHead
          id="features-title"
          title="Fonctionnalités principales"
          lead="Tout ce dont vous avez besoin pour organiser la vie de votre enfant, réuni dans une seule application."
        />
        <ul className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:mt-12 lg:grid-cols-4">
          {FEATURES.map(({ id, icon: Icon, name, text }) => (
            <li key={id} id={id} className={cn(CARD, 'scroll-mt-28 p-6')}>
              <div className="flex items-center gap-3">
                <IconBubble size="sm"><Icon strokeWidth={1.75} /></IconBubble>
                <h3 className="text-[16.5px] font-bold leading-snug text-night-900">{name}</h3>
              </div>
              <p className="mt-3 text-[15px] leading-relaxed text-night-700">{text}</p>
            </li>
          ))}
        </ul>
        <p className="mt-10 text-center">
          <a href="#en-images" className="inline-flex min-h-[44px] items-center gap-2 rounded-lg text-[16px] font-semibold text-leaf-600 hover:text-leaf-700">
            Voir toutes les fonctionnalités en images<ArrowRight className="h-4 w-4" aria-hidden />
          </a>
        </p>
      </div>
    </section>
  )
}
