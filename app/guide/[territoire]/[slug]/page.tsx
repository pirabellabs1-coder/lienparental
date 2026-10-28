import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { BadgeCheck, Building2, CalendarClock, ExternalLink, FileText, Info, ListChecks, MapPin, Phone } from 'lucide-react'
import { cn } from '@/lib/cn'
import { LOCALE_META, type Locale } from '@/lib/i18n/config'
import { contentLangAttr } from '@/lib/contenus/locale'
import { ficheHref } from '@/lib/guide/links'
import { getCategory } from '@/lib/guide/types'
import { guidePaths } from '@/lib/seo/site'
import { localePath, localePathFor } from '@/lib/i18n/routing'
import { ficheJsonLd, type Crumb } from '@/lib/seo/guide-jsonld'
import { JsonLd } from '@/components/seo/JsonLd'
import { CategoryIcon } from '@/components/guide/icons'
import { formatDate, guideItemLocales, guideMetadata, isSlug, loadPublicTerritory } from '@/components/guide-public/data'
import { Breadcrumbs, CARD, CONTAINER, EXT_LINK, H1, SignupCta } from '@/components/guide-public/ui'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ territoire: string; slug: string }> }

async function resolve(params: Props['params']) {
  const { territoire, slug } = await params
  if (!isSlug(slug)) return null
  const data = await loadPublicTerritory(territoire)
  const fiche = data?.g.fiches.find((f) => f.slug === slug)
  return data && fiche ? { ...data, fiche } : null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await resolve(params)
  if (!r) return { robots: { index: false } }
  const t = await getTranslations('public.guide')
  return guideMetadata({
    title: r.fiche.titre,
    description: r.fiche.resume,
    path: guidePaths.fiche(r.g.territoire.code, r.fiche.slug),
    locale: r.locale,
    lang: r.fiche.lang ?? 'fr',
    available: await guideItemLocales(r.g.territoire.code, 'fiche', r.fiche.slug),
    type: 'article',
    modifiedTime: r.fiche.derniereVerification,
    section: t(`categories.${r.fiche.categorie}`),
    tags: r.fiche.motsCles,
  })
}

/** Section titrée ; `lang` = langue du CONTENU (fiche non traduite), le titre suit l'interface. */
function Section({ id, title, children, lang }: { id: string; title: string; children: React.ReactNode; lang?: string }) {
  return (
    <section aria-labelledby={id} className="mt-9 scroll-mt-24">
      <h2 id={id} className="text-[19px] font-extrabold tracking-[-0.01em] text-night-900">{title}</h2>
      <div className="mt-3" lang={lang}>{children}</div>
    </section>
  )
}

