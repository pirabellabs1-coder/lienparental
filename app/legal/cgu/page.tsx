import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Conditions générales d’utilisation',
  description:
    'Conditions générales d’utilisation du service Lien Parental : objet, accès, obligations, suspension, responsabilité.',
};

const LAST_UPDATED = '25 octobre 2026';

export default function CGUPage() {
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
          Conditions générales d&apos;utilisation
        </h1>
        <p className="mt-2 text-sm text-night-600">
          Dernière mise à jour&nbsp;: {LAST_UPDATED}
        </p>

        <div className="mt-10 space-y-8 text-[15.5px] text-night-800 leading-relaxed">
          <section>
            <h2 className="font-display text-xl font-bold text-night-900">
              1. Objet
            </h2>
            <p className="mt-3">
              Les présentes conditions générales d&apos;utilisation (les
              « CGU ») encadrent l&apos;accès et l&apos;utilisation du service
              Lien Parental, application en ligne destinée à faciliter la
              communication, l&apos;organisation du quotidien et la
              conservation des preuves pour les parents séparés. Toute
              inscription ou utilisation vaut acceptation sans réserve des
              présentes.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-night-900">
              2. Accès au service
            </h2>
            <p className="mt-3">
              L&apos;accès à Lien Parental est réservé aux personnes majeures
              exerçant une autorité parentale sur un ou plusieurs enfants.
              L&apos;utilisateur s&apos;engage à fournir des informations
              exactes et à maintenir à jour les éléments de son compte. Il est
              seul responsable de la confidentialité de ses identifiants.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-night-900">
              3. Obligations de l&apos;utilisateur
            </h2>
            <p className="mt-3">
              L&apos;utilisateur s&apos;interdit tout usage détourné du
              service, notamment la diffusion de contenus illicites,
              diffamatoires, injurieux, haineux, ou portant atteinte à la vie
              privée d&apos;autrui. Les contenus produits dans l&apos;espace
              « journal » et « coffre-fort » doivent rester factuels et
              authentiques. L&apos;utilisateur garantit disposer des droits
              nécessaires sur les documents téléversés.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-night-900">
              4. Suspension et résiliation
            </h2>
            <p className="mt-3">
              En cas de manquement caractérisé aux présentes, l&apos;éditeur se
              réserve le droit de suspendre ou de clôturer le compte, après
              notification par courrier électronique. L&apos;utilisateur peut
              à tout moment supprimer son compte depuis l&apos;espace
              « profil ». Les données sont alors effacées dans les conditions
              décrites par la politique de confidentialité.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-night-900">
              5. Responsabilité
            </h2>
            <p className="mt-3">
              Lien Parental fournit un outil de soutien à la coparentalité ; il
              ne se substitue en aucun cas à un conseil juridique, médical ou
              psychologique. L&apos;éditeur met en œuvre les meilleurs efforts
              pour assurer la disponibilité du service, sans toutefois garantir
              une continuité absolue. Sa responsabilité ne saurait être
              engagée pour un préjudice indirect ou pour une interruption liée
              à un cas de force majeure.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-night-900">
              6. Droit applicable
            </h2>
            <p className="mt-3">
              Les présentes CGU sont soumises au droit français. Tout litige
              relatif à leur interprétation ou leur exécution relève de la
              compétence exclusive des tribunaux français, sous réserve des
              dispositions impératives applicables aux consommateurs.
            </p>
          </section>
        </div>
      </article>
    </div>
  );
}
