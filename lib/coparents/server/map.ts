import 'server-only'
// Conversion des lignes RPC (0340) vers les types de lib/coparents/types.ts.
import type {
  FamilyChild, FamilyRole, GuardianRole, InvitationChild, MergeCandidate, ReceivedInvitation, SentInvitation,
} from '../types'

type MemberRow = {
  child_id: string; child_prenom: string; child_date_naissance: string | null; my_role: FamilyRole
  guardian_id: string | null; user_id: string; prenom: string; nom: string; role: FamilyRole
  invited_by: string | null; since: string; is_me: boolean; can_manage: boolean
}
type SentRow = {
  id: string; invitee_email: string; role: GuardianRole; status: SentInvitation['status']; expires_at: string
  sent_count: number; last_sent_at: string; created_at: string; children: InvitationChild[] | null
}
type ReceivedRow = {
  id: string; inviter_prenom: string; inviter_nom: string; role: GuardianRole; children: InvitationChild[] | null
  created_at: string; expires_at: string
}
type MergeRow = {
  my_child_id: string; my_child_prenom: string; shared_child_id: string; shared_child_prenom: string
  date_naissance: string; shared_owner_prenom: string
}

const ROLE_ORDER: Record<FamilyRole, number> = { owner: 0, parent: 1, proche: 2 }

export function toChildren(rows: MemberRow[]): FamilyChild[] {
  const byChild = new Map<string, FamilyChild>()
  for (const r of rows) {
    let c = byChild.get(r.child_id)
    if (!c) {
      c = { id: r.child_id, prenom: r.child_prenom, dateNaissance: r.child_date_naissance, myRole: r.my_role, members: [] }
      byChild.set(r.child_id, c)
    }
    c.members.push({
      guardianId: r.guardian_id, userId: r.user_id, prenom: r.prenom, nom: r.nom, role: r.role,
      since: r.since, isMe: r.is_me, canManage: r.can_manage,
    })
  }
  const list = [...byChild.values()]
  for (const c of list) c.members.sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.since.localeCompare(b.since))
  return list.sort((a, b) => a.prenom.localeCompare(b.prenom, 'fr'))
}

export function toSent(rows: SentRow[]): SentInvitation[] {
  return rows.map((r) => ({
    id: r.id, email: r.invitee_email, role: r.role, status: r.status, expiresAt: r.expires_at,
    sentCount: r.sent_count, lastSentAt: r.last_sent_at, createdAt: r.created_at, children: r.children ?? [],
  }))
}

export function toReceived(rows: ReceivedRow[]): ReceivedInvitation[] {
  return rows.map((r) => ({
    id: r.id, fromPrenom: r.inviter_prenom, fromNom: r.inviter_nom, role: r.role,
    children: r.children ?? [], createdAt: r.created_at, expiresAt: r.expires_at,
  }))
}

export function toMerge(rows: MergeRow[]): MergeCandidate[] {
  return rows.map((r) => ({
    myChild: { id: r.my_child_id, prenom: r.my_child_prenom },
    sharedChild: { id: r.shared_child_id, prenom: r.shared_child_prenom, ownerPrenom: r.shared_owner_prenom },
    dateNaissance: r.date_naissance,
  }))
}
