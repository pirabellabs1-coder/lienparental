/**
 * Liaison des parents — accès depuis les Client Components.
 * - Supabase configuré : routes /api/coparents/** (session, MFA, RLS 0340).
 * - Sinon : mode démonstration (lib/coparents/demo.ts, sessionStorage).
 * Aucune donnée d'identité n'est envoyée par le client : le serveur la lit
 * dans la session.
 */
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import * as demo from './demo'
import { libT } from '@/lib/i18n/runtime'
import { createInvitationSchema, familyTokenSchema } from './validation'
import type {
  AcceptResult, FamilyOverview, GuardianRole, InvitationPreview, IssuedInvitation, LinkedParent,
  MergeResult, SharingKind, SharingSummary,
} from './types'

export const FAMILY_LIVE = SUPABASE_ENABLED

type ErrorBody = { error?: { code?: string; message?: string } }

export class FamilyError extends Error {
  readonly code: string
  readonly status: number
  constructor(message: string, code = 'unknown', status = 0) {
    super(message)
    this.name = 'FamilyError'
    this.code = code
    this.status = status
  }
}

async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      ...init,
      cache: 'no-store',
      headers: init?.json !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    })
  } catch {
    throw new FamilyError(libT('shared.family')('network'), 'network')
  }
  const body = (await res.json().catch(() => null)) as (T & ErrorBody) | null
  if (!res.ok) {
    throw new FamilyError(body?.error?.message ?? libT('shared.family')('generic'), body?.error?.code ?? String(res.status), res.status)
  }
  return body as T
}

const wrap = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof FamilyError) throw e
    throw new FamilyError(e instanceof Error ? e.message : 'Une erreur est survenue.')
  }
}

/** Lien d'invitation à partager (WhatsApp, SMS, e-mail, copie). */
export function invitationUrl(token: string): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  return `${origin}/app/coparents/invitation/${token}`
}

export function loadFamilyOverview(): Promise<FamilyOverview> {
  return FAMILY_LIVE ? api<FamilyOverview>('/api/coparents') : demo.demoOverview()
}

export function createFamilyInvitation(input: { email: string; role: GuardianRole; childIds: string[] }): Promise<IssuedInvitation> {
  const parsed = createInvitationSchema.safeParse(input)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message
    return Promise.reject(new FamilyError(msg && !msg.startsWith('Invalid') && msg !== 'Required' ? msg : 'Certaines informations sont invalides.', 'invalid'))
  }
  const v = parsed.data
  return wrap(() => FAMILY_LIVE
    ? api<IssuedInvitation>('/api/coparents/invitations', { method: 'POST', json: v })
    : demo.demoCreateInvitation(v.email, v.role, v.childIds))
}

export function resendFamilyInvitation(id: string): Promise<IssuedInvitation> {
  return wrap(() => FAMILY_LIVE
    ? api<IssuedInvitation>(`/api/coparents/invitations/${encodeURIComponent(id)}/resend`, { method: 'POST' })
    : demo.demoResend(id))
}

export function cancelFamilyInvitation(id: string): Promise<void> {
  return wrap(async () => {
    if (FAMILY_LIVE) await api(`/api/coparents/invitations/${encodeURIComponent(id)}`, { method: 'DELETE' })
    else await demo.demoCancel(id)
  })
}

export function acceptFamilyInvitation(ref: { token: string } | { id: string }): Promise<AcceptResult> {
  return wrap(async () => {
    if ('token' in ref && !familyTokenSchema.safeParse(ref.token).success) {
      throw new FamilyError(libT('shared.family')('inviteInvalid'), 'not_found', 404)
    }
    if (FAMILY_LIVE) return api<AcceptResult>('/api/coparents/invitations/accept', { method: 'POST', json: ref })
    return 'id' in ref ? demo.demoAccept(ref.id) : { childIds: [], role: 'parent' as const, conversationId: null }
  })
}

export function declineFamilyInvitation(id: string): Promise<void> {
  return wrap(async () => {
    if (FAMILY_LIVE) await api(`/api/coparents/invitations/${encodeURIComponent(id)}/decline`, { method: 'POST' })
    else await demo.demoDecline(id)
  })
}

export function previewFamilyInvitation(token: string): Promise<InvitationPreview> {
  return wrap(() => FAMILY_LIVE
    ? api<InvitationPreview>('/api/coparents/invitations/preview', { method: 'POST', json: { token } })
    : demo.demoPreview(token))
}

export function changeGuardianRole(guardianId: string, role: GuardianRole): Promise<void> {
  return wrap(async () => {
    if (FAMILY_LIVE) await api(`/api/coparents/guardians/${encodeURIComponent(guardianId)}`, { method: 'PATCH', json: { role } })
    else await demo.demoSetRole(guardianId, role)
  })
}

/** Retire un adulte d'une fiche (ou se retire soi-même). */
export function removeGuardian(guardianId: string): Promise<void> {
  return wrap(async () => {
    if (FAMILY_LIVE) await api(`/api/coparents/guardians/${encodeURIComponent(guardianId)}`, { method: 'DELETE' })
    else await demo.demoRemove(guardianId)
  })
}

export function mergeChildren(dropChildId: string, keepChildId: string): Promise<MergeResult> {
  return wrap(() => FAMILY_LIVE
    ? api<MergeResult>('/api/coparents/merge', { method: 'POST', json: { dropChildId, keepChildId, confirm: true } })
    : demo.demoMerge(dropChildId))
}

export function dismissMergeCandidate(myChildId: string, sharedChildId: string): Promise<void> {
  return wrap(async () => {
    if (FAMILY_LIVE) await api('/api/coparents/merge/dismiss', { method: 'POST', json: { myChildId, sharedChildId } })
    else await demo.demoDismissMerge(myChildId, sharedChildId)
  })
}

export function loadSharing(childId: string): Promise<SharingSummary> {
  return wrap(() => FAMILY_LIVE
    ? api<SharingSummary>(`/api/coparents/sharing?childId=${encodeURIComponent(childId)}`)
    : demo.demoSharing(childId))
}

export function setSharing(kind: SharingKind, id: string, shared: boolean): Promise<void> {
  return wrap(async () => {
    if (FAMILY_LIVE) await api('/api/coparents/sharing', { method: 'PATCH', json: { kind, id, shared } })
    else await demo.demoSetSharing(id, shared)
  })
}

/**
 * Adultes avec qui l'utilisateur peut échanger dans la messagerie (contrat chantier H).
 * Parents d'un enfant commun et co-parent lié par la messagerie V1 ; jamais
 * l'utilisateur lui-même ni les proches. Même règle que la RPC list_linked_parents().
 */
export async function listLinkedParents(): Promise<LinkedParent[]> {
  if (!FAMILY_LIVE) return demo.demoLinkedParents()
  return api<LinkedParent[]>('/api/coparents/contacts')
}

// --- Partage du lien ---------------------------------------------------------

export function invitationMessage(senderPrenom: string, url: string): string {
  const t = libT('shared.family.invitation')
  return t('message', { from: senderPrenom ? t('fromName', { name: senderPrenom }) : t('fromMe'), url })
}

export function shareTargets(message: string, email?: string) {
  const text = encodeURIComponent(message)
  return {
    whatsapp: `https://wa.me/?text=${text}`,
    // `?&body=` : compatible iOS et Android.
    sms: `sms:?&body=${text}`,
    email: `mailto:${email ? encodeURIComponent(email) : ''}?subject=${encodeURIComponent('Invitation Lien Parental')}&body=${text}`,
  }
}
