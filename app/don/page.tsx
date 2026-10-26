import type { Metadata } from 'next'
import Link from 'next/link'
import { Heart, ArrowLeft } from 'lucide-react'
import { SiteShell } from '@/components/site/SiteShell'

export const metadata: Metadata = { title: 'Soutenir Lien Parental' }

// La plateforme de don (Stripe, HelloAsso…) reste à choisir par le client (CDC §13 Q7).
const DON_URL = process.env.NEXT_PUBLIC_DON_URL

export default function DonPage() {
  return (
    <SiteShell mainClassName="grid place-items-center bg-[#F7F9FC] px-5 py-16">
      <div className="w-full max-w-md rounded-2xl border border-night-100 bg-white p-8 text-center shadow-soft">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-leaf-50">
          <Heart className="h-8 w-8 text-leaf-500" aria-hidden />
        </span>
        <h1 className="mt-4 text-[28px] font-extrabold text-night-900">Soutenez Lien Parental</h1>
        <p className="mt-3 text-sm leading-relaxed text-night-700">
          Votre soutien nous permet de développer gratuitement de nouveaux outils pour accompagner les familles et préserver le lien parent-enfant.
        </p>
        {DON_URL ? (
          <a href={DON_URL} rel="noopener" className="mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-leaf-500 px-6 font-semibold text-white hover:bg-leaf-600">
            <Heart className="h-4 w-4" aria-hidden /> Faire un don
          </a>
        ) : (
          <p className="mt-6 rounded-lg bg-leaf-50 px-4 py-3 text-sm font-medium text-leaf-700">La page de don ouvre très bientôt. Merci pour votre générosité !</p>
        )}
        <Link href="/" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-night-900 hover:text-leaf-500">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Retour à l’accueil
        </Link>
      </div>
    </SiteShell>
  )
}
