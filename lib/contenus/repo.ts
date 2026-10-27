import 'server-only'
/**
 * Dépôt des contenus éditoriaux (back-office).
 *
 * Deux implémentations derrière la même interface :
 * - `live` : Supabase avec le client RLS de l'administrateur connecté (jamais la
 *   service_role). Les politiques de 0300_admin_contenus.sql exigent is_admin() pour
 *   toute écriture : la vérification applicative n'est qu'une première barrière.
 *   L'historique est écrit par trigger (content_versions), impossible à contourner.
 * - `demo` : mémoire du serveur (lib/contenus/demo-store.ts).
 *
 * Concurrence : chaque écriture fournit la `version` lue ; si un autre administrateur a
 * enregistré entre-temps, l'écriture est refusée (409) au lieu d'écraser son travail.
 *
 * Traductions (colonne `translations`, 0490) : écrites par saveTranslation(), une langue à la fois,
 * validées par le schéma du type avec les champs invariants forcés depuis le français
 * (lib/contenus/i18n.ts). Une modification du français ne touche jamais aux traductions.
 */
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getFiches, getParcoursList, listTerritoires as listFileTerritoires } from '@/lib/guide/load'
import { territoireSchema, type Territoire } from '@/lib/guide/types'
import { SEED_TEMPLATES } from '@/lib/modeles/seeds'
import { readSeedPosts } from '@/lib/blog/seed'
import { readSeedConseils, readSeedFaq, readSeedTutoriels } from '@/lib/aide/seed'
import { demoStore, demoView, detachFromFiles, logVersion, makeRecord } from './demo-store'
import { COLUMNS, TABLE, fromRow, rowData, toRow, type Row } from './rows'
import { TRANSLATION_LOCALES, checkTranslation, sanitizeTranslations, type TranslationLocale, type Translations } from './i18n'
import { fileTranslations } from './i18n-files'
import {
  CONTENT_SCHEMAS, describe, slugify, zodIssues,
  type ContentData, type ContentKind, type ContentRecord, type ContentStatus, type ContentVersion,
} from './types'

export type AdminCtx =
  | { mode: 'demo'; actor: string }
  | { mode: 'live'; db: SupabaseClient; userId: string; actor: string }

export type RepoErrorCode = 'not_found' | 'conflict' | 'slug_taken' | 'invalid' | 'forbidden' | 'in_use' | 'unavailable'

