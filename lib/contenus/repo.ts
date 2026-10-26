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
 */
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getFiches, getParcoursList, listTerritoires as listFileTerritoires } from '@/lib/guide/load'
import { territoireSchema, type Territoire } from '@/lib/guide/types'
import { SEED_TEMPLATES } from '@/lib/modeles/seeds'
import { readSeedPosts } from '@/lib/blog/seed'
import { readSeedConseils, readSeedFaq, readSeedTutoriels } from '@/lib/aide/seed'
import { demoStore, logVersion, makeRecord } from './demo-store'
import { COLUMNS, TABLE, fromRow, rowData, toRow, type Row } from './rows'
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
    const all = [...demoStore().records[kind].values()] as ContentRecord<K>[]
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
    const r = demoStore().records[kind].get(id)
    if (!r) throw new RepoError('not_found', 'Élément introuvable (supprimé entre-temps ?).')
    return r as ContentRecord<K>
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

export async function createContent<K extends ContentKind>(
  ctx: AdminCtx, kind: K, input: unknown, opts: { statut?: ContentStatus; publishedAt?: string | null } = {},
): Promise<ContentRecord<K>> {
  const statut = opts.statut ?? 'brouillon'
  const id = randomUUID()
  const data = parseData(kind, kind === 'partenaire' ? { ...(input as object), id } : input)
  await assertRefs(ctx, kind, data)
  const d = describe(kind, data)
  await assertSlugFree(ctx, kind, d.slug, d.territoire)
  const publishedAt = statut === 'publie' ? opts.publishedAt ?? new Date().toISOString() : opts.publishedAt ?? null

  if (ctx.mode === 'demo') {
    const now = new Date().toISOString()
    const rec = makeRecord(kind, id, data, { statut, version: 1, createdAt: now, updatedAt: now, publishedAt })
    const store = demoStore()
    store.records[kind].set(id, rec as ContentRecord)
    logVersion(store, rec as ContentRecord, 'creation', ctx.actor)
    return rec
  }
  const { data: row, error } = await ctx.db.from(TABLE[kind]).insert({ id, ...toRow(kind, data, statut, publishedAt) }).select(COLUMNS[kind]).single()
  if (error) throw pgError(error, `${kind}.insert`)
  return fromRow(kind, row as unknown as Row)
}

export type ContentPatch = { data?: unknown; statut?: ContentStatus; publishedAt?: string | null }

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

  if (ctx.mode === 'demo') {
    const store = demoStore()
    const rec = makeRecord(kind, id, data, {
      statut, version: current.version + 1, createdAt: current.createdAt, updatedAt: new Date().toISOString(), publishedAt,
    })
    store.records[kind].set(id, rec as ContentRecord)
    logVersion(store, rec as ContentRecord, 'modification', ctx.actor)
    return rec
  }
  const { data: row, error } = await ctx.db
    .from(TABLE[kind])
    .update(toRow(kind, data, statut, publishedAt))
    .eq('id', id)
    .eq('version', expectedVersion)
    .select(COLUMNS[kind])
    .maybeSingle()
  if (error) throw pgError(error, `${kind}.update`)
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
  return createContent(ctx, kind, copy, { statut: 'brouillon' })
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
    }
  })
}

export async function restoreVersion<K extends ContentKind>(ctx: AdminCtx, kind: K, id: string, versionId: string, expectedVersion: number): Promise<ContentRecord<K>> {
  const versions = await listVersions(ctx, kind, id)
  const v = versions.find((x) => x.id === versionId)
  if (!v) throw new RepoError('not_found', 'Version introuvable.')
  const data = ctx.mode === 'demo' ? (v.snapshot as ContentRecord).data : v.snapshot
  // Le contenu est restauré, le statut actuel est conservé (pas de republication involontaire).
  return updateContent(ctx, kind, id, { data }, expectedVersion)
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

export type ImportReport = { created: number; skipped: number; errors: string[] }

/**
 * Importe en base les contenus versionnés dans le dépôt, sans jamais écraser l'existant
 * (même slug = ignoré). Fiches et parcours : publiés (déjà relus et sourcés).
 * Modèles et articles : brouillons (à relire avant publication réelle).
 */
export type SeedSet = 'guide' | 'modeles' | 'blog' | 'aide'

export async function importSeeds(ctx: AdminCtx, what: SeedSet): Promise<ImportReport> {
  const report: ImportReport = { created: 0, skipped: 0, errors: [] }
  const run = async <K extends ContentKind>(kind: K, items: { data: ContentData[K]; statut: ContentStatus; publishedAt?: string }[]) => {
    const existing = await listContent(ctx, kind)
    for (const it of items) {
      const d = describe(kind, it.data)
      if (existing.some((r) => sameScope(kind, r, d.slug, d.territoire))) { report.skipped++; continue }
      try {
        await createContent(ctx, kind, it.data, { statut: it.statut, publishedAt: it.publishedAt })
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

export { rowData }
