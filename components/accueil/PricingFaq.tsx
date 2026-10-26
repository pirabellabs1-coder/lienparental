import { cn } from '@/lib/cn'
import { Faq } from './Faq'
import { Pricing } from './Pricing'
import { CONTAINER, SECTION } from './ui'

// Maquette : tarifs (≈ 2/3) et FAQ (≈ 1/3) côte à côte sur grand écran, empilés en dessous de 1280 px.
export function PricingFaq({ signedIn }: { signedIn: boolean }) {
  return (
    <section className={cn(SECTION, 'bg-[#F4F6F9]')}>
      <div className={cn(CONTAINER, 'grid grid-cols-1 gap-16 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:gap-10 [&>*]:min-w-0')}>
        <Pricing signedIn={signedIn} />
        <Faq />
      </div>
    </section>
  )
}
