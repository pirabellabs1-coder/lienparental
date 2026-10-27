import 'server-only'
/**
 * Lectures publiques du centre d'aide : éléments PUBLIÉS uniquement.
 *  - Supabase : faq_items / tutorials / daily_tips via lib/contenus/public (client anonyme, RLS
 *    « publié seulement », revalidation zod de chaque ligne).
 *  - Démonstration : magasin mémoire du back-office (mêmes contenus que les fichiers du dépôt).
 *  - Base indisponible ou vide : repli sur les fichiers du dépôt (le centre d'aide ne doit jamais être vide).
 *
 * Langue : `locale` (fr | en | pt, revalidée ; passer `await getLocale()`). Traduction de la ligne en base,
 * ou de content/i18n/<locale>/… en repli fichiers ; sinon le français, signalé par `lang: 'fr'`
 * (attribut `lang` du conteneur, accessibilité).
 */
import { listPublished, PublicReadError } from '@/lib/contenus/public'
import { toContentLocale, type ContentLocale } from '@/lib/contenus/locale'
import { localizeFromFiles } from '@/lib/contenus/i18n-files'
import type { Tip } from '@/lib/mock-data'
import type { ContentRecord } from '@/lib/contenus/types'
import { FAQ_CATEGORIES, tipCategoryLabel, type Conseil, type FaqItem, type TipCategory, type Tutoriel } from './types'
import { readSeedConseils, readSeedFaq, readSeedTutoriels } from './seed'

/** `lang` : langue réellement affichée (français si la traduction manque). */
export type HelpFaq = FaqItem & { id: string; updatedAt: string; lang: ContentLocale }
export type HelpTutoriel = Tutoriel & { id: string; updatedAt: string; lang: ContentLocale }

const CAT_RANK = new Map<string, number>(FAQ_CATEGORIES.map((c, i) => [c.key, i]))

async function published<K extends 'faq' | 'tutoriel' | 'conseil', T>(
  kind: K, locale: ContentLocale, fallback: () => T[], map: (r: ContentRecord<K>) => T,
): Promise<T[]> {
  try {
    const rows = await listPublished(kind, { locale })
    // Tables encore vides (migration 0400 appliquée, import « Importer depuis le dépôt » pas encore fait) :
    // on garde les contenus du dépôt plutôt qu'un centre d'aide vide. Conséquence assumée : dépublier
    // (ou archiver) TOUS les éléments d'un type fait réapparaître ceux du dépôt : garder au moins un élément publié.
    return rows.length ? rows.map(map) : fallback()
  } catch (e) {
    if (e instanceof PublicReadError) return fallback()
    throw e
  }
}

const seedId = (slug: string) => `depot-${slug}`

export async function getHelpFaq(rawLocale?: string): Promise<HelpFaq[]> {
  const locale = toContentLocale(rawLocale)
  const rows = await published('faq', locale,
    () => readSeedFaq().map((f) => {
      const l = localizeFromFiles('faq', f, locale)
      return { ...l.data, id: seedId(f.slug), updatedAt: '', lang: l.lang }
    }),
    (r) => ({ ...r.data, id: r.id, updatedAt: r.updatedAt, lang: r.lang ?? 'fr' }))
  return rows.sort((a, b) => (CAT_RANK.get(a.categorie) ?? 99) - (CAT_RANK.get(b.categorie) ?? 99) || a.ordre - b.ordre)
}

export async function getHelpFaqBySlug(slug: string, locale?: string): Promise<HelpFaq | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null
  return (await getHelpFaq(locale)).find((f) => f.slug === slug) ?? null
}

export async function getHelpTutoriels(rawLocale?: string): Promise<HelpTutoriel[]> {
  const locale = toContentLocale(rawLocale)
  const rows = await published('tutoriel', locale,
    () => readSeedTutoriels().map((t) => {
      const l = localizeFromFiles('tutoriel', t, locale)
      return { ...l.data, id: seedId(t.slug), updatedAt: '', lang: l.lang }
    }),
    (r) => ({ ...r.data, id: r.id, updatedAt: r.updatedAt, lang: r.lang ?? 'fr' }))
  return rows.sort((a, b) => a.ordre - b.ordre)
}

export async function getHelpTutoriel(slug: string, locale?: string): Promise<HelpTutoriel | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null
  return (await getHelpTutoriels(locale)).find((t) => t.slug === slug) ?? null
}

/** Conseil du jour au format de components/dashboard/DailyTip, avec sa catégorie (clé) et sa langue. */
export type DailyTipItem = Tip & { categorie: TipCategory; lang: ContentLocale }

/**
 * Conseils du jour publiés, au format attendu par components/dashboard/DailyTip.
 * `tagLabel` traduit la catégorie (catalogue d'interface) ; par défaut, libellé français.
 */
export async function getDailyTips(rawLocale?: string, tagLabel: (key: TipCategory) => string = tipCategoryLabel): Promise<DailyTipItem[]> {
  const locale = toContentLocale(rawLocale)
  const rows = await published<'conseil', Conseil & { id: string; lang: ContentLocale }>('conseil', locale,
    () => readSeedConseils().map((c) => {
      const l = localizeFromFiles('conseil', c, locale)
      return { ...l.data, id: seedId(c.slug), lang: l.lang }
    }),
    (r) => ({ ...r.data, id: r.id, lang: r.lang ?? 'fr' }))
  return rows
    .sort((a, b) => a.ordre - b.ordre)
    .map((c) => ({ id: c.id, title: c.titre, body: c.texte, tag: tagLabel(c.categorie), categorie: c.categorie, lang: c.lang }))
}
