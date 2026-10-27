import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { ChevronRight, ListChecks } from 'lucide-react'
import { cn } from '@/lib/cn'
import { contentLangAttr } from '@/lib/contenus/locale'
import { GUIDE_CATEGORIES } from '@/lib/guide/types'
import { homeHref } from '@/lib/guide/links'
import { guidePaths } from '@/lib/seo/site'
import { collectionJsonLd, type Crumb } from '@/lib/seo/guide-jsonld'
import { JsonLd } from '@/components/seo/JsonLd'
import { guideMetadata, loadPublicTerritory } from '@/components/guide-public/data'
import { Breadcrumbs, CONTAINER, CategoryTile, FicheCard, H1, H2, LINK_CARD, SignupCta } from '@/components/guide-public/ui'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ territoire: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { territoire } = await params
  const data = await loadPublicTerritory(territoire)
  if (!data) return { robots: { index: false } }
  const { g, locale } = data
  const t = await getTranslations('public.guide.territory')
  return guideMetadata({
    title: t('metaTitle', { territory: g.territoire.nom }),
    description: t('metaDescription', { territory: g.territoire.nom, count: g.fiches.length }),
    path: guidePaths.territoire(g.territoire.code),
    lang: locale,
  })
}

// Index d'un territoire : parcours, catégories et toutes les fiches.
export default async function GuideTerritoryPage({ params }: Props) {
  const { territoire: code } = await params
  const data = await loadPublicTerritory(code)
  if (!data) notFound()
  const { g, locale } = data
  const { territoire, fiches, parcours } = g
  const t = await getTranslations('public.guide')
  const counts = Object.fromEntries(GUIDE_CATEGORIES.map((c) => [c.key, fiches.filter((f) => f.categorie === c.key).length]))
  const title = t('territory.title', { territory: territoire.nom })

  const crumbs: Crumb[] = [
    { name: t('breadcrumbHome'), path: '/' },
    { name: t('title'), path: guidePaths.index },
    { name: territoire.nom, path: guidePaths.territoire(territoire.code) },
  ]

  return (
    <>
      <JsonLd data={collectionJsonLd({
        path: guidePaths.territoire(territoire.code),
        title,
        description: t('territory.metaDescription', { territory: territoire.nom, count: fiches.length }),
        lang: locale,
        entries: fiches.map((f) => ({ name: f.titre, path: guidePaths.fiche(territoire.code, f.slug) })),
        crumbs,
      })} />

      <div className={cn(CONTAINER, 'py-8 sm:py-12')}>
        <Breadcrumbs crumbs={crumbs} />

        <header className="mt-6 max-w-[720px]">
          <h1 className={H1}>{title}</h1>
          <p className="mt-3 text-[16.5px] leading-relaxed text-night-700">{t('territory.lead', { territory: territoire.nom, count: fiches.length })}</p>
        </header>

        {parcours.length > 0 && (
          <section aria-labelledby="parcours" className="mt-10">
            <h2 id="parcours" className={H2}>{t('territory.parcoursTitle')}</h2>
            <p className="mt-1 text-[14px] text-night-600">{t('territory.parcoursHint')}</p>
            <ul className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {parcours.map((p) => (
                <li key={p.slug}>
                  <Link href={guidePaths.parcours(territoire.code, p.slug)} className={cn(LINK_CARD, 'flex h-full items-start gap-3 p-4')}>
                    <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-leaf-50 text-leaf-700"><ListChecks className="h-5 w-5" strokeWidth={1.75} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15.5px] font-bold leading-snug text-night-900" lang={contentLangAttr(p.lang, locale)}>{p.titre}</span>
                      <span className="mt-1 line-clamp-3 block text-[13.5px] leading-snug text-night-600" lang={contentLangAttr(p.lang, locale)}>{p.resume}</span>
                      <span className="mt-2 block text-[12.5px] font-semibold text-leaf-700">{t('territory.stepsCount', { count: p.elements.length })}</span>
                    </span>
                    <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-leaf-600" strokeWidth={1.75} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="categories" className="mt-10">
          <h2 id="categories" className={H2}>{t('territory.categoriesTitle')}</h2>
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {GUIDE_CATEGORIES.map((c) => (
              <li key={c.key}>
                <CategoryTile
                  href={guidePaths.categorie(territoire.code, c.key)}
                  cat={c.key}
                  label={t(`categories.${c.key}`)}
                  count={t('ficheCount', { count: counts[c.key] ?? 0 })}
                />
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="fiches" className="mt-10">
          <h2 id="fiches" className={H2}>{t('territory.fichesTitle')}</h2>
          {GUIDE_CATEGORIES.filter((c) => counts[c.key]).map((c) => (
            <div key={c.key} className="mt-6">
              <h3 className="text-[15px] font-bold text-night-800">
                <Link href={guidePaths.categorie(territoire.code, c.key)} className="hover:underline">{t(`categories.${c.key}`)}</Link>
              </h3>
              <ul className="mt-3 grid gap-3 md:grid-cols-2">
                {fiches.filter((f) => f.categorie === c.key).map((f) => (
                  <li key={f.slug}>
                    <FicheCard href={guidePaths.fiche(territoire.code, f.slug)} title={f.titre} summary={f.resume} lang={contentLangAttr(f.lang, locale)} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <SignupCta next={homeHref(territoire.code)} variant="generic" className="mt-12" />

        <p className="mt-8 max-w-[720px] text-[13px] leading-relaxed text-night-600">{t('disclaimer')}</p>
      </div>
    </>
  )
}
