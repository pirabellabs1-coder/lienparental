import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { ArrowRight, BriefcaseBusiness, Facebook, Gem, Handshake, Instagram, Landmark, Linkedin, Music2, Users, Youtube } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { SiteShell } from '@/components/site/SiteShell'
import { PartnerRail } from '@/components/partenaires/PartnerRail'
import { PartnerMarquee } from '@/components/partenaires/PartnerMarquee'
import { BTN_PRIMARY, CONTAINER } from '@/components/accueil/ui'
import { cn } from '@/lib/cn'
import { localePathFor } from '@/lib/i18n/routing'
import { pageMetadata } from '@/lib/seo/metadata'
import { CORE_CATEGORIES, EMPTY_SLOTS, PARTNERS, PARTNER_CATEGORIES, demoPartnersAllowed, displayedPartners, type Partner, type PartnerCategory, type PartnerSocial } from '@/lib/partenaires/catalog'
import { listPublishedPartners } from '@/lib/partenaires/server'

// Langue lue dans un cookie (comme les autres pages publiques) : rendu à chaque requête.
export const dynamic = 'force-dynamic'

const PATH = '/partenaires'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('public.partners.page')
  return pageMetadata({ title: t('metaTitle'), description: t('metaDescription'), path: PATH, locale: await getLocale() })
}

// Une teinte par catégorie (maquette client) : bleu nuit, vert, rose.
const STYLE: Record<PartnerCategory, { icon: LucideIcon; tone: 'night' | 'leaf' | 'pink'; panel: string; badge: string; disc: string }> = {
  institution: { icon: Landmark, tone: 'night', panel: 'bg-gradient-to-br from-night-50 to-white ring-night-100', badge: 'text-night-700 ring-night-100', disc: 'bg-night-600' },
  association: { icon: Users, tone: 'leaf', panel: 'bg-gradient-to-br from-leaf-50 to-white ring-leaf-100', badge: 'text-leaf-700 ring-leaf-100', disc: 'bg-leaf-500' },
  createur: { icon: Gem, tone: 'pink', panel: 'bg-gradient-to-br from-pink-50 to-white ring-pink-100', badge: 'text-pink-700 ring-pink-100', disc: 'bg-pink-500' },
  professionnel: { icon: BriefcaseBusiness, tone: 'night', panel: 'bg-gradient-to-br from-gold-50 to-white ring-gold-100', badge: 'text-gold-700 ring-gold-100', disc: 'bg-gold-500' },
}

const SOCIAL_ICON: Record<PartnerSocial['network'], LucideIcon> = {
  instagram: Instagram, tiktok: Music2, youtube: Youtube, facebook: Facebook, linkedin: Linkedin,
}
const SOCIAL_NAME: Record<PartnerSocial['network'], string> = {
  instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', facebook: 'Facebook', linkedin: 'LinkedIn',
}

const CARD = 'flex min-h-[176px] w-[78%] shrink-0 snap-start flex-col items-center justify-center rounded-2xl bg-white p-5 text-center ring-1 ring-[#E5E7EB] shadow-[0_1px_2px_rgba(11,45,91,0.04),0_12px_28px_-22px_rgba(11,45,91,0.3)] sm:w-[calc(50%-8px)]'

type T = Awaited<ReturnType<typeof getTranslations>>

/** Carte d'un bandeau défilant : largeur fixe (la piste boucle sur sa propre largeur). */
const MARQUEE_CARD = 'relative flex min-h-[170px] w-[260px] shrink-0 flex-col items-center justify-center rounded-2xl bg-white px-5 pb-5 pt-8 text-center ring-1 ring-night-100 shadow-[0_2px_6px_rgba(11,45,91,0.06),0_14px_30px_-18px_rgba(11,45,91,0.35)] sm:w-[280px]'