// Fiche publique du Guide : information vérifiée et sourcée, sans les actions de l'espace connecté
// (coffre, rappel, calendrier, dépense), sans progression, sans partenaires et SANS `aConfirmer`.
export default async function GuideFichePublicPage({ params }: Props) {
  const r = await resolve(params)
  if (!r) notFound()
  const { g, locale, fiche } = r
  const lp = localePathFor(locale)
  const { territoire } = g
  const t = await getTranslations('public.guide')
  const cl = contentLangAttr(fiche.lang, locale)
  const shownLang = fiche.lang ?? 'fr'
  const category = getCategory(fiche.categorie)!
  const categoryLabel = t(`categories.${category.key}`)
  const path = guidePaths.fiche(territoire.code, fiche.slug)
  const date = (iso: string) => formatDate(iso, locale)

  const parcours = g.parcours.filter((p) => p.elements.some((e) => e.fiche === fiche.slug))
  // Fiches liées : d'abord celles des mêmes parcours, puis celles de la même catégorie.
  const relatedSlugs = [
    ...parcours.flatMap((p) => p.elements.map((e) => e.fiche)),
    ...g.fiches.filter((f) => f.categorie === fiche.categorie).map((f) => f.slug),
  ].filter((s, i, all): s is string => !!s && s !== fiche.slug && all.indexOf(s) === i)
  const related = relatedSlugs.slice(0, 4).map((s) => g.fiches.find((f) => f.slug === s)).filter((f) => f !== undefined)

  const crumbs: Crumb[] = [
    { name: t('breadcrumbHome'), path: lp('/') },
    { name: t('title'), path: lp(guidePaths.index) },
    { name: territoire.nom, path: lp(guidePaths.territoire(territoire.code)) },
    { name: categoryLabel, path: lp(guidePaths.categorie(territoire.code, category.key)) },
    { name: fiche.titre, path: lp(path) },
  ]

  return (
    <>
      <JsonLd data={ficheJsonLd({
        path: localePath(shownLang, path),
        title: fiche.titre,
        description: fiche.resume,
        lang: shownLang,
        derniereVerification: fiche.derniereVerification,
        motsCles: fiche.motsCles,
        section: categoryLabel,
        territoireNom: territoire.nom,
        audience: t('audience'),
        sources: fiche.sources,
        crumbs,
      })} />

      <div className={cn(CONTAINER, 'py-8 sm:py-12')}>
        <Breadcrumbs crumbs={crumbs} />

        <article className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-x-10">
          <div className="min-w-0">
            <Link
              href={lp(guidePaths.categorie(territoire.code, category.key))}
              className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full bg-leaf-50 px-3 py-1 text-[12.5px] font-semibold text-leaf-800 hover:bg-leaf-100"
            >
              <CategoryIcon cat={category.key} className="h-3.5 w-3.5" />{categoryLabel}
            </Link>
            <h1 className={cn(H1, 'mt-3')} lang={cl}>{fiche.titre}</h1>
            <p className="mt-3 text-[17px] leading-relaxed text-night-700" lang={cl}>{fiche.resume}</p>
            <p className="mt-3 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-night-700">
              <BadgeCheck className="h-4 w-4 shrink-0 text-leaf-600" strokeWidth={2} aria-hidden="true" />
              <span>{t.rich('fiche.verified', { date: () => <time dateTime={fiche.derniereVerification}>{date(fiche.derniereVerification)}</time> })}</span>
            </p>
            {cl && <p className="mt-3 flex gap-2 rounded-xl bg-white px-3.5 py-2.5 text-[13.5px] text-night-700 ring-1 ring-[#E5E7EB]"><Info className="mt-0.5 h-4 w-4 shrink-0 text-night-500" aria-hidden="true" />{t('fiche.untranslated')}</p>}

            {/* En bref : délais, lieu, pièces */}
            <section aria-labelledby="en-bref" className={cn(CARD, 'mt-6 p-5')}>
              <h2 id="en-bref" className="text-[16px] font-extrabold text-night-900">{t('fiche.inBrief')}</h2>
              <dl className="mt-3 space-y-3 text-[14.5px] leading-snug">
                {fiche.datesLimites.length > 0 && (
                  <div className="flex gap-3">
                    <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-gold-700" strokeWidth={1.75} aria-hidden="true" />
                    <div className="min-w-0">
                      <dt className="font-bold text-night-900">{t('fiche.briefDeadlines')}</dt>
                      <dd className="mt-0.5 text-night-700" lang={cl}>
                        <ul className="space-y-0.5">{fiche.datesLimites.map((d) => <li key={d.libelle}>{d.libelle}</li>)}</ul>
                      </dd>
                    </div>
                  </div>
                )}
                <div className="flex gap-3">
                  <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-leaf-700" strokeWidth={1.75} aria-hidden="true" />
                  <div className="min-w-0">
                    <dt className="font-bold text-night-900">{t('fiche.briefWhere')}</dt>
                    <dd className="mt-0.5 text-night-700" lang={cl}>
                      <ul className="space-y-0.5">{fiche.ou.map((o) => <li key={o.nom}>{o.nom}</li>)}</ul>
                    </dd>
                  </div>
                </div>
                {fiche.documents.length > 0 && (
                  <div className="flex gap-3">
                    <FileText className="mt-0.5 h-5 w-5 shrink-0 text-night-600" strokeWidth={1.75} aria-hidden="true" />
                    <div className="min-w-0">
                      <dt className="font-bold text-night-900">{t('fiche.briefDocuments')}</dt>
                      <dd className="mt-0.5 text-night-700">
                        <a href="#documents" className="font-semibold text-leaf-700 underline decoration-leaf-300 underline-offset-2">{t('fiche.documentsCount', { count: fiche.documents.length })}</a>
                      </dd>
                    </div>
                  </div>
                )}
              </dl>
            </section>

            <Section id="a-quoi-ca-sert" title={t('fiche.whatFor')} lang={cl}>
              <p className="text-[15.5px] leading-relaxed text-night-800">{fiche.aQuoiCaSert}</p>
            </Section>

            <Section id="qui" title={t('fiche.who')} lang={cl}>
              <ul className="list-disc space-y-1.5 pl-5 text-[15.5px] leading-relaxed text-night-800 marker:text-leaf-500">
                {fiche.quiEstConcerne.map((q) => <li key={q}>{q}</li>)}
              </ul>
            </Section>

            {fiche.datesLimites.length > 0 && (
              <Section id="dates" title={t('fiche.deadlines')} lang={cl}>
                <ul className="space-y-2">
                  {fiche.datesLimites.map((d) => (
                    <li key={d.libelle} className="flex gap-2.5 rounded-xl border border-gold-200 bg-gold-50 px-4 py-3">
                      <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-gold-700" strokeWidth={1.75} aria-hidden="true" />
                      <span>
                        <span className="block text-[14.5px] font-bold text-night-900">{d.libelle}</span>
                        {d.detail && <span className="mt-0.5 block text-[14px] leading-snug text-night-700">{d.detail}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <Section id="etapes" title={t('fiche.steps')} lang={cl}>
              <ol className="space-y-4">
                {fiche.etapes.map((e, i) => (
                  <li key={e.titre} className="flex gap-3">
                    <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-leaf-500 text-[14px] font-bold text-white">{i + 1}</span>
                    <div className="min-w-0 pt-1">
                      <p className="text-[15.5px] font-bold leading-snug text-night-900">{e.titre}</p>
                      {e.detail && <p className="mt-1 text-[14.5px] leading-relaxed text-night-700">{e.detail}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </Section>

            {fiche.documents.length > 0 && (
              <Section id="documents" title={t('fiche.documents')} lang={cl}>
                <ul className={cn(CARD, 'divide-y divide-[#E5E7EB]')}>
                  {fiche.documents.map((d) => (
                    <li key={d.id} className="flex gap-3 px-4 py-3">
                      <FileText className="mt-0.5 h-5 w-5 shrink-0 text-night-500" strokeWidth={1.75} aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-[14.5px] font-semibold text-night-900">{d.libelle}</p>
                        {d.detail && <p className="mt-0.5 text-[13.5px] leading-snug text-night-700">{d.detail}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <Section id="ou" title={t('fiche.where')} lang={cl}>
              <ul className="space-y-2.5">
                {fiche.ou.map((o) => (
                  <li key={o.nom} className={cn(CARD, 'flex gap-3 p-4')}>
                    <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-leaf-700" strokeWidth={1.75} aria-hidden="true" />
                    <div className="min-w-0 text-[14.5px] leading-relaxed">
                      <p className="font-bold text-night-900">{o.nom}</p>
                      {o.detail && <p className="text-night-700">{o.detail}</p>}
                      {(o.telephone || o.url) && (
                        <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1">
                          {o.telephone && (
                            <a href={`tel:${o.telephone.replace(/\s/g, '')}`} className={cn(EXT_LINK, 'min-h-[36px]')}>
                              <Phone className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />{o.telephone}
                            </a>
                          )}
                          {o.url && (
                            <a href={o.url} target="_blank" rel="noopener noreferrer" className={cn(EXT_LINK, 'min-h-[36px]')}>
                              {t('fiche.officialSite')}<span className="sr-only">{t('fiche.officialSiteSr', { name: o.nom })}</span>
                              <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Section>

            <Section id="liens" title={t('fiche.links')} lang={cl}>
              <ul className="space-y-2 text-[14.5px]">
                {fiche.liens.map((l) => (
                  <li key={l.url}>
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className={EXT_LINK}>
                      {l.titre}<span className="sr-only">{t('fiche.newTab')}</span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            </Section>

            {fiche.aSavoir.length > 0 && (
              <Section id="a-savoir" title={t('fiche.goodToKnow')} lang={cl}>
                <ul className="space-y-2">
                  {fiche.aSavoir.map((s) => (
                    <li key={s} className="rounded-xl bg-white px-4 py-3 text-[14.5px] leading-relaxed text-night-800 ring-1 ring-[#E5E7EB]">{s}</li>
                  ))}
                </ul>
              </Section>
            )}

            <section aria-labelledby="sources" className="mt-10 border-t border-[#E5E7EB] pt-6">
              <h2 id="sources" className="text-[17px] font-extrabold text-night-900">{t('fiche.sources')}</h2>
              <p className="mt-1 text-[13.5px] text-night-600">
                {t.rich('fiche.verified', { date: () => <time dateTime={fiche.derniereVerification}>{date(fiche.derniereVerification)}</time> })}
              </p>
              <ul className="mt-3 space-y-2 text-[14px] leading-snug" lang={cl}>
                {fiche.sources.map((s) => (
                  <li key={s.url} className="text-night-700">
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className={EXT_LINK}>
                      {s.titre}<span className="sr-only">{t('fiche.newTab')}</span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                    </a>
                    {s.verifieLe && <span className="text-night-600" lang={cl ? LOCALE_META[locale as Locale]?.htmlLang : undefined}>{t('fiche.checkedBySource', { date: date(s.verifieLe) })}</span>}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[13px] leading-relaxed text-night-600">{t('disclaimer')}</p>
            </section>
          </div>

          <aside aria-label={t('fiche.asideLabel')} className="mt-10 lg:col-start-2 lg:row-start-1 lg:mt-0">
            <div className="space-y-4 lg:sticky lg:top-24">
              <SignupCta next={ficheHref(fiche.slug, territoire.code)} variant="fiche" />

              {parcours.length > 0 && (
                <nav aria-labelledby="dans-parcours" className={cn(CARD, 'p-4')}>
                  <h2 id="dans-parcours" className="flex items-center gap-1.5 text-[15px] font-extrabold text-night-900">
                    <ListChecks className="h-4 w-4 text-leaf-700" strokeWidth={1.75} aria-hidden="true" />{t('fiche.inParcours')}
                  </h2>
                  <ul className="mt-2 space-y-1">
                    {parcours.map((p) => (
                      <li key={p.slug} lang={contentLangAttr(p.lang, locale)}>
                        <Link href={lp(guidePaths.parcours(territoire.code, p.slug))} className="inline-flex min-h-[40px] items-center text-[14px] font-semibold text-leaf-700 hover:underline">
                          {p.titre}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}

              {related.length > 0 && (
                <nav aria-labelledby="fiches-liees" className={cn(CARD, 'p-4')}>
                  <h2 id="fiches-liees" className="text-[15px] font-extrabold text-night-900">{t('fiche.related')}</h2>
                  <ul className="mt-2 space-y-1">
                    {related.map((f) => (
                      <li key={f.slug} lang={contentLangAttr(f.lang, locale)}>
                        <Link href={lp(guidePaths.fiche(territoire.code, f.slug))} className="inline-flex min-h-[40px] items-center py-1 text-[14px] font-semibold leading-snug text-leaf-700 hover:underline">
                          {f.titre}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <Link href={lp(guidePaths.categorie(territoire.code, category.key))} className="mt-2 inline-flex min-h-[40px] items-center text-[13.5px] font-semibold text-night-700 underline underline-offset-2 hover:text-night-900">
                    {t('fiche.allInCategory', { category: categoryLabel })}
                  </Link>
                </nav>
              )}
            </div>
          </aside>
        </article>
      </div>
    </>
  )
}
