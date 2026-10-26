import Image from 'next/image'
import { Check, History, Images, Lock, LockKeyhole, MessagesSquare, Play, ShieldCheck, Smile } from 'lucide-react'
import { cn } from '@/lib/cn'
import { CARD, CONTAINER, IconBubble, SECTION, SectionHead } from './ui'
import { VideoTrigger } from './VideoDialog'

const OVERVIEW = [
  'Vue d’ensemble du quotidien',
  'Présentation des fonctionnalités',
  'Guide parental et informations pratiques',
  'Installation sur téléphone (PWA)',
]

// Formulation vérifiée (docs/SECURITY.md) : chiffrement en transit (HTTPS/TLS) et au repos.
// Ne jamais écrire « chiffrement de bout en bout » : ce n'est pas le cas.
const MESSAGING = [
  { icon: Lock, label: 'Échanges chiffrés (HTTPS/TLS)' },
  { icon: LockKeyhole, label: 'Stockage chiffré' },
  { icon: Images, label: 'Messages, photos et documents' },
  { icon: History, label: 'Historique conservé' },
  { icon: Smile, label: 'Un cadre respectueux' },
]

export function VideoSection({ hasVideo }: { hasVideo: boolean }) {
  return (
    <section aria-labelledby="video-section-title" className={SECTION}>
      <div className={CONTAINER}>
        <SectionHead id="video-section-title" title="Découvrez Lien Parental en 1 minute" />

        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:mt-12 lg:grid-cols-[1.25fr_1fr_1fr] lg:gap-8 [&>*]:min-w-0">
          <VideoTrigger
            label={hasVideo ? 'Lire la vidéo de présentation (1 minute)' : 'Découvrir Lien Parental en images (vidéo bientôt disponible)'}
            className="group relative block aspect-[4/3] w-full overflow-hidden rounded-3xl bg-night-100 shadow-[0_30px_60px_-40px_rgba(11,45,91,0.6)] md:col-span-2 md:aspect-video lg:col-span-1 lg:aspect-auto lg:min-h-[340px]"
          >
            <Image src="/images/home/moment-partage.jpg" alt="" fill sizes="(min-width:1024px) 460px, 100vw" className="object-cover transition-transform duration-700 group-hover:scale-[1.02]" />
            <span aria-hidden className="absolute inset-0 bg-night-950/30" />
            <span aria-hidden className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-leaf-600 shadow-xl transition-transform duration-200 group-hover:scale-105 sm:h-[72px] sm:w-[72px]">
              <Play className="h-6 w-6 translate-x-0.5" fill="currentColor" />
            </span>
            <span aria-hidden className="absolute bottom-4 right-4 rounded-full bg-night-950/80 px-3 py-1 text-[13px] font-semibold text-white">
              {hasVideo ? '1:00' : 'Aperçu en images'}
            </span>
          </VideoTrigger>

          <div className="flex flex-col justify-center rounded-3xl bg-[#F3F8F3] p-6 sm:p-7">
            <h3 className="text-[20px] font-bold leading-snug text-night-900">Une seule application pour tout gérer</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-night-700">En une minute, faites le tour de Lien Parental :</p>
            <ul className="mt-5 space-y-3">
              {OVERVIEW.map(label => (
                <li key={label} className="flex items-start gap-3 text-[15px] leading-snug text-night-800">
                  <span aria-hidden className="mt-px grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-leaf-600 ring-1 ring-leaf-200"><Check className="h-3.5 w-3.5" strokeWidth={2.5} /></span>
                  {label}
                </li>
              ))}
            </ul>
          </div>

          <div className={cn(CARD, 'flex flex-col p-6 sm:p-7')}>
            <div className="flex items-center gap-3">
              <IconBubble><MessagesSquare strokeWidth={1.75} /></IconBubble>
              <h3 className="text-[20px] font-bold leading-snug text-night-900">Messagerie sécurisée</h3>
            </div>
            <p className="mt-3 text-[15px] leading-relaxed text-night-700">Échangez sereinement avec l’autre parent dans un espace privé et sécurisé.</p>
            <ul className="mt-5 space-y-2.5">
              {MESSAGING.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-3 text-[15px] text-night-800">
                  <Icon className="h-[18px] w-[18px] shrink-0 text-leaf-600" strokeWidth={1.75} aria-hidden />
                  {label}
                </li>
              ))}
            </ul>
            <p className="mt-5 flex items-center gap-2 border-t border-[#E5E7EB] pt-4 text-[13.5px] text-night-600">
              <ShieldCheck className="h-4 w-4 shrink-0 text-leaf-600" strokeWidth={1.75} aria-hidden />
              Données hébergées en Europe
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
