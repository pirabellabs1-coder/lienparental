import { NextResponse, type NextRequest } from 'next/server'
import { getTranslations } from 'next-intl/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAuthedUser } from '@/lib/auth/guard'
import { jsonError } from '@/lib/data/server/http'
import { rateLimit, rateLimitedResponse, userKey } from '@/lib/data/server/rate-limit'
import { sameOrigin, readJson } from '@/lib/contenus/api'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { requireVaultUnlocked, vaultDeniedResponse } from '@/lib/vault-lock'
import { thumbsRequestSchema } from '@/lib/album/types'

// POST /api/coffre/album/vignettes  { ids: uuid[] (≤ 60) } → 200 { data: { urls: { [id]: url } } }
//
// Vignettes de l'album de l'enfant, signées par lot (une grille de photos dépasserait la limite de
// GET /api/coffre/fichier/[id]). Mêmes garanties que cette route :
//   1. même origine, session revalidée (requireAuthedUser : getUser + aal2 si 2FA) ;
//   2. coffre déverrouillé pour CETTE session (la base l'exige aussi, 0370) ;
//   3. lignes lues avec le client RLS de l'utilisateur, puis contrôle applicatif : ma photo, ou photo
//      explicitement partagée (family_shared, gardien parent d'un enfant commun, 0340) ;
//   4. vignette rangée sous le dossier du propriétaire (0530 l'impose aussi) ;
//   5. URL signées de 5 minutes avec le client de l'UTILISATEUR (politiques Storage 0530), jamais
//      avec le service_role. Une photo refusée est simplement absente de la réponse.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SIGNED_SECONDS = 300

type Row = { id: string; user_id: string; thumb_path: string | null; family_shared: boolean | null; mime: string }

function ownedPath(path: string, ownerId: string): boolean {
  return path.startsWith(`${ownerId}/`)
    && path.length > ownerId.length + 1
    && path.length <= 1024
    && !path.includes('..')
    && !path.includes('//')
    && !path.includes('\\')
    && !/[\u0000-\u001f\u007f]/.test(path)
}

const noStore = { 'Cache-Control': 'no-store' }

export async function POST(req: NextRequest) {
  const t = await getTranslations('server.coffre')
  const tc = await getTranslations('server.common')
  if (!sameOrigin(req)) return jsonError(403, 'bad_origin', tc('denied.unauthenticated'))
  if (!SUPABASE_ENABLED) return jsonError(404, 'demo', t('demo'))

  const auth = await requireAuthedUser()
  if (!auth.ok) {
    return auth.reason === 'mfa_required'
      ? jsonError(403, 'mfa_required', tc('denied.mfa_required'))
      : jsonError(401, 'unauthenticated', tc('denied.unauthenticated'))
  }
  const { supabase, user } = auth
  const vault = await requireVaultUnlocked()
  if (!vault.ok) return vaultDeniedResponse(vault)
  if (vault.principal.userId !== user.id) return jsonError(401, 'unauthenticated', tc('denied.unauthenticated'))

  const rl = await rateLimit(userKey('coffre:album-vignettes', user.id), 30, 60_000, { failClosed: true })
  if (!rl.ok) return rateLimitedResponse(rl, t('rateLimited'))

  const parsed = thumbsRequestSchema.safeParse(await readJson(req))
  if (!parsed.success) return jsonError(422, 'invalid', t('invalidRequest'))
  const ids = [...new Set(parsed.data.ids)]

  // Colonnes récentes (0340, 0530) absentes des types générés : client non typé.
  const db = supabase as unknown as SupabaseClient
  const { data, error } = await db
    .from('documents')
    .select('id, user_id, thumb_path, family_shared, mime')
    .in('id', ids)
    .is('deleted_at', null)
  if (error) {
    console.warn(`[coffre/album] lecture a échoué (code ${error.code ?? 'inconnu'})`)
    return jsonError(503, 'unavailable', t('unavailable'))
  }
  const allowed = ((data ?? []) as Row[]).filter((r) =>
    r.thumb_path
    && r.mime.startsWith('image/')
    && (r.user_id === user.id || r.family_shared)
    && ownedPath(r.thumb_path, r.user_id),
  )
  if (allowed.length === 0) return NextResponse.json({ data: { urls: {} } }, { headers: noStore })

  const { data: signed, error: sErr } = await db.storage
    .from('documents')
    .createSignedUrls(allowed.map((r) => r.thumb_path!), SIGNED_SECONDS)
  if (sErr || !signed) {
    console.warn(`[coffre/album] signature a échoué (${sErr?.name ?? 'inconnu'})`)
    return jsonError(503, 'unavailable', t('unavailable'))
  }
  const byPath = new Map(signed.filter((s) => s.signedUrl && !s.error).map((s) => [s.path, s.signedUrl]))
  const urls: Record<string, string> = {}
  for (const r of allowed) {
    const u = byPath.get(r.thumb_path!)
    if (u) urls[r.id] = u
  }
  return NextResponse.json({ data: { urls } }, { headers: noStore })
}
