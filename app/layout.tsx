import type { Metadata, Viewport } from 'next'
import { Allura, Montserrat } from 'next/font/google'
import './globals.css'
import { DisplayPrefs } from '@/components/a11y/DisplayPrefs'

// Typographies du guide d'identité : Montserrat (titres et textes), Allura (signature « Parental »).
// Auto-hébergées par next/font : pas d'appel à Google au chargement, pas de saut de mise en page.
const montserrat = Montserrat({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-montserrat', display: 'swap' })
const allura = Allura({ subsets: ['latin'], weight: '400', variable: '--font-allura', display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'Lien Parental : informer, accompagner, préserver le lien parent-enfant', template: '%s · Lien Parental' },
  description:
    "Lien Parental accompagne les parents séparés : coffre-fort chiffré, journal, calendrier, témoignages horodatés et coach parental IA. Hébergement sécurisé en Europe.",
  manifest: '/manifest.json',
  applicationName: 'Lien Parental',
  appleWebApp: { capable: true, title: 'Lien Parental', statusBarStyle: 'black-translucent' },
  icons: {
    icon: [{ url: '/icons/favicon.svg', type: 'image/svg+xml' }, { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  openGraph: {
    title: 'Lien Parental',
    description: 'Communiquer sereinement, s’organiser facilement, retrouver tout ce qui concerne votre enfant.',
    type: 'website',
    locale: 'fr_FR',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#0b2d5b' }, { media: '(prefers-color-scheme: dark)', color: '#060f26' }],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning className={`${montserrat.variable} ${allura.variable}`}>
      <body className="min-h-dvh pwa-safe">
        <DisplayPrefs />
        {children}
      </body>
    </html>
  )
}
