/**
 * Lecteur des modèles de départ (lib/modeles/seeds.ts) dans une langue donnée.
 *
 * Traduction : content/i18n/<locale>/modeles/<slug>.json (objet complet du modèle). Seuls `titre`,
 * `description`, `champs[].label` et `champs[].aide` sont traduits : le document produit (`corps`,
 * `miseEnPage`, `exemple`, `options`) reste en français, destiné à une administration française
 * (champs invariants, lib/contenus/i18n-invariants.ts). Sans traduction valide : modèle en français.
 * Sans `server-only` : utilisable par les scripts.
 */
import type { ContentLocale, Translations } from '../contenus/locale'
import { fileTranslations, localizeFromFiles } from '../contenus/i18n-files'
import { SEED_TEMPLATES } from './seeds'
import type { DocumentTemplate } from './template'

export function readSeedTemplates(locale: ContentLocale = 'fr'): DocumentTemplate[] {
  return locale === 'fr' ? SEED_TEMPLATES : SEED_TEMPLATES.map((t) => localizeFromFiles('modele', t, locale).data)
}

/** Traductions valides d'un modèle de départ (import en base). */
export function seedTemplateTranslations(t: DocumentTemplate): Translations {
  return fileTranslations('modele', t)
}
