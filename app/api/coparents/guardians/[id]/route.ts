import { jsonError, jsonOk } from '@/lib/data/server/http'
import { familyContext, limited, readJson, rpcError } from '@/lib/coparents/server/context'
import { notifyGuardianRemoved } from '@/lib/coparents/server/email'
import { roleChangeSchema, uuidSchema } from '@/lib/coparents/validation'

// PATCH  /api/coparents/guardians/[id] { role } : change le rôle (titulaire, ou parent qui a invité).
// DELETE /api/coparents/guardians/[id]          : retire l'adulte, ou se retire soi-même.
// Les droits sont vérifiés par la base (set_child_guardian_role / revoke_child_guardian).
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Ctx) {
  const ctx = await familyContext(req)
  if ('error' in ctx) return ctx.error
  const { id } = await params
  if (!uuidSchema.safeParse(id).success) return jsonError(404, 'not_found', 'Lien introuvable.')
  const tooMany = await limited(ctx.user.id, 'write', 60, 60_000)
  if (tooMany) return tooMany
  const parsed = roleChangeSchema.safeParse(await readJson(req))
  if (!parsed.success) return jsonError(422, 'invalid', 'Rôle invalide.')

  const { error } = await ctx.db.rpc('set_child_guardian_role', { p_guardian_id: id, p_role: parsed.data.role })
  if (error) return rpcError(error, 'guardian.role', 'Lien introuvable.')
  return jsonOk({ ok: true })
}

export async function DELETE(req: Request, { params }: Ctx) {
  const ctx = await familyContext(req)
  if ('error' in ctx) return ctx.error
  const { id } = await params
  if (!uuidSchema.safeParse(id).success) return jsonError(404, 'not_found', 'Lien introuvable.')
  const tooMany = await limited(ctx.user.id, 'write', 60, 60_000)
  if (tooMany) return tooMany

  const { data, error } = await ctx.db.rpc('revoke_child_guardian', { p_guardian_id: id })
  if (error) return rpcError(error, 'guardian.revoke', 'Lien introuvable.')
  const r = (data ?? {}) as { user_id?: string; child_id?: string; reason?: string }

  if (r.reason === 'removed' && r.user_id && r.child_id) {
    const { data: child } = await ctx.db.from('children').select('prenom').eq('id', r.child_id).maybeSingle()
    await notifyGuardianRemoved({
      userId: r.user_id,
      childPrenom: (child as { prenom?: string } | null)?.prenom ?? '',
      idempotencyKey: `family-removed:${id}`,
    })
  }
  return jsonOk({ ok: true, reason: r.reason ?? 'removed' })
}
