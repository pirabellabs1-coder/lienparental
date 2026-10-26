'use server'
/**
 * Messagerie → coffre-fort.
 *
 * 1. Rangement AUTOMATIQUE, désactivé par défaut (0420) : la base n'inscrit une
 *    pièce jointe que pour les participants dont le réglage
 *    vault_settings.auto_import_messages est activé (trigger
 *    trg_messages_enqueue_vault), avec leur dossier cible éventuel.
 *    `syncConversationVault` traite les inscriptions en attente d'une
 *    conversation : copie du binaire dans le coffre de chaque participant
 *    concerné et création du document (addToVaultFromSource, service_role).
 *    Appelée après chaque envoi et à l'ouverture d'une conversation.
 * 2. Rangement À LA DEMANDE : `saveAttachmentToVault` (« Mettre au
 *    coffre-fort » sur une pièce jointe), dans le dossier choisi ou à la racine.
 */
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { DENIED_MESSAGES, requireAuthedUser } from '@/lib/auth/guard'
import { createServiceClient } from '@/lib/supabase/server'
import { rateLimit, userKey } from '@/lib/data/server/rate-limit'
import { requireVaultUnlocked } from '@/lib/vault-lock'
import { DEFAULT_TZ, dayKeyInTz } from '@/lib/tz'
import { VaultImportQuotaError, addToVaultFromSource, isMessageAttachmentPath } from '@/lib/vault/from-source'

export type VaultLinkStatus = 'pending' | 'done' | 'failed'
export type VaultLinkDto = { messageId: string; documentId: string | null; status: VaultLinkStatus; categoryName: string }
export type SyncVaultResult = { ok: true; links: VaultLinkDto[] } | { ok: false; error: string }
export type SaveToVaultResult =
  | { ok: true; link: VaultLinkDto; created: boolean; placed: boolean | null; folderName: string | null }
  | { ok: false; error: string; code?: 'vault_locked' }

const MAX_ATTEMPTS = 5
const BATCH = 20

const inputSchema = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().uuid().optional(),
  categoryName: z.string().trim().min(1).max(40).optional(),
})

type ImportRow = { id: string; user_id: string; message_id: string | null; category_name: string; attempts: number; folder_id: string | null }
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

/**
 * Copie UNE pièce jointe dans le coffre de `userId` (nom, description et provenance
 * identiques pour l'import automatique et l'action « Mettre au coffre-fort »).
 */
