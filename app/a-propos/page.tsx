import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { getLocale, getTranslations } from 'next-intl/server'
import { SiteShell } from '@/components/site/SiteShell'
import { JsonLd } from '@/components/seo/JsonLd'
import { SUPPORT_EMAIL } from '@/components/profil/data'
import { loadGuide } from '@/lib/guide/load'
import { intlLocale } from '@/lib/i18n/config'
import { localePathFor } from '@/lib/i18n/routing'
import { aboutPage, graph } from '@/lib/seo/jsonld'
import { pageMetadata } from '@/lib/seo/metadata'
import { CONTACT_EMAIL } from '@/lib/seo/site'

// Langue lue dans un cookie et Guide administrable : rendu à chaque requête.
export const dynamic = 'force-dynamic'

const PATH = '/a-propos'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('about')
  return pageMetadata({ title: t('metaTitle'), description: t('metaDescription'), path: PATH, locale: await getLocale() })
}

const LINK = 'font-semibold text-leaf-700 underline underline-offset-4 hover:text-leaf-600'
const strong = (c: ReactNode) => <strong>{c}</strong>
// eslint-disable-next-line react/display-name -- fonction de rendu passée à t.rich, pas un composant
const linkTo = (href: string) => (c: ReactNode) => <Link href={href} className={LINK}>{c}</Link>

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-10">
      <h2 id={id} className="text-[22px] font-extrabold tracking-[-0.01em] text-night-900">{title}</h2>
      <div className="mt-3 space-y-3 leading-relaxed text-night-800">{children}</div>
    </section>
  )
}

/** Page « À propos » : uniquement des faits vérifiables dans le dépôt (éditeur, Guide, méthode, données). */
export default async function AboutPage() {
  const t = await getTranslations('about')
  const locale = await getLocale()
  const lp = localePathFor(locale)
  // Chiffres du Guide calculés depuis le contenu publié (version française de référence).
  const guide = await loadGuide(undefined, 'fr').catch(() => null)
  const ficheCount = guide?.fiches.length ?? 0
  const lastCheck = guide?.fiches.map((f) => f.derniereVerification).sort().at(-1)
  const territoryName = guide ? (await loadGuide(undefined, locale)).territoire.nom : null
  const fmtDate = (iso: string) => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))

  return (
    <SiteShell mainClassName="bg-[#F7F9FC]">
      <JsonLd data={graph(aboutPage({ path: lp(PATH), name: t('title'), description: t('metaDescription'), locale }))} />
      <div className="px-5 py-12 sm:px-8 sm:py-16">
        <article className="mx-auto max-w-[760px] rounded-3xl bg-white p-6 ring-1 ring-[#E5E7EB] sm:p-10">
          <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-leaf-700">{t('kicker')}</p>
          <h1 className="mt-2 text-[30px] font-extrabold leading-tight tracking-[-0.02em] text-night-900 sm:text-[38px]">{t('title')}</h1>
          <p className="mt-4 text-[17px] leading-relaxed text-night-700">{t('lead')}</p>

          <Section id="qui" title={t('whoTitle')}>
            <p>{t.rich('whoBody', { b: strong, link: linkTo(lp('/legal/mentions')) })}</p>
          </Section>

          {territoryName && ficheCount > 0 && (
            <Section id="ou" title={t('whereTitle')}>
              <p>{t('whereBody', { territory: territoryName, count: ficheCount })}</p>
            </Section>
          )}

          <Section id="pour-qui" title={t('forTitle')}>
            <ul className="list-disc space-y-2 pl-6 marker:text-leaf-500">
              <li>{t('for1')}</li>
              <li>{t('for2')}</li>
              <li>{t('for3')}</li>
            </ul>
          </Section>

          <Section id="methode" title={t('methodTitle')}>
            <ul className="list-disc space-y-2 pl-6 marker:text-leaf-500">
              <li>{t('method1')}</li>
              {lastCheck && <li>{t('method2', { date: fmtDate(lastCheck) })}</li>}
              <li>{t('method3')}</li>
              <li>{t('method4')}</li>
            </ul>
          </Section>

          <Section id="juridique" title={t('legalTitle')}>
            <p>{t('legalBody')}</p>
          </Section>

          <Section id="donnees" title={t('dataTitle')}>
            <p>{t.rich('dataBody', { link: linkTo(lp('/legal/confidentialite')) })}</p>
          </Section>

          <Section id="contact" title={t('contactTitle')}>
            <dl className="grid gap-2 sm:grid-cols-[max-content_1fr] sm:gap-x-6">
              <dt className="font-semibold text-night-900">{t('contactGeneral')}</dt>
              <dd><a href={`mailto:${CONTACT_EMAIL}`} className={LINK}>{CONTACT_EMAIL}</a></dd>
              <dt className="font-semibold text-night-900">{t('contactSupport')}</dt>
              <dd><a href={`mailto:${SUPPORT_EMAIL}`} className={LINK}>{SUPPORT_EMAIL}</a></dd>
            </dl>
            <p>{t.rich('contactHelp', { link: linkTo(lp('/aide')) })}</p>
          </Section>
        </article>
      </div>
    </SiteShell>
  )
}
