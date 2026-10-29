import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { ArrowLeft, HandHeart, Handshake, Network, ShieldCheck, TrendingUp } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { SiteShell } from '@/components/site/SiteShell'
import { PartnerApplicationForm } from '@/components/partenaires/PartnerApplicationForm'
import { CONTAINER } from '@/components/accueil/ui'
import { cn } from '@/lib/cn'
import { CLIENT_NS_SITE_PARTNER_APPLY } from '@/lib/i18n/client-namespaces'
import { localePathFor } from '@/lib/i18n/routing'
import { pageMetadata } from '@/lib/seo/metadata'

// Langue lue dans un cookie (comme les autres pages publiques) : rendu à chaque requête.
export const dynamic = 'force-dynamic'

const PATH = '/partenaires/candidature'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('public.partners.apply')
  return pageMetadata({ title: t('metaTitle'), description: t('metaDescription'), path: PATH, locale: await getLocale() })
}

const BENEFITS: { key: 'visibility' | 'actions' | 'inform' | 'network'; icon: LucideIcon }[] = [
  { key: 'visibility', icon: TrendingUp },
  { key: 'actions', icon: HandHeart },
  { key: 'inform', icon: ShieldCheck },
  { key: 'network', icon: Network },
]

/** Candidature « Devenir partenaire » : argumentaire à gauche, formulaire en cinq blocs à droite. */
export default async function PartnerApplicationPage() {
  const t = await getTranslations('public.partners.apply')
  const lp = localePathFor(await getLocale())

  return (
    <SiteShell mainClassName="bg-[#F7F9FC]" extraNamespaces={CLIENT_NS_SITE_PARTNER_APPLY}>
      <div className={cn(CONTAINER, 'py-8 sm:py-12')}>
        <Link href={lp('/partenaires')} className="inline-flex min-h-[44px] items-center gap-2 rounded-lg text-[14.5px] font-semibold text-night-800 hover:text-leaf-600">
          <ArrowLeft className="h-4 w-4" aria-hidden /> {t('back')}
        </Link>

        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start lg:gap-8 [&>*]:min-w-0">
          <aside aria-labelledby="apply-title" className="relative overflow-hidden rounded-[28px] bg-gradient-to-b from-leaf-50 via-[#eef7f4] to-night-50 px-6 pb-0 pt-8 ring-1 ring-leaf-100 lg:sticky lg:top-24">
            <span aria-hidden className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-white shadow-[0_10px_30px_-14px_rgba(11,45,91,0.35)]">
              <Handshake className="h-12 w-12 text-leaf-500" strokeWidth={1.6} />
            </span>
            <p className="mt-5 text-center">
              <span className="inline-block rounded-full bg-leaf-500 px-3 py-1 text-[11.5px] font-bold uppercase tracking-[0.16em] text-white">{t('eyebrow')}</span>
            </p>
            <h1 id="apply-title" className="mt-3 text-center text-[36px] font-extrabold leading-[1.05] tracking-[-0.03em] text-night-900 sm:text-[42px]">
              {t('title')} <span className="block text-leaf-500">{t('titleAccent')}</span>
            </h1>
            <p className="mt-4 text-center text-[15.5px] leading-relaxed text-night-700">{t('lead')}</p>
            <ul className="mt-6 space-y-3">
              {BENEFITS.map(({ key, icon: Icon }) => (
                <li key={key} className="flex items-center gap-3">
                  <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-leaf-600 shadow-[0_4px_14px_-6px_rgba(11,45,91,0.3)]">
                    <Icon className="h-5 w-5" strokeWidth={2} />
                  </span>
                  <span className="text-[15px] font-semibold text-night-900">{t(`benefits.${key}`)}</span>
                </li>
              ))}
            </ul>
            <div className="relative -mx-6 mt-6 aspect-[720/400]">
              <Image src="/images/onboarding/ensemble.webp" alt={t('imageAlt')} fill sizes="(min-width: 1024px) 380px, 100vw" className="object-cover object-bottom" />
            </div>
          </aside>

          <PartnerApplicationForm />
        </div>
      </div>
    </SiteShell>
  )
}
