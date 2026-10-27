import { NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { isPlausibleToken, jsonError } from '@/lib/data/server/http'
import { clientIp, ipKey, rateLimit, rateLimitedResponse } from '@/lib/data/server/rate-limit'
import { serviceClientOrNull } from '@/lib/data/server/witness'
import { isOwnedStoragePath } from '@/app/api/partage/_lib/server'

// GET /api/partages/[token] — lien de partage public d'un document du coffre-fort.
// Vérifie (jeton connu, non révoqué, non expiré, quota de téléchargements, document
// non supprimé), compte le téléchargement, puis redirige vers une URL signée 15 min.
// Les clients anonymes n'ont aucun accès direct à `shares` ni au bucket `documents`.

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ token: string }> }

export async function GET(req: Request, ctx: Ctx) {
  const t = await getTranslations('server.partages')
  const GONE = t('documentLinkGone')
  if (!SUPABASE_ENABLED) return jsonError(503, 'not_configured', t('serviceUnavailableShort'))
  // Fail-closed : jetons d'accès à des documents du coffre.
  const rl = await rateLimit(ipKey('partages:open', clientIp(req.headers)), 30, 60_000, { failClosed: true })
  if (!rl.ok) return rateLimitedResponse(rl, t('tooManyAttempts'))

  const { token } = await ctx.params
  if (!isPlausibleToken(token)) return jsonError(404, 'not_found', GONE)

  const svc = serviceClientOrNull()
  if (!svc) return jsonError(503, 'unavailable', t('serviceUnavailable'))

  const { data: share, error } = await svc
    .from('shares')
    .select('id, user_id, document_id, expires_at, revoked_at, download_count, max_downloads')
    .eq('token', token)
    .maybeSingle()
  if (error) return jsonError(503, 'unavailable', t('serviceUnavailable'))
  const s = share as { id: string; user_id: string; document_id: string; expires_at: string; revoked_at: string | null; download_count: number; max_downloads: number | null } | null
  if (!s || s.revoked_at || new Date(s.expires_at).getTime() <= Date.now()) return jsonError(404, 'not_found', GONE)
  if (s.max_downloads !== null && s.download_count >= s.max_downloads) return jsonError(410, 'exhausted', GONE)

  const { data: doc } = await svc
    .from('documents')
    .select('user_id, name, mime, storage_path, deleted_at')
    .eq('id', s.document_id)
    .maybeSingle()
  const d = doc as { user_id: string; name: string; mime: string; storage_path: string; deleted_at: string | null } | null
  // Défense en profondeur : le partage doit appartenir au propriétaire du document, et le
  // service_role ne signe QUE des objets rangés sous le dossier de ce propriétaire
  // (un storage_path altéré ne doit jamais ouvrir le fichier d'un autre utilisateur).
  if (!d || d.deleted_at || d.user_id !== s.user_id) return jsonError(404, 'not_found', GONE)
  if (!isOwnedStoragePath(d.storage_path, s.user_id)) {
    console.warn('[partages] storage_path hors du dossier propriétaire refusé')
    return jsonError(404, 'not_found', GONE)
  }

  // Incrément conditionnel (évite de dépasser max_downloads en cas de requêtes concurrentes).
  const { data: bumped } = await svc
    .from('shares')
    .update({ download_count: s.download_count + 1 })
    .eq('id', s.id)
    .eq('download_count', s.download_count)
    .select('id')
  if (!bumped || bumped.length === 0) return jsonError(409, 'retry', t('retrySoon'))

  const ext = d.storage_path.split('.').pop() ?? ''
  const filename = ext && !d.name.toLowerCase().endsWith(`.${ext}`) ? `${d.name}.${ext}` : d.name
  const { data: signed, error: sErr } = await svc.storage.from('documents').createSignedUrl(d.storage_path, 900, { download: filename })
  if (sErr || !signed?.signedUrl) return jsonError(503, 'unavailable', t('downloadUnavailable'))

  return NextResponse.redirect(signed.signedUrl, {
    status: 302,
    headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' },
  })
}
