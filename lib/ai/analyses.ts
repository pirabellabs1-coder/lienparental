import 'server-only'
/**
 * Stockage des analyses Coach IA.
 * - SUPABASE_ENABLED : table public.ai_analyses.
 *   · Lecture, création et archivage : client RLS de l'utilisateur (auth.uid() = user_id).
 *   · Écritures internes (fin d'analyse, fil de discussion, pierre tombale, purges,
 *     annulation) : client service_role, TOUJOURS bornées par `user_id = user.id`
 *     (0270 : l'utilisateur n'a plus que UPDATE(archived), ni DELETE).
 *   · Le quota est compté sur public.ai_usage (registre service_role, cf. quota.ts).
 * - Démo : mémoire du processus (perdue au redémarrage, propre à chaque instance).
 *
 * Suppression : une analyse comptée dans la fenêtre de quota (30 jours glissants) n'est pas
 * effacée physiquement mais VIDÉE de tout contenu (« pierre tombale » : entree = null,
 * resultat = {deleted:true}, messages = []) pour que la suppression ne restaure pas le quota.
 * Les pierres tombales sorties de la fenêtre sont purgées à la lecture de l'historique.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { CurrentUser } from '@/lib/auth/session'
import { StoredAnalysisResultSchema, type AnalysisResult } from './schemas'

export type CoachKind = 'capture' | 'pdf' | 'word' | 'document' | 'message'
export type ChatLogTurn = { role: 'user' | 'assistant'; content: string; at: string }

export type StoredAnalysis = {
  id: string
  kind: CoachKind
  title: string
  createdAt: string
  cycle: string
  archived: boolean
  status: 'pending' | 'done' | 'deleted'
  result: AnalysisResult | null
  messages: ChatLogTurn[]
  demo: boolean
}

export const CYCLE_DAYS = 30
const DAY_MS = 86_400_000
const PENDING_STALE_MS = 15 * 60_000
const MAX_CHAT_LOG = 40

const INPUT_KIND: Record<CoachKind, 'text' | 'image' | 'document'> = { capture: 'image', pdf: 'document', word: 'document', document: 'document', message: 'text' }

// --- Mémoire (démo) ---------------------------------------------------------------

type MemoryState = { analyses: Map<string, StoredAnalysis[]> }
const g = globalThis as unknown as { __lpCoachStore?: MemoryState }
const memory: MemoryState = (g.__lpCoachStore ??= { analyses: new Map() })
const MAX_MEMORY_USERS = 500
const MAX_MEMORY_ITEMS = 100

function memList(userId: string): StoredAnalysis[] {
  let list = memory.analyses.get(userId)
  if (!list) {
    if (memory.analyses.size >= MAX_MEMORY_USERS) memory.analyses.clear()
    list = []
    memory.analyses.set(userId, list)
  }
  return list
}

export function newAnalysisId(): string {
  return randomBytes(12).toString('base64url')
}

// --- Conversions Supabase ------------------------------------------------------------

type Row = {
  id: string
  entree: string | null
  resultat: Record<string, unknown> | null
  messages: unknown
  input_kind: string
  cycle: string
  archived: boolean
  created_at: string
}

const COLUMNS = 'id, entree, resultat, messages, input_kind, cycle, archived, created_at'

function rowToAnalysis(r: Row): StoredAnalysis {
  const res = (r.resultat ?? {}) as Record<string, unknown>
  const status: StoredAnalysis['status'] = res.deleted ? 'deleted' : res.status === 'pending' ? 'pending' : 'done'
  const kind = (['capture', 'pdf', 'word', 'document', 'message'] as const).find((k) => k === res.kind) ?? (r.input_kind === 'image' ? 'capture' : r.input_kind === 'text' ? 'message' : 'pdf')
  const parsed = StoredAnalysisResultSchema.safeParse(res.result)
  const messages = Array.isArray(r.messages)
    ? (r.messages as unknown[]).filter((m): m is ChatLogTurn => !!m && typeof m === 'object' && typeof (m as ChatLogTurn).content === 'string' && ((m as ChatLogTurn).role === 'user' || (m as ChatLogTurn).role === 'assistant'))
    : []
  return {
    id: r.id,
    kind,
    title: r.entree ?? 'Analyse supprimée',
    createdAt: r.created_at,
    cycle: r.cycle,
    archived: r.archived,
    status,
    result: parsed.success ? { ...parsed.data, disclaimer: parsed.data.disclaimer ?? 'Le Coach IA ne donne pas de conseil juridique.' } : null,
    messages,
    demo: Boolean(res.demo),
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Client service_role (contourne la RLS) : chaque requête qui l'utilise DOIT filtrer
 * sur `user_id = user.id` (contrôle de propriété). ai_usage n'est pas dans les types générés.
 */
