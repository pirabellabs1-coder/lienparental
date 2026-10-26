import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { SiteShell } from '@/components/site/SiteShell'
import { HomeStyles } from '@/components/accueil/HomeStyles'
import { Hero } from '@/components/accueil/Hero'
import { ModuleBar } from '@/components/accueil/ModuleBar'
import { VideoSection } from '@/components/accueil/VideoSection'
import { VideoDialog } from '@/components/accueil/VideoDialog'
import { WhyChoose } from '@/components/accueil/WhyChoose'
import { Features } from '@/components/accueil/Features'
import { FeatureTabs } from '@/components/accueil/FeatureTabs'
import { Guide } from '@/components/accueil/Guide'
import { Pwa } from '@/components/accueil/Pwa'
import { Testimonials } from '@/components/accueil/TestimonialsSection'
import { PricingFaq } from '@/components/accueil/PricingFaq'
import { FinalBanner } from '@/components/accueil/FinalBanner'
import { DEMO_COOKIE } from '@/lib/demo-auth'

// Page d'accueil : maquette du client (octobre 2026), fond clair et sections dans l'ordre de la maquette.
export const metadata: Metadata = {
  title: 'Lien Parental : tout pour votre enfant, enfin au même endroit',
  description:
    'L’application des parents séparés : agenda partagé, dépenses et paiements, santé des enfants, coffre-fort sécurisé, témoignages, dossier JAF, Coach parental IA et Guide parental (Guyane). Gratuit pour commencer, installable en PWA.',
}

// Vidéo de présentation : déposer public/video/presentation.mp4 (+ presentation.fr.vtt pour les sous-titres).
// Détection au rendu serveur : sans fichier, la fenêtre affiche un diaporama de vraies captures de l’app.
const PUBLIC = join(process.cwd(), 'public', 'video')
const hasVideo = existsSync(join(PUBLIC, 'presentation.mp4'))
const hasCaptions = existsSync(join(PUBLIC, 'presentation.fr.vtt'))

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
  // Ordre de la maquette du client ; en-tête et pied de page partagés avec les autres pages publiques (SiteShell).
  return (
    <SiteShell className="home">
      <HomeStyles />
      <Hero />
      <div className="-mt-4 lg:-mt-6"><ModuleBar /></div>
      <VideoSection hasVideo={hasVideo} />
      <WhyChoose />
      <Features />
      <FeatureTabs />
      <Guide />
      <Pwa />
      <Testimonials />
      <PricingFaq signedIn={signedIn} />
      <FinalBanner />
      <VideoDialog hasVideo={hasVideo} hasCaptions={hasCaptions} />
    </SiteShell>
  )
}
