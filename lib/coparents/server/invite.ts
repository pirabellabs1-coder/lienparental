import 'server-only'
// Envoi de l'e-mail d'invitation (création et renvoi) : prénoms lus sous la RLS de l'invitant.
import type { FamilyCtx } from './context'
import { invitationLink } from './context'
import { sendFamilyInvitationEmail, type MailStatus } from './email'
import type { GuardianRole } from '../types'

export async function mailInvitation(ctx: FamilyCtx, args: {
  invitationId: string
  email: string
  role: GuardianRole
  token: string
  expiresAt: string
  childIds?: string[]
  sendNumber: number
}): Promise<MailStatus> {
  const childIds = args.childIds ?? (
    ((await ctx.db.from('family_invitation_children').select('child_id').eq('invitation_id', args.invitationId)).data ?? []) as { child_id: string }[]
  ).map((r) => r.child_id)

  const [me, kids] = await Promise.all([
    ctx.db.from('users').select('prenom').eq('id', ctx.user.id).maybeSingle(),
    childIds.length
      ? ctx.db.from('children').select('prenom').in('id', childIds).is('deleted_at', null)
      : Promise.resolve({ data: [] as { prenom: string }[] }),
  ])
  try {
    return await sendFamilyInvitationEmail({
      to: args.email,
      inviterPrenom: (me.data as { prenom?: string } | null)?.prenom ?? '',
      role: args.role,
      childPrenoms: ((kids.data ?? []) as { prenom: string }[]).map((k) => k.prenom),
      link: invitationLink(args.token),
      expiresAt: args.expiresAt,
      idempotencyKey: `family-invite:${args.invitationId}:${args.sendNumber}`,
    })
  } catch {
    console.warn('[api/coparents] e-mail d’invitation non envoyé')
    return 'failed'
  }
}