/** `repeat` : copie ajoutée pour boucler le défilement, masquée aux lecteurs d'écran et au clavier. */
function PartnerCard({ p, t, repeat = false }: { p: Partner; t: T; repeat?: boolean }) {
  const creator = p.category === 'createur'
  return (
    <li aria-hidden={repeat || undefined} inert={repeat || undefined} className={cn(MARQUEE_CARD, creator && 'flex-row items-center justify-start gap-4 text-left')}>
      {p.demo && <span className="absolute right-3 top-3 rounded-full bg-gold-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-gold-700 ring-1 ring-gold-200">{t('example')}</span>}
      <span className={cn('relative block shrink-0 overflow-hidden', creator ? 'h-20 w-20 rounded-full' : 'h-24 w-full')}>
        <Image src={p.image} alt={creator ? '' : p.name} fill sizes={creator ? '80px' : '240px'} className={creator ? 'object-cover' : 'object-contain'} />
      </span>
      <span className={cn('min-w-0', !creator && 'mt-3')}>
        {p.href ? (
          <a href={p.href} target="_blank" rel="noopener noreferrer" aria-label={t('visit', { name: p.name })} className="font-semibold text-night-800 underline-offset-4 hover:underline">
            {p.name}
          </a>
        ) : (
          <span className="font-semibold text-night-800">{p.name}</span>
        )}
        {p.tagline && <span className="mt-0.5 block text-[13.5px] text-night-600">{p.tagline}</span>}
        {p.socials?.length ? (
          <span className="mt-2 flex gap-1">
            {p.socials.map((s) => {
              const Icon = SOCIAL_ICON[s.network]
              // Exemple fictif : icônes seules, aucun lien vers un compte réel.
              if (p.demo) return <span key={s.network} aria-hidden className="inline-flex h-9 w-9 items-center justify-center rounded-full text-night-600"><Icon className="h-5 w-5" /></span>
              return (
                <a key={s.href} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={t('social', { name: p.name, network: SOCIAL_NAME[s.network] })} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-night-700 hover:bg-night-50">
                  <Icon className="h-5 w-5" aria-hidden />
                </a>
              )
            })}
          </span>
        ) : null}
      </span>
    </li>
  )
}

