import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { Logo } from '@/components/brand/Logo'
import { SUPPORT_EMAIL } from '@/components/profil/data'
import { cn } from '@/lib/cn'
import { localePathFor } from '@/lib/i18n/routing'
import { TERRITORIES, TerritoryShape } from './territories'

// Pied de page unique des pages publiques.
const LINKS: { key: string; href: string }[] = [
  { key: 'about', href: '/a-propos' },
  { key: 'features', href: '/#fonctionnalites' },
  { key: 'guide', href: '/guide' },
  { key: 'pricing', href: '/#tarifs' },
  { key: 'faq', href: '/aide' },
  { key: 'contact', href: `mailto:${SUPPORT_EMAIL}` },
  { key: 'legalMentions', href: '/legal/mentions' },
  { key: 'privacy', href: '/legal/confidentialite' },
  { key: 'terms', href: '/legal/cgu' },
  { key: 'install', href: '/installer' },
  { key: 'blog', href: '/blog' },
]

export async function SiteFooter() {
  const t = await getTranslations('footer')
  // Noms des territoires traduits (catalogue shared.territories, mêmes codes que TERRITORIES).
  const tTerr = await getTranslations('shared.territories')
  const ta = await getTranslations('a11y')
  // Liens dans la langue de la page (/en/aide…) ; mailto: et liens externes inchangés.
  const lp = localePathFor(await getLocale())
  return (
    <footer className="site-footer border-t border-[#E5E7EB] bg-white text-night-900">
      <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[1fr_2fr] lg:gap-16 [&>*]:min-w-0">
        <div>
          <Link href={lp('/')} aria-label={ta('homeLink')} className="inline-flex rounded-lg">
            <Logo size="md" tagline />
          </Link>
          <p className="mt-4 max-w-[36ch] text-[14px] leading-relaxed text-night-700">
            {t('tagline')}
          </p>
        </div>
        <div>
          <nav aria-label={t('navLabel')}>
            <ul className="grid grid-cols-2 gap-x-6 sm:grid-cols-3">
              {LINKS.map(({ key, href }) => (
                <li key={key}>
                  <Link href={lp(href)} className="inline-flex min-h-[44px] items-center text-[14.5px] text-night-800 hover:text-leaf-600">{t(key)}</Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-8 border-t border-[#E5E7EB] pt-6">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-night-700">{t('territoriesTitle')}</h2>
            <p className="mt-1 text-[14px] text-night-700">{t('territoriesSub')}</p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {TERRITORIES.map(terr => (
                <li key={terr.code} className={cn('inline-flex items-center gap-2 rounded-full py-1.5 pl-2 pr-3 text-[13px] ring-1', terr.available ? 'bg-leaf-50 ring-leaf-200' : 'bg-white ring-[#E5E7EB]')}>
                  <TerritoryShape path={terr.path} available={terr.available} className="h-6 w-6 shrink-0" />
                  <span className="font-semibold text-night-900">{tTerr(terr.code)}</span>
                  <span className={terr.available ? 'font-semibold text-leaf-700' : 'text-night-600'}>{terr.available ? t('available') : t('soon')}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <div className="border-t border-[#E5E7EB]">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-1 px-5 py-6 text-[13px] text-night-600 sm:flex-row sm:justify-between sm:px-8">
          <p>{t('rights', { year: new Date().getFullYear() })}</p>
          <p>{t('disclaimer')}</p>
        </div>
      </div>
    </footer>
  )
}
