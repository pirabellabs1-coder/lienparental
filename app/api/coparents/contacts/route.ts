import type { SupabaseClient } from '@supabase/supabase-js'
import { jsonOk } from '@/lib/data/server/http'
import { familyContext, limited, rpcError } from '@/lib/coparents/server/context'
import { createServiceClient } from '@/lib/supabase/server'
import type { LinkedParent } from '@/lib/coparents/types'

// GET /api/coparents/contacts : adultes joignables par la messagerie (contrat chantier H,
// lib/coparents#listLinkedParents). Même règle que la RPC list_linked_parents() (0340) :
// parents d'un enfant commun, ou co-parent lié par la messagerie V1. Les proches sont exclus.
// Avatars : URL signée 15 min si SUPABASE_SERVICE_ROLE_KEY est configurée (bucket privé).
export const dynamic = 'force-dynamic'

type Row = { user_id: string; prenom: string; nom: string | null; role: string; photo_path: string | null; messageable: boolean }

export async function GET() {
  const ctx = await familyContext()
  if ('error' in ctx) return ctx.error
  const tooMany = await limited(ctx.user.id, 'read', 120, 60_000)
  if (tooMany) return tooMany

  const { data, error } = await ctx.db.rpc('list_family_contacts')
  if (error) return rpcError(error, 'contacts')
  const rows = ((data ?? []) as Row[]).filter((r) => r.messageable)

  // M6 (audit v3) : on ne signe (service_role) que l'avatar rangé dans le dossier de
  // son propriétaire. Un photo_url pointant vers le fichier d'un autre compte est ignoré
  // (la base l'interdit aussi : chk_users_photo_url_owner, 0360).
  const ownAvatar = (r: Row): string | null =>
    r.photo_path && r.photo_path.startsWith(`${r.user_id}/`) && !r.photo_path.includes('..') ? r.photo_path : null
  const avatars = new Map<string, string>()
  const paths = [...new Set(rows.map(ownAvatar).filter((p): p is string => p !== null))]
  if (paths.length) {
    try {
      const admin = createServiceClient() as unknown as SupabaseClient
      const { data: signed } = await admin.storage.from('avatars').createSignedUrls(paths, 900)
      for (const s of signed ?? []) if (s.path && s.signedUrl) avatars.set(s.path, s.signedUrl)
    } catch { /* clé service absente : pas d'avatar */ }
  }

  const body: LinkedParent[] = rows.map((r) => {
    const own = ownAvatar(r)
    return {
      userId: r.user_id,
      prenom: r.prenom,
      nom: r.nom || undefined,
      role: r.role,
      avatarUrl: own ? avatars.get(own) : undefined,
    }
  })
  return jsonOk(body)
}
