import { cn } from '@/lib/cn'
import { Faq } from './Faq'
import { Pricing } from './Pricing'
import { CONTAINER, SECTION } from './ui'

// Tarifs pleine largeur (3 cartes lisibles), puis FAQ en dessous sur deux colonnes.
// La disposition côte à côte de la maquette serrait trop les cartes : textes et boutons passaient sur plusieurs lignes.
export function PricingFaq({ signedIn }: { signedIn: boolean }) {
  return (
    <section className={cn(SECTION, 'bg-[#F4F6F9]')}>
      <div className={cn(CONTAINER, 'max-w-[1120px] [&>*]:min-w-0')}>
        <Pricing signedIn={signedIn} />
        <div className="mt-20 border-t border-[#E5E7EB] pt-16 sm:mt-24 sm:pt-20">
          <Faq />
        </div>
      </div>
    </section>
  )
}
