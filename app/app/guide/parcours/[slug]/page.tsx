import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { GuideHeader } from '@/components/guide/GuideHeader'
import { ParcoursChecklist } from '@/components/guide/Progress'
import { guideAsync, loadGuide } from '@/lib/guide/load'
import { wantedTerritoire } from '@/lib/guide/territory-server'
import { DEFAULT_TERRITOIRE } from '@/lib/guide/types'
import { homeHref } from '@/lib/guide/links'
import { contentLangAttr } from '@/lib/contenus/locale'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, sp] = await Promise.all([params, searchParams])
  const locale = await getLocale()
  const p = (await guideAsync.parcours(await wantedTerritoire(sp.territoire), slug, locale)) ?? (await guideAsync.parcours(DEFAULT_TERRITOIRE, slug, locale))
  const t = await getTranslations('coach.guide.parcours')
  return { title: p?.titre ?? t('metaTitle'), robots: { index: false, follow: false } }
}

export default async function GuideParcoursPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams])
  const locale = await getLocale()
  const g = await loadGuide(await wantedTerritoire(sp.territoire), locale)
  const { territoire } = g
  const parcours = g.parcours.find((p) => p.slug === slug)
  if (!parcours) notFound()
  const cl = contentLangAttr(parcours.lang, locale)
  const t = await getTranslations('coach.guide')
  const ficheTitles = Object.fromEntries(g.fiches.map((f) => [f.slug, f.titre]))

  return (
    <div className="w-full px-5 pb-8 lg:px-6">
      <GuideHeader territoire={territoire} territoires={g.territoires} back={{ href: homeHref(territoire.code), label: t('header.back') }} />
      <div className="mx-auto max-w-[720px]">
        <p className="mt-5 text-[12.5px] font-semibold uppercase tracking-[0.08em] text-leaf-700">{t('parcours.eyebrow')}</p>
        <h1 className="mt-1 text-[24px] font-extrabold leading-tight tracking-[-0.02em] text-night-900 lg:text-[28px]" lang={cl}>{parcours.titre}</h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-night-600" lang={cl}>{parcours.resume}</p>
        <div className="mt-5" lang={cl}>
          <ParcoursChecklist parcours={parcours} territoire={territoire.code} ficheTitles={ficheTitles} />
        </div>
        <p className="mt-6 text-[12.5px] leading-relaxed text-night-600">
          {t('parcours.privacy')}
        </p>
      </div>
    </div>
  )
}
