import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Lock, Globe2, BadgeCheck } from 'lucide-react'
import { Logo } from '@/components/brand/Logo'

/**
 * Parcours publics (connexion, inscription, onboarding, mot de passe oublié).
 * - Mobile : plein écran, comme les maquettes.
 * - Tablette : carte centrée sur fond clair.
 * - Ordinateur : écran partagé, photo à gauche, formulaire à droite.
 * Note : un compte non vérifié ne peut accéder ni au coffre ni créer de témoignage (à appliquer côté backend).
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-white pwa-safe md:bg-[#f6f7fb] lg:grid lg:grid-cols-[1.05fr_1fr] lg:bg-white">
      <aside className="relative hidden overflow-hidden lg:block" aria-hidden="false">
        <Image
          src="/images/hero-pere-fille.jpg"
          alt="Un père serre sa fille dans ses bras, tous deux rient"
          fill
          priority
          sizes="55vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-night-950/85 via-night-950/25 to-night-950/10" />
        <Link href="/" className="absolute left-10 top-10 rounded-2xl bg-white/90 px-4 py-2.5 backdrop-blur" aria-label="Retour à l’accueil Lien Parental">
          <Logo size="sm" layout="inline" />
        </Link>
        <div className="absolute inset-x-10 bottom-12 text-white">
          <p className="max-w-md text-[32px] font-extrabold leading-[1.15] tracking-[-0.03em]">
            Un espace serein pour ce qui compte le plus : vos enfants.
          </p>
          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[14px] font-medium text-white/85">
            <li className="flex items-center gap-2"><Lock className="h-4 w-4" strokeWidth={1.75} aria-hidden />Données chiffrées</li>
            <li className="flex items-center gap-2"><Globe2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />Hébergé en Europe</li>
            <li className="flex items-center gap-2"><BadgeCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden />Sans engagement</li>
          </ul>
        </div>
      </aside>

      <div className="md:flex md:min-h-dvh md:items-center md:justify-center md:px-4 md:py-10 lg:px-12">
        <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-white md:min-h-[min(820px,calc(100dvh-5rem))] md:max-w-[440px] md:overflow-hidden md:rounded-3xl md:border md:border-night-100/70 md:shadow-[0_1px_2px_rgba(11,45,91,0.06),0_24px_60px_-24px_rgba(11,45,91,0.18)] lg:min-h-[min(600px,calc(100dvh-5rem))] lg:rounded-none lg:border-0 lg:shadow-none">
          {children}
        </div>
      </div>
    </div>
  )
}
