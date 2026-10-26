import Link from 'next/link'
import { ArrowRight, Smartphone } from 'lucide-react'
import { cn } from '@/lib/cn'
import { CONTAINER } from './ui'

const STEPS = [
  { title: 'Ouvrez le site', text: 'Depuis le navigateur de votre téléphone.' },
  { title: 'Appuyez sur « Ajouter à l’écran d’accueil »', text: 'Menu de partage (iPhone) ou menu du navigateur (Android).' },
  { title: 'L’application s’installe', text: 'Son icône apparaît, elle s’ouvre comme une application.' },
]

// Bandeau horizontal de la maquette : message PWA à gauche, 3 étapes numérotées à droite.
export function Pwa() {
  return (
    <section aria-labelledby="pwa-title" className="py-6 lg:py-8">
      <div className={CONTAINER}>
        <div className="grid grid-cols-1 gap-8 rounded-[28px] bg-[#F3F8F3] p-6 ring-1 ring-leaf-100 sm:p-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)] lg:items-center lg:gap-10 lg:p-10">
          <div className="flex items-start gap-4">
            <span aria-hidden className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-leaf-500 text-white">
              <Smartphone className="h-7 w-7" strokeWidth={1.75} />
            </span>
            <div>
              <h2 id="pwa-title" className="text-[22px] font-extrabold leading-tight tracking-[-0.02em] text-night-900 lg:text-[24px]">Disponible dès maintenant en PWA</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-night-700">
                Ni sur le Play Store, ni sur l’App Store : votre navigateur suffit, sur téléphone comme sur ordinateur.
              </p>
              <Link href="/installer" className="mt-2 inline-flex min-h-[44px] items-center gap-2 rounded-lg text-[15px] font-semibold text-leaf-600 hover:text-leaf-700">
                Voir le guide d’installation<ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>

          <ol className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {STEPS.map(({ title, text }, i) => (
              <li key={title} className={cn('flex gap-3.5 rounded-2xl bg-white p-4 ring-1 ring-[#E5E7EB] sm:flex-col sm:gap-3')}>
                <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-leaf-500 text-[15px] font-bold text-white">{i + 1}</span>
                <div>
                  <h3 className="text-[15px] font-bold leading-snug text-night-900"><span className="sr-only">Étape {i + 1} : </span>{title}</h3>
                  <p className="mt-1 text-[14px] leading-snug text-night-700">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
