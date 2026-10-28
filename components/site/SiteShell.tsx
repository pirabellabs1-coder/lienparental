import { useLocale, useTranslations } from 'next-intl'
import { cn } from '@/lib/cn'
import { JsonLd } from '@/components/seo/JsonLd'
import { ScopedIntlProvider } from '@/components/i18n/ScopedIntlProvider'
import { CLIENT_NS_SITE } from '@/lib/i18n/client-namespaces'
import { graph, organization, website } from '@/lib/seo/jsonld'
import { SiteFooter } from './SiteFooter'
import { SiteHeader } from './SiteHeader'

// Gabarit des pages publiques : lien d'évitement, en-tête et pied de page partagés, <main id="contenu">,
// et graphe schema.org Organization + WebSite (référencé par @id depuis les autres données structurées).
// Animations sobres (transform / opacity uniquement), coupées en prefers-reduced-motion.
const CSS = `
@keyframes site-rise{from{opacity:0;transform:translate3d(0,16px,0)}to{opacity:1;transform:none}}
.site-rise{animation:site-rise .6s cubic-bezier(.22,1,.36,1) both;animation-delay:var(--d,0ms)}
.site :focus-visible{outline:2px solid #2e7d32;outline-offset:3px;box-shadow:none}
.site .on-dark :focus-visible{outline-color:#aadcac}
@media (prefers-reduced-motion:reduce){
  .site-rise{animation:none!important}
  .site *{scroll-behavior:auto!important;transition-duration:0s!important}
}
`

type Props = {
  children: React.ReactNode
  className?: string
  mainClassName?: string
  /** La page fournit déjà son propre <main> (ex. /installer) : on l'enveloppe sans en créer un second. */
  ownMain?: boolean
  /** Namespaces client propres à la page, en plus de CLIENT_NS_SITE (ex. CLIENT_NS_SITE_HOME). */
  extraNamespaces?: readonly string[]
}

export function SiteShell({ children, className, mainClassName, ownMain = false, extraNamespaces = [] }: Props) {
  const Main = ownMain ? 'div' : 'main'
  const t = useTranslations('a11y')
  const ts = useTranslations('seo')
  const locale = useLocale()
  return (
    // Textes des composants client du site public uniquement (audit C3 : pas tout le catalogue dans le HTML).
    <ScopedIntlProvider namespaces={[...CLIENT_NS_SITE, ...extraNamespaces]}>
    <div className={cn('site flex min-h-[100dvh] flex-col overflow-x-clip bg-white font-sans text-night-900 antialiased', className)}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <JsonLd data={graph(organization({ description: ts('orgDescription') }), website({ description: ts('orgDescription'), locale }))} />
      <a
        href="#contenu"
        className="fixed left-4 top-4 z-50 -translate-y-24 rounded-full bg-white px-5 py-3 text-[15px] font-semibold text-night-900 shadow-lg ring-1 ring-[#E5E7EB] transition-transform focus-visible:translate-y-0"
      >
        {t('skipToContent')}
      </a>
      <SiteHeader />
      <Main id="contenu" tabIndex={-1} className={cn('flex-1 outline-none', mainClassName)}>
        {children}
      </Main>
      <SiteFooter />
    </div>
    </ScopedIntlProvider>
  )
}
