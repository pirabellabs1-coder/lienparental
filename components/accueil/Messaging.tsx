import { ArrowRight, CheckCheck, Clock, FileDown, FolderLock, Images, Sparkles } from 'lucide-react'
import { PhoneFrame } from '@/components/home/PhoneFrame'
import { cn } from '@/lib/cn'
import { BTN_PRIMARY, CONTAINER, H2, IconBubble, LEAD, SECTION } from './ui'
import Link from 'next/link'

// Section dédiée à la messagerie entre parents (fonctions vérifiées dans components/messages).
// Formulation sécurité : chiffrement en transit et au repos, jamais « de bout en bout ».
const POINTS = [
  { icon: Clock, title: 'Chaque message est horodaté', text: 'Date et heure d’envoi, et la mention « Lu » quand l’autre parent a ouvert la conversation.' },
  { icon: Sparkles, title: 'Le Coach relit le ton avant l’envoi', text: 'Un message trop vif ? Il propose une version plus calme. Vous restez libre d’envoyer le vôtre.' },
  { icon: Images, title: 'Photos, documents et messages vocaux', text: 'Une ordonnance, un bulletin, une photo de vacances : tout passe par le même fil.' },
  { icon: FolderLock, title: 'Les pièces importantes vont au coffre-fort', text: 'Ordonnances, certificats, factures : rangés dans votre coffre-fort, classés et retrouvés en un instant.' },
  { icon: FileDown, title: 'Export PDF de la conversation', text: 'Un document propre et daté, prêt à joindre à votre dossier si vous en avez besoin.' },
]

export function Messaging() {
  return (
    <section id="messagerie" aria-labelledby="messaging-title" className={cn(SECTION, 'overflow-hidden')}>
      <div className={cn(CONTAINER, 'grid grid-cols-1 items-center gap-12 lg:grid-cols-[1fr_0.85fr] lg:gap-16 [&>*]:min-w-0')}>
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-leaf-50 px-3.5 py-1.5 text-[13px] font-semibold text-leaf-700">
            <CheckCheck className="h-4 w-4" strokeWidth={2} aria-hidden />
            Messagerie entre parents
          </p>
          <h2 id="messaging-title" className={cn(H2, 'mt-4 max-w-[22ch]')}>
            Des échanges écrits, clairs et apaisés.
          </h2>
          <p className={cn(LEAD, 'mt-4 max-w-[52ch]')}>
            Fini les messages perdus entre SMS, mails et réseaux sociaux. Avec l’autre parent, tout se dit au même endroit, et tout reste.
          </p>

          <ul className="mt-8 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <IconBubble size="sm"><Icon strokeWidth={1.75} /></IconBubble>
                <div>
                  <h3 className="text-[16px] font-bold leading-snug text-night-900">{title}</h3>
                  <p className="mt-1 text-[14.5px] leading-relaxed text-night-700">{text}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href="/onboarding" className={cn(BTN_PRIMARY, 'h-12 px-6')}>
              Essayer gratuitement<ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <p className="text-[13.5px] text-night-600">Échanges chiffrés (HTTPS/TLS), données hébergées en Europe.</p>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[340px]">
          <div aria-hidden className="absolute -inset-x-10 inset-y-10 -z-10 rounded-[48px] bg-gradient-to-br from-[#EAF4EA] via-[#F3F8F3] to-[#EEF2F8]" />
          <PhoneFrame
            src="/images/app/mobile-messages.png"
            alt="Une conversation entre deux parents dans Lien Parental : messages horodatés, mention Lu et pièce jointe"
            sizes="(min-width:1024px) 340px, 80vw"
          />
        </div>
      </div>
    </section>
  )
}
