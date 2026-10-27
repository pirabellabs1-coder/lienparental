import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { ChevronRight } from 'lucide-react'
import { GuideHeader } from '@/components/guide/GuideHeader'
import { GuideSearch } from '@/components/guide/GuideSearch'
import { ParcoursCard } from '@/components/guide/Progress'
import { CategoryIcon } from '@/components/guide/icons'
import { loadGuide, toResume } from '@/lib/guide/load'
import { GUIDE_CATEGORIES } from '@/lib/guide/types'
import { categoryHref } from '@/lib/guide/links'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('coach.guide')
  return { title: t('title') }
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

// Guide Parent : accueil (recherche, parcours, catégories).
export default async function GuidePage({ searchParams }: Props) {
  const t = await getTranslations('coach.guide')
  const sp = await searchParams
  const g = await loadGuide(sp.territoire)
  const { territoire, fiches, parcours } = g
  const counts = Object.fromEntries(GUIDE_CATEGORIES.map((c) => [c.key, fiches.filter((f) => f.categorie === c.key).length]))

  return (
    <div className="w-full px-5 pb-8 lg:px-6">
      <GuideHeader territoire={territoire} territoires={g.territoires} />

      <h1 className="mt-5 text-[26px] font-extrabold tracking-[-0.02em] text-night-900 lg:text-[30px]">{t('title')}</h1>
      <p className="mt-1.5 max-w-[560px] text-[14px] leading-relaxed text-night-600">
        {t('home.intro')}
      </p>

      <div className="mt-5 max-w-[640px]">
        <GuideSearch fiches={fiches.map(toResume)} territoire={territoire.code} />
      </div>

      {parcours.length > 0 && (
        <section aria-labelledby="parcours-titre" className="mt-8">
          <h2 id="parcours-titre" className="text-[17px] font-extrabold text-night-900">{t('home.parcoursTitle')}</h2>
          <p className="mt-0.5 text-[13px] text-night-600">{t('home.parcoursHint')}</p>
          <ul className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {parcours.map((p) => (
              <li key={p.slug}><ParcoursCard parcours={p} territoire={territoire.code} /></li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="categories-titre" className="mt-8">
        <h2 id="categories-titre" className="text-[17px] font-extrabold text-night-900">{t('home.categoriesTitle')}</h2>
        <ul className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {GUIDE_CATEGORIES.map((c) => (
            <li key={c.key}>
              <Link
                href={categoryHref(c.key, territoire.code)}
                className="group flex min-h-[64px] items-center gap-3 rounded-2xl border border-night-100 bg-white px-3.5 py-3 transition-shadow duration-200 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500"
              >
                <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-leaf-50 text-leaf-700">
                  <CategoryIcon cat={c.key} className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-bold text-night-900">{t(`categories.${c.key}`)}</span>
                  <span className="block text-[12.5px] text-night-600">{t('home.ficheCount', { count: counts[c.key] ?? 0 })}</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-night-400 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" strokeWidth={1.75} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-8 max-w-[640px] text-[12.5px] leading-relaxed text-night-600">
        {t('home.disclaimer')}
      </p>
    </div>
  )
}
