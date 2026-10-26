'use server'
/**
 * Messagerie : rangement automatique des pièces jointes dans le coffre-fort.
 *
 * La base inscrit chaque pièce jointe pour chaque participant (trigger
 * trg_messages_enqueue_vault, 0330). Cette action traite les inscriptions en
 * attente d'une conversation : copie du binaire dans le coffre de chaque
 * participant et création du document (addToVaultFromSource, service_role).
 * Appelée après chaque envoi et à l'ouverture d'une conversation ; une
 * tâche planifiée peut appeler `processPendingVaultImports` de la même façon.
 */
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { DENIED_MESSAGES, requireAuthedUser } from '@/lib/auth/guard'
import { createServiceClient } from '@/lib/supabase/server'
import { DEFAULT_TZ, dayKeyInTz } from '@/lib/tz'
import { VaultImportQuotaError, addToVaultFromSource, isMessageAttachmentPath } from '@/lib/vault/from-source'

export type VaultLinkStatus = 'pending' | 'done' | 'failed'
export type VaultLinkDto = { messageId: string; documentId: string | null; status: VaultLinkStatus; categoryName: string }
export type SyncVaultResult = { ok: true; links: VaultLinkDto[] } | { ok: false; error: string }

const MAX_ATTEMPTS = 5
const BATCH = 20

const inputSchema = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().uuid().optional(),
  categoryName: z.string().trim().min(1).max(40).optional(),
})

type ImportRow = { id: string; user_id: string; message_id: string | null; category_name: string; attempts: number }
type MsgRow = {
  id: string
  sender_id: string
  kind: 'text' | 'attachment' | 'audio'
  attachment_path: string | null
  attachment_meta: { name?: string } | null
  audio_duration_ms: number | null
  created_at: string
}
type UserRow = { id: string; prenom: string | null; nom: string | null }
type LinkRow = { message_id: string | null; document_id: string | null; status: VaultLinkStatus; category_name: string }

function stamp(iso: string): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString('fr-FR', { timeZone: DEFAULT_TZ, day: '2-digit', month: '2-digit', year: 'numeric' })
  const time = d.toLocaleTimeString('fr-FR', { timeZone: DEFAULT_TZ, hour: '2-digit', minute: '2-digit' })
  return `${date} à ${time}`
}

function fullName(u: UserRow | undefined): string {
  return u ? `${u.prenom ?? ''} ${u.nom ?? ''}`.trim() || 'Parent' : 'Parent'
}

