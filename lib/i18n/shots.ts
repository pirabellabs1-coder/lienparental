// Captures d'écran de l'app affichées sur le site public, localisées par langue.
// FR (langue source) garde le chemin historique /images/app/<nom>.png ;
// EN et PT ont leurs variantes traduites sous /images/app/<locale>/<nom>.png
// (mêmes dimensions, même cadrage). Les fichiers FR/EN/PT sont dans public/images/app/.
//
// Utilisation :
//   - composant serveur : const locale = await getLocale(); appShot('mobile-accueil', locale)
//   - composant client  : const locale = useLocale();       appShot('mobile-accueil', locale)
// Réutilisable par l'agent vidéo (VideoDialog) pour choisir la bonne capture.
import { isLocale, type Locale } from './config'

/** Nom de capture sans extension, tel qu'il existe dans public/images/app/. */
export type AppShotName =
  | 'mobile-accueil'
  | 'mobile-journal'
  | 'mobile-calendrier'
  | 'mobile-coffre'
  | 'mobile-temoignages'
  | 'mobile-coach'
  | 'mobile-guide'
  | 'mobile-temoin'
  | 'mobile-messages'
  | 'desktop-web-accueil'

/**
 * Chemin public de la capture pour la locale donnée.
 * FR → /images/app/<nom>.png (inchangé) ; EN/PT → /images/app/<locale>/<nom>.png.
 */
export function appShot(name: AppShotName, locale: Locale | string | undefined | null): string {
  return isLocale(locale) && locale !== 'fr' ? `/images/app/${locale}/${name}.png` : `/images/app/${name}.png`
}
