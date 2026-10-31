/**
 * Namespaces next-intl fournis aux composants CLIENT, zone par zone (audit SEO C3).
 *
 * Le catalogue complet (cœur + modules : e-mails, erreurs serveur…) reste côté serveur
 * (getTranslations) ; chaque zone ne sérialise dans le HTML que ce que ses composants client
 * (`'use client'` et tout ce qu'ils importent) lisent via useTranslations.
 *
 * Un NextIntlClientProvider imbriqué REMPLACE les messages du parent (pas de fusion) :
 * chaque liste inclut donc CLIENT_NS_ROOT.
 *
 * Ajout d'un useTranslations('x.y') dans un composant client → ajouter 'x.y' (ou un ancêtre)
 * à la zone concernée. tests/i18n-client-namespaces.test.ts le vérifie automatiquement.
 */

/** Éléments globaux (app/layout.tsx) : sélecteur de langue, accessibilité. */
export const CLIENT_NS_ROOT = ['lang', 'a11y'] as const

/**
 * Site public (components/site/SiteShell.tsx) : accueil, /aide, /blog, /guide, /legal, /don, /installer,
 * /a-propos, 404, et l'assistant public (bulle « Une question ? »). Volontairement minimal : la page 404
 * racine est sérialisée dans le flux RSC de TOUTES les pages (frontière notFound du layout racine), avec son provider.
 */
export const CLIENT_NS_SITE = [...CLIENT_NS_ROOT, 'nav', 'header', 'public.assistant'] as const

/** En plus de CLIENT_NS_SITE sur l'accueil (`<SiteShell extraNamespaces>` dans app/page.tsx). */
export const CLIENT_NS_SITE_HOME = ['featureTabs', 'testimonials', 'video.dialog', 'video.slides'] as const

/** En plus de CLIENT_NS_SITE sur /installer (app/installer/page.tsx). */
export const CLIENT_NS_SITE_INSTALL = ['public.install'] as const

/** En plus de CLIENT_NS_SITE sur /partenaires/candidature (formulaire client). */
export const CLIENT_NS_SITE_PARTNER_APPLY = ['public.partners.apply'] as const

/** Parcours publics app/(public)/** : connexion, inscription, onboarding, mots de passe. */
export const CLIENT_NS_PUBLIC_FLOWS = [
  ...CLIENT_NS_ROOT,
  'onb',
  'public.onboarding',
  'public.password',
  'shared.territories',
  'family.coparents.inviteForm',
  'family.coparents.roles',
  'family.coparents.share',
  'vault.ui.copyLink',
] as const

/** Espace connecté app/app/** : modules complets (catalogue large, accepté). */
export const CLIENT_NS_APP = [
  ...CLIENT_NS_ROOT,
  'appnav',
  'dash',
  'account',
  'billing',
  'calendar',
  'coach',
  'family',
  'messaging',
  'vault',
  'onb',
  'public.assistant',
  'public.help',
  'public.onboarding.classes',
  'public.onboarding.fields',
  'public.onboarding.photo',
  'shared.calendar',
  'shared.dashboard',
  'shared.territories',
  'shared.states',
  'shared.timePicker',
  'shared.timezones',
  'shared.topBar',
] as const

/** Back-office app/admin/** (français) : composants UI partagés et aperçu du blog. */
export const CLIENT_NS_ADMIN = [...CLIENT_NS_ROOT, 'account.ui', 'public.blog'] as const

/** Page hors ligne (PWA). */
export const CLIENT_NS_OFFLINE = [...CLIENT_NS_ROOT, 'shared.states'] as const

/** Lien de partage du dossier JAF (/partage/[token]). */
export const CLIENT_NS_PARTAGE = [...CLIENT_NS_ROOT, 'family.courtFile.viewer'] as const

/** Formulaire du témoin (/temoin/[token]). */
export const CLIENT_NS_TEMOIN = [...CLIENT_NS_ROOT, 'public.witness', 'public.onboarding.fields', 'shared.states'] as const