export function aiServiceDb(): SupabaseClient {
  return createServiceClient() as unknown as SupabaseClient
}

/** Identifiant d'une nouvelle analyse Supabase (connu avant la réservation de quota). */
export function newAnalysisUuid(): string {
  return randomUUID()
}

// --- API ------------------------------------------------------------------------------

/** Crée une analyse « en attente » (réservation de quota). */
export async function insertPending(user: CurrentUser, meta: { kind: CoachKind; title: string; demo?: boolean; id?: string }): Promise<StoredAnalysis> {
  const now = new Date().toISOString()
  const title = meta.title.slice(0, 120)
  if (SUPABASE_ENABLED) {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('ai_analyses')
      .insert({
        ...(meta.id && UUID_RE.test(meta.id) ? { id: meta.id } : {}),
        user_id: user.id, entree: title, input_kind: INPUT_KIND[meta.kind], resultat: { status: 'pending', kind: meta.kind },
      })
      .select(COLUMNS)
      .single()
    if (error || !data) throw new Error('ai_analyses insert failed')
    return rowToAnalysis(data as unknown as Row)
  }
  const item: StoredAnalysis = { id: newAnalysisId(), kind: meta.kind, title, createdAt: now, cycle: now, archived: false, status: 'pending', result: null, messages: [], demo: Boolean(meta.demo) }
  const list = memList(user.id)
  list.unshift(item)
  if (list.length > MAX_MEMORY_ITEMS) list.length = MAX_MEMORY_ITEMS
  return item
}

export async function completeAnalysis(user: CurrentUser, id: string, kind: CoachKind, result: AnalysisResult, demo = false): Promise<void> {
  if (SUPABASE_ENABLED) {
    if (!UUID_RE.test(id)) return
    const { error } = await aiServiceDb()
      .from('ai_analyses')
      .update({ resultat: { status: 'done', kind, result, demo } })
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) throw new Error('ai_analyses complete failed')
    return
  }
  const item = memList(user.id).find((a) => a.id === id)
  if (item) Object.assign(item, { status: 'done', result, demo })
}

/**
 * Annule une réservation (échec, refus) : l'analyse n'est pas décomptée.
 * Supabase : seule une analyse ENCORE en attente appartenant à l'utilisateur est annulée ;
 * la ligne ai_usage liée est alors retirée (remboursement). Une analyse terminée n'est
 * jamais remboursée.
 */
export async function cancelPending(user: CurrentUser, id: string): Promise<void> {
  if (SUPABASE_ENABLED) {
    if (!UUID_RE.test(id)) return
    const db = aiServiceDb()
    const { data } = await db
      .from('ai_analyses')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('resultat->>status', 'pending')
      .select('id')
    // Réservation sans ligne d'analyse (échec d'insertion) ou analyse annulée : remboursement.
    const { count } = await db.from('ai_analyses').select('id', { count: 'exact', head: true }).eq('id', id).eq('user_id', user.id)
    if ((data ?? []).length > 0 || count === 0) {
      await db.from('ai_usage').delete().eq('analysis_id', id).eq('user_id', user.id)
    }
    return
  }
  const list = memList(user.id)
  const i = list.findIndex((a) => a.id === id)
  if (i >= 0) list.splice(i, 1)
}

export async function getAnalysis(user: CurrentUser, id: string): Promise<StoredAnalysis | null> {
  if (SUPABASE_ENABLED) {
    if (!UUID_RE.test(id)) return null
    const supabase = await createClient()
    const { data } = await supabase.from('ai_analyses').select(COLUMNS).eq('id', id).maybeSingle()
    const a = data ? rowToAnalysis(data as unknown as Row) : null
    return a && a.status === 'done' ? a : null
  }
  const a = memList(user.id).find((x) => x.id === id)
  return a && a.status === 'done' ? a : null
}

/** Analyses visibles (terminées, non supprimées), plus récentes d'abord. */
export async function listAnalyses(user: CurrentUser, archived: boolean): Promise<StoredAnalysis[]> {
  if (SUPABASE_ENABLED) {
    const supabase = await createClient()
    const { data } = await supabase
      .from('ai_analyses')
      .select(COLUMNS)
      .eq('archived', archived)
      .order('created_at', { ascending: false })
      .limit(100)
    const items = ((data ?? []) as unknown as Row[]).map(rowToAnalysis)
    void purgeStale(user, items)
    return items.filter((a) => a.status === 'done')
  }
  return memList(user.id).filter((a) => a.status === 'done' && a.archived === archived)
}

