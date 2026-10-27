import Image from 'next/image'
import { getTranslations } from 'next-intl/server'
import { cn } from '@/lib/cn'
import { CONTAINER } from './ui'

// Bandeau des partenaires (sous la barre des modules), sur une ligne.
// N'afficher le logo d'un organisme (CAF, tribunal, associations…) qu'avec un partenariat signé et son accord
// écrit sur l'usage du logo. Pour en ajouter un : déposer le fichier dans public/partenaires/ puis compléter PARTNERS.
// Tant qu'il manque des partenaires, des emplacements neutres complètent la ligne.
type Partner = { name: string; logo: string; href?: string }

const PARTNERS: Partner[] = [
  // { name: 'Caisse d’allocations familiales de Guyane', logo: '/partenaires/caf-guyane.svg', href: 'https://www.caf.fr' },
]

const SLOTS = 6

export async function Partners() {
  const t = await getTranslations('partners')
  const empty = Math.max(0, SLOTS - PARTNERS.length)
  return (
    <section aria-labelledby="partners-title" className="pb-4 pt-12 lg:pt-16">
      <div className={CONTAINER}>
        <h2 id="partners-title" className="text-center text-[13px] font-semibold uppercase tracking-[0.14em] text-night-600">
          {PARTNERS.length ? t('titleActive') : t('titlePlaceholder')}
        </h2>
        {!PARTNERS.length && (
          <p className="mx-auto mt-2 max-w-[60ch] text-center text-[14.5px] text-night-600">
            {t('placeholder')}
          </p>
        )}
        <ul className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-6 sm:gap-4">
          {PARTNERS.map(p => (
            <li key={p.name} className="flex h-16 items-center justify-center rounded-2xl bg-white px-3 ring-1 ring-[#E5E7EB] sm:h-20">
              {p.href ? (
                <a href={p.href} target="_blank" rel="noopener noreferrer" className="relative block h-10 w-full" aria-label={p.name}>
                  <Image src={p.logo} alt="" fill sizes="160px" className="object-contain grayscale transition duration-200 hover:grayscale-0" />
                </a>
              ) : (
                <span className="relative block h-10 w-full">
                  <Image src={p.logo} alt={p.name} fill sizes="160px" className="object-contain grayscale" />
                </span>
              )}
            </li>
          ))}
          {Array.from({ length: empty }, (_, i) => (
            <li
              key={`slot-${i}`}
              aria-hidden
              className={cn(
                'flex h-16 items-center justify-center rounded-2xl border border-dashed border-night-200 bg-white/60 text-[12.5px] font-medium text-night-500 sm:h-20',
              )}
            >
              {t('slot')}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
