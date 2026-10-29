import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { Building2, CalendarClock, ExternalLink, ListChecks, Phone, TriangleAlert } from 'lucide-react'
import { GuideHeader } from '@/components/guide/GuideHeader'
import { FicheActions } from '@/components/guide/FicheActions'
import { FicheChecklist, MarkDoneButton } from '@/components/guide/Progress'
import { PartnersBlock } from '@/components/guide/PartnersBlock'
import { CategoryIcon } from '@/components/guide/icons'
import { DEMO_MODE } from '@/lib/demo-auth'
import { guideAsync, loadGuide } from '@/lib/guide/load'
import { wantedTerritoire } from '@/lib/guide/territory-server'
import { getCategory } from '@/lib/guide/types'
import { categoryHref, parcoursHref } from '@/lib/guide/links'
import { intlLocale } from '@/lib/i18n/config'
import { contentLangAttr } from '@/lib/contenus/locale'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const formatDate = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, sp] = await Promise.all([params, searchParams])
  const locale = await getLocale()
  const f = (await guideAsync.fiche(await wantedTerritoire(sp.territoire), slug, locale)) ?? (await guideAsync.ficheParDefaut(slug, locale))
  const t = await getTranslations('coach.guide')
  return { title: f?.titre ?? t('title'), description: f?.resume, robots: { index: false, follow: false } }
}

/** `lang` : langue du CONTENU (fiche non traduite) ; le titre de section suit l'interface. */
function Section({ id, title, children, lang }: { id: string; title: string; children: React.ReactNode; lang?: string }) {
  return (
    <section aria-labelledby={id} className="mt-7">
      <h2 id={id} className="text-[17px] font-extrabold text-night-900">{title}</h2>
      <div className="mt-2.5" lang={lang}>{children}</div>
    </section>
  )
}

const extLink = 'inline-flex items-center gap-1 font-semibold text-leaf-700 underline decoration-leaf-300 underline-offset-2 hover:decoration-leaf-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500'