/** Lignes de quota (y compris archivées et supprimées) depuis `since`. */
export async function cycleRows(user: CurrentUser, since: Date): Promise<Array<{ id: string; title: string; cycle: string; status: StoredAnalysis['status'] }>> {
  if (SUPABASE_ENABLED) {
    const supabase = await createClient()
    const { data } = await supabase
      .from('ai_analyses')
      .select('id, entree, resultat, cycle')
      .gte('cycle', since.toISOString())
      .order('cycle', { ascending: false })
      .limit(500)
    return ((data ?? []) as Array<{ id: string; entree: string | null; resultat: Record<string, unknown> | null; cycle: string }>).map((r) => ({
      id: r.id,
      title: r.entree ?? 'Analyse supprimée',
      cycle: r.cycle,
      status: r.resultat?.deleted ? 'deleted' : r.resultat?.status === 'pending' ? 'pending' : 'done',
    }))
  }
  return memList(user.id)
    .filter((a) => !a.demo && new Date(a.cycle) >= since)
    .map((a) => ({ id: a.id, title: a.title, cycle: a.cycle, status: a.status }))
}

export async function setArchived(user: CurrentUser, id: string, archived: boolean): Promise<boolean> {
  if (SUPABASE_ENABLED) {
    if (!UUID_RE.test(id)) return false
    const supabase = await createClient()
    const { data } = await supabase.from('ai_analyses').update({ archived }).eq('id', id).select('id')
    return (data ?? []).length > 0
  }
  const a = memList(user.id).find((x) => x.id === id && x.status === 'done')
  if (!a) return false
  a.archived = archived
  return true
}

function inWindow(cycle: string): boolean {
  return Date.now() - new Date(cycle).getTime() < CYCLE_DAYS * DAY_MS
}

/** Supprime le contenu ; la ligne reste (sans contenu) tant qu'elle compte dans le quota. */
export async function deleteAnalyses(user: CurrentUser, target: { id: string } | { all: true; archived: boolean }): Promise<number> {
  if (SUPABASE_ENABLED) {
    const supabase = await createClient()
    let q = supabase.from('ai_analyses').select('id, cycle, resultat')
    q = 'id' in target ? (UUID_RE.test(target.id) ? q.eq('id', target.id) : q.eq('id', '00000000-0000-0000-0000-000000000000')) : q.eq('archived', target.archived)
    const { data } = await q.limit(500)
    const rows = (data ?? []) as Array<{ id: string; cycle: string; resultat: Record<string, unknown> | null }>
    const visible = rows.filter((r) => !r.resultat?.deleted && r.resultat?.status !== 'pending')
    const tomb = visible.filter((r) => inWindow(r.cycle)).map((r) => r.id)
    const hard = visible.filter((r) => !inWindow(r.cycle)).map((r) => r.id)
    // Lignes déjà filtrées par la RLS (propriétaire) ; écriture service_role re-bornée à user_id.
    const db = aiServiceDb()
    if (tomb.length) await db.from('ai_analyses').update({ entree: null, resultat: { deleted: true }, messages: [], archived: true }).in('id', tomb).eq('user_id', user.id)
    if (hard.length) await db.from('ai_analyses').delete().in('id', hard).eq('user_id', user.id)
    return visible.length
  }
  const list = memList(user.id)
  const matches = list.filter((a) => a.status === 'done' && ('id' in target ? a.id === target.id : a.archived === target.archived))
  for (const a of matches) Object.assign(a, { status: 'deleted', result: null, messages: [], title: 'Analyse supprimée', archived: true })
  return matches.length
}

/** Ajoute des tours au fil de discussion d'une analyse (borné). */
export async function appendAnalysisMessages(user: CurrentUser, id: string, turns: ChatLogTurn[]): Promise<void> {
  const a = await getAnalysis(user, id)
  if (!a) return
  const messages = [...a.messages, ...turns].slice(-MAX_CHAT_LOG)
  if (SUPABASE_ENABLED) {
    // getAnalysis (client RLS) a déjà vérifié la propriété ; écriture re-bornée à user_id.
    await aiServiceDb().from('ai_analyses').update({ messages }).eq('id', id).eq('user_id', user.id)
    return
  }
  const item = memList(user.id).find((x) => x.id === id)
  if (item) item.messages = messages
}

/** Purge opportuniste : réservations orphelines et pierres tombales hors fenêtre. */
async function purgeStale(user: CurrentUser, items: StoredAnalysis[]): Promise<void> {
  try {
    const stale = items
      .filter((a) => (a.status === 'pending' && Date.now() - new Date(a.createdAt).getTime() > PENDING_STALE_MS) || (a.status === 'deleted' && !inWindow(a.cycle)))
      .map((a) => a.id)
    if (!stale.length || !SUPABASE_ENABLED) return
    // La consommation (ai_usage) n'est pas remboursée : seule la ligne de contenu est purgée.
    await aiServiceDb().from('ai_analyses').delete().in('id', stale).eq('user_id', user.id)
  } catch {
    // purge best-effort
  }
}
