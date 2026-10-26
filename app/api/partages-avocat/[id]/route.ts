/**
 * DELETE /api/partages-avocat/[id] — révocation immédiate d'un partage.
 * Le partage reste listé (traçabilité) mais le lien cesse de fonctionner.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCurrentUser } from '@/lib/auth/session'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'
import { jsonError, jsonOk } from '@/lib/data/server/http'
import { demoShares } from '@/app/api/partage/_lib/server'
import { requireVaultUnlocked, vaultDeniedResponse } from '@/lib/vault-lock'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  // Coffre-fort verrouillé : ces données en proviennent (chantier D).
  const vault = await requireVaultUnlocked()
  if (!vault.ok) return vaultDeniedResponse(vault)
  const user = await getCurrentUser()
  if (!user) return jsonError(401, 'unauthenticated', 'Session expirée. Reconnectez-vous.')

  const { id } = await ctx.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError(404, 'not_found', 'Partage introuvable.')

  if (!SUPABASE_ENABLED) {
    const s = demoShares().get(id)
    if (!s || s.userId !== user.id) return jsonError(404, 'not_found', 'Partage introuvable.')
    if (!s.revokedAt) s.revokedAt = new Date().toISOString()
    return jsonOk({ ok: true })
  }

  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data, error } = await supabase
    .from('lawyer_shares')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .is('revoked_at', null)
    .select('id')
  if (error) return jsonError(500, 'revoke_failed', "Le partage n'a pas pu être révoqué.")
  if (!data || data.length === 0) {
    // Déjà révoqué ou non visible (RLS) : réponse idempotente si le partage appartient à l'utilisateur.
    const { data: existing } = await supabase.from('lawyer_shares').select('id').eq('id', id).maybeSingle()
    if (!existing) return jsonError(404, 'not_found', 'Partage introuvable.')
  }
  return jsonOk({ ok: true })
}