/** Page publique des partenaires : trois familles de partenaires, puis l'appel à candidature. */
export default async function PartnersPage() {
  const t = await getTranslations('public.partners.page')
  const lp = localePathFor(await getLocale())
  const showDemo = demoPartnersAllowed()
  // Partenaires validés dans l'administration (base) + éventuels partenaires déclarés dans le code.
  const published = [...(await listPublishedPartners()), ...PARTNERS]

  return (
    <SiteShell mainClassName="bg-[#F7F9FC]">
      <section aria-labelledby="partners-title" className="pb-8 pt-12 sm:pt-16">
        <div className={cn(CONTAINER, 'text-center')}>
          <p className="site-rise flex items-center justify-center gap-3 text-[12.5px] font-bold uppercase tracking-[0.16em] text-night-700">
            <span aria-hidden className="h-px w-8 bg-leaf-400 sm:w-12" />
            {t('eyebrow')}
            <span aria-hidden className="h-px w-8 bg-leaf-400 sm:w-12" />
          </p>
          <h1 id="partners-title" className="site-rise mx-auto mt-4 text-[34px] font-extrabold leading-[1.08] tracking-[-0.03em] text-night-900 [--d:60ms] [text-wrap:balance] sm:text-[46px] lg:text-[54px]">
            {t('title')} <span className="text-leaf-500 sm:block">{t('titleAccent')}</span>
          </h1>
          <p className="site-rise mx-auto mt-4 max-w-[60ch] text-[16.5px] leading-relaxed text-night-700 [--d:120ms] sm:text-[18px]">{t('lead')}</p>
        </div>
      </section>

      <div className={cn(CONTAINER, 'max-w-[1040px] space-y-5 pb-6')}>
        {PARTNER_CATEGORIES.map((cat) => {
          const s = STYLE[cat]
          const Icon = s.icon
          const list = displayedPartners(cat, showDemo, published)
          // Catégorie hors maquette (professionnels) : affichée seulement si elle a un partenaire.
          if (!CORE_CATEGORIES.includes(cat) && list.length === 0) return null
          const real = list.some((p) => !p.demo)
          // Piste assez longue pour boucler sans trou sur grand écran (logos répétés si peu nombreux).
          const loop = list.length ? Array.from({ length: Math.ceil(6 / list.length) }, () => list).flat() : []
          const id = `partners-${cat}`
          return (
            <section key={cat} id={cat} aria-labelledby={id} className={cn('scroll-mt-24 rounded-[28px] p-5 ring-1 sm:p-7', s.panel)}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-4">
                  <span aria-hidden className={cn('grid h-14 w-14 shrink-0 place-items-center rounded-full text-white sm:h-16 sm:w-16', s.disc)}>
                    <Icon className="h-7 w-7" strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0">
                    <h2 id={id} className="text-[21px] font-extrabold leading-tight tracking-[-0.015em] text-night-900 sm:text-[24px]">{t(`categories.${cat}.title`)}</h2>
                    <p className="mt-1 text-[14.5px] leading-snug text-night-700">{t(`categories.${cat}.text`)}</p>
                  </div>
                </div>
                {!real && (
                  <span className={cn('inline-flex shrink-0 items-center gap-2 self-start rounded-full bg-white px-4 py-2 text-[13px] font-semibold ring-1', s.badge)}>
                    <Handshake className="h-5 w-5" aria-hidden />
                    {t('soon')}
                  </span>
                )}
              </div>
              <div className="mt-5">
                {list.length ? (
                  <PartnerMarquee pauseLabel={t('pause')} playLabel={t('play')} speed={loop.length * 6}>
                    {loop.map((p, i) => <PartnerCard key={`${p.name}-${i}`} p={p} t={t} repeat={i >= list.length} />)}
                  </PartnerMarquee>
                ) : (
                <PartnerRail count={EMPTY_SLOTS} prevLabel={t('prev')} nextLabel={t('next')} tone={s.tone}>
                  {Array.from({ length: EMPTY_SLOTS }, (_, i) => (
                        <li key={i} className={cn(CARD, 'border border-dashed border-night-200 bg-white/70 shadow-none ring-0')}>
                          <span aria-hidden className={cn('grid h-12 w-12 place-items-center rounded-full bg-white ring-1', s.badge)}>
                            <Icon className="h-6 w-6" strokeWidth={1.8} />
                          </span>
                          <span className="mt-3 font-semibold text-night-800">{t('slot')}</span>
                          {i === 0 && <span className="mt-1 max-w-[30ch] text-[13px] leading-snug text-night-600">{t('slotText')}</span>}
                        </li>
                      ))}
                </PartnerRail>
                )}
              </div>
            </section>
          )
        })}
      </div>

      <section aria-labelledby="partners-cta" className="pb-16 pt-6 sm:pb-24">
        <div className={cn(CONTAINER, 'max-w-[1040px]')}>
          <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-leaf-50 via-white to-night-50 p-6 ring-1 ring-leaf-100 sm:p-10">
            <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
              <span aria-hidden className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-white shadow-[0_8px_24px_-12px_rgba(11,45,91,0.35)] ring-1 ring-[#E5E7EB] sm:h-24 sm:w-24">
                <Handshake className="h-10 w-10 text-leaf-500 sm:h-12 sm:w-12" strokeWidth={1.7} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="partners-cta" className="text-[26px] font-extrabold leading-[1.15] tracking-[-0.02em] text-night-900 [text-wrap:balance] sm:text-[32px]">
                  {t('ctaTitle')} <span className="text-leaf-500">{t('ctaAccent')}</span>
                </h2>
                <p className="mt-3 max-w-[62ch] text-[15.5px] leading-relaxed text-night-700">{t('ctaText')}</p>
                <Link href={lp('/partenaires/candidature')} className={cn(BTN_PRIMARY, 'mt-6 w-full sm:w-auto')}>
                  {t('cta')} <ArrowRight className="h-5 w-5" aria-hidden />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </SiteShell>
  )
}
