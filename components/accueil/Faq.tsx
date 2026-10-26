import Link from 'next/link'
import { ArrowRight, Plus } from 'lucide-react'
import { H2 } from './ui'

// Réponses vérifiées : PWA (pas de store), Guide (Guyane d'abord), sécurité (docs/SECURITY.md : chiffrement en transit
// et au repos, pas de bout en bout), partage via « Parents liés » (app/app/coparents), résiliation sans engagement.
const FAQ = [
  {
    q: 'Qu’est-ce qu’une application PWA ?',
    a: 'Une application web que l’on installe depuis le navigateur, sans passer par un store. Elle s’ouvre en plein écran depuis son icône, comme une application classique, et se met à jour toute seule.',
  },
  {
    q: 'Comment installer Lien Parental sur mon téléphone ?',
    a: 'Ouvrez le site dans votre navigateur, puis choisissez « Ajouter à l’écran d’accueil » (menu de partage sur iPhone, menu du navigateur sur Android). Notre page Installer l’application vous guide pas à pas.',
    link: { href: '/installer', label: 'Installer l’application' },
  },
  {
    q: 'Le Guide parental est-il disponible partout ?',
    a: 'Pas encore. Le Guide commence par la Guyane, avec des fiches sur l’école, la santé, les aides, la séparation et la vie quotidienne. La Martinique, la Guadeloupe, La Réunion, Mayotte et l’Hexagone suivront.',
  },
  {
    q: 'Mes données sont-elles sécurisées ?',
    a: 'Oui. Les échanges sont chiffrés en transit (HTTPS/TLS) et les données chiffrées au repos. Vos données sont stockées dans l’Union européenne (Irlande) ; certains prestataires (paiement, e-mails, Coach IA) peuvent en traiter une partie hors UE, avec les garanties prévues par le RGPD (détail dans la politique de confidentialité). Les données de santé bénéficient d’un chiffrement supplémentaire. Votre espace est personnel : rien n’est partagé sans votre accord.',
  },
  {
    q: 'Puis-je partager des informations avec l’autre parent ?',
    a: 'Oui, avec « Parents liés ». Vous invitez l’autre parent et choisissez ce que vous partagez pour chaque enfant : fiche, calendrier, documents ou dépenses. Votre Journal, le Coach IA et vos documents non partagés restent privés.',
  },
  {
    q: 'Puis-je résilier mon abonnement à tout moment ?',
    a: 'Oui. Les formules payantes sont sans engagement et se résilient depuis votre profil. Vous gardez l’accès jusqu’à la fin de la période payée, puis vos données restent consultables en offre gratuite.',
  },
]

function Item({ q, a, link }: (typeof FAQ)[number]) {
  return (
    <details className="group">
      <summary className="flex min-h-[64px] cursor-pointer list-none items-center justify-between gap-4 py-4 text-[16px] font-semibold leading-snug text-night-900">
        {q}
        <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-leaf-50 text-leaf-600 transition-transform duration-300 group-open:rotate-45">
          <Plus className="h-4 w-4" strokeWidth={2} />
        </span>
      </summary>
      <div className="pb-5 pr-2 text-[15px] leading-relaxed text-night-700">
        <p>{a}</p>
        {link && (
          <Link href={link.href} className="mt-2 inline-flex min-h-[44px] items-center font-semibold text-leaf-600 underline decoration-leaf-600/40 underline-offset-2 hover:decoration-leaf-600">
            {link.label}
          </Link>
        )}
      </div>
    </details>
  )
}

/** FAQ sous les tarifs : titre centré, questions sur deux colonnes en grand écran. */
export function Faq() {
  const half = Math.ceil(FAQ.length / 2)
  return (
    <div id="faq" className="scroll-mt-24">
      <div className="mx-auto max-w-[640px] text-center">
        <h2 id="faq-title" className={H2}>Questions fréquentes</h2>
      </div>
      <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
        {[FAQ.slice(0, half), FAQ.slice(half)].map((col, i) => (
          <div key={i} className="divide-y divide-[#E5E7EB] rounded-3xl bg-white px-5 ring-1 ring-[#E5E7EB] sm:px-7">
            {col.map(item => <Item key={item.q} {...item} />)}
          </div>
        ))}
      </div>
      <div className="mt-8 text-center">
        <Link href="/aide" className="inline-flex min-h-[44px] items-center gap-2 rounded-lg text-[16px] font-semibold text-leaf-600 hover:text-leaf-700">
          Voir toutes les questions<ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </div>
  )
}
