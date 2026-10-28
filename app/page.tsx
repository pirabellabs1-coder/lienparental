import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { cookies } from 'next/headers'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { SiteShell } from '@/components/site/SiteShell'
import { CLIENT_NS_SITE_HOME } from '@/lib/i18n/client-namespaces'
import { HomeStyles } from '@/components/accueil/HomeStyles'
import { Hero } from '@/components/accueil/Hero'
import { ModuleBar } from '@/components/accueil/ModuleBar'
import { Partners } from '@/components/accueil/Partners'
import { VideoSection } from '@/components/accueil/VideoSection'
import { VideoDialog, type PresentationVideo } from '@/components/accueil/VideoDialog'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { WhyChoose } from '@/components/accueil/WhyChoose'
import { Messaging } from '@/components/accueil/Messaging'
import { Features } from '@/components/accueil/Features'
import { FeatureTabs } from '@/components/accueil/FeatureTabs'
import { Guide } from '@/components/accueil/Guide'
import { Pwa } from '@/components/accueil/Pwa'
import { Testimonials } from '@/components/accueil/TestimonialsSection'
import { PricingFaq } from '@/components/accueil/PricingFaq'
import { FinalBanner } from '@/components/accueil/FinalBanner'
import { DEMO_COOKIE } from '@/lib/demo-auth'
import { JsonLd } from '@/components/seo/JsonLd'
import { graph, webApplication } from '@/lib/seo/jsonld'
import { pageMetadata } from '@/lib/seo/metadata'

// Page d'accueil : maquette du client (octobre 2026), fond clair et sections dans l'ordre de la maquette.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta')
  return pageMetadata({ title: t('homeTitle'), description: t('homeDescription'), path: '/', locale: await getLocale(), absoluteTitle: true })
}

// Vidéo de présentation, une par langue (voix off seule, pas de sous-titres) :
// fr = public/video/presentation.mp4, en/pt = public/video/presentation.<locale>.mp4 (+ poster du même nom).
// Détection au rendu serveur : sans fichier pour la langue, la fenêtre affiche un diaporama de vraies captures de l’app.
const VIDEOS: Record<Locale, PresentationVideo> = {
  fr: { src: '/video/presentation.mp4', poster: '/video/presentation-poster.jpg' },
  en: { src: '/video/presentation.en.mp4', poster: '/video/presentation-poster.en.jpg' },
  pt: { src: '/video/presentation.pt.mp4', poster: '/video/presentation-poster.pt.jpg' },
}
const publicFile = (url: string) => existsSync(join(process.cwd(), 'public', ...url.split('/').filter(Boolean)))

function presentationVideo(locale: string): PresentationVideo | null {
  const video = VIDEOS[isLocale(locale) ? locale : 'fr']
  if (!publicFile(video.src)) return null
  // Poster localisé manquant : repli sur le poster français plutôt qu'une vignette vide.
  return publicFile(video.poster) ? video : { ...video, poster: VIDEOS.fr.poster }
}

/**
 * Présence d'un cookie de session (démo ou Supabase), sans appel réseau : sert seulement à choisir la cible
 * des boutons des formules payantes. Une session expirée est de toute façon renvoyée vers la connexion par le middleware.
 */
async function hasSessionCookie(): Promise<boolean> {
  const jar = await cookies()
  return jar.getAll().some(c => c.name === DEMO_COOKIE || /^sb-.+-auth-token/.test(c.name))
}

export default async function HomePage() {
  const signedIn = await hasSessionCookie()
  const locale = await getLocale()
  const video = presentationVideo(locale)
  const tm = await getTranslations('meta')
  const ts = await getTranslations('seo')
  // Ordre de la maquette du client ; en-tête et pied de page partagés avec les autres pages publiques (SiteShell).
  return (
    <SiteShell className="home" extraNamespaces={CLIENT_NS_SITE_HOME}>
      <HomeStyles />
      <JsonLd data={graph(webApplication({
        description: tm('homeDescription'),
        offerLabels: { free: ts('offers.free'), monthly: ts('offers.monthly'), yearly: ts('offers.yearly') },
      }))} />
      <Hero />
      <div className="-mt-4 lg:-mt-6"><ModuleBar /></div>
      <Partners />
      <VideoSection hasVideo={!!video} poster={video?.poster} />
      <WhyChoose />
      <Messaging />
      <Guide />
      <Features />
      <FeatureTabs />
      <Pwa />
      <Testimonials />
      <PricingFaq signedIn={signedIn} />
      <FinalBanner />
      <VideoDialog video={video} />
    </SiteShell>
  )
}
