import { TopBar } from '@/components/mobile/TopBar'
import { LegalAccordion, type LegalSection } from '@/components/profil/LegalAccordion'

// Texte synthétique ; la version complète fait foi : /legal/confidentialite.
const LAST_UPDATED = '25 octobre 2026'
const DPO = 'dpo@lienparental.fr'

const SECTIONS: LegalSection[] = [
  { title: '1. Données collectées', body: 'Données de compte (identité, coordonnées), contenus que vous ajoutez (journal, documents, calendrier, témoignages) et données techniques nécessaires au fonctionnement et à la sécurité du service.' },
  { title: '2. Utilisation des données', body: 'Fourniture du service et gestion du compte (base contractuelle), amélioration de l’expérience (intérêt légitime, opposition possible), respect de nos obligations légales. Aucun traitement à des fins publicitaires, aucune revente.' },
  { title: '3. Stockage et sécurité', body: 'Données hébergées dans l’Union européenne. Échanges chiffrés en transit (TLS 1.3), données sensibles chiffrées au repos (AES-256), sauvegardes chiffrées sur un périmètre distinct.' },
  { title: '4. Vos droits', body: 'Accès, rectification, effacement, limitation, portabilité et opposition (articles 15 à 22 du RGPD), depuis votre profil ou par e-mail. Vous pouvez aussi saisir la CNIL (www.cnil.fr).' },
  { title: '5. Contact', body: <>Délégué à la protection des données : <a href={`mailto:${DPO}`} className="font-semibold text-night-900 underline">{DPO}</a>.</> },
]

export default function AideConfidentialitePage() {
  return (
    <>
      <TopBar title="Politique de confidentialité" showBack backHref="/app/aide" showBell={false} />
      <div className="px-5 pb-8 pt-4">
        <h1 className="text-[16px] font-extrabold text-night-900">Politique de confidentialité</h1>
        <p className="mt-2 text-[12.5px] text-night-800">Dernière mise à jour : {LAST_UPDATED}</p>
        <p className="mt-3 text-[12.5px] leading-relaxed text-night-800">
          Chez Lien Parental, la protection de vos données <strong className="font-bold text-night-900">personnelles est une priorité.</strong>
        </p>
        <div className="mt-6">
          <LegalAccordion sections={SECTIONS} />
        </div>
      </div>
    </>
  )
}
