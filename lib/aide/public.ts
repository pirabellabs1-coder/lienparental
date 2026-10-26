import 'server-only'
/**
 * Lectures publiques du centre d'aide : éléments PUBLIÉS uniquement.
 *  - Supabase : faq_items / tutorials / daily_tips via lib/contenus/public (client anonyme, RLS
 *    « publié seulement », revalidation zod de chaque ligne).
 *  - Démonstration : magasin mémoire du back-office (mêmes contenus que les fichiers du dépôt).
 *  - Base indisponible : repli sur les fichiers du dépôt (le centre d'aide ne doit jamais être vide).
 *
 * Branchement côté parent (app/app/**, hors périmètre M6) : remplacer les imports de
 * content/faq/index.json, content/tutoriels/index.json et mockTips par ces fonctions
 * (voir le livrable de la mission M6).
 */
import { listPublished, PublicReadError } from '@/lib/contenus/public'
import type { Tip } from '@/lib/mock-data'
import type { ContentRecord } from '@/lib/contenus/types'
import { FAQ_CATEGORIES, tipCategoryLabel, type Conseil, type FaqItem, type Tutoriel } from './types'
import { readSeedConseils, readSeedFaq, readSeedTutoriels } from './seed'

export type HelpFaq = FaqItem & { id: string; updatedAt: string }
export type HelpTutoriel = Tutoriel & { id: string; updatedAt: string }

const CAT_RANK = new Map<string, number>(FAQ_CATEGORIES.map((c, i) => [c.key, i]))

async function published<K extends 'faq' | 'tutoriel' | 'conseil', T>(kind: K, fallback: () => T[], map: (r: ContentRecord<K>) => T): Promise<T[]> {
  try {
    const rows = await listPublished(kind)
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

export async function getHelpFaq(): Promise<HelpFaq[]> {
  const rows = await published('faq',
    () => readSeedFaq().map((f) => ({ ...f, id: seedId(f.slug), updatedAt: '' })),
    (r) => ({ ...r.data, id: r.id, updatedAt: r.updatedAt }))
  return rows.sort((a, b) => (CAT_RANK.get(a.categorie) ?? 99) - (CAT_RANK.get(b.categorie) ?? 99) || a.ordre - b.ordre)
}

export async function getHelpFaqBySlug(slug: string): Promise<HelpFaq | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null
  return (await getHelpFaq()).find((f) => f.slug === slug) ?? null
}

export async function getHelpTutoriels(): Promise<HelpTutoriel[]> {
  const rows = await published('tutoriel',
    () => readSeedTutoriels().map((t) => ({ ...t, id: seedId(t.slug), updatedAt: '' })),
    (r) => ({ ...r.data, id: r.id, updatedAt: r.updatedAt }))
  return rows.sort((a, b) => a.ordre - b.ordre)
}

export async function getHelpTutoriel(slug: string): Promise<HelpTutoriel | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null
  return (await getHelpTutoriels()).find((t) => t.slug === slug) ?? null
}

/** Conseils du jour publiés, au format attendu par components/dashboard/DailyTip. */
export async function getDailyTips(): Promise<Tip[]> {
  const rows = await published<'conseil', Conseil & { id: string }>('conseil',
    () => readSeedConseils().map((c) => ({ ...c, id: seedId(c.slug) })),
    (r) => ({ ...r.data, id: r.id }))
  return rows
    .sort((a, b) => a.ordre - b.ordre)
    .map((c) => ({ id: c.id, title: c.titre, body: c.texte, tag: tipCategoryLabel(c.categorie) }))
}