async function importAttachment(
  admin: SupabaseClient,
  args: { userId: string; m: MsgRow; conversationId: string; title: string | null; names: Map<string, UserRow>; categoryName: string },
): Promise<{ documentId: string; created: boolean }> {
  const { userId, m, conversationId, title, names, categoryName } = args
  const sender = names.get(m.sender_id)
  const mine = m.sender_id === userId
  const when = stamp(m.created_at)
  const name = m.kind === 'audio'
    ? `Note vocale de ${fullName(sender)} du ${when.replace(' à ', ' ')}`
    : (m.attachment_meta?.name?.trim() || 'Pièce jointe')
  const where = title ? `conversation « ${title} »` : 'conversation générale'
  const description = `Messagerie, ${where} : ${mine ? 'envoyé' : `reçu de ${fullName(sender)}`} le ${when}.`
  return addToVaultFromSource(admin, {
    userId,
    source: 'messagerie',
    sourceRef: m.id,
    from: { bucket: 'message-attachments', path: m.attachment_path ?? '' },
    name,
    categoryName,
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
}

/**
 * Range le document dans un dossier de son propriétaire (0410). Le filtre user_id et le
 * déclencheur trg_documents_folder_guard empêchent tout dossier d'un autre parent.
 * Appelé uniquement pour un document NOUVELLEMENT créé (jamais pour déplacer un document
 * existant ou dédoublonné) ; `is('folder_id', null)` en garde-fou. Renvoie false en cas d'échec.
 */
async function placeInFolder(admin: SupabaseClient, userId: string, documentId: string, folderId: string): Promise<boolean> {
  const { data, error } = await admin
    .from('documents')
    .update({ folder_id: folderId })
    .eq('id', documentId)
    .eq('user_id', userId)
    .is('folder_id', null)
    .select('id')
  if (error) console.warn(`[messages] rangement dans le dossier impossible (code ${error.code ?? 'inconnu'})`)
  return !error && Array.isArray(data) && data.length === 1
}

/** Traite les pièces jointes en attente d'une conversation, pour les participants concernés. */
async function processPendingVaultImports(admin: SupabaseClient, conversationId: string): Promise<void> {
  const { data: pending, error } = await admin
    .from('vault_imports')
    .select('id, user_id, message_id, category_name, attempts, folder_id')
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
    try {
      const res = await importAttachment(admin, { userId: r.user_id, m, conversationId, title, names, categoryName: r.category_name })
      // Dossier cible du réglage (0420), seulement pour un document nouvellement créé.
      if (r.folder_id && res.created) await placeInFolder(admin, r.user_id, res.documentId, r.folder_id)
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

const saveSchema = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
  /** Dossier du coffre (0410) ; null = racine. */
  folderId: z.string().uuid().nullable(),
})

/**
 * « Mettre au coffre-fort » : copie une pièce jointe d'un message dans MON coffre.
 *   - nouveau document : rangé dans le dossier choisi (ou à la racine) ;
 *   - pièce déjà présente (même message, ou même contenu) : AUCUN déplacement, on
 *     renvoie son dossier actuel (« Déjà dans votre coffre-fort ») ;
 *   - choisir un dossier exige le coffre déverrouillé (comme toute écriture de la
 *     structure, 0410) ; l'ajout à la racine reste possible coffre verrouillé : il ne
 *     révèle rien du coffre et ne peut rien exposer à l'autre parent.
 */
export async function saveAttachmentToVault(input: unknown): Promise<SaveToVaultResult> {
  const parsed = saveSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Requête invalide.' }
  const { conversationId, messageId, folderId } = parsed.data

  const auth = await requireAuthedUser()
  if (!auth.ok) return { ok: false, error: DENIED_MESSAGES[auth.reason] }
  const userClient = auth.supabase as unknown as SupabaseClient
  const me = auth.user.id

  // Même règle que la route des fichiers du coffre : limiteur indisponible = refus.
  const rl = await rateLimit(userKey('messages:coffre', me), 30, 60_000, { failClosed: true })
  if (!rl.ok) return { ok: false, error: 'Trop de demandes ou service momentanément indisponible. Patientez un instant.' }

  if (folderId) {
    const vault = await requireVaultUnlocked()
    if (!vault.ok || vault.principal.userId !== me) {
      return {
        ok: false,
        code: 'vault_locked',
        error: 'Déverrouillez votre coffre-fort pour choisir un dossier, ou ajoutez la pièce sans dossier.',
      }
    }
  }

  // Message lu sous la RLS de l'utilisateur (participant, ou ancien participant pour
  // l'historique qu'il voit encore) : jamais un identifiant accepté tel quel.
  const { data: msg, error: mErr } = await userClient
    .from('messages')
    .select('id, sender_id, kind, attachment_path, attachment_meta, audio_duration_ms, created_at')
    .eq('id', messageId)
    .eq('conversation_id', conversationId)
    .maybeSingle()
  const m = msg as MsgRow | null
  if (mErr || !m) return { ok: false, error: 'Message introuvable.' }
  if (!m.attachment_path || !isMessageAttachmentPath(m.attachment_path, conversationId)) {
    return { ok: false, error: 'Ce message ne contient pas de pièce jointe à ranger.' }
  }

  // Dossier : uniquement un des miens (RLS + filtre explicite).
  if (folderId) {
    const { data: folder, error: fErr } = await userClient
      .from('vault_folders')
      .select('id')
      .eq('id', folderId)
      .eq('user_id', me)
      .maybeSingle()
    if (fErr || !folder) return { ok: false, error: 'Dossier introuvable. Choisissez un autre emplacement.' }
  }

  let admin: SupabaseClient
  try {
    admin = createServiceClient() as unknown as SupabaseClient
  } catch {
    return { ok: false, error: "Le rangement dans le coffre-fort n'est pas configuré." }
  }

  const [{ data: conv }, { data: users }] = await Promise.all([
    admin.from('conversations').select('title').eq('id', conversationId).maybeSingle(),
    admin.from('users').select('id, prenom, nom').in('id', [...new Set([me, m.sender_id])]),
  ])
  const names = new Map(((users ?? []) as UserRow[]).map((u) => [u.id, u]))
  const title = (conv as { title: string | null } | null)?.title ?? null

  let res: { documentId: string; created: boolean }
  try {
    res = await importAttachment(admin, { userId: me, m, conversationId, title, names, categoryName: 'Courriers' })
  } catch (err) {
    if (err instanceof VaultImportQuotaError) {
      return { ok: false, error: "Limite quotidienne d'ajout au coffre-fort atteinte pour cet expéditeur. Réessayez demain." }
    }
    console.warn('[messages] mise au coffre impossible', err instanceof Error ? err.message : 'unknown')
    return { ok: false, error: "La pièce jointe n'a pas pu être ajoutée au coffre-fort. Réessayez." }
  }

  // Rangement : seulement un document créé à l'instant (jamais de déplacement).
  const placed = folderId && res.created ? await placeInFolder(admin, me, res.documentId, folderId) : null

  // Dossier où se trouve réellement le document (pour le message affiché).
  const { data: doc } = await admin.from('documents').select('folder_id').eq('id', res.documentId).eq('user_id', me).maybeSingle()
  const currentFolder = (doc as { folder_id: string | null } | null)?.folder_id ?? null
  let folderName: string | null = null
  if (currentFolder) {
    const { data: f } = await admin.from('vault_folders').select('name').eq('id', currentFolder).eq('user_id', me).maybeSingle()
    folderName = (f as { name: string } | null)?.name ?? null
  }

  const { data: link } = await userClient
    .from('vault_imports')
    .select('category_name')
    .eq('user_id', me)
    .eq('source', 'messagerie')
    .eq('source_ref', m.id)
    .maybeSingle()
  return {
    ok: true,
    created: res.created,
    placed,
    folderName,
    link: {
      messageId: m.id,
      documentId: res.documentId,
      status: 'done',
      categoryName: (link as { category_name: string } | null)?.category_name ?? 'Courriers',
    },
  }
}
