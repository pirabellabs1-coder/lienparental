import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Politique de confidentialité',
  description:
    'Politique de confidentialité de Lien Parental : RGPD, stockage des données dans l’UE, sous-traitants et transferts, chiffrement, durée de conservation, droit à l’oubli.',
};

const LAST_UPDATED = '26 octobre 2026';

const SCC =
  'Clauses contractuelles types de la Commission européenne (accord de traitement des données du prestataire), le cas échéant complétées par le Data Privacy Framework UE-États-Unis.';

/** Sous-traitants et destinataires techniques (art. 28 et 44 et suivants du RGPD). */
const SUBPROCESSORS: ReadonlyArray<{
  name: string;
  purpose: string;
  data: string;
  location: string;
  safeguard: string;
}> = [
  {
    name: 'Supabase (base de données, comptes, fichiers)',
    purpose: 'Hébergement de la base de données, authentification et stockage des fichiers.',
    data: 'Toutes les données de votre espace : compte, enfants, journal, calendrier, coffre-fort, témoignages, messages et fichiers.',
    location:
      'Union européenne (Irlande). Supabase est une société américaine : un accès ponctuel depuis l’extérieur de l’UE (support, maintenance) reste possible.',
    safeguard: SCC,
  },
  {
    name: 'Vercel (hébergement de l’application)',
    purpose: 'Exécution de l’application web et diffusion des pages et fichiers statiques.',
    data: 'Données techniques des requêtes (adresse IP, pages consultées, navigateur) et données en transit pendant l’utilisation du service.',
    location:
      'Fonctions exécutées dans l’Union européenne (Paris). Vercel est une société américaine dont le réseau de diffusion est mondial : une requête peut transiter par un point de présence proche de vous, y compris hors UE.',
    safeguard: SCC,
  },
  {
    name: 'Anthropic (Coach IA)',
    purpose: 'Réponses du Coach IA et analyse des messages que vous lui soumettez.',
    data: 'Uniquement lorsque vous utilisez le Coach : votre question ou le contenu à analyser, et un résumé de votre espace (prénoms et âges des enfants, journal, calendrier, noms des documents). Les informations médicales ne sont transmises que si vous l’activez pour une question.',
    location: 'États-Unis (Anthropic est une société américaine).',
    safeguard: SCC,
  },
  {
    name: 'Stripe (paiements)',
    purpose: 'Paiement et gestion des abonnements, factures.',
    data: 'Adresse e-mail, identifiant de compte, formule choisie, et données de paiement saisies directement sur les pages de Stripe (nous ne voyons jamais votre numéro de carte).',
    location: 'Union européenne et États-Unis (Stripe est un groupe américain).',
    safeguard: SCC,
  },
  {
    name: 'Resend (envoi des e-mails)',
    purpose:
      'Envoi des e-mails du service : confirmation de compte, sécurité, invitations, témoignages, factures.',
    data: 'Adresse e-mail du destinataire et contenu de l’e-mail (prénoms, liens).',
    location: 'États-Unis (Resend est une société américaine).',
    safeguard: SCC,
  },
  {
    name: 'Google (connexion et Google Agenda, uniquement si vous les choisissez)',
    purpose:
      'Connexion avec votre compte Google et, si vous l’activez, copie de vos événements dans votre Google Agenda.',
    data: 'Connexion : nom, adresse e-mail et identifiant Google. Agenda : titre, dates et lieu des événements copiés (rendez-vous de santé masqués par défaut, prénoms des enfants jamais envoyés).',
    location:
      'Union européenne et États-Unis. Pour les données de votre compte Google, Google agit selon ses propres règles de confidentialité.',
    safeguard: SCC,
  },
];

