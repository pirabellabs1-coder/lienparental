import { CalendarClock, Mail, Timer, UserRoundSearch } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { SUPPORT_EMAIL } from '@/components/profil/data'

export default function ContactInfosPage() {
  return (
    <>
      <TopBar title="Nous contacter - Détail" showBack backHref="/app/aide/contact" showBell={false} />
      <div className="px-5 pb-8 pt-4">
        <h1 className="text-[16px] font-extrabold text-night-900">Comment nous contacter ?</h1>
        <p className="mt-2 text-[12.5px] leading-relaxed text-night-800">
          Notre équipe est à votre écoute pour répondre à toutes vos questions.
        </p>

        <dl className="mt-6 space-y-6">
          <div className="flex items-start gap-4">
            <dt className="w-14 shrink-0 text-[12.5px] font-bold text-night-900">Par e-mail</dt>
            <dd className="flex-1 text-[12.5px] text-night-800">
              Écrivez-nous à l’adresse suivante :
              <a href={`mailto:${SUPPORT_EMAIL}`} className="mt-1 flex min-h-[44px] items-center justify-between gap-2 font-bold text-night-900 underline-offset-2 hover:underline">
                {SUPPORT_EMAIL}
                <Mail className="h-5 w-5 shrink-0" aria-hidden />
              </a>
            </dd>
          </div>
          <div className="flex items-start gap-4">
            <dt className="flex w-14 shrink-0 justify-center pt-0.5 text-night-900">
              <Timer className="h-5 w-5" strokeWidth={1.8} aria-hidden /><span className="sr-only">Délai</span>
            </dt>
            <dd className="text-[12.5px] text-night-800">
              <span className="block font-bold text-night-900">Délai de réponse</span>
              Nous répondons sous 24 à 48h ouvrées.
            </dd>
          </div>
          <div className="flex items-start gap-4">
            <dt className="flex w-14 shrink-0 justify-center pt-0.5 text-night-900">
              <CalendarClock className="h-5 w-5" strokeWidth={1.8} aria-hidden /><span className="sr-only">Horaires</span>
            </dt>
            <dd className="text-[12.5px] text-night-800">
              <span className="block font-bold text-night-900">Nos horaires</span>
              Lundi - Vendredi : 9h - 18h
            </dd>
          </div>
        </dl>

        <div className="mt-8 flex items-start gap-3.5 rounded-xl2 bg-night-50/80 p-4">
          <UserRoundSearch className="mt-0.5 h-5 w-5 shrink-0 text-night-900" strokeWidth={1.8} aria-hidden />
          <p className="text-[12.5px] leading-relaxed text-night-800">
            Avant de nous écrire, consultez notre FAQ : vous y trouverez peut-être déjà la réponse à votre question.
          </p>
        </div>
      </div>
    </>
  )
}