export class RepoError extends Error {
  constructor(readonly code: RepoErrorCode, message: string, readonly issues?: { path: string; message: string }[]) {
    super(message)
    this.name = 'RepoError'
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_LIST = 500

function pgError(e: unknown, op: string): RepoError {
  const code = String((e as { code?: string })?.code ?? 'unknown')
  console.warn(`[contenus] ${op} a échoué (code ${code})`)
  if (code === '23505') return new RepoError('slug_taken', 'Ce slug est déjà utilisé : choisissez-en un autre.')
  if (code === '23514' || code === '22P02' || code === '23502') return new RepoError('invalid', 'Certaines informations sont refusées par la base (format ou valeur).')
  if (code === '42501' || code === 'PGRST301') return new RepoError('forbidden', 'Accès refusé : droits administrateur (et double authentification) requis.')
  if (code === '23503') return new RepoError('invalid', 'Élément lié introuvable.')
  return new RepoError('unavailable', 'La base de données ne répond pas. Réessayez dans un instant.')
}

/** Valide les données d'un type de contenu (schéma zod partagé avec l'éditeur). */
export function parseData<K extends ContentKind>(kind: K, input: unknown): ContentData[K] {
  const r = CONTENT_SCHEMAS[kind].safeParse(input)
  if (!r.success) throw new RepoError('invalid', 'Le contenu contient des erreurs : corrigez les champs signalés.', zodIssues(r.error))
  return r.data as ContentData[K]
}

function sameScope(kind: ContentKind, a: ContentRecord, slug: string, territoire: string | null) {
  if (kind === 'partenaire') return false
  return a.slug === slug && (kind === 'fiche' || kind === 'parcours' ? a.territoire === territoire : true)
}

// --- Lecture ---------------------------------------------------------------------

export async function listContent<K extends ContentKind>(ctx: AdminCtx, kind: K, opts: { territoire?: string } = {}): Promise<ContentRecord<K>[]> {
  if (ctx.mode === 'demo') {
    const store = demoStore()
    const all = ([...store.records[kind].values()] as ContentRecord<K>[]).map((r) => demoView(store, r))
    return all
      .filter((r) => !opts.territoire || r.territoire === opts.territoire)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }
  let q = ctx.db.from(TABLE[kind]).select(COLUMNS[kind]).order('updated_at', { ascending: false }).limit(MAX_LIST)
  if (opts.territoire && kind !== 'modele' && kind !== 'article') q = q.eq('territoire', opts.territoire)
  const { data, error } = await q
  if (error) throw pgError(error, `${kind}.list`)
  return ((data ?? []) as unknown as Row[]).map((r) => fromRow(kind, r))
}

export async function getContent<K extends ContentKind>(ctx: AdminCtx, kind: K, id: string): Promise<ContentRecord<K>> {
  if (ctx.mode === 'demo') {
    const store = demoStore()
    const r = store.records[kind].get(id)
    if (!r) throw new RepoError('not_found', 'Élément introuvable (supprimé entre-temps ?).')
    return demoView(store, r as ContentRecord<K>)
  }
  if (!UUID_RE.test(id)) throw new RepoError('not_found', 'Élément introuvable.')
  const { data, error } = await ctx.db.from(TABLE[kind]).select(COLUMNS[kind]).eq('id', id).maybeSingle()
  if (error) throw pgError(error, `${kind}.get`)
  if (!data) throw new RepoError('not_found', 'Élément introuvable (supprimé entre-temps ?).')
  return fromRow(kind, data as unknown as Row)
}

// --- Contrôles d'intégrité ------------------------------------------------------------

async function assertRefs<K extends ContentKind>(ctx: AdminCtx, kind: K, data: ContentData[K]) {
  if (kind === 'fiche' || kind === 'parcours' || kind === 'partenaire') {
    const terr = (data as { territoire: string }).territoire
    const known = (await listTerritoiresAdmin(ctx)).some((t) => t.code === terr)
    if (!known) throw new RepoError('invalid', `Territoire « ${terr} » inconnu : créez-le d'abord.`, [{ path: 'territoire', message: 'Territoire inconnu.' }])
  }
  if (kind !== 'parcours') return
  const p = data as ContentData['parcours']
  const fiches = new Set((await listContent(ctx, 'fiche', { territoire: p.territoire })).map((f) => f.slug))
  const issues = p.elements.flatMap((el, i) =>
    el.fiche && !fiches.has(el.fiche) ? [{ path: `elements.${i}.fiche`, message: `Fiche « ${el.fiche} » introuvable dans ce territoire.` }] : [],
  )
  if (issues.length) throw new RepoError('invalid', 'Le parcours cite des fiches qui n’existent pas.', issues)
}

async function assertSlugFree(ctx: AdminCtx, kind: ContentKind, slug: string, territoire: string | null, exceptId?: string) {
  if (kind === 'partenaire' || ctx.mode === 'live') return // en base : contrainte UNIQUE (23505 → slug_taken)
  for (const r of demoStore().records[kind].values()) {
    if (r.id !== exceptId && sameScope(kind, r, slug, territoire)) throw new RepoError('slug_taken', 'Ce slug est déjà utilisé : choisissez-en un autre.', [{ path: 'slug', message: 'Slug déjà utilisé.' }])
  }
}

// --- Écriture --------------------------------------------------------------------------

/** Ne garde que les traductions valides pour ces données (invariants forcés depuis le français). */
function validTranslations<K extends ContentKind>(kind: K, data: ContentData[K], raw: Translations | undefined): Translations {
  const out: Translations = {}
  for (const l of TRANSLATION_LOCALES) {
    const r = raw?.[l] === undefined ? null : checkTranslation(kind, data, raw[l])
    if (r?.ok) out[l] = r.data
  }
  return out
}

export async function createContent<K extends ContentKind>(
  ctx: AdminCtx, kind: K, input: unknown,
  opts: { statut?: ContentStatus; publishedAt?: string | null; translations?: Translations } = {},
): Promise<ContentRecord<K>> {
  const statut = opts.statut ?? 'brouillon'
  const id = randomUUID()
  const data = parseData(kind, kind === 'partenaire' ? { ...(input as object), id } : input)
  await assertRefs(ctx, kind, data)
  const d = describe(kind, data)
  await assertSlugFree(ctx, kind, d.slug, d.territoire)
  const publishedAt = statut === 'publie' ? opts.publishedAt ?? new Date().toISOString() : opts.publishedAt ?? null
  const translations = validTranslations(kind, data, opts.translations)

  if (ctx.mode === 'demo') {
    const now = new Date().toISOString()
    const rec = makeRecord(kind, id, data, { statut, version: 1, createdAt: now, updatedAt: now, publishedAt }, translations)
    const store = demoStore()
    store.records[kind].set(id, rec as ContentRecord)
    logVersion(store, rec as ContentRecord, 'creation', ctx.actor)
    return rec
  }
  const insert = { id, ...toRow(kind, data, statut, publishedAt), ...(Object.keys(translations).length ? { translations } : {}) }
  const { data: row, error } = await ctx.db.from(TABLE[kind]).insert(insert).select(COLUMNS[kind]).single()
  if (error) throw pgError(error, `${kind}.insert`)
  return fromRow(kind, row as unknown as Row)
}

/** `translations` : restauration d'une version uniquement (sinon saveTranslation). */
export type ContentPatch = { data?: unknown; statut?: ContentStatus; publishedAt?: string | null; translations?: Translations }

export async function updateContent<K extends ContentKind>(
  ctx: AdminCtx, kind: K, id: string, patch: ContentPatch, expectedVersion: number,
): Promise<ContentRecord<K>> {
  const current = await getContent(ctx, kind, id)
  if (current.version !== expectedVersion) {
    throw new RepoError('conflict', 'Cet élément a été modifié entre-temps (autre onglet ou autre administrateur). Rechargez pour voir la dernière version.')
  }
  if (kind === 'partenaire' && patch.statut === 'archive') throw new RepoError('invalid', 'Une offre partenaire se désactive (dépublier) ou se supprime.')

  const statut = patch.statut ?? current.statut
  // Toute écriture revalide l'ensemble (y compris une simple publication d'un contenu ancien).
  const data = parseData(kind, patch.data !== undefined ? (kind === 'partenaire' ? { ...(patch.data as object), id } : patch.data) : current.data)
  await assertRefs(ctx, kind, data)
  const d = describe(kind, data)
  await assertSlugFree(ctx, kind, d.slug, d.territoire, id)

  let publishedAt = patch.publishedAt !== undefined ? patch.publishedAt : current.publishedAt
  if (statut === 'publie' && !publishedAt) publishedAt = new Date().toISOString()

  if (kind === 'fiche' && (d.slug !== current.slug || d.territoire !== current.territoire)) {
    await assertFicheUnused(ctx, current as ContentRecord<'fiche'>, 'renommer')
  }

  const translations = patch.translations !== undefined ? sanitizeTranslations(patch.translations) : undefined

  if (ctx.mode === 'demo') {
    const store = demoStore()
    const kept = detachFromFiles(store, current as ContentRecord)
    const rec = makeRecord(kind, id, data, {
      statut, version: current.version + 1, createdAt: current.createdAt, updatedAt: new Date().toISOString(), publishedAt,
    }, translations ?? kept)
    store.records[kind].set(id, rec as ContentRecord)
    logVersion(store, rec as ContentRecord, 'modification', ctx.actor)
    return rec
  }
  const { data: row, error } = await ctx.db
    .from(TABLE[kind])
    .update({ ...toRow(kind, data, statut, publishedAt), ...(translations !== undefined ? { translations } : {}) })
    .eq('id', id)
    .eq('version', expectedVersion)
    .select(COLUMNS[kind])
    .maybeSingle()
  if (error) throw pgError(error, `${kind}.update`)
  if (!row) throw new RepoError('conflict', 'Cet élément a été modifié entre-temps. Rechargez pour voir la dernière version.')
  return fromRow(kind, row as unknown as Row)
}

/**
 * Enregistre (ou supprime avec `input = null`) la traduction d'une langue. Les champs invariants
 * sont forcés depuis le français, puis l'objet complet est validé par le schéma du type : une
 * traduction enregistrée est donc toujours affichable. Même contrôle de `version` qu'une modification.
 */
export async function saveTranslation<K extends ContentKind>(
  ctx: AdminCtx, kind: K, id: string, locale: TranslationLocale, input: unknown | null, expectedVersion: number,
): Promise<ContentRecord<K>> {
  const current = await getContent(ctx, kind, id)
  if (current.version !== expectedVersion) {
    throw new RepoError('conflict', 'Cet élément a été modifié entre-temps (autre onglet ou autre administrateur). Rechargez pour voir la dernière version.')
  }
  const next: Translations = { ...current.translations }
  if (input === null) {
    if (next[locale] === undefined) throw new RepoError('not_found', 'Aucune traduction à supprimer pour cette langue.')
    delete next[locale]
  } else {
    const r = checkTranslation(kind, current.data, input)
    if (!r.ok) {
      throw new RepoError('invalid', r.reason === 'missing' ? 'Traduction vide.' : 'La traduction contient des erreurs : corrigez les champs signalés.', r.issues)
    }
    next[locale] = r.data
  }

  if (ctx.mode === 'demo') {
    const store = demoStore()
    detachFromFiles(store, current as ContentRecord)
    const rec = makeRecord(kind, id, current.data, {
      statut: current.statut, version: current.version + 1, createdAt: current.createdAt, updatedAt: new Date().toISOString(), publishedAt: current.publishedAt,
    }, next)
    store.records[kind].set(id, rec as ContentRecord)
    logVersion(store, rec as ContentRecord, 'modification', ctx.actor)
    return rec
  }
  const { data: row, error } = await ctx.db
    .from(TABLE[kind])
    .update({ translations: next })
    .eq('id', id)
    .eq('version', expectedVersion)
    .select(COLUMNS[kind])
    .maybeSingle()
  if (error) throw pgError(error, `${kind}.translations`)
  if (!row) throw new RepoError('conflict', 'Cet élément a été modifié entre-temps. Rechargez pour voir la dernière version.')
  return fromRow(kind, row as unknown as Row)
}

/** Une fiche citée par un parcours ne peut pas disparaître (ni changer de slug) sans casser ce parcours. */
async function assertFicheUnused(ctx: AdminCtx, fiche: ContentRecord<'fiche'>, verb: string) {
  const parcours = await listContent(ctx, 'parcours', { territoire: fiche.territoire ?? undefined })
  const users = parcours.filter((p) => (p.data.elements ?? []).some((e) => e.fiche === fiche.slug))
  if (users.length) {
    throw new RepoError('in_use', `Impossible de ${verb} cette fiche : elle est citée par ${users.map((p) => `« ${p.titre} »`).join(', ')}. Retirez-la de ces parcours d'abord.`)
  }
}

export async function deleteContent(ctx: AdminCtx, kind: ContentKind, id: string): Promise<void> {
  const current = await getContent(ctx, kind, id)
  if (kind === 'fiche') await assertFicheUnused(ctx, current as ContentRecord<'fiche'>, 'supprimer')
  if (ctx.mode === 'demo') {
    const store = demoStore()
    store.records[kind].delete(id)
    logVersion(store, current, 'suppression', ctx.actor)
    return
  }
  const { error, count } = await ctx.db.from(TABLE[kind]).delete({ count: 'exact' }).eq('id', id)
  if (error) throw pgError(error, `${kind}.delete`)
  if (!count) throw new RepoError('forbidden', 'Suppression refusée par la base (droits administrateur requis).')
}

export async function duplicateContent<K extends ContentKind>(ctx: AdminCtx, kind: K, id: string): Promise<ContentRecord<K>> {
  const src = await getContent(ctx, kind, id)
  const existing = new Set((await listContent(ctx, kind, { territoire: src.territoire ?? undefined })).map((r) => r.slug))
  let slug = slugify(`${src.slug}-copie`)
  for (let n = 2; existing.has(slug); n++) slug = slugify(`${src.slug}-copie-${n}`)
  const copy = structuredClone(src.data) as Record<string, unknown>
  const suffix = ' (copie)'
  if (kind === 'partenaire') {
    copy.nom = `${String(copy.nom).slice(0, 120 - suffix.length)}${suffix}`
  } else if (kind === 'faq') {
    copy.slug = slug
    copy.question = `${String(copy.question).slice(0, 160 - suffix.length)}${suffix}`
  } else {
    copy.slug = slug
    const max = kind === 'modele' || kind === 'article' ? 140 : kind === 'conseil' ? 80 : 120
    copy.titre = `${String(copy.titre).slice(0, max - suffix.length)}${suffix}`
  }
  // Les traductions suivent la copie (invariants, dont le nouveau slug, forcés depuis le français).
  return createContent(ctx, kind, copy, { statut: 'brouillon', translations: src.translations })
}

// --- Historique -------------------------------------------------------------------------

export async function listVersions(ctx: AdminCtx, kind: ContentKind, id: string): Promise<ContentVersion[]> {
  if (ctx.mode === 'demo') return demoStore().versions.get(id) ?? []
  if (!UUID_RE.test(id)) return []
  const { data, error } = await ctx.db
    .from('content_versions')
    .select('id, version, action, actor_id, created_at, snapshot')
    .eq('entity_type', TABLE[kind])
    .eq('entity_id', id)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw pgError(error, 'content_versions.select')
  return ((data ?? []) as Row[]).map((v) => {
    const snap = (v.snapshot ?? {}) as Row
    const rec = fromRow(kind, snap)
    const action = v.action === 'insert' ? 'creation' : v.action === 'delete' ? 'suppression' : 'modification'
    return {
      id: String(v.id),
      version: typeof v.version === 'number' ? v.version : rec.version,
      action,
      statut: rec.statut,
      titre: rec.titre,
      actor: typeof v.actor_id === 'string' ? (v.actor_id === ctx.userId ? 'Vous' : `Admin ${v.actor_id.slice(0, 8)}`) : 'Système',
      createdAt: String(v.created_at),
      snapshot: rec.data,
      // Instantanés antérieurs à 0490 : pas de clé `translations` → traductions actuelles conservées.
      ...('translations' in snap ? { translations: rec.translations } : {}),
    }
  })
}

export async function restoreVersion<K extends ContentKind>(ctx: AdminCtx, kind: K, id: string, versionId: string, expectedVersion: number): Promise<ContentRecord<K>> {
  const versions = await listVersions(ctx, kind, id)
  const v = versions.find((x) => x.id === versionId)
  if (!v) throw new RepoError('not_found', 'Version introuvable.')
  const data = ctx.mode === 'demo' ? (v.snapshot as ContentRecord).data : v.snapshot
  const translations = ctx.mode === 'demo' ? (v.snapshot as ContentRecord).translations : v.translations
  // Le contenu (et ses traductions) est restauré, le statut actuel est conservé (pas de republication involontaire).
  return updateContent(ctx, kind, id, { data, ...(translations !== undefined ? { translations } : {}) }, expectedVersion)
}

// --- Territoires ------------------------------------------------------------------------

export async function listTerritoiresAdmin(ctx: AdminCtx): Promise<Territoire[]> {
  if (ctx.mode === 'demo') return [...demoStore().territoires.values()].sort((a, b) => a.ordre - b.ordre)
  const { data, error } = await ctx.db.from('guide_territoires').select('code, nom, disponible, ordre').order('ordre')
  if (error) throw pgError(error, 'guide_territoires.select')
  return (data ?? []) as Territoire[]
}

export async function saveTerritoire(ctx: AdminCtx, input: unknown): Promise<Territoire> {
  const r = territoireSchema.safeParse(input)
  if (!r.success) throw new RepoError('invalid', 'Territoire invalide.', zodIssues(r.error))
  if (ctx.mode === 'demo') {
    demoStore().territoires.set(r.data.code, r.data)
    return r.data
  }
  const { data, error } = await ctx.db.from('guide_territoires').upsert(r.data, { onConflict: 'code' }).select('code, nom, disponible, ordre').single()
  if (error) throw pgError(error, 'guide_territoires.upsert')
  return data as Territoire
}

// --- Import des semences (fichiers du dépôt → base) -----------------------------------------

export type ImportReport = { created: number; skipped: number; errors: string[]; /** Traductions ajoutées à des contenus déjà en base. */ translated?: number }

/**
 * Importe en base les contenus versionnés dans le dépôt, sans jamais écraser l'existant
 * (même slug = ignoré). Fiches et parcours : publiés (déjà relus et sourcés).
 * Modèles et articles : brouillons (à relire avant publication réelle).
 */
export type SeedSet = 'guide' | 'modeles' | 'blog' | 'aide'

export async function importSeeds(ctx: AdminCtx, what: SeedSet): Promise<ImportReport> {
  const report: ImportReport = { created: 0, skipped: 0, errors: [], translated: 0 }
  const run = async <K extends ContentKind>(kind: K, items: { data: ContentData[K]; statut: ContentStatus; publishedAt?: string }[]) => {
    const existing = await listContent(ctx, kind)
    for (const it of items) {
      const d = describe(kind, it.data)
      // Traductions du dépôt (content/i18n/<locale>/…), validées : importées avec le contenu.
      const translations = fileTranslations(kind, it.data)
      const found = existing.find((r) => sameScope(kind, r, d.slug, d.territoire))
      if (found) {
        report.skipped++
        await addMissingTranslations(ctx, kind, found, it.data, translations, report)
        continue
      }
      try {
        await createContent(ctx, kind, it.data, { statut: it.statut, publishedAt: it.publishedAt, translations })
        report.created++
      } catch (e) {
        report.errors.push(`${d.slug} : ${e instanceof Error ? e.message : 'erreur'}`)
      }
    }
  }
  if (what === 'guide') {
    for (const t of listFileTerritoires()) {
      await saveTerritoire(ctx, t)
      await run('fiche', getFiches(t.code).map((f) => ({ data: f, statut: 'publie' as const })))
      await run('parcours', getParcoursList(t.code).map((p) => ({ data: p, statut: 'publie' as const })))
    }
  } else if (what === 'modeles') {
    await run('modele', SEED_TEMPLATES.map((t) => ({ data: t, statut: 'brouillon' as const })))
  } else if (what === 'aide') {
    // Déjà publiés dans le centre d'aide (fichiers relus) : importés publiés pour ne rien faire disparaître.
    await run('faq', readSeedFaq().map((d) => ({ data: d, statut: 'publie' as const })))
    await run('tutoriel', readSeedTutoriels().map((d) => ({ data: d, statut: 'publie' as const })))
    await run('conseil', readSeedConseils().map((d) => ({ data: d, statut: 'publie' as const })))
  } else {
    await run('article', readSeedPosts().map((s) => ({ data: s.post, statut: 'brouillon' as const })))
  }
  return report
}

/** JSON à clés triées : compare deux contenus quel que soit l'ordre des clés (base ⇄ fichiers). */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).filter((k) => (v as Row)[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Row)[k])}`).join(',')}}`
  }
  return JSON.stringify(v) ?? 'null'
}

/**
 * Contenu déjà en base : ajoute seulement les traductions qui MANQUENT, et seulement si le français
 * en base est identique à celui du dépôt (sinon la traduction du fichier ne correspondrait plus).
 * Jamais d'écrasement d'une traduction saisie dans l'admin.
 */
async function addMissingTranslations<K extends ContentKind>(
  ctx: AdminCtx, kind: K, existing: ContentRecord<K>, fileData: ContentData[K], translations: Translations, report: ImportReport,
) {
  const missing = TRANSLATION_LOCALES.filter((l) => translations[l] !== undefined && existing.translations[l] === undefined)
  if (!missing.length) return
  const parsed = CONTENT_SCHEMAS[kind].safeParse(existing.data)
  if (!parsed.success || stable(parsed.data) !== stable(fileData)) return
  let rec = existing
  for (const l of missing) {
    try {
      rec = await saveTranslation(ctx, kind, rec.id, l, translations[l], rec.version)
      report.translated = (report.translated ?? 0) + 1
    } catch (e) {
      report.errors.push(`${existing.slug} (${l}) : ${e instanceof Error ? e.message : 'erreur'}`)
    }
  }
}

export { rowData }
