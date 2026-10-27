import { getTranslations } from 'next-intl/server'
import { jsonError, jsonOk } from '@/lib/data/server/http'
import { familyContext, limited, readJson, rpcError } from '@/lib/coparents/server/context'
import { notifyOwnersNewAdult } from '@/lib/coparents/server/email'
import { flushForActor } from '@/lib/notify/jobs'
import { acceptSchema } from '@/lib/coparents/validation'
import type { AcceptResult, GuardianRole } from '@/lib/coparents/types'

// POST /api/coparents/invitations/accept { token } | { id }
// La base vérifie : invitation en attente, non expirée, e-mail du JWT vérifié et
// identique à l'e-mail invité. Réponse indistincte (404) dans tous les autres cas.
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const ctx = await familyContext(req)
  if ('error' in ctx) return ctx.error
  const t = await getTranslations('server.coparents')
  const tooMany = await limited(ctx.user.id, 'accept', 20, 10 * 60_000)
  if (tooMany) return tooMany

  const parsed = acceptSchema.safeParse(await readJson(req))
  if (!parsed.success) return jsonError(404, 'not_found', t('invitationInvalid'))

  const { data, error } = 'token' in parsed.data
    ? await ctx.db.rpc('accept_family_invitation', { p_token: parsed.data.token })
    : await ctx.db.rpc('accept_family_invitation_by_id', { p_invitation_id: parsed.data.id })
  if (error) return rpcError(error, 'invitation.accept', t('invitationInvalid'))

  const r = (data ?? {}) as { invitation_id?: string; inviter_id?: string; role?: GuardianRole; child_ids?: string[]; conversation_id?: string | null }
  if (r.inviter_id && r.invitation_id) {
    const { data: me } = await ctx.db.from('users').select('prenom').eq('id', ctx.user.id).maybeSingle()
    const prenom = (me as { prenom?: string } | null)?.prenom ?? ''
    // « Invitation acceptée » à l'invitant (in-app + push + e-mail) : déposée par le
    // déclencheur 0440 (trg_notif_family_invite_accepted), livrée ici tout de suite.
    await flushForActor(ctx.user.id).catch(() => null)
    // M2 : le titulaire de chaque fiche est prévenu de tout nouvel adulte lié.
    await notifyOwnersNewAdult({
      childIds: r.child_ids ?? [],
      newUserId: ctx.user.id,
      newPrenom: prenom,
      role: r.role ?? 'parent',
      inviterId: r.inviter_id,
      invitationId: r.invitation_id,
    })
  }
  const body: AcceptResult = { childIds: r.child_ids ?? [], role: r.role ?? 'parent', conversationId: r.conversation_id ?? null }
  return jsonOk(body)
}