export default function ConfidentialitePage() {
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
          Politique de confidentialité
        </h1>
        <p className="mt-2 text-sm text-night-600">
          Dernière mise à jour&nbsp;: {LAST_UPDATED}
        </p>

        <div className="mt-10 space-y-8 text-[15.5px] text-night-800 leading-relaxed">
          <section>
            <h2 className="font-display text-xl font-bold text-night-900">
              Responsable de traitement
            </h2>
            <p className="mt-3">
              Le responsable de traitement des données collectées via Lien
              Parental est la société Pirabel Labs, dont les coordonnées
              figurent dans les mentions légales. Toute question relative au
              traitement de vos données peut être adressée à
              <strong> dpo@lienparental.fr</strong>.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-night-900">
              Finalités et bases légales (RGPD)
            </h2>
            <p className="mt-3">
              Nous traitons vos données pour&nbsp;: (i) la fourniture du
              service et la gestion du compte (base contractuelle)&nbsp;;
              (ii) l&apos;amélioration de l&apos;expérience (intérêt légitime,
              avec opposition possible)&nbsp;; (iii) le respect de nos
              obligations légales, notamment en matière de conservation
              probatoire. Aucun traitement à des fins publicitaires n&apos;est
              réalisé.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-night-900">
              Où sont stockées vos données
            </h2>
            <p className="mt-3">
              Vos données (compte, enfants, journal, calendrier, coffre-fort,
              témoignages, messages et fichiers) sont stockées dans
              l&apos;Union européenne (Irlande), dans la base de données et
              l&apos;espace de stockage de notre hébergeur Supabase. Les
              fonctions de l&apos;application s&apos;exécutent en France
              (Paris).
            </p>
            <p className="mt-3">
              Certains prestataires, listés ci-dessous, sont des sociétés
              établies aux États-Unis et peuvent traiter une partie des données
              hors de l&apos;Union européenne. Ces transferts ne sont effectués
              qu&apos;avec les garanties appropriées prévues aux articles 44 et
              suivants du RGPD.
            </p>
          </section>

          <section aria-labelledby="sous-traitants">
            <h2
              id="sous-traitants"
              className="font-display text-xl font-bold text-night-900"
            >
              Sous-traitants et transferts hors UE
            </h2>
            <p className="mt-3">
              Nous ne transmettons à chaque prestataire que les données
              nécessaires au service qu&apos;il rend. Les garanties de transfert
              reposent sur les clauses contractuelles types adoptées par la
              Commission européenne, prévues dans l&apos;accord de traitement
              des données de chaque prestataire, le cas échéant complétées par
              son adhésion au cadre de protection des données UE-États-Unis
              (Data Privacy Framework).
            </p>
            <ul className="mt-5 space-y-4">
              {SUBPROCESSORS.map((s) => (
                <li key={s.name} className="rounded-2xl p-5 ring-1 ring-[#E5E7EB]">
                  <h3 className="text-[16.5px] font-bold text-night-900">{s.name}</h3>
                  <dl className="mt-2 space-y-1.5 text-[15px]">
                    {(
                      [
                        ['Finalité', s.purpose],
                        ['Données concernées', s.data],
                        ['Localisation', s.location],
                        ['Garantie de transfert', s.safeguard],
                      ] as const
                    ).map(([label, value]) => (
                      <div key={label}>
                        <dt className="inline font-semibold text-night-900">{label}&nbsp;: </dt>
                        <dd className="inline">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
            <p className="mt-4">
              La liste à jour des sous-traitants peut être obtenue sur simple
              demande à <strong>dpo@lienparental.fr</strong>.
            </p>
          </section>

          <section aria-labelledby="donnees-google">
            <h2 id="donnees-google" className="font-display text-xl font-bold text-night-900">
              Données reçues de Google
            </h2>
            <p className="mt-3">
              Si vous choisissez « Continuer avec Google », Lien Parental reçoit de Google votre
              nom, votre adresse e-mail, votre photo de profil et un identifiant de compte. Ces
              informations servent uniquement à créer votre compte et à vous connecter.
            </p>
            <p className="mt-3">
              Si vous activez la synchronisation avec Google Agenda, Lien Parental demande
              l&apos;accès à un agenda « Lien Parental » qu&apos;il crée pour vous (ou, si vous le
              choisissez, aux événements de votre agenda principal). Cet accès sert uniquement à
              y copier, modifier ou supprimer les événements que vous créez dans Lien Parental.
              Lien Parental ne lit pas vos autres événements, ne les conserve pas et ne les
              utilise à aucune autre fin. Vous pouvez arrêter la synchronisation à tout moment
              depuis les paramètres du calendrier ou depuis votre compte Google ; les jetons
              d&apos;accès sont alors révoqués et supprimés.
            </p>
            <p className="mt-3">
              L&apos;utilisation et le transfert vers toute autre application des informations
              reçues des API Google respectent les{' '}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                className="font-semibold text-leaf-700 underline underline-offset-2"
              >
                règles relatives aux données utilisateur des services d&apos;API Google
              </a>
              , y compris les exigences d&apos;utilisation limitée (Limited Use). Ces données ne
              sont ni vendues, ni utilisées pour de la publicité, ni pour entraîner des modèles
              d&apos;intelligence artificielle, et aucune personne de l&apos;équipe ne les lit,
              sauf demande de votre part, obligation légale ou nécessité de sécurité.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-night-900">
              Chiffrement et sécurité
            </h2>
            <p className="mt-3">
              Les échanges sont chiffrés en transit (HTTPS/TLS). Les données sont stockées
              chiffrées au repos par notre hébergeur de base de données (AES-256), et les
              informations médicales des enfants sont en plus chiffrées par l&apos;application
              elle-même (AES-256-GCM). Les mots de passe sont hachés par notre service
              d&apos;authentification (bcrypt) et le code du coffre-fort est haché (scrypt) : ils
              ne sont jamais stockés en clair. Les jetons d&apos;accès Google sont chiffrés.
              Les sauvegardes de la base sont chiffrées.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-night-900">
              Durée de conservation
            </h2>
            <p className="mt-3">
              Les données du compte sont conservées pendant toute la durée
              d&apos;utilisation du service, puis pendant une durée de trois
              (3) ans suivant la dernière connexion active, à des fins de
              preuve et conformément aux prescriptions légales. Les
              documents à valeur probatoire téléversés dans le coffre-fort
              peuvent être conservés plus longtemps à votre demande expresse.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-night-900">
              Droits et droit à l&apos;oubli
            </h2>
            <p className="mt-3">
              Conformément aux articles 15 à 22 du RGPD, vous disposez
              d&apos;un droit d&apos;accès, de rectification, d&apos;effacement
              (« droit à l&apos;oubli »), de limitation, de portabilité et
              d&apos;opposition. Ces droits s&apos;exercent directement depuis
              votre espace « profil », ou par courriel à
              <strong> dpo@lienparental.fr</strong>. Vous pouvez également
              introduire une réclamation auprès de la CNIL (www.cnil.fr).
            </p>
          </section>
        </div>
      </article>
    </div>
  );
}
