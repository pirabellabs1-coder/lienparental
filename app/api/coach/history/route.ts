/**
 * /api/coach/history — analyses du parent connecté (RLS côté Supabase).
 *   GET    ?id=<id>            -> { analysis }           (404 si absente)
 *   GET    ?archived=1         -> { items }              (archives ; défaut : historique)
 *   PATCH  { id, archived }    -> { ok: true }           archiver / restaurer
 *   DELETE { id } | { all: true, archived } -> { deleted }
 * La suppression efface le contenu ; le quota du cycle reste décompté (voir lib/ai/analyses.ts).
 */
import { getCurrentUser } from '@/lib/auth/session'
import { jsonError, jsonOk } from '@/lib/data/server/http'
import { rateLimit, userKey } from '@/lib/data/server/rate-limit'
import { deleteAnalyses, getAnalysis, listAnalyses, setArchived, type StoredAnalysis } from '@/lib/ai/analyses'
import { HistoryDeleteSchema, HistoryPatchSchema } from '@/lib/ai/schemas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BODY = 4 * 1024

function summary(a: StoredAnalysis) {
  return { id: a.id, kind: a.kind, title: a.title, createdAt: a.createdAt, archived: a.archived, demo: a.demo }
}

async function readJson(req: Request): Promise<unknown> {
  const raw = await req.text().catch(() => '')
  if (raw.length > MAX_BODY) throw new Error('too_large')
  return JSON.parse(raw)
}

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return jsonError(401, 'unauthenticated', 'Connectez-vous pour accéder à vos analyses.')
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (id) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return jsonError(400, 'bad_id', 'Identifiant invalide.')
    const a = await getAnalysis(user, id)
    if (!a || !a.result) return jsonError(404, 'not_found', 'Cette analyse est introuvable ou a été supprimée.')
    return jsonOk({ analysis: { ...summary(a), result: a.result, messages: a.messages } })
  }
  const items = await listAnalyses(user, url.searchParams.get('archived') === '1')
  return jsonOk({ items: items.map(summary) })
}

export async function PATCH(req: Request) {
  const user = await getCurrentUser()
  if (!user) return jsonError(401, 'unauthenticated', 'Connectez-vous pour accéder à vos analyses.')
  if (!(await rateLimit(userKey('coach-history', user.id), 60, 60_000)).ok) return jsonError(429, 'rate_limited', 'Trop de demandes. Patientez un instant.')
  let body: unknown
  try {
    body = await readJson(req)
  } catch (e) {
    return (e as Error).message === 'too_large' ? jsonError(413, 'payload_too_large', 'Requête trop volumineuse.') : jsonError(400, 'bad_json', 'Requête invalide.')
  }
  const parsed = HistoryPatchSchema.safeParse(body)
  if (!parsed.success) return jsonError(422, 'invalid_body', 'Requête invalide.')
  const ok = await setArchived(user, parsed.data.id, parsed.data.archived)
  if (!ok) return jsonError(404, 'not_found', 'Cette analyse est introuvable.')
  return jsonOk({ ok: true })
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser()
  if (!user) return jsonError(401, 'unauthenticated', 'Connectez-vous pour accéder à vos analyses.')
  if (!(await rateLimit(userKey('coach-history', user.id), 60, 60_000)).ok) return jsonError(429, 'rate_limited', 'Trop de demandes. Patientez un instant.')
  let body: unknown
  try {
    body = await readJson(req)
  } catch (e) {
    return (e as Error).message === 'too_large' ? jsonError(413, 'payload_too_large', 'Requête trop volumineuse.') : jsonError(400, 'bad_json', 'Requête invalide.')
  }
  const parsed = HistoryDeleteSchema.safeParse(body)
  if (!parsed.success) return jsonError(422, 'invalid_body', 'Requête invalide.')
  const deleted = await deleteAnalyses(user, parsed.data)
  return jsonOk({ deleted })
}
