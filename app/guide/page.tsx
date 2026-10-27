import type { Metadata } from 'next'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { ArrowRight, BadgeCheck, ListChecks, MapPin } from 'lucide-react'
import { cn } from '@/lib/cn'
import { loadGuide } from '@/lib/guide/load'
import { GUIDE_CATEGORIES } from '@/lib/guide/types'
import { guidePaths } from '@/lib/seo/site'
import { collectionJsonLd, type Crumb } from '@/lib/seo/guide-jsonld'
import { JsonLd } from '@/components/seo/JsonLd'
import { TERRITORIES, TerritoryShape } from '@/components/site/territories'
import { guideMetadata } from '@/components/guide-public/data'
import { BTN_PRIMARY, Breadcrumbs, CARD, CONTAINER, CategoryTile, H1, H2, SignupCta } from '@/components/guide-public/ui'

// La langue vient du cookie lp_locale : rendu à la requête (pas d'ISR, cf. docs/SEO-AUDIT.md C1).
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('public.guide.landing')
  return guideMetadata({ title: t('metaTitle'), description: t('metaDescription'), path: guidePaths.index, lang: await getLocale() })
}

// Présentation du Guide parental public et choix du territoire (Guyane par défaut).
export default async function GuidePublicIndex() {
  const locale = await getLocale()
  const t = await getTranslations('public.guide')
  const g = await loadGuide(undefined, locale)
  const def = g.territoire
  const shapes = new Map<string, string>(TERRITORIES.map((x) => [x.code, x.path]))
  const counts = Object.fromEntries(GUIDE_CATEGORIES.map((c) => [c.key, g.fiches.filter((f) => f.categorie === c.key).length]))

  const crumbs: Crumb[] = [
    { name: t('breadcrumbHome'), path: '/' },
    { name: t('title'), path: guidePaths.index },
  ]
  const available = g.territoires.filter((x) => x.disponible)

  return (
    <>
      <JsonLd data={collectionJsonLd({
        path: guidePaths.index,
        title: t('landing.title'),
        description: t('landing.metaDescription'),
        lang: locale,
        entries: available.map((x) => ({ name: t('territory.title', { territory: x.nom }), path: guidePaths.territoire(x.code) })),
        crumbs,
      })} />

      <div className={cn(CONTAINER, 'py-8 sm:py-12')}>
        <Breadcrumbs crumbs={crumbs} />

        <header className="mt-6 max-w-[720px]">
          <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-leaf-700">{t('title')}</p>
          <h1 className={cn(H1, 'mt-2')}>{t('landing.title')}</h1>
          <p className="mt-4 text-[17px] leading-relaxed text-night-700">{t('landing.lead')}</p>
          <Link href={guidePaths.territoire(def.code)} className={cn(BTN_PRIMARY, 'mt-6')}>
            {t('landing.openDefault', { territory: def.nom })}<ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </header>

        <section aria-labelledby="territoires" className="mt-12">
          <h2 id="territoires" className={H2}>{t('landing.territoriesTitle')}</h2>
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.territoires.map((x) => {
              const shape = shapes.get(x.code)
              const body = (
                <>
                  {shape
                    ? <TerritoryShape path={shape} available={x.disponible} className="h-11 w-11 shrink-0" />
                    : <MapPin className="h-6 w-6 shrink-0 text-leaf-700" strokeWidth={1.75} aria-hidden="true" />}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-bold text-night-900">{x.nom}</span>
                    <span className={cn('block text-[13.5px]', x.disponible ? 'font-semibold text-leaf-700' : 'text-night-600')}>
                      {x.disponible ? t('landing.available') : t('landing.soon')}
                    </span>
                  </span>
                </>
              )
              return (
                <li key={x.code}>
                  {x.disponible ? (
                    <Link href={guidePaths.territoire(x.code)} className={cn(CARD, 'flex min-h-[72px] items-center gap-3 p-4 ring-leaf-300 transition-shadow hover:shadow-[0_12px_32px_-20px_rgba(11,45,91,0.35)]')}>
                      {body}
                      <ArrowRight className="h-5 w-5 shrink-0 text-leaf-600" aria-hidden="true" />
                    </Link>
                  ) : (
                    <div className={cn(CARD, 'flex min-h-[72px] items-center gap-3 p-4 opacity-80')}>{body}</div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>

        <section aria-labelledby="dans-chaque-fiche" className="mt-12 grid gap-4 md:grid-cols-3">
          <h2 id="dans-chaque-fiche" className="sr-only">{t('landing.pointsTitle')}</h2>
          {([['point1', ListChecks], ['point2', BadgeCheck], ['point3', MapPin]] as const).map(([k, Icon]) => (
            <div key={k} className={cn(CARD, 'p-5')}>
              <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-full bg-leaf-50 text-leaf-700"><Icon className="h-5 w-5" strokeWidth={1.75} /></span>
              <h3 className="mt-3 text-[16px] font-bold text-night-900">{t(`landing.${k}Title`)}</h3>
              <p className="mt-1 text-[14px] leading-relaxed text-night-700">{t(`landing.${k}Text`)}</p>
            </div>
          ))}
        </section>

        <section aria-labelledby="categories" className="mt-12">
          <h2 id="categories" className={H2}>{t('landing.categoriesTitle', { territory: def.nom })}</h2>
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {GUIDE_CATEGORIES.map((c) => (
              <li key={c.key}>
                <CategoryTile
                  href={guidePaths.categorie(def.code, c.key)}
                  cat={c.key}
                  label={t(`categories.${c.key}`)}
                  count={t('ficheCount', { count: counts[c.key] ?? 0 })}
                />
              </li>
            ))}
          </ul>
        </section>

        <SignupCta next="/app/guide" variant="generic" className="mt-12" />

        <p className="mt-8 max-w-[720px] text-[13px] leading-relaxed text-night-600">{t('disclaimer')}</p>
      </div>
    </>
  )
}
