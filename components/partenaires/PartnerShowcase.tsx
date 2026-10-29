import Image from 'next/image'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { ArrowRight, BriefcaseBusiness, ChevronRight, Facebook, Gem, Handshake, Instagram, Landmark, Linkedin, Music2, Users, Youtube } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { PartnerRail } from '@/components/partenaires/PartnerRail'
import { BTN_PRIMARY, CONTAINER } from '@/components/accueil/ui'
import { cn } from '@/lib/cn'
import { localePathFor } from '@/lib/i18n/routing'
import { CORE_CATEGORIES, EMPTY_SLOTS, PARTNERS, PARTNER_CATEGORIES, demoPartnersAllowed, displayedPartners, type Partner, type PartnerCategory, type PartnerSocial } from '@/lib/partenaires/catalog'
import { listPublishedPartners } from '@/lib/partenaires/server'

// Vitrine des partenaires (maquette client), commune à l'accueil et à /partenaires : en-tête, un panneau
// par catégorie avec carrousel défilant (flèches, points), puis l'appel « Devenir partenaire ».
// Logos : uniquement les partenaires signés (lib/partenaires/catalog.ts) ; exemples fictifs hors production.

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
const SOCIAL_COLOR: Record<PartnerSocial['network'], string> = {
  instagram: 'text-pink-600', tiktok: 'text-night-900', youtube: 'text-red-600', facebook: 'text-night-600', linkedin: 'text-night-600',
}

/** Largeur d'une carte : 2 visibles sur mobile, 3 sur tablette, 5 sur grand écran (maquette). */
const SLOT = 'w-[calc(50%_-_6px)] shrink-0 snap-start sm:w-[calc((100%_-_32px)/3)] lg:w-[calc((100%_-_64px)/5)]'
const TILE = 'rounded-2xl bg-white ring-1 ring-[#E5E7EB] shadow-[0_1px_2px_rgba(11,45,91,0.04),0_12px_28px_-22px_rgba(11,45,91,0.3)]'
const EXAMPLE = 'absolute right-2 top-2 rounded-full bg-gold-50 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-gold-700 ring-1 ring-gold-200'

type T = Awaited<ReturnType<typeof getTranslations>>

function Name({ p, t, className }: { p: Partner; t: T; className?: string }) {
  return p.href ? (
    <a href={p.href} target="_blank" rel="noopener noreferrer" aria-label={t('visit', { name: p.name })} className={cn('underline-offset-4 hover:underline', className)}>{p.name}</a>
  ) : (
    <span className={className}>{p.name}</span>
  )
}

/** Organisme : logo dans une tuile blanche, nom dessous (maquette). */
function OrgCard({ p, t }: { p: Partner; t: T }) {
  return (
    <li className={cn(SLOT, 'flex flex-col items-center text-center')}>
      <span className={cn(TILE, 'relative flex h-28 w-full items-center justify-center px-4 py-3 sm:h-32')}>
        {p.demo && <span className={EXAMPLE}>{t('example')}</span>}
        <span className="relative block h-full w-full"><Image src={p.image} alt={p.name} fill sizes="240px" className="object-contain" /></span>
      </span>
      <Name p={p} t={t} className="mt-3 max-w-[24ch] text-[14.5px] leading-snug text-night-800 [text-wrap:balance]" />
    </li>
  )
}

/** Créateur de contenu : photo ronde, nom, thème, réseaux, chevron (maquette). */
function CreatorCard({ p, t }: { p: Partner; t: T }) {
  return (
    <li className={cn(SLOT, TILE, 'relative flex items-center gap-3 p-3 sm:p-4')}>
      {p.demo && <span className={cn(EXAMPLE, '-top-2 right-3')}>{t('example')}</span>}
      <span className="relative block h-14 w-14 shrink-0 overflow-hidden rounded-full sm:h-16 sm:w-16">
        <Image src={p.image} alt="" fill sizes="64px" className="object-cover" />
      </span>
      <span className="min-w-0 flex-1">
        <Name p={p} t={t} className="line-clamp-2 text-[14px] font-bold leading-tight text-night-900" />
        {p.tagline && <span className="mt-0.5 block truncate text-[13px] text-night-600">{p.tagline}</span>}
        {p.socials?.length ? (
          <span className="mt-1.5 flex gap-0.5">
            {p.socials.map((s) => {
              const Icon = SOCIAL_ICON[s.network]
              // Exemple fictif : icônes seules, aucun lien vers un compte réel.
              if (p.demo) return <span key={s.network} aria-hidden className={cn('inline-flex h-8 w-8 items-center justify-center', SOCIAL_COLOR[s.network])}><Icon className="h-5 w-5" /></span>
              return (
                <a key={s.href} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={t('social', { name: p.name, network: SOCIAL_NAME[s.network] })} className={cn('inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-night-50', SOCIAL_COLOR[s.network])}>
                  <Icon className="h-5 w-5" aria-hidden />
                </a>
              )
            })}
          </span>
        ) : null}
      </span>
      <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-night-500" />
    </li>
  )
}

/**
 * `as` : niveau du titre principal (h1 sur /partenaires, h2 sur l'accueil) ; les catégories prennent le niveau suivant.
 */
