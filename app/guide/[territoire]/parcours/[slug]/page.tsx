import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/cn'
import { contentLangAttr } from '@/lib/contenus/locale'
import { parcoursHref } from '@/lib/guide/links'
import { guidePaths } from '@/lib/seo/site'
import { localePath, localePathFor } from '@/lib/i18n/routing'
import { parcoursJsonLd, type Crumb } from '@/lib/seo/guide-jsonld'
import { JsonLd } from '@/components/seo/JsonLd'
import { guideItemLocales, guideMetadata, isSlug, loadPublicTerritory, titleTerritory } from '@/components/guide-public/data'
import { Breadcrumbs, CARD, CONTAINER, H1, SignupCta } from '@/components/guide-public/ui'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ territoire: string; slug: string }> }

async function resolve(params: Props['params']) {
  const { territoire, slug } = await params
  if (!isSlug(slug)) return null
  const data = await loadPublicTerritory(territoire)
  const parcours = data?.g.parcours.find((p) => p.slug === slug)
  return data && parcours ? { ...data, parcours } : null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await resolve(params)
  if (!r) return { robots: { index: false } }
  return guideMetadata({
    title: r.parcours.titre,
    territory: titleTerritory(r.g.territoire.code, r.parcours.lang ?? 'fr'),
    description: r.parcours.resume,
    path: guidePaths.parcours(r.g.territoire.code, r.parcours.slug),
    locale: r.locale,
    lang: r.parcours.lang ?? 'fr',
    available: await guideItemLocales(r.g.territoire.code, 'parcours', r.parcours.slug),
  })
}

// Parcours public : liste ordonnée des étapes, chacune liée à sa fiche (sans suivi de progression).
export default async function GuideParcoursPublicPage({ params }: Props) {
  const r = await resolve(params)
  if (!r) notFound()
  const { g, locale, parcours } = r
  const lp = localePathFor(locale)
  const { territoire } = g
  const t = await getTranslations('public.guide')
  const cl = contentLangAttr(parcours.lang, locale)
  const fiches = new Map(g.fiches.map((f) => [f.slug, f]))
  const path = guidePaths.parcours(territoire.code, parcours.slug)

  const crumbs: Crumb[] = [
    { name: t('breadcrumbHome'), path: lp('/') },
    { name: t('title'), path: lp(guidePaths.index) },
    { name: territoire.nom, path: lp(guidePaths.territoire(territoire.code)) },
    { name: parcours.titre, path: lp(path) },
  ]

  return (
    <>
      <JsonLd data={parcoursJsonLd({
        path: localePath(parcours.lang ?? 'fr', path),
        title: parcours.titre,
        description: parcours.resume,
        lang: parcours.lang ?? 'fr',
        entries: parcours.elements.map((e) => ({ name: e.titre, path: e.fiche && fiches.has(e.fiche) ? lp(guidePaths.fiche(territoire.code, e.fiche)) : undefined })),
        crumbs,
      })} />

      <div className={cn(CONTAINER, 'py-8 sm:py-12')}>
        <Breadcrumbs crumbs={crumbs} />

        <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-x-10">
          <div>
            <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-leaf-700">{t('parcours.eyebrow')}</p>
            <h1 className={cn(H1, 'mt-2')} lang={cl}>{parcours.titre}</h1>
            <p className="mt-3 text-[16px] leading-relaxed text-night-700" lang={cl}>{parcours.resume}</p>

            <h2 className="mt-8 text-[18px] font-extrabold text-night-900">{t('parcours.stepsTitle', { count: parcours.elements.length })}</h2>
            <ol className="mt-4 space-y-3" lang={cl}>
              {parcours.elements.map((e, i) => {
                const fiche = e.fiche ? fiches.get(e.fiche) : undefined
                return (
                  <li key={e.id} className={cn(CARD, 'flex gap-3 p-4')}>
                    <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-leaf-500 text-[14px] font-bold text-white">{i + 1}</span>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className="text-[15.5px] font-bold leading-snug text-night-900">{e.titre}</p>
                      {e.detail && <p className="mt-1 text-[14px] leading-relaxed text-night-700">{e.detail}</p>}
                      {fiche && (
                        <Link
                          href={lp(guidePaths.fiche(territoire.code, fiche.slug))}
                          className="mt-2 inline-flex min-h-[40px] items-center gap-1.5 text-[14px] font-semibold text-leaf-700 underline decoration-leaf-300 underline-offset-2 hover:decoration-leaf-600"
                        >
                          <span lang={contentLangAttr(fiche.lang, locale)}>{t('parcours.seeFiche', { title: fiche.titre })}</span>
                          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                        </Link>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>

          <aside className="mt-10 lg:mt-0">
            <div className="lg:sticky lg:top-24">
              <SignupCta next={parcoursHref(parcours.slug, territoire.code)} variant="parcours" />
            </div>
          </aside>
        </div>

        <p className="mt-10 max-w-[720px] text-[13px] leading-relaxed text-night-600">{t('disclaimer')}</p>
      </div>
    </>
  )
}
