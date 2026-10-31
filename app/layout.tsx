import type { Metadata, Viewport } from 'next'
import { Allura, Montserrat } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages, getTranslations } from 'next-intl/server'
import './globals.css'
import { DisplayPrefs } from '@/components/a11y/DisplayPrefs'
import { IosFixedRecover } from '@/components/pwa/IosFixedRecover'
import { isLocale, LOCALE_META } from '@/lib/i18n/config'
import { CLIENT_NS_ROOT } from '@/lib/i18n/client-namespaces'
import { pick } from '@/lib/i18n/pick'
import { SITE, SITE_NAME } from '@/lib/seo/site'
import { defaultOgImage, ogLocale } from '@/lib/seo/metadata'
import { SPLASH_SCREENS, splashMedia } from '@/lib/pwa/splash.mjs'

// Typographies du guide d'identité : Montserrat (titres et textes), Allura (signature « Parental »).
// Auto-hébergées par next/font : pas d'appel à Google au chargement, pas de saut de mise en page.
const montserrat = Montserrat({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-montserrat', display: 'swap' })
const allura = Allura({ subsets: ['latin'], weight: '400', variable: '--font-allura', display: 'swap' })

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta')
  const locale = await getLocale()
  const og = t('ogDescription')
  return {
    // Origine absolue : tous les canonical, og:url et og:image relatifs en dérivent.
    metadataBase: new URL(SITE),
    title: { default: t('rootTitle'), template: `%s · ${SITE_NAME}` },
    description: t('rootDescription'),
    manifest: '/manifest.json',
    applicationName: SITE_NAME,
    // Écrans de lancement iOS (scripts/generate-splash.mjs) : plus d'écran blanc ou noir à l'ouverture.
    appleWebApp: {
      capable: true,
      title: SITE_NAME,
      statusBarStyle: 'black-translucent',
      startupImage: SPLASH_SCREENS.map((s) => ({ url: `/splash/${s.file}`, media: splashMedia(s) })),
    },
    icons: {
      icon: [{ url: '/icons/favicon.svg', type: 'image/svg+xml' }, { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
      apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
    },
    // Valeurs par défaut ; chaque page publique fournit les siennes (lib/seo/metadata.ts).
    openGraph: {
      title: SITE_NAME,
      description: og,
      type: 'website',
      siteName: SITE_NAME,
      url: SITE,
      locale: ogLocale(locale),
      images: [defaultOgImage((await getTranslations('seo'))('ogImageAlt'))],
    },
    twitter: { card: 'summary_large_image', title: SITE_NAME, description: og },
    // Propriété du domaine dans Google Search Console (jeton public, sans secret).
    verification: { google: 'xMONRMSDLRyrcVZZnVuc-3WTKVrFr4JeSQrF_SlHsh8' },
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#0b2d5b' }, { media: '(prefers-color-scheme: dark)', color: '#060f26' }],
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Locale résolue par next-intl (cookie lp_locale, repli français) : pilote <html lang>,
  // le format des dates/nombres et les messages fournis aux composants client.
  // Seuls les namespaces globaux sont sérialisés ici ; chaque zone (site, parcours, app, admin…)
  // fournit les siens via ScopedIntlProvider (lib/i18n/client-namespaces.ts, audit C3).
  const locale = await getLocale()
  const messages = pick(await getMessages(), CLIENT_NS_ROOT)
  const htmlLang = isLocale(locale) ? LOCALE_META[locale].htmlLang : 'fr'

  return (
    <html lang={htmlLang} suppressHydrationWarning className={`${montserrat.variable} ${allura.variable}`}>
      <body className="min-h-dvh pwa-safe">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <DisplayPrefs />
          <IosFixedRecover />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
