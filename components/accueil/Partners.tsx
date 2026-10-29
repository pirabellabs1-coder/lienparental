import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { PartnerMarquee } from '@/components/partenaires/PartnerMarquee'
import { cn } from '@/lib/cn'
import { localePathFor } from '@/lib/i18n/routing'
import { PARTNERS, demoPartnersAllowed, displayedPartners } from '@/lib/partenaires/catalog'
import { listPublishedPartners } from '@/lib/partenaires/server'
import { CONTAINER } from './ui'

// Bandeau des partenaires (sous la barre des modules) : logos des organismes partenaires en défilement.
// Source unique : lib/partenaires/catalog.ts (même règle d'accord écrit avant tout logo). Hors production et
// sans partenaire signé, des logos d'EXEMPLE fictifs s'affichent ; en production, des emplacements neutres.

const SLOTS = 6

export async function Partners() {
  const t = await getTranslations('partners')
  const tp = await getTranslations('public.partners.page')
  const lp = localePathFor(await getLocale())
  const showDemo = demoPartnersAllowed()
  const published = [...(await listPublishedPartners()), ...PARTNERS]
  const logos = [...displayedPartners('institution', showDemo, published), ...displayedPartners('association', showDemo, published), ...displayedPartners('professionnel', showDemo, published)]
  const real = logos.some((p) => !p.demo)
  const loop = logos.length ? Array.from({ length: Math.ceil(8 / logos.length) }, () => logos).flat() : []

  return (
    <section aria-labelledby="partners-title" className="pb-4 pt-12 lg:pt-16">
      <div className={CONTAINER}>
        <h2 id="partners-title" className="text-center text-[13px] font-semibold uppercase tracking-[0.14em] text-night-600">
          {real ? t('titleActive') : t('titlePlaceholder')}
        </h2>
        {!real && (
          <p className="mx-auto mt-2 max-w-[60ch] text-center text-[14.5px] text-night-600">
            {t('placeholder')}
          </p>
        )}
        {loop.length ? (
          <PartnerMarquee pauseLabel={tp('pause')} playLabel={tp('play')} speed={loop.length * 4} className="mt-6">
            {loop.map((p, i) => {
              const repeat = i >= logos.length
              const logo = <span className="relative block h-16 w-full"><Image src={p.image} alt={p.name} fill sizes="240px" className="object-contain" /></span>
              return (
                <li key={`${p.name}-${i}`} aria-hidden={repeat || undefined} inert={repeat || undefined} className="relative flex h-28 w-[250px] shrink-0 items-center justify-center rounded-2xl bg-white px-6 pt-3 ring-1 ring-night-100 shadow-[0_2px_6px_rgba(11,45,91,0.06),0_14px_30px_-18px_rgba(11,45,91,0.35)]">
                  {p.href ? <a href={p.href} target="_blank" rel="noopener noreferrer" aria-label={tp('visit', { name: p.name })} className="block w-full">{logo}</a> : logo}
                  {p.demo && <span className="absolute right-2.5 top-2.5 rounded-full bg-gold-50 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-gold-700 ring-1 ring-gold-200">{tp('example')}</span>}
                </li>
              )
            })}
          </PartnerMarquee>
        ) : (
          <ul className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-6 sm:gap-4">
            {Array.from({ length: SLOTS }, (_, i) => (
              <li
                key={`slot-${i}`}
                aria-hidden
                className={cn('flex h-16 items-center justify-center rounded-2xl border border-dashed border-night-200 bg-white/60 text-[12.5px] font-medium text-night-500 sm:h-20')}
              >
                {t('slot')}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-5 text-center">
          <Link href={lp('/partenaires')} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg text-[14.5px] font-semibold text-leaf-700 underline-offset-4 hover:underline">
            {t('more')} <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </p>
      </div>
    </section>
  )
}