export default async function GuideFichePage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams])
  const locale = await getLocale()
  const g = await loadGuide(await wantedTerritoire(sp.territoire), locale)
  const { territoire } = g
  const fiche = g.fiches.find((f) => f.slug === slug)
  if (!fiche) notFound()
  // Fiche non traduite (interface EN/PT) : lang="fr" sur ses textes (lecteurs d'écran, césure).
  const cl = contentLangAttr(fiche.lang, locale)
  const category = getCategory(fiche.categorie)!
  const parcours = g.parcours.filter((p) => p.elements.some((e) => e.fiche === fiche.slug))
  const demoPartners = DEMO_MODE ? g.partenairesDemo : []
  const t = await getTranslations('coach.guide')
  const dateFr = (iso: string) => formatDate(iso, locale)
  const categoryLabel = t(`categories.${category.key}`)

  return (
    <div className="w-full px-5 pb-8 lg:px-6">
      <GuideHeader
        territoire={territoire}
        territoires={g.territoires}
        back={{ href: categoryHref(category.key, territoire.code), label: categoryLabel }}
      />

      <article className="mt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-x-10">
        <div className="lg:col-start-1">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-leaf-50 px-2.5 py-1 text-[12px] font-semibold text-leaf-800">
            <CategoryIcon cat={category.key} className="h-3.5 w-3.5" />
            {categoryLabel}
          </p>
          <h1 className="mt-3 text-[24px] font-extrabold leading-tight tracking-[-0.02em] text-night-900 lg:text-[28px]" lang={cl}>{fiche.titre}</h1>
          <p className="mt-2 text-[14.5px] leading-relaxed text-night-700" lang={cl}>{fiche.resume}</p>
          <p className="mt-2 text-[12.5px] text-night-600">
            {t('fiche.lastChecked')}<time dateTime={fiche.derniereVerification}>{dateFr(fiche.derniereVerification)}</time>
          </p>

          <Section id="sert" title={t('fiche.whatFor')} lang={cl}>
            <p className="text-[14.5px] leading-relaxed text-night-800">{fiche.aQuoiCaSert}</p>
          </Section>

          <Section id="qui" title={t('fiche.who')} lang={cl}>
            <ul className="list-disc space-y-1.5 pl-5 text-[14.5px] leading-relaxed text-night-800 marker:text-leaf-500">
              {fiche.quiEstConcerne.map((q) => <li key={q}>{q}</li>)}
            </ul>
          </Section>

          {fiche.aSavoir.length > 0 && (
            <Section id="savoir" title={t('fiche.goodToKnow')} lang={cl}>
              <ul className="space-y-2">
                {fiche.aSavoir.map((s) => (
                  <li key={s} className="rounded-xl bg-night-50/70 px-3.5 py-2.5 text-[14px] leading-relaxed text-night-800">{s}</li>
                ))}
              </ul>
            </Section>
          )}

          {fiche.datesLimites.length > 0 && (
            <Section id="dates" title={t('fiche.deadlines')} lang={cl}>
              <ul className="space-y-2">
                {fiche.datesLimites.map((d) => (
                  <li key={d.libelle} className="flex gap-2.5 rounded-xl border border-gold-200 bg-gold-50 px-3.5 py-2.5">
                    <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-gold-700" strokeWidth={1.75} aria-hidden="true" />
                    <span>
                      <span className="block text-[14px] font-bold text-night-900">{d.libelle}</span>
                      {d.detail && <span className="block text-[13px] leading-snug text-night-700">{d.detail}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {fiche.documents.length > 0 && (
            <Section id="documents" title={t('fiche.documents')} lang={cl}>
              <FicheChecklist fiche={fiche} territoire={territoire.code} />
            </Section>
          )}

          <Section id="etapes" title={t('fiche.steps')} lang={cl}>
            <ol className="space-y-3">
              {fiche.etapes.map((e, i) => (
                <li key={e.titre} className="flex gap-3">
                  <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-leaf-500 text-[13px] font-bold text-white">{i + 1}</span>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-[14.5px] font-bold leading-snug text-night-900">{e.titre}</p>
                    {e.detail && <p className="mt-0.5 text-[13.5px] leading-relaxed text-night-700">{e.detail}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </Section>

          <Section id="ou" title={t('fiche.where')} lang={cl}>
            <ul className="space-y-2">
              {fiche.ou.map((o) => (
                <li key={o.nom} className="flex gap-3 rounded-xl border border-night-100 p-3.5">
                  <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-leaf-700" strokeWidth={1.75} aria-hidden="true" />
                  <div className="min-w-0 text-[13.5px] leading-relaxed">
                    <p className="font-bold text-night-900">{o.nom}</p>
                    {o.detail && <p className="text-night-700">{o.detail}</p>}
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                      {o.telephone && (
                        <a href={`tel:${o.telephone.replace(/\s/g, '')}`} className={extLink}>
                          <Phone className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />{o.telephone}
                        </a>
                      )}
                      {o.url && (
                        <a href={o.url} target="_blank" rel="noopener noreferrer" className={extLink}>
                          {t('fiche.officialSite')}<span className="sr-only">{t('fiche.officialSiteSr', { name: o.nom })}</span>
                          <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                        </a>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Section>

          <Section id="liens" title={t('fiche.links')} lang={cl}>
            <ul className="space-y-1.5 text-[14px]">
              {fiche.liens.map((l) => (
                <li key={l.url}>
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className={extLink}>
                    {l.titre}<span className="sr-only">{t('fiche.newTab')}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <aside aria-labelledby="ajouter-titre" className="mt-8 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0">
          <div className="lg:sticky lg:top-6">
            <div className="rounded-2xl bg-[#f7f8fc] p-4 ring-1 ring-night-100">
              <h2 id="ajouter-titre" className="text-[16px] font-extrabold text-night-900">{t('fiche.addTitle')}</h2>
              <p className="mt-0.5 text-[12.5px] text-night-600">{t('fiche.addHint')}</p>
              <div className="mt-3" lang={cl}><FicheActions actions={fiche.actions} ficheSlug={fiche.slug} /></div>
              <div className="mt-4"><MarkDoneButton fiche={fiche} territoire={territoire.code} /></div>
            </div>
            {parcours.length > 0 && (
              <div className="mt-4 rounded-2xl border border-night-100 p-4">
                <h2 className="flex items-center gap-1.5 text-[14px] font-extrabold text-night-900">
                  <ListChecks className="h-4 w-4 text-leaf-700" strokeWidth={1.75} aria-hidden="true" />{t('fiche.inParcours')}
                </h2>
                <ul className="mt-1.5 space-y-1">
                  {parcours.map((p) => (
                    <li key={p.slug} lang={contentLangAttr(p.lang, locale)}>
                      <Link href={parcoursHref(p.slug, territoire.code)} className="inline-flex min-h-[36px] items-center text-[13.5px] font-semibold text-leaf-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500">
                        {p.titre}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </aside>

        <div className="lg:col-start-1">
          {fiche.aConfirmer.length > 0 && (
            <section aria-labelledby="confirmer" className="mt-8 rounded-2xl border border-gold-200 bg-gold-50 p-4">
              <h2 id="confirmer" className="flex items-center gap-2 text-[15px] font-extrabold text-night-900">
                <TriangleAlert className="h-5 w-5 text-gold-700" strokeWidth={1.75} aria-hidden="true" />{t('fiche.toConfirm')}
              </h2>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-night-800" lang={cl}>
                {fiche.aConfirmer.map((c) => <li key={c}>{c}</li>)}
              </ul>
            </section>
          )}

          <section aria-labelledby="sources" className="mt-6">
            <h2 id="sources" className="text-[15px] font-extrabold text-night-900">{t('fiche.sources')}</h2>
            <ul className="mt-2 space-y-1.5 text-[13px] leading-snug" lang={cl}>
              {fiche.sources.map((s) => (
                <li key={s.url} className="text-night-700">
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className={extLink}>
                    {s.titre}<span className="sr-only">{t('fiche.newTab')}</span>
                  </a>
                  {s.verifieLe && <span className="text-night-600">{t('fiche.checkedBySource', { date: dateFr(s.verifieLe) })}</span>}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12.5px] leading-relaxed text-night-600">
              {t('fiche.disclaimer')}
            </p>
          </section>

          <PartnersBlock territoire={territoire.code} territoireNom={territoire.nom} categorie={fiche.categorie} demo={demoPartners} />
        </div>
      </article>
    </div>
  )
}
