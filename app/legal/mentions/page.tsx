import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Mentions légales',
  description:
    'Mentions légales du service Lien Parental : éditeur, hébergeur, directeur de la publication, contact.',
};

const LAST_UPDATED = '25 octobre 2026';

export default function MentionsLegalesPage() {
  return (
    <div className="px-5 py-12 text-night-900 sm:px-8 sm:py-16">
      <article className="mx-auto max-w-[760px] rounded-3xl bg-white p-6 ring-1 ring-[#E5E7EB] sm:p-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 min-h-[44px] text-[14px] font-semibold text-night-700 hover:text-leaf-600 underline underline-offset-4"
        >
          <span aria-hidden="true">←</span> Retour à l&apos;accueil
        </Link>

        <h1 className="mt-6 text-[32px] font-extrabold leading-tight tracking-[-0.02em] text-night-900 sm:text-[38px]">
          Mentions légales
        </h1>
        <p className="mt-2 text-sm text-night-600">
          Dernière mise à jour&nbsp;: {LAST_UPDATED}
        </p>

        <div className="mt-10 space-y-8 text-[15.5px] text-night-800 leading-relaxed">
          <section>
            <h2 className="font-display text-xl font-bold text-night-900">
              Éditeur du site
            </h2>
            <p className="mt-3">
              Le service <strong>Lien Parental</strong> est édité par la société
              Pirabel Labs, [forme juridique à compléter], immatriculée au
              Registre du Commerce et des Sociétés de [ville] sous le numéro
              [SIREN], dont le siège social est situé [adresse postale
              complète]. Capital social&nbsp;: [montant] €. Numéro de TVA
              intracommunautaire&nbsp;: [FR-XX-XXXXXXXXX].
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-night-900">
              Directeur de la publication
            </h2>
            <p className="mt-3">
              Le directeur de la publication est [nom et prénom], en qualité de
              [fonction]. Pour toute question relative au contenu éditorial,
              vous pouvez le contacter à l&apos;adresse&nbsp;:
              contact@lienparental.fr.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-night-900">
              Hébergeur
            </h2>
            <p className="mt-3">
              L&apos;application est hébergée au sein de l&apos;Union européenne
              par [raison sociale de l&apos;hébergeur], société [forme juridique]
              dont le siège social est situé [adresse], joignable au [numéro de
              téléphone]. Les serveurs applicatifs sont localisés en France
              (région [zone]).
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-night-900">
              Propriété intellectuelle
            </h2>
            <p className="mt-3">
              L&apos;ensemble des contenus présents sur le service Lien Parental
              (textes, graphismes, logos, icônes, images, interfaces,
              identité sonore, code source) est protégé par le droit
              d&apos;auteur et le droit des marques. Toute reproduction,
              représentation, modification ou adaptation, totale ou partielle,
              par quelque procédé que ce soit, est interdite sans
              autorisation écrite préalable de l&apos;éditeur.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-night-900">
              Contact
            </h2>
            <p className="mt-3">
              Pour toute demande d&apos;information, réclamation ou signalement,
              écrivez à <strong>contact@lienparental.fr</strong>. Nous nous
              engageons à répondre dans un délai raisonnable, et au plus tard
              sous trente jours pour les demandes relatives aux données
              personnelles.
            </p>
          </section>
        </div>
      </article>
    </div>
  );
}