export async function PartnerShowcase({ as = 'h2' }: { as?: 'h1' | 'h2' }) {
  const t = await getTranslations('public.partners.page')
  const lp = localePathFor(await getLocale())
  const showDemo = demoPartnersAllowed()
  // Partenaires validés dans l'administration (base) + éventuels partenaires déclarés dans le code.
  const published = [...(await listPublishedPartners()), ...PARTNERS]
  const Title = as
  const Sub = as === 'h1' ? 'h2' : 'h3'

  return (
    <>
      <section aria-labelledby="partners-title" className="pb-6 pt-12 sm:pt-16">
        <div className={cn(CONTAINER, 'text-center')}>
          <p className="site-rise flex items-center justify-center gap-3 text-[12.5px] font-bold uppercase tracking-[0.16em] text-night-700">
            <span aria-hidden className="h-px w-8 bg-leaf-400 sm:w-12" />
            {t('eyebrow')}
            <span aria-hidden className="h-px w-8 bg-leaf-400 sm:w-12" />
          </p>
          <Title id="partners-title" className="site-rise mx-auto mt-3 text-[34px] font-extrabold leading-[1.05] tracking-[-0.03em] text-night-900 [--d:60ms] [text-wrap:balance] sm:text-[46px] lg:text-[54px]">
            {t('title')} <span className="text-leaf-600 sm:block">{t('titleAccent')}</span>
          </Title>
          <p className="site-rise mx-auto mt-3 max-w-[62ch] text-[16.5px] leading-relaxed text-night-700 [--d:120ms] sm:text-[18px]">{t('lead')}</p>
        </div>
      </section>

      <div className={cn(CONTAINER, 'max-w-[1440px] space-y-4 pb-4')}>
        {PARTNER_CATEGORIES.map((cat) => {
          const s = STYLE[cat]
          const Icon = s.icon
          const list = displayedPartners(cat, showDemo, published)
          // Catégorie hors maquette (professionnels) : affichée seulement si elle a un partenaire.
          if (!CORE_CATEGORIES.includes(cat) && list.length === 0) return null
          const real = list.some((p) => !p.demo)
          const id = `partners-${cat}`
          return (
            <section key={cat} id={cat} aria-labelledby={id} className={cn('scroll-mt-24 rounded-[28px] px-4 pb-4 pt-5 ring-1 sm:px-8 sm:pt-6', s.panel)}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-4">
                  <span aria-hidden className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-full text-white sm:h-14 sm:w-14', s.disc)}>
                    <Icon className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0 sm:flex sm:items-center sm:gap-4">
                    <Sub id={id} className="text-[20px] font-extrabold leading-tight tracking-[-0.015em] text-night-900 sm:shrink-0 sm:whitespace-nowrap sm:text-[24px]">{t(`categories.${cat}.title`)}</Sub>
                    <span aria-hidden className="hidden h-6 w-px bg-night-300 sm:block" />
                    <p className="mt-1 text-[14px] leading-snug text-night-700 sm:mt-0 sm:text-[15px]">{t(`categories.${cat}.text`)}</p>
                  </div>
                </div>
                {!real && (
                  <span className={cn('inline-flex shrink-0 items-center gap-2 self-start rounded-full bg-white/90 px-4 py-2 text-[13px] font-semibold ring-1 lg:self-auto', s.badge)}>
                    <Handshake className="h-5 w-5" aria-hidden />
                    {t('soon')}
                  </span>
                )}
              </div>
              <div className="mt-4 sm:px-2">
                {list.length ? (
                  <PartnerRail autoplay interval={3500 + PARTNER_CATEGORIES.indexOf(cat) * 700} count={list.length} prevLabel={t('prev')} nextLabel={t('next')} pauseLabel={t('pause')} playLabel={t('play')} tone={s.tone}>
                    {list.map((p) => cat === 'createur'
                      ? <CreatorCard key={p.name} p={p} t={t} />
                      : <OrgCard key={p.name} p={p} t={t} />)}
                  </PartnerRail>
                ) : (
                  <PartnerRail count={EMPTY_SLOTS} prevLabel={t('prev')} nextLabel={t('next')} tone={s.tone}>
                    {Array.from({ length: EMPTY_SLOTS }, (_, i) => (
                      <li key={i} className="flex min-h-[150px] w-[78%] shrink-0 snap-start flex-col items-center justify-center rounded-2xl border border-dashed border-night-200 bg-white/70 p-5 text-center sm:w-[calc(50%-8px)]">
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

      <section aria-labelledby="partners-cta" className="pb-12 pt-2 sm:pb-16">
        <div className={cn(CONTAINER, 'max-w-[1440px]')}>
          <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-r from-leaf-100 via-leaf-50 to-leaf-100 px-6 py-7 ring-1 ring-leaf-100 sm:px-10">
            <div className="flex flex-col items-start gap-5 md:flex-row md:items-center md:gap-8">
              <span aria-hidden className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-white shadow-[0_8px_24px_-12px_rgba(11,45,91,0.35)] ring-1 ring-[#E5E7EB] sm:h-24 sm:w-24">
                <Handshake className="h-10 w-10 text-leaf-600 sm:h-12 sm:w-12" strokeWidth={1.7} />
              </span>
              <div className="min-w-0 flex-1">
                <Sub id="partners-cta" className="text-[26px] font-extrabold leading-[1.15] tracking-[-0.02em] text-night-900 [text-wrap:balance] sm:text-[32px]">
                  {t('ctaTitle')} <span className="text-leaf-700">{t('ctaAccent')}</span>
                </Sub>
                <p className="mt-2 max-w-[66ch] text-[15.5px] leading-relaxed text-night-700">{t('ctaText')}</p>
              </div>
              <Link href={lp('/partenaires/candidature')} className={cn(BTN_PRIMARY, 'w-full shrink-0 md:w-auto')}>
                {t('cta')} <ArrowRight className="h-5 w-5" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
