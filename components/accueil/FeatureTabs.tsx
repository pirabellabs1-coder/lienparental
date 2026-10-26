'use client'
import { useRef, useState } from 'react'
import { Bot, CalendarDays, FolderLock, HeartPulse, MessageSquareQuote, MessagesSquare, Scale, Wallet } from 'lucide-react'
import { PhoneFrame } from '@/components/home/PhoneFrame'
import { cn } from '@/lib/cn'
import { CONTAINER, H2, IconBubble, LEAD, SECTION } from './ui'

// Les 8 modules (+ messagerie) regroupés en 4 besoins de parent : un onglet = une idée, illustrée par une vraie capture.
// Le Guide parental a sa propre section. Onglets ARIA (WAI-ARIA APG) : flèches, Début / Fin, tabulation vers le panneau.
const TABS = [
  {
    key: 'organiser',
    label: 'Organiser',
    title: 'Organiser le quotidien',
    text: 'Les rendez-vous, les activités et l’argent de votre enfant, enfin rangés.',
    shot: { src: '/images/app/mobile-calendrier.png', alt: 'Le calendrier de Lien Parental : vue du mois et rendez-vous du jour' },
    modules: [
      { icon: CalendarDays, name: 'Agenda partagé', text: 'Rendez-vous, activités et rappels de chaque enfant, partageables avec l’autre parent lié.' },
      { icon: Wallet, name: 'Dépenses et paiements', text: 'Pension, école, santé : chaque dépense dans le Journal, avec son justificatif et le total du mois.' },
    ],
  },
  {
    key: 'proteger',
    label: 'Protéger',
    title: 'Veiller sur votre enfant',
    text: 'Sa santé et ses documents importants, toujours à portée de main.',
    shot: { src: '/images/app/mobile-coffre.png', alt: 'Le coffre-fort de Lien Parental : catégories et documents récents' },
    modules: [
      { icon: HeartPulse, name: 'Santé des enfants', text: 'Vaccins, allergies, traitements, médecin et rendez-vous médicaux, enfant par enfant.' },
      { icon: FolderLock, name: 'Coffre-fort sécurisé', text: 'Jugements, certificats, factures : chiffrés, classés et retrouvés en un instant.' },
    ],
  },
  {
    key: 'preparer',
    label: 'Préparer',
    title: 'Préparer vos démarches',
    text: 'Des éléments clairs et datés le jour où vous en avez besoin.',
    shot: { src: '/images/app/mobile-temoignages.png', alt: 'Les demandes de témoignage dans Lien Parental, avec leur avancement' },
    modules: [
      { icon: MessageSquareQuote, name: 'Témoignages', text: 'Demandez une attestation à un proche et suivez-la jusqu’à sa signature.' },
      { icon: Scale, name: 'Mon dossier JAF', text: 'Rassemblez les pièces utiles dans un dossier clair, exportable pour votre avocat.' },
    ],
  },
  {
    key: 'apaiser',
    label: 'Apaiser',
    title: 'Apaiser les échanges',
    text: 'Parler de l’essentiel, dans un cadre respectueux.',
    shot: { src: '/images/app/mobile-coach.png', alt: 'Le Coach parental IA propose une reformulation apaisée d’un message' },
    modules: [
      { icon: Bot, name: 'Coach parental IA', text: 'Reformuler un message, préparer un échange difficile, garder un ton serein.' },
      // Formulation vérifiée (docs/SECURITY.md) : chiffrement en transit et au repos, pas « de bout en bout ».
      { icon: MessagesSquare, name: 'Messagerie sécurisée', text: 'Messages, photos et documents, historique conservé. Échanges chiffrés (HTTPS/TLS) et stockage chiffré.' },
    ],
  },
]

export function FeatureTabs() {
  const [active, setActive] = useState(0)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])

  const select = (i: number) => {
    const n = (i + TABS.length) % TABS.length
    setActive(n)
    tabs.current[n]?.focus()
  }
  const onKey = (e: React.KeyboardEvent) => {
    const map: Record<string, number> = { ArrowRight: active + 1, ArrowDown: active + 1, ArrowLeft: active - 1, ArrowUp: active - 1, Home: 0, End: TABS.length - 1 }
    if (!(e.key in map)) return
    e.preventDefault()
    select(map[e.key])
  }

  const tab = TABS[active]

  return (
    <section id="en-images" aria-labelledby="tabs-title" className={cn(SECTION, 'bg-[#F4F6F9]')}>
      <div className={CONTAINER}>
        <div className="max-w-[640px]">
          <h2 id="tabs-title" className={H2}>Lien Parental en images</h2>
          <p className={cn(LEAD, 'mt-4')}>Les vrais écrans de l’application, regroupés en quatre gestes simples.</p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-8 lg:mt-12 lg:grid-cols-[300px_1fr] lg:gap-14 [&>*]:min-w-0">
          <div
            role="tablist"
            aria-label="Fonctionnalités"
            onKeyDown={onKey}
            className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:flex lg:flex-col"
          >
            {TABS.map((t, i) => (
              <button
                key={t.key}
                ref={el => { tabs.current[i] = el }}
                id={`tab-${t.key}`}
                type="button"
                role="tab"
                aria-selected={i === active}
                aria-controls={`panel-${t.key}`}
                tabIndex={i === active ? 0 : -1}
                onClick={() => setActive(i)}
                className={cn(
                  'min-h-[48px] rounded-2xl px-4 py-3 text-center lg:px-5 lg:text-left transition-colors duration-200 lg:py-4',
                  i === active ? 'bg-night-900 text-white' : 'bg-white text-night-900 ring-1 ring-[#E5E7EB] hover:bg-night-50',
                )}
              >
                <span className="block text-[15px] font-bold lg:text-[17px]">{t.label}</span>
                <span className={cn('hidden text-[14px] lg:mt-0.5 lg:block', i === active ? 'text-night-100' : 'text-night-700')}>{t.modules.map(m => m.name).join(' · ')}</span>
              </button>
            ))}
          </div>

          <div
            key={tab.key}
            id={`panel-${tab.key}`}
            role="tabpanel"
            aria-labelledby={`tab-${tab.key}`}
            tabIndex={0}
            className="grid grid-cols-1 items-center gap-10 rounded-[28px] bg-white p-6 ring-1 ring-[#E5E7EB] sm:p-10 md:grid-cols-[1fr_auto] lg:gap-12"
          >
            <div className="home-rise">
              <h3 className="text-[22px] font-bold leading-tight text-night-900 lg:text-[24px]">{tab.title}</h3>
              <p className="mt-2 text-[16px] leading-relaxed text-night-700">{tab.text}</p>
              <ul className="mt-8 space-y-7">
                {tab.modules.map(({ icon: Icon, name, text }) => (
                  <li key={name} className="flex gap-4">
                    <IconBubble><Icon strokeWidth={1.75} /></IconBubble>
                    <div>
                      <h4 className="text-[17px] font-bold text-night-900">{name}</h4>
                      <p className="mt-1 max-w-[42ch] text-[15px] leading-relaxed text-night-700">{text}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <PhoneFrame src={tab.shot.src} alt={tab.shot.alt} sizes="230px" className="home-rise mx-auto w-[190px] sm:w-[210px] lg:w-[230px]" />
          </div>
        </div>
      </div>
    </section>
  )
}