/** Traite les pièces jointes en attente d'une conversation, pour tous ses participants. */
async function processPendingVaultImports(admin: SupabaseClient, conversationId: string): Promise<void> {
  const { data: pending, error } = await admin
    .from('vault_imports')
    .select('id, user_id, message_id, category_name, attempts')
    .eq('conversation_id', conversationId)
    .eq('source', 'messagerie')
    .neq('status', 'done')
    .lt('attempts', MAX_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(BATCH)
  if (error || !pending || pending.length === 0) return
  const rows = pending as ImportRow[]

  const messageIds = [...new Set(rows.map((r) => r.message_id).filter((v): v is string => Boolean(v)))]
  const [{ data: msgs }, { data: conv }] = await Promise.all([
    admin.from('messages')
      .select('id, sender_id, kind, attachment_path, attachment_meta, audio_duration_ms, created_at')
      .in('id', messageIds),
    admin.from('conversations').select('title').eq('id', conversationId).maybeSingle(),
  ])
  const byId = new Map(((msgs ?? []) as MsgRow[]).map((m) => [m.id, m]))
  const userIds = [...new Set([...rows.map((r) => r.user_id), ...[...byId.values()].map((m) => m.sender_id)])]
  const { data: users } = await admin.from('users').select('id, prenom, nom').in('id', userIds)
  const names = new Map(((users ?? []) as UserRow[]).map((u) => [u.id, u]))
  const title = (conv as { title: string | null } | null)?.title ?? null

  for (const r of rows) {
    const m = r.message_id ? byId.get(r.message_id) : undefined
    // M5 (audit v3) : chemin strict `<conversationId>/<uuid>.<ext>` avant tout download
    // service_role (contrainte chk_messages_attachment_path côté base, NOT VALID pour l'historique).
    if (!m?.attachment_path || !isMessageAttachmentPath(m.attachment_path, conversationId)) {
      await admin.from('vault_imports').update({ status: 'failed', attempts: MAX_ATTEMPTS }).eq('id', r.id)
      continue
    }
    const sender = names.get(m.sender_id)
    const mine = m.sender_id === r.user_id
    const when = stamp(m.created_at)
    const name = m.kind === 'audio'
      ? `Note vocale de ${fullName(sender)} du ${when.replace(' à ', ' ')}`
      : (m.attachment_meta?.name?.trim() || 'Pièce jointe')
    const where = title ? `conversation « ${title} »` : 'conversation générale'
    const description = `Messagerie, ${where} : ${mine ? 'envoyé' : `reçu de ${fullName(sender)}`} le ${when}.`
    try {
      await addToVaultFromSource(admin, {
        userId: r.user_id,
        source: 'messagerie',
        sourceRef: m.id,
        from: { bucket: 'message-attachments', path: m.attachment_path },
        name,
        categoryName: r.category_name,
        docDate: dayKeyInTz(m.created_at),
        description,
        meta: {
          provenance: 'Messagerie',
          conversationId,
          conversationTitle: title,
          messageId: m.id,
          senderId: m.sender_id,
          senderName: fullName(sender),
          sentAt: m.created_at,
          kind: m.kind,
          audioDurationMs: m.audio_duration_ms,
        },
        messageId: m.id,
        conversationId,
        senderId: m.sender_id,
      })
    } catch (err) {
      console.warn('[messages] vault import failed', err instanceof Error ? err.message : 'unknown')
      // Quota quotidien atteint : inutile de réessayer automatiquement.
      const attempts = err instanceof VaultImportQuotaError ? MAX_ATTEMPTS : r.attempts + 1
      await admin.from('vault_imports')
        .update({ status: 'failed', attempts })
        .eq('id', r.id)
        .neq('status', 'done')
    }
  }
}

/**
 * Traite la conversation puis renvoie, pour l'utilisateur courant, l'état
 * de rangement de chaque pièce jointe (message -> document du coffre).
 * `categoryName` : catégorie choisie par l'expéditeur pour SA copie.
 */
export async function syncConversationVault(input: unknown): Promise<SyncVaultResult> {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Requête invalide.' }
  const { conversationId, messageId, categoryName } = parsed.data

  const auth = await requireAuthedUser()
  if (!auth.ok) return { ok: false, error: DENIED_MESSAGES[auth.reason] }
  const userClient = auth.supabase as unknown as SupabaseClient
  const me = auth.user.id

  // Contrôle d'appartenance sous RLS (jamais d'identifiant fourni par le client).
  const { data: member, error: mErr } = await userClient
    .from('conversation_participants')
    .select('user_id')
    .eq('conversation_id', conversationId)
    .eq('user_id', me)
    .maybeSingle()
  if (mErr || !member) return { ok: false, error: 'Conversation introuvable.' }

  let admin: SupabaseClient
  try {
    admin = createServiceClient() as unknown as SupabaseClient
  } catch {
    return { ok: false, error: "Le rangement automatique dans le coffre-fort n'est pas configuré." }
  }

  if (messageId && categoryName) {
    await admin.from('vault_imports')
      .update({ category_name: categoryName })
      .eq('user_id', me)
      .eq('source', 'messagerie')
      .eq('source_ref', messageId)
      .eq('conversation_id', conversationId)
      .neq('status', 'done')
  }

  await processPendingVaultImports(admin, conversationId)

  const { data: links, error: lErr } = await userClient
    .from('vault_imports')
    .select('message_id, document_id, status, category_name')
    .eq('conversation_id', conversationId)
    .eq('user_id', me)
    .limit(1000)
  if (lErr) return { ok: false, error: 'État du coffre-fort indisponible.' }
  return {
    ok: true,
    links: ((links ?? []) as LinkRow[])
      .filter((l): l is LinkRow & { message_id: string } => Boolean(l.message_id))
      .map((l) => ({ messageId: l.message_id, documentId: l.document_id, status: l.status, categoryName: l.category_name })),
  }
}
