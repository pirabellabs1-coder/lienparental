import type { Metadata } from 'next'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { localePathFor } from '@/lib/i18n/routing'
import { SiteShell } from '@/components/site/SiteShell'
import { NOINDEX_FOLLOW } from '@/lib/seo/metadata'
import { guidePaths } from '@/lib/seo/site'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('notFound')
  return { title: t('metaTitle'), robots: NOINDEX_FOLLOW }
}

const BTN = 'inline-flex min-h-[48px] items-center justify-center rounded-full px-6 text-[15px] font-semibold transition-colors duration-200'

/** 404 de marque, traduite (URL inconnue, article ou fiche introuvable, espace admin masqué). */
export default async function NotFound() {
  const t = await getTranslations('notFound')
  // Liens dans la langue de la page (404 sous /en/… : liens /en/…).
  const lp = localePathFor(await getLocale())
  const links = [
    { href: lp('/aide'), label: t('help') },
    { href: lp(guidePaths.index), label: t('guide') },
    { href: lp('/blog'), label: t('blog') },
  ]
  return (
    <SiteShell mainClassName="grid place-items-center bg-[#F7F9FC] px-5 py-16 sm:py-24">
      <div className="w-full max-w-xl text-center">
        <p className="font-script text-[40px] leading-none text-leaf-500">{t('kicker')}</p>
        <h1 className="mt-3 text-[30px] font-extrabold leading-tight tracking-[-0.02em] text-night-900 sm:text-[38px]">{t('title')}</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-night-700">{t('text')}</p>
        <Link href={lp('/')} className={`${BTN} mt-8 bg-leaf-500 text-white hover:bg-leaf-600`}>{t('home')}</Link>
        <ul className="mt-6 flex flex-wrap justify-center gap-3">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className={`${BTN} bg-white text-night-900 ring-1 ring-inset ring-night-900/15 hover:bg-night-50`}>{l.label}</Link>
            </li>
          ))}
        </ul>
      </div>
    </SiteShell>
  )
}
