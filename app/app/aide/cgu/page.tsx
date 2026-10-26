import { TopBar } from '@/components/mobile/TopBar'
import { LegalAccordion, type LegalSection } from '@/components/profil/LegalAccordion'
import { SUPPORT_EMAIL } from '@/components/profil/data'

// Texte synthétique ; la version complète fait foi : /legal/cgu.
const LAST_UPDATED = '25 octobre 2026'

const SECTIONS: LegalSection[] = [
  { title: '1. Objet', body: 'Les présentes CGU encadrent l’accès et l’utilisation de Lien Parental, application destinée à faciliter la communication, l’organisation du quotidien et la conservation des preuves pour les parents séparés. Toute inscription ou utilisation vaut acceptation sans réserve des présentes.' },
  { title: '2. Utilisation du service', body: 'L’utilisateur s’interdit tout usage détourné du service, notamment la diffusion de contenus illicites, diffamatoires, injurieux ou portant atteinte à la vie privée d’autrui. Les contenus du journal et du coffre-fort doivent rester factuels et authentiques.' },
  { title: '3. Comptes utilisateurs', body: 'L’accès est réservé aux personnes majeures exerçant une autorité parentale. L’utilisateur fournit des informations exactes, les tient à jour et reste seul responsable de la confidentialité de ses identifiants.' },
  { title: '4. Abonnement et paiement', body: 'La formule Premium est payable mensuellement ou annuellement via notre prestataire de paiement sécurisé Stripe. L’abonnement est résiliable à tout moment depuis votre profil ; les avantages restent actifs jusqu’à la fin de la période payée.' },
  { title: '5. Contact', body: <>Pour toute question relative aux présentes CGU : <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-night-900 underline">{SUPPORT_EMAIL}</a>.</> },
]

export default function AideCguPage() {
  return (
    <>
      <TopBar title="Conditions générales" showBack backHref="/app/aide" showBell={false} />
      <div className="px-5 pb-8 pt-4">
        <h1 className="text-[16px] font-extrabold text-night-900">Conditions Générales d’Utilisation</h1>
        <p className="mt-2 text-[12.5px] text-night-800">Dernière mise à jour : {LAST_UPDATED}</p>
        <p className="mt-3 text-[12.5px] leading-relaxed text-night-800">
          Bienvenue sur Lien Parental. En utilisant notre application, vous acceptez les présentes Conditions Générales d’Utilisation.
        </p>
        <div className="mt-6">
          <LegalAccordion sections={SECTIONS} />
        </div>
      </div>
    </>
  )
}
