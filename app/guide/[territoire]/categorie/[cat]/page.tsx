import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { cn } from '@/lib/cn'
import { contentLangAttr } from '@/lib/contenus/locale'
import { categoryHref } from '@/lib/guide/links'
import { GUIDE_CATEGORIES, getCategory } from '@/lib/guide/types'
import { guidePaths } from '@/lib/seo/site'
import { localePathFor } from '@/lib/i18n/routing'
import { collectionJsonLd, type Crumb } from '@/lib/seo/guide-jsonld'
import { JsonLd } from '@/components/seo/JsonLd'
import { CategoryIcon } from '@/components/guide/icons'
import { guideMetadata, loadPublicTerritory } from '@/components/guide-public/data'
import { Breadcrumbs, CONTAINER, FicheCard, H1, SignupCta } from '@/components/guide-public/ui'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ territoire: string; cat: string }> }

async function resolve(params: Props['params']) {
  const { territoire, cat } = await params
  const category = getCategory(cat)
  if (!category) return null
  const data = await loadPublicTerritory(territoire)
  return data ? { ...data, category } : null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await resolve(params)
  if (!r) return { robots: { index: false } }
  const t = await getTranslations('public.guide')
  const label = t(`categories.${r.category.key}`)
  const count = r.g.fiches.filter((f) => f.categorie === r.category.key).length
  return guideMetadata({
    title: t('category.metaTitle', { category: label, territory: r.g.territoire.nom }),
    description: t('category.metaDescription', { category: label, territory: r.g.territoire.nom, count }),
    path: guidePaths.categorie(r.g.territoire.code, r.category.key),
    locale: r.locale,
  })
}

// Catégorie d'un territoire : liste des fiches et autres catégories.
export default async function GuideCategoryPublicPage({ params }: Props) {
  const r = await resolve(params)
  if (!r) notFound()
  const { g, locale, category } = r
  const lp = localePathFor(locale)
  const { territoire } = g
  const t = await getTranslations('public.guide')
  const label = t(`categories.${category.key}`)
  const fiches = g.fiches.filter((f) => f.categorie === category.key)
  const path = lp(guidePaths.categorie(territoire.code, category.key))

  const crumbs: Crumb[] = [
    { name: t('breadcrumbHome'), path: lp('/') },
    { name: t('title'), path: lp(guidePaths.index) },
    { name: territoire.nom, path: lp(guidePaths.territoire(territoire.code)) },
    { name: label, path },
  ]

  return (
    <>
      <JsonLd data={collectionJsonLd({
        path,
        title: t('category.metaTitle', { category: label, territory: territoire.nom }),
        description: t('category.metaDescription', { category: label, territory: territoire.nom, count: fiches.length }),
        lang: locale,
        entries: fiches.map((f) => ({ name: f.titre, path: lp(guidePaths.fiche(territoire.code, f.slug)) })),
        crumbs,
      })} />

      <div className={cn(CONTAINER, 'py-8 sm:py-12')}>
        <Breadcrumbs crumbs={crumbs} />

        <header className="mt-6 flex items-start gap-4">
          <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-leaf-50 text-leaf-700 sm:h-14 sm:w-14">
            <CategoryIcon cat={category.key} className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <h1 className={H1}>{t('category.title', { category: label, territory: territoire.nom })}</h1>
            <p className="mt-2 text-[15.5px] leading-relaxed text-night-700">{t('category.lead', { count: fiches.length, territory: territoire.nom })}</p>
          </div>
        </header>

        {fiches.length === 0 ? (
          <p className="mt-8 rounded-2xl bg-white p-5 text-[14.5px] text-night-700 ring-1 ring-[#E5E7EB]">{t('category.empty')}</p>
        ) : (
          <ul className="mt-8 grid gap-3 md:grid-cols-2">
            {fiches.map((f) => (
              <li key={f.slug}>
                <FicheCard href={lp(guidePaths.fiche(territoire.code, f.slug))} title={f.titre} summary={f.resume} lang={contentLangAttr(f.lang, locale)} />
              </li>
            ))}
          </ul>
        )}

        <nav aria-labelledby="autres-categories" className="mt-10">
          <h2 id="autres-categories" className="text-[16px] font-extrabold text-night-900">{t('category.others')}</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {GUIDE_CATEGORIES.filter((c) => c.key !== category.key).map((c) => (
              <li key={c.key}>
                <Link
                  href={lp(guidePaths.categorie(territoire.code, c.key))}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-white px-3.5 text-[14px] font-semibold text-night-800 ring-1 ring-[#E5E7EB] hover:bg-night-50"
                >
                  <CategoryIcon cat={c.key} className="h-4 w-4 text-leaf-700" />
                  {t(`categories.${c.key}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <SignupCta next={categoryHref(category.key, territoire.code)} variant="generic" className="mt-12" />
      </div>
    </>
  )
}
