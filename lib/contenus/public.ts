import 'server-only'
/**
 * Lectures publiques des contenus (pages parent, blog, sitemap) : éléments publiés uniquement.
 *
 * - Supabase : client anonyme SANS cookie (aucune session, aucun cookie lu : pages
 *   cachables, utilisable dans sitemap.ts). La RLS ne laisse voir que le publié ;
 *   on refiltre quand même ici (défense en profondeur) et on revalide chaque ligne
 *   avec zod : une ligne mal formée n'est jamais affichée.
 * - Démonstration : mémoire du serveur (lib/contenus/demo-store.ts).
 * - Langue : `locale` (fr | en | pt, revalidée) ; la traduction de la ligne (colonne `translations`)
 *   est superposée au français (lib/contenus/i18n.ts). `lang` de chaque enregistrement = langue
 *   réellement affichée (français si la traduction manque ou est invalide).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_ENABLED, SUPABASE_URL } from '@/lib/supabase/config'
import { demoStore, demoTranslation } from './demo-store'
import { COLUMNS, TABLE, fromRow, rowData, type Row } from './rows'
import { localizeWithLang, toContentLocale } from './i18n'
import { CONTENT_SCHEMAS, isLive, type ContentData, type ContentKind, type ContentRecord } from './types'

let anon: SupabaseClient | null = null

function publicClient(): SupabaseClient {
  if (!anon) {
    anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
    })
  }
  return anon
}

export const CONTENT_LIVE = SUPABASE_ENABLED

export class PublicReadError extends Error {}

/**
 * Éléments publiés d'un type. En cas d'indisponibilité de la base : PublicReadError
 * (l'appelant choisit : repli fichiers pour le Guide, liste vide pour le blog).
 */
export async function listPublished<K extends ContentKind>(
  kind: K,
  opts: { territoire?: string; slug?: string; limit?: number; locale?: string } = {},
): Promise<ContentRecord<K>[]> {
  const now = Date.now()
  const schema = CONTENT_SCHEMAS[kind]
  const locale = toContentLocale(opts.locale)

  if (!SUPABASE_ENABLED) {
    const store = demoStore()
    return ([...store.records[kind].values()] as ContentRecord<K>[])
      .filter((r) => isLive(r, now))
      .filter((r) => !opts.territoire || r.territoire === opts.territoire)
      .filter((r) => !opts.slug || r.slug === opts.slug)
      .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
      .slice(0, opts.limit ?? 1000)
      .map((r) => {
        if (locale === 'fr') return { ...r, lang: 'fr' as const }
        const tr = demoTranslation(store, r as ContentRecord, locale)
        const { data, lang } = localizeWithLang(kind, r.data, tr === undefined ? {} : { [locale]: tr }, locale)
        return { ...r, data, lang }
      })
  }

  const { data, error } = await selectPublished(kind, opts, now, COLUMNS[kind])
  if (error) {
    console.warn(`[contenus] lecture publique ${kind} impossible (code ${error.code ?? 'inconnu'})`)
    throw new PublicReadError(error.message)
  }
  return ((data ?? []) as unknown as Row[]).flatMap((row) => {
    const parsed = schema.safeParse(rowData(kind, row))
    if (!parsed.success) {
      console.warn(`[contenus] ${kind} ${String(row.id)} ignoré : contenu invalide`)
      return []
    }
    const rec = fromRow(kind, row, parsed.data as ContentData[K])
    if (!isLive(rec, now)) return []
    const loc = localizeWithLang(kind, rec.data, rec.translations, locale)
    return [{ ...rec, data: loc.data, lang: loc.lang }]
  })
}

async function selectPublished(kind: ContentKind, opts: { territoire?: string; slug?: string; limit?: number }, now: number, columns: string) {
  let q = publicClient().from(TABLE[kind]).select(columns)
  q = kind === 'partenaire' ? q.eq('actif', true) : q.eq('statut', 'publie')
  if (kind === 'article') q = q.lte('published_at', new Date(now).toISOString())
  if (opts.territoire && (kind === 'fiche' || kind === 'parcours' || kind === 'partenaire')) q = q.eq('territoire', opts.territoire)
  if (opts.slug && kind !== 'partenaire') q = q.eq('slug', opts.slug)
  q = q.order('published_at', { ascending: false, nullsFirst: false }).limit(opts.limit ?? 1000)
  const res = await q
  // Colonne `translations` absente (code déployé avant la migration 0490) : lecture du français seul
  // plutôt qu'un site vide. À retirer une fois 0490 appliquée partout.
  if (res.error?.code === '42703' && columns.includes('translations')) {
    console.warn('[contenus] colonne translations absente : appliquer supabase/migrations/0490_contenus_translations.sql')
    return selectPublished(kind, opts, now, columns.replace(', translations', ''))
  }
  return res
}

export type PublicTerritoire = { code: string; nom: string; disponible: boolean; ordre: number }

export async function listPublicTerritoires(): Promise<PublicTerritoire[]> {
  if (!SUPABASE_ENABLED) return [...demoStore().territoires.values()]
  const { data, error } = await publicClient().from('guide_territoires').select('code, nom, disponible, ordre').order('ordre')
  if (error) throw new PublicReadError(error.message)
  return (data ?? []) as PublicTerritoire[]
}
