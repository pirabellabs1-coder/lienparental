import { useLocale } from 'next-intl'
import { localePath } from '@/lib/i18n/routing'

/**
 * Liens internes dans la langue courante : `const lp = useLocalePath(); <Link href={lp('/aide')}>`.
 * Utilisable dans un composant client ET dans un composant serveur non asynchrone (next-intl).
 * Seules les pages publiques de la liste blanche sont préfixées (`/app/**` reste sans préfixe).
 * Composant serveur asynchrone : `localePathFor(await getLocale())` (lib/i18n/routing.ts).
 */
export function useLocalePath(): (href: string) => string {
  const locale = useLocale()
  return (href: string) => localePath(locale, href)
}
