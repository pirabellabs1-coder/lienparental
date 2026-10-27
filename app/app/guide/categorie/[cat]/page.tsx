import type { Metadata } from 'next'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { GuideHeader } from '@/components/guide/GuideHeader'
import { FicheStatusBadge } from '@/components/guide/Progress'
import { CategoryIcon } from '@/components/guide/icons'
import { loadGuide } from '@/lib/guide/load'
import { GUIDE_CATEGORIES, getCategory } from '@/lib/guide/types'
import { categoryHref, ficheHref, homeHref } from '@/lib/guide/links'
import { contentLangAttr } from '@/lib/contenus/locale'

type Props = {
  params: Promise<{ cat: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export function generateStaticParams() {
  return GUIDE_CATEGORIES.map((c) => ({ cat: c.key }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { cat } = await params
  const t = await getTranslations('coach.guide')
  const category = getCategory(cat)
  return { title: category ? t(`categories.${category.key}`) : t('title'), robots: { index: false, follow: false } }
}

export default async function GuideCategoryPage({ params, searchParams }: Props) {
  const [{ cat }, sp] = await Promise.all([params, searchParams])
  const category = getCategory(cat)
  if (!category) notFound()
  const t = await getTranslations('coach.guide')
  const locale = await getLocale()
  const g = await loadGuide(sp.territoire, locale)
  const { territoire } = g
  const fiches = g.fiches.filter((f) => f.categorie === category.key)

  return (
    <div className="w-full px-5 pb-8 lg:px-6">
      <GuideHeader territoire={territoire} territoires={g.territoires} back={{ href: homeHref(territoire.code), label: t('header.back') }} />

      <div className="mt-5 flex items-center gap-3">
        <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-leaf-50 text-leaf-700">
          <CategoryIcon cat={category.key} className="h-6 w-6" />
        </span>
        <h1 className="text-[24px] font-extrabold leading-tight tracking-[-0.02em] text-night-900 lg:text-[28px]">{t(`categories.${category.key}`)}</h1>
      </div>

      {fiches.length === 0 ? (
        <p className="mt-6 rounded-2xl bg-night-50 p-4 text-[14px] text-night-700">{t('category.empty')}</p>
      ) : (
        <ul className="mt-6 grid gap-3 lg:grid-cols-2">
          {fiches.map((f) => (
            <li key={f.slug}>
              <Link
                href={ficheHref(f.slug, territoire.code)}
                className="group flex h-full items-start gap-3 rounded-2xl border border-night-100 bg-white p-4 transition-shadow duration-200 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold leading-snug text-night-900" lang={contentLangAttr(f.lang, locale)}>{f.titre}</span>
                  <span className="mt-1 block text-[13px] leading-snug text-night-600" lang={contentLangAttr(f.lang, locale)}>{f.resume}</span>
                  <span className="mt-2 block"><FicheStatusBadge slug={f.slug} territoire={territoire.code} /></span>
                </span>
                <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-leaf-600 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" strokeWidth={1.75} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <nav aria-label={t('category.others')} className="mt-8">
        <h2 className="text-[14px] font-extrabold text-night-900">{t('category.others')}</h2>
        <ul className="mt-2 flex flex-wrap gap-2">
          {GUIDE_CATEGORIES.filter((c) => c.key !== category.key).map((c) => (
            <li key={c.key}>
              <Link
                href={categoryHref(c.key, territoire.code)}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-night-200 bg-white px-3 text-[13px] font-semibold text-night-800 hover:bg-night-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500"
              >
                <CategoryIcon cat={c.key} className="h-4 w-4 text-leaf-700" />
                {t(`categories.${c.key}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
