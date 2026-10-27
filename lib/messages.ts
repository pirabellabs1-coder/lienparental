/**
 * Messagerie entre parents : accès aux données.
 *
 * - SUPABASE_ENABLED : tables coparent_links / conversations / messages (0230)
 *   et conversation_participants / vault_imports (0330). RLS « participants
 *   uniquement », messages immuables, plusieurs conversations par paire de
 *   parents (sujet facultatif), archivage par participant, notes vocales,
 *   accusés de lecture via mark_read(), temps réel via supabase.channel.
 *   Pièces jointes et coffre-fort (0420) : rangement automatique seulement
 *   pour les participants qui l'ont activé (syncConversationVault), sinon à la
 *   demande avec « Mettre au coffre-fort » (saveAttachmentToVault).
 * - Mode démonstration : conversations fictives en sessionStorage, fichiers
 *   et notes vocales en mémoire (URL blob:), rien ne quitte l'appareil.
 *   À n'utiliser que dans des Client Components.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/client'
import { kickNotifications } from '@/lib/notify/client'
import { saveAttachmentToVault, syncConversationVault } from '@/app/app/messages/actions'
import { getVaultSettings, listFolders, type SaveOutcome } from '@/lib/data/vault-folders'
import { listLinkedParents } from '@/lib/coparents/client'
import {
  DEMO_CONVERSATION_ID, DEMO_ME, DEMO_OTHER, DEMO_THIRD, demoConversations,
  type SeedConversation, type SeedMessage, type SeedVaultLink,
} from '@/components/messages/seed'

// --- Types -------------------------------------------------------------------

export type Participant = { id: string; prenom: string; nom: string }

export type MessageKind = 'text' | 'attachment' | 'audio'

export type MessageAttachment = { name: string; mime: string; size: number; path: string }

export type Message = {
  id: string
  conversationId: string
  senderId: string
  body: string
  kind: MessageKind
  attachment: MessageAttachment | null
  /** Notes vocales uniquement (ms). */
  audioDurationMs: number | null
  /** ISO, horodatage serveur (non modifiable) */
  createdAt: string
  readAt: string | null
}

export type ConversationPreview = {
  id: string
  senderId: string
  body: string
  kind: MessageKind
  attachmentName: string | null
  createdAt: string
}

export type ConversationSummary = {
  id: string
  /** Sujet facultatif (« Vacances de Lina »). */
  title: string | null
  createdAt: string
  archived: boolean
  /** Autres participants (vous exclu). */
  participants: Participant[]
  lastMessage: ConversationPreview | null
  unread: number
}

export type VaultLink = {
  messageId: string
  documentId: string | null
  status: 'pending' | 'done' | 'failed'
  categoryName: string
}

export type CoparentInvite = {
  id: string
  inviteeEmail: string
  token: string
  status: 'pending' | 'accepted'
  createdAt: string
  expiresAt: string
}

/** État « historique » (une conversation) : conservé pour le dossier JAF. */
export type ThreadState = {
  me: Participant
  other: Participant | null
  conversationId: string | null
  invite: CoparentInvite | null
}

export type MessageEvent = { type: 'insert' | 'update'; message: Message }

export type SendOptions = {
  /** Note vocale : durée mesurée à l'enregistrement. */
  audioDurationMs?: number
  /** Catégorie du coffre-fort pour VOTRE copie (défaut « Courriers »), si le rangement automatique est activé. */
  vaultCategory?: string
}

// --- Règles partagées --------------------------------------------------------

export const MAX_BODY_CHARS = 5000
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const ALLOWED_ATTACHMENT_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'] as const
export const ALLOWED_AUDIO_MIME = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/mpeg'] as const
export const MAX_TITLE_CHARS = 80
export const MAX_VOICE_MS = 3 * 60 * 1000
export const MIN_VOICE_MS = 500
export const DEFAULT_VAULT_CATEGORY = 'Courriers'
const BUCKET = 'message-attachments'

/** Type MIME sans paramètres (« audio/webm;codecs=opus » -> « audio/webm »). */
export function baseMime(mime: string): string {
  return mime.split(';')[0].trim().toLowerCase()
}

/** Message d'erreur lisible, ou null si la pièce jointe est acceptée. */
export function validateAttachment(file: File): string | null {
  if (!(ALLOWED_ATTACHMENT_MIME as readonly string[]).includes(file.type)) {
    return 'Format non accepté. Choisissez une image (JPG, PNG, WebP, HEIC) ou un PDF.'
  }
  if (file.size > MAX_ATTACHMENT_BYTES) return 'Fichier trop volumineux : 10 Mo maximum.'
  if (file.size === 0) return 'Ce fichier est vide.'
  return null
}

/** Contrôle d'une note vocale avant envoi. */
export function validateVoice(file: Blob, durationMs: number): string | null {
  if (!(ALLOWED_AUDIO_MIME as readonly string[]).includes(baseMime(file.type))) return 'Format audio non pris en charge par ce navigateur.'
  if (durationMs < MIN_VOICE_MS) return 'Note vocale trop courte.'
  if (durationMs > MAX_VOICE_MS + 1000) return 'Note vocale trop longue : 3 minutes maximum.'
  if (file.size === 0) return 'Enregistrement vide. Vérifiez votre micro.'
  if (file.size > MAX_ATTACHMENT_BYTES) return 'Note vocale trop volumineuse.'
  return null
}

export function displayName(p: Pick<Participant, 'prenom' | 'nom'>): string {
  return `${p.prenom} ${p.nom}`.trim() || 'Autre parent'
}

/** « Thomas Martin », « Thomas et Karim »... */
export function participantsLabel(list: Participant[]): string {
  if (list.length === 0) return 'Conversation'
  if (list.length === 1) return displayName(list[0])
  const names = list.map((p) => p.prenom || displayName(p))
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`
}

/** Titre affiché : le sujet, sinon les interlocuteurs. */
export function conversationLabel(c: Pick<ConversationSummary, 'title' | 'participants'>): string {
  return c.title ?? participantsLabel(c.participants)
}

export function durationLabel(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Aperçu textuel d'un message (liste, notifications). */
export function previewText(m: Pick<ConversationPreview, 'body' | 'kind' | 'attachmentName'>): string {
  if (m.kind === 'audio') return 'Note vocale'
  if (m.body) return m.body
  if (m.kind === 'attachment') return m.attachmentName ? `Pièce jointe : ${m.attachmentName}` : 'Pièce jointe'
  return ''
}

export function inviteUrl(token: string): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  return `${origin}/app/messages/invitation/${encodeURIComponent(token)}`
}

// --- Supabase ----------------------------------------------------------------

const MESSAGE_COLUMNS = 'id, conversation_id, sender_id, body, kind, attachment_path, attachment_meta, audio_duration_ms, created_at, read_at'

type MessageRow = {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  kind?: MessageKind | null
  attachment_path: string | null
  attachment_meta: { name?: string; mime?: string; size?: number } | null
  audio_duration_ms?: number | null
  created_at: string
  read_at: string | null
}

type InviteRow = {
  id: string
  invitee_email: string
  token: string
  status: 'pending' | 'accepted'
  created_at: string
  expires_at: string
}

type ConversationRow = {
  conversation_id: string
  title: string | null
  created_at: string
  archived: boolean
  participants: Array<{ id: string; prenom: string; nom: string }> | null
  last_message: { id: string; sender_id: string; body: string; kind: MessageKind; attachment_name: string | null; created_at: string } | null
  unread_count: number
}

let client: SupabaseClient | null = null
// Les tables 0230/0330 ne figurent pas (encore) dans lib/supabase/types.ts : client non typé.
function sb(): SupabaseClient {
  if (!client) client = createClient() as unknown as SupabaseClient
  return client
}

function fromRow(r: MessageRow): Message {
  const kind: MessageKind = r.kind ?? (r.attachment_path ? 'attachment' : 'text')
  return {
    id: r.id,
    conversationId: r.conversation_id,
    senderId: r.sender_id,
    body: r.body,
    kind,
    attachment: r.attachment_path
      ? {
          path: r.attachment_path,
          name: r.attachment_meta?.name ?? (kind === 'audio' ? 'Note vocale' : 'Pièce jointe'),
          mime: r.attachment_meta?.mime ?? 'application/octet-stream',
          size: r.attachment_meta?.size ?? 0,
        }
      : null,
    audioDurationMs: r.audio_duration_ms ?? null,
    createdAt: r.created_at,
    readAt: r.read_at,
  }
}

function fromConversationRow(r: ConversationRow): ConversationSummary {
  const lm = r.last_message
  return {
    id: r.conversation_id,
    title: r.title,
    createdAt: r.created_at,
    archived: r.archived,
    participants: (r.participants ?? []).map((p) => ({ id: p.id, prenom: p.prenom, nom: p.nom })),
    lastMessage: lm
      ? { id: lm.id, senderId: lm.sender_id, body: lm.body, kind: lm.kind, attachmentName: lm.attachment_name, createdAt: lm.created_at }
      : null,
    unread: r.unread_count ?? 0,
  }
}

function fromInviteRow(r: InviteRow): CoparentInvite {
  return {
    id: r.id, inviteeEmail: r.invitee_email, token: r.token, status: r.status,
    createdAt: r.created_at, expiresAt: r.expires_at,
  }
}

async function currentParticipant(): Promise<Participant> {
  const { data: { user }, error } = await sb().auth.getUser()
  if (error || !user) throw new Error('Session expirée. Reconnectez-vous.')
  const { data } = await sb().from('users').select('prenom, nom').eq('id', user.id).maybeSingle()
  const profile = data as { prenom: string | null; nom: string | null } | null
  return { id: user.id, prenom: profile?.prenom ?? '', nom: profile?.nom ?? '' }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// --- Démo (sessionStorage + mémoire) -----------------------------------------

const DEMO_STORE_KEY = 'lp.messages.v3'
const DEMO_INVITE_KEY = 'lp.messages.invite.v1'
const DEMO_PEOPLE: Participant[] = [DEMO_ME, DEMO_OTHER, DEMO_THIRD]

type DemoMessage = SeedMessage
type DemoConversation = SeedConversation & { lastReadAt?: string | null }
type DemoVaultLink = SeedVaultLink & { documentId: string; addedAt: string; name: string; senderId: string; folderId?: string | null }
type DemoStore = {
  conversations: DemoConversation[]
  messages: Record<string, DemoMessage[]>
  vault: DemoVaultLink[]
}

const demoListeners = new Set<{ conversationId: string; fn: (e: MessageEvent) => void }>()
/** URLs locales (blob:) des pièces jointes et notes vocales de la session. */
const demoBlobs = new Map<string, string>()

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

function isStore(v: unknown): v is DemoStore {
  if (!v || typeof v !== 'object') return false
  const o = v as DemoStore
  return Array.isArray(o.conversations) && typeof o.messages === 'object' && o.messages !== null && Array.isArray(o.vault)
}

let memoryStore: DemoStore | null = null

function seedStore(): DemoStore {
  const seed = demoConversations(new Date())
  const vault: DemoVaultLink[] = seed.vault.map((v) => {
    const m = seed.messages[v.conversationId]?.find((x) => x.id === v.messageId)
    return {
      ...v,
      documentId: `demo_doc_${v.messageId}`,
      addedAt: m?.createdAt ?? new Date().toISOString(),
      name: m?.attachment?.name ?? 'Pièce jointe',
      senderId: m?.senderId ?? DEMO_ME.id,
    }
  })
  return { conversations: seed.conversations, messages: seed.messages, vault }
}

function demoRead(): DemoStore {
  const raw = storage()?.getItem(DEMO_STORE_KEY)
  if (raw) {
    try {
      const v: unknown = JSON.parse(raw)
      if (isStore(v)) return v
    } catch { /* données corrompues : on repart de la démo */ }
  }
  if (memoryStore) return memoryStore
  const s = seedStore()
  demoWrite(s)
  return s
}

function demoWrite(s: DemoStore) {
  memoryStore = s
  try {
    storage()?.setItem(DEMO_STORE_KEY, JSON.stringify(s))
  } catch { /* quota dépassé : la démo continue en mémoire */ }
}

function demoKind(m: DemoMessage): MessageKind {
  return m.kind ?? (m.attachment ? 'attachment' : 'text')
}

function fromSeed(conversationId: string, m: DemoMessage): Message {
  return {
    id: m.id, conversationId, senderId: m.senderId, body: m.body, kind: demoKind(m),
    attachment: m.attachment, audioDurationMs: m.audioDurationMs ?? null, createdAt: m.createdAt, readAt: m.readAt,
  }
}

function demoSummary(s: DemoStore, c: DemoConversation): ConversationSummary {
  const list = s.messages[c.id] ?? []
  const last = list[list.length - 1]
  return {
    id: c.id,
    title: c.title,
    createdAt: c.createdAt,
    archived: Boolean(c.archivedAt),
    participants: c.participantIds
      .filter((id) => id !== DEMO_ME.id)
      .map((id) => DEMO_PEOPLE.find((p) => p.id === id) ?? { id, prenom: 'Parent', nom: '' }),
    lastMessage: last
      ? { id: last.id, senderId: last.senderId, body: last.body.slice(0, 160), kind: demoKind(last), attachmentName: last.attachment?.name ?? null, createdAt: last.createdAt }
      : null,
    unread: list.filter((m) => m.senderId !== DEMO_ME.id && !m.readAt).length,
  }
}

function emit(conversationId: string, e: MessageEvent) {
  demoListeners.forEach((l) => { if (l.conversationId === conversationId) l.fn(e) })
}

function randomHex(bytes: number): string {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('')
}

function lastActivity(c: ConversationSummary): number {
  return new Date(c.lastMessage?.createdAt ?? c.createdAt).getTime()
}

function isPreviewInvite(): boolean {
  try {
    return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('apercu') === 'invitation'
  } catch {
    return false
  }
}

/** Fichiers fictifs de démonstration, générés à la demande (aucun réseau). */
function demoAsset(path: string): string | null {
  if (typeof window === 'undefined') return null
  const cached = demoBlobs.get(path)
  if (cached) return cached
  let blob: Blob | null = null
  if (path.startsWith('demo/voice-')) blob = demoVoiceWav(14)
  else if (path === 'demo/invitation-anniversaire') blob = demoInvitationImage()
  if (!blob) return null
  const url = URL.createObjectURL(blob)
  demoBlobs.set(path, url)
  return url
}

/** Son doux de démonstration (WAV 8 kHz, 8 bits) imitant le rythme d'une voix. */
function demoVoiceWav(seconds: number): Blob {
  const rate = 8000
  const n = rate * seconds
  const buf = new ArrayBuffer(44 + n)
  const v = new DataView(buf)
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true)
  w(36, 'data'); v.setUint32(40, n, true)
  for (let i = 0; i < n; i++) {
    const t = i / rate
    const syllable = Math.max(0, Math.sin(Math.PI * 3.1 * t)) * (0.55 + 0.45 * Math.sin(Math.PI * 0.37 * t + 1))
    const pitch = 165 + 25 * Math.sin(2 * Math.PI * 0.8 * t)
    const s = syllable * (0.6 * Math.sin(2 * Math.PI * pitch * t) + 0.25 * Math.sin(4 * Math.PI * pitch * t))
    v.setUint8(44 + i, Math.round(128 + 38 * s))
  }
  return new Blob([buf], { type: 'audio/wav' })
}

function demoInvitationImage(): Blob {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="448" height="320" viewBox="0 0 448 320">
<rect width="448" height="320" rx="24" fill="#EEF7EE"/><circle cx="70" cy="70" r="34" fill="#4CAF50" opacity=".25"/>
<circle cx="390" cy="250" r="46" fill="#0B2D5B" opacity=".12"/><rect x="40" y="110" width="368" height="150" rx="18" fill="#fff"/>
<text x="224" y="160" font-family="Montserrat,Arial,sans-serif" font-size="22" font-weight="800" fill="#0B2D5B" text-anchor="middle">Léo fête ses 8 ans</text>
<text x="224" y="196" font-family="Montserrat,Arial,sans-serif" font-size="16" fill="#334155" text-anchor="middle">Samedi 8 novembre, 14h à 17h</text>
<text x="224" y="226" font-family="Montserrat,Arial,sans-serif" font-size="14" fill="#2E7D32" text-anchor="middle">Goûter et jeux au parc</text></svg>`
  return new Blob([svg], { type: 'image/svg+xml' })
}

// --- API publique : identité, parents liés -----------------------------------

/** Utilisateur courant (prénom / nom). */
export async function getMe(): Promise<Participant> {
  if (!SUPABASE_ENABLED) return DEMO_ME
  return currentParticipant()
}

/**
 * Parents avec qui l'utilisateur peut démarrer une discussion, vus comme `Participant`.
 *
 * Source UNIQUE : `listLinkedParents()` de lib/coparents/client (chantier I) :
 *   - réel : GET /api/coparents/contacts (RPC list_family_contacts, filtre `messageable`,
 *     même règle que list_linked_parents() sur laquelle s'appuie create_conversation()) ;
 *   - démo : lib/coparents/demo (mêmes parents que l'écran « Coparents »).
 * `previewInvite` (démo uniquement) simule l'absence d'autre parent connecté.
 */
export async function listMessageableParents(opts: { previewInvite?: boolean } = {}): Promise<Participant[]> {
  if (!SUPABASE_ENABLED && (opts.previewInvite ?? isPreviewInvite())) return []
  const parents = await listLinkedParents()
  return parents.map((p) => ({ id: p.userId, prenom: p.prenom, nom: p.nom ?? '' }))
}

// --- API publique : conversations --------------------------------------------

/** Toutes les conversations (archivées comprises), de la plus récente à la plus ancienne. */
export async function listConversations(opts: { previewInvite?: boolean } = {}): Promise<ConversationSummary[]> {
  if (!SUPABASE_ENABLED) {
    if (opts.previewInvite ?? isPreviewInvite()) return []
    const s = demoRead()
    return s.conversations.map((c) => demoSummary(s, c)).sort((a, b) => lastActivity(b) - lastActivity(a))
  }
  const { data, error } = await sb().rpc('list_my_conversations')
  if (error) throw new Error('Impossible de charger les conversations.')
  return ((data ?? []) as ConversationRow[]).map(fromConversationRow)
}

/** Une conversation (null si inconnue ou inaccessible). */
export async function getConversation(id: string): Promise<ConversationSummary | null> {
  if (!SUPABASE_ENABLED) {
    const s = demoRead()
    const c = s.conversations.find((x) => x.id === id)
    return c ? demoSummary(s, c) : null
  }
  if (!UUID_RE.test(id)) return null
  const { data, error } = await sb().rpc('list_my_conversations', { p_conversation_id: id })
  if (error) throw new Error('Impossible de charger la conversation.')
  const row = (data as ConversationRow[] | null)?.[0]
  return row ? fromConversationRow(row) : null
}

/** Nettoie un sujet saisi (espaces, longueur). */
export function normalizeTitle(raw: string): string | null {
  const t = raw.replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, MAX_TITLE_CHARS) : null
}

/**
 * Démarre une discussion avec un ou plusieurs parents liés, avec un sujet
 * facultatif. Même sujet et mêmes participants qu'une conversation existante :
 * celle-ci est réutilisée (et désarchivée). Retourne l'identifiant.
 */
export async function createConversation(input: { participantIds: string[]; title?: string }): Promise<string> {
  const ids = [...new Set(input.participantIds)].filter(Boolean)
  if (ids.length === 0) throw new Error('Choisissez au moins un interlocuteur.')
  if (ids.length > 5) throw new Error('Cinq interlocuteurs au maximum.')
  const raw = (input.title ?? '').replace(/\s+/g, ' ').trim()
  if (raw.length > MAX_TITLE_CHARS) throw new Error(`Sujet trop long (${MAX_TITLE_CHARS} caractères maximum).`)
  const title = raw || null

  if (!SUPABASE_ENABLED) {
    const linked = await listMessageableParents({ previewInvite: false })
    if (!ids.every((id) => linked.some((p) => p.id === id))) throw new Error('Interlocuteur non lié à votre compte.')
    const s = demoRead()
    const wanted = [...ids, DEMO_ME.id].sort().join(',')
    const existing = s.conversations.find(
      (c) => (c.title ?? '').toLowerCase() === (title ?? '').toLowerCase() && [...c.participantIds].sort().join(',') === wanted,
    )
    if (existing) {
      if (existing.archivedAt) demoWrite({ ...s, conversations: s.conversations.map((c) => (c.id === existing.id ? { ...c, archivedAt: null } : c)) })
      return existing.id
    }
    const conv: DemoConversation = {
      id: `conv_${randomHex(5)}`, title, participantIds: [DEMO_ME.id, ...ids], createdAt: new Date().toISOString(), archivedAt: null,
    }
    demoWrite({ ...s, conversations: [conv, ...s.conversations], messages: { ...s.messages, [conv.id]: [] } })
    return conv.id
  }

  if (!ids.every((id) => UUID_RE.test(id))) throw new Error('Interlocuteur invalide.')
  const { data, error } = await sb().rpc('create_conversation', { p_participant_ids: ids, p_title: title })
  if (error || typeof data !== 'string') {
    const code = (error as { code?: string } | null)?.code
    if (code === '42501') throw new Error('Ce parent n’est pas lié à votre compte.')
    if (code === '54000') throw new Error('Trop de conversations créées aujourd’hui. Réessayez demain.')
    throw new Error("La discussion n'a pas pu être créée.")
  }
  return data
}

/** Archive (ou ressort des archives) une conversation, pour vous seul. */
export async function setConversationArchived(id: string, archived: boolean): Promise<void> {
  if (!SUPABASE_ENABLED) {
    const s = demoRead()
    demoWrite({
      ...s,
      conversations: s.conversations.map((c) => (c.id === id ? { ...c, archivedAt: archived ? new Date().toISOString() : null } : c)),
    })
    return
  }
  const me = await currentParticipant()
  const { error } = await sb()
    .from('conversation_participants')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('conversation_id', id)
    .eq('user_id', me.id)
  if (error) throw new Error(archived ? "La conversation n'a pas pu être archivée." : "La conversation n'a pas pu être désarchivée.")
}

// --- API publique : messages -------------------------------------------------

/** Messages de la conversation, du plus ancien au plus récent. */
export async function listMessages(conversationId: string): Promise<Message[]> {
  if (!SUPABASE_ENABLED) return (demoRead().messages[conversationId] ?? []).map((m) => fromSeed(conversationId, m))

  const { data, error } = await sb()
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(1000)
  if (error) throw new Error('Impossible de charger les messages.')
  return (data as MessageRow[]).map(fromRow)
}

function extFor(mime: string, name: string): string {
  const m = baseMime(mime)
  if (m === 'audio/webm') return 'webm'
  if (m === 'audio/ogg') return 'ogg'
  if (m === 'audio/mp4') return 'm4a'
  if (m === 'audio/aac') return 'aac'
  if (m === 'audio/mpeg') return 'mp3'
  return (name.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin'
}

/**
 * Envoi d'un message (texte, pièce jointe ou note vocale). Le message est
 * ensuite immuable. Une note vocale se passe dans `file` avec
 * `opts.audioDurationMs`.
 */
export async function sendMessage(
  state: { me: Participant; conversationId: string | null },
  body: string,
  file: File | null,
  opts: SendOptions = {},
): Promise<Message> {
  const text = body.trim()
  const isAudio = opts.audioDurationMs !== undefined
  if (!state.conversationId) throw new Error("Aucune conversation : invitez d'abord l'autre parent.")
  if (!text && !file) throw new Error('Le message est vide.')
  if (text.length > MAX_BODY_CHARS) throw new Error(`Message trop long (${MAX_BODY_CHARS} caractères maximum).`)
  if (file) {
    const err = isAudio ? validateVoice(file, opts.audioDurationMs ?? 0) : validateAttachment(file)
    if (err) throw new Error(err)
  }
  const kind: MessageKind = file ? (isAudio ? 'audio' : 'attachment') : 'text'
  const durationMs = isAudio ? Math.min(MAX_VOICE_MS, Math.round(opts.audioDurationMs ?? 0)) : null
  const conversationId = state.conversationId

  if (!SUPABASE_ENABLED) {
    let attachment: MessageAttachment | null = null
    const s = demoRead()
    const id = `msg_${Date.now().toString(36)}_${randomHex(3)}`
    if (file) {
      const path = `local/${randomHex(8)}`
      demoBlobs.set(path, URL.createObjectURL(file))
      attachment = { name: isAudio ? 'Note vocale' : file.name, mime: baseMime(file.type), size: file.size, path }
    }
    const seed: DemoMessage = {
      id, senderId: state.me.id, body: text, attachment, createdAt: new Date().toISOString(), readAt: null,
      kind, audioDurationMs: durationMs,
    }
    // Démo : rangement automatique seulement si le réglage est activé (désactivé par défaut, 0420).
    const auto = attachment ? await getVaultSettings().catch(() => null) : null
    const vault = attachment && auto?.autoImportMessages
      ? [...s.vault, {
          messageId: id, conversationId, categoryName: opts.vaultCategory ?? DEFAULT_VAULT_CATEGORY,
          documentId: `demo_doc_${id}`, addedAt: seed.createdAt, name: attachment.name, senderId: state.me.id,
          folderId: auto.autoImportFolderId,
        }]
      : s.vault
    demoWrite({ ...s, messages: { ...s.messages, [conversationId]: [...(s.messages[conversationId] ?? []), seed] }, vault })
    const message = fromSeed(conversationId, seed)
    emit(conversationId, { type: 'insert', message })
    // Démo : l'autre parent « lit » le message quelques secondes plus tard.
    setTimeout(() => {
      const cur = demoRead()
      const list = cur.messages[conversationId] ?? []
      const idx = list.findIndex((m) => m.id === id)
      if (idx < 0 || list[idx].readAt) return
      const next = list.slice()
      next[idx] = { ...list[idx], readAt: new Date().toISOString() }
      demoWrite({ ...cur, messages: { ...cur.messages, [conversationId]: next } })
      emit(conversationId, { type: 'update', message: fromSeed(conversationId, next[idx]) })
    }, 4000)
    return message
  }

  let attachmentPath: string | null = null
  let attachmentMeta: MessageRow['attachment_meta'] = null
  if (file) {
    const mime = baseMime(file.type)
    attachmentPath = `${conversationId}/${crypto.randomUUID()}.${extFor(mime, file.name)}`
    const up = await sb().storage.from(BUCKET).upload(attachmentPath, file, { contentType: mime, upsert: false })
    if (up.error) throw new Error(isAudio ? "La note vocale n'a pas pu être envoyée." : "La pièce jointe n'a pas pu être envoyée.")
    attachmentMeta = { name: isAudio ? 'Note vocale' : file.name.slice(0, 200), mime, size: file.size }
  }

  const { data, error } = await sb()
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: state.me.id,
      body: text,
      kind,
      attachment_path: attachmentPath,
      attachment_meta: attachmentMeta,
      audio_duration_ms: durationMs,
    })
    .select(MESSAGE_COLUMNS)
    .single()
  if (error || !data) throw new Error("Le message n'a pas pu être envoyé.")
  kickNotifications() // « X vous a écrit » livré tout de suite aux autres participants
  return fromRow(data as MessageRow)
}

/** Marque comme lus les messages reçus (jamais ceux envoyés par soi). */
export async function markConversationRead(conversationId: string, meId: string): Promise<void> {
  if (!SUPABASE_ENABLED) {
    const s = demoRead()
    const list = s.messages[conversationId] ?? []
    let changed = false
    const now = new Date().toISOString()
    const next = list.map((m) => {
      if (m.senderId === meId || m.readAt) return m
      changed = true
      return { ...m, readAt: now }
    })
    if (changed) demoWrite({ ...s, messages: { ...s.messages, [conversationId]: next } })
    return
  }
  await sb().rpc('mark_read', { p_conversation_id: conversationId })
}

/** Abonnement aux nouveaux messages et accusés de lecture. Retourne la fonction de désabonnement. */
export function subscribeToConversation(conversationId: string, onEvent: (e: MessageEvent) => void): () => void {
  if (!SUPABASE_ENABLED) {
    const entry = { conversationId, fn: onEvent }
    demoListeners.add(entry)
    return () => { demoListeners.delete(entry) }
  }
  const channel = sb()
    .channel(`messages:${conversationId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => onEvent({ type: 'insert', message: fromRow(payload.new as MessageRow) }),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => onEvent({ type: 'update', message: fromRow(payload.new as MessageRow) }),
    )
    .subscribe()
  return () => { void sb().removeChannel(channel) }
}

/** URL temporaire d'une pièce jointe (null si indisponible, ex. fichier fictif de démo). */
export async function attachmentUrl(attachment: MessageAttachment): Promise<string | null> {
  if (!SUPABASE_ENABLED) return demoBlobs.get(attachment.path) ?? demoAsset(attachment.path)
  const { data, error } = await sb().storage.from(BUCKET).createSignedUrl(attachment.path, 300)
  return error ? null : data.signedUrl
}

// --- API publique : coffre-fort ----------------------------------------------

/**
 * Range les pièces jointes de la conversation dans le coffre-fort de chaque
 * participant (côté serveur) et renvoie l'état de VOS copies, par message.
 * `messageId` + `categoryName` : catégorie choisie pour un envoi précis.
 */
export async function syncVault(
  conversationId: string,
  opts: { messageId?: string; categoryName?: string } = {},
): Promise<Record<string, VaultLink>> {
  if (!SUPABASE_ENABLED) {
    const out: Record<string, VaultLink> = {}
    for (const v of demoRead().vault) {
      if (v.conversationId === conversationId) {
        out[v.messageId] = { messageId: v.messageId, documentId: v.documentId, status: 'done', categoryName: v.categoryName }
      }
    }
    return out
  }
  const res = await syncConversationVault({ conversationId, ...opts })
  if (!res.ok) throw new Error(res.error)
  return Object.fromEntries(res.links.map((l) => [l.messageId, l]))
}

/**
 * « Mettre au coffre-fort » : copie la pièce jointe d'un message dans VOTRE coffre, dans
 * `folderId` (dossier du coffre) ou à la racine (null). Sans doublon.
 */
export async function saveToVault(
  conversationId: string,
  messageId: string,
  folderId: string | null,
): Promise<{ link: VaultLink; outcome: SaveOutcome }> {
  if (!SUPABASE_ENABLED) {
    const s = demoRead()
    const m = s.messages[conversationId]?.find((x) => x.id === messageId)
    if (!m?.attachment) throw new Error('Ce message ne contient pas de pièce jointe à ranger.')
    const existing = s.vault.find((v) => v.messageId === messageId)
    const folderName = async (id: string | null | undefined) =>
      id ? (await listFolders().catch(() => [])).find((f) => f.id === id)?.name ?? null : null
    if (existing) {
      // Déjà au coffre : aucun déplacement (même règle que le serveur).
      return {
        link: { messageId, documentId: existing.documentId, status: 'done', categoryName: existing.categoryName },
        outcome: { created: false, placed: null, folderName: await folderName(existing.folderId) },
      }
    }
    const link: DemoVaultLink = {
      messageId, conversationId, categoryName: DEFAULT_VAULT_CATEGORY, documentId: `demo_doc_${messageId}`,
      addedAt: new Date().toISOString(), name: m.attachment.name, senderId: m.senderId, folderId,
    }
    demoWrite({ ...s, vault: [...s.vault, link] })
    return {
      link: { messageId, documentId: link.documentId, status: 'done', categoryName: link.categoryName },
      outcome: { created: true, placed: folderId ? true : null, folderName: await folderName(folderId) },
    }
  }
  const res = await saveAttachmentToVault({ conversationId, messageId, folderId })
  if (!res.ok) throw new VaultSaveError(res.error, res.code)
  return { link: res.link, outcome: { created: res.created, placed: res.placed, folderName: res.folderName } }
}

/** Échec de « Mettre au coffre-fort » ; `code = 'vault_locked'` : coffre à déverrouiller. */
export class VaultSaveError extends Error {
  constructor(message: string, readonly code?: 'vault_locked') {
    super(message)
    this.name = 'VaultSaveError'
  }
}

/** Lien vers le document du coffre (démo : liste du coffre, les documents fictifs n'y figurent pas). */
export function vaultDocumentHref(documentId: string): string {
  return SUPABASE_ENABLED ? `/app/coffre/documents/${encodeURIComponent(documentId)}` : '/app/coffre'
}

/**
 * Démo : pièces rangées dans le coffre pendant la session (lecture seule).
 * Point d'accroche pour lib/data/vault.ts (mode démo) si le coordinateur
 * souhaite les afficher dans la liste du coffre.
 */
export function listDemoVaultImports(): Array<{ documentId: string; name: string; categoryName: string; addedAt: string; conversationId: string; messageId: string; senderId: string; mime?: string; size?: number; folderId?: string | null }> {
  if (SUPABASE_ENABLED) return []
  const store = demoRead()
  return store.vault.map((v) => {
    const att = store.messages[v.conversationId]?.find((m) => m.id === v.messageId)?.attachment
    return {
      documentId: v.documentId, name: v.name, categoryName: v.categoryName, addedAt: v.addedAt,
      conversationId: v.conversationId, messageId: v.messageId, senderId: v.senderId,
      mime: att?.mime, size: att?.size, folderId: v.folderId ?? null,
    }
  })
}

// --- Compatibilité : fil unique (dossier JAF, partage avocat) -----------------

/**
 * État de la messagerie V1 : participants, conversation principale et
 * invitation en attente. Utilisé par components/dossier/data.ts.
 * `previewInvite` (démo uniquement) simule l'absence d'autre parent connecté.
 */
export async function loadThreadState(opts: { previewInvite?: boolean } = {}): Promise<ThreadState> {
  if (!SUPABASE_ENABLED) {
    const invite = demoInvite()
    return opts.previewInvite
      ? { me: DEMO_ME, other: null, conversationId: null, invite }
      : { me: DEMO_ME, other: DEMO_OTHER, conversationId: DEMO_CONVERSATION_ID, invite: null }
  }

  const me = await currentParticipant()
  const [conv, invite] = await Promise.all([sb().rpc('get_my_conversation'), loadPendingInvite(me.id)])
  if (conv.error) throw new Error('Impossible de charger la conversation.')
  const row = (conv.data as Array<{ conversation_id: string; other_id: string; other_prenom: string; other_nom: string }> | null)?.[0]
  return {
    me,
    other: row ? { id: row.other_id, prenom: row.other_prenom, nom: row.other_nom } : null,
    conversationId: row?.conversation_id ?? null,
    invite,
  }
}

// --- Invitations -------------------------------------------------------------

function demoInvite(): CoparentInvite | null {
  const raw = storage()?.getItem(DEMO_INVITE_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) as CoparentInvite } catch { return null }
}

async function loadPendingInvite(meId: string): Promise<CoparentInvite | null> {
  const { data } = await sb().from('coparent_links')
    .select('id, invitee_email, token, status, created_at, expires_at')
    .eq('user_id', meId).eq('status', 'pending')
    .order('created_at', { ascending: false }).limit(1)
  const row = (data as InviteRow[] | null)?.[0]
  return row ? fromInviteRow(row) : null
}

/** Invitation en attente envoyée par l'utilisateur (null si aucune). */
export async function getPendingInvite(): Promise<CoparentInvite | null> {
  if (!SUPABASE_ENABLED) return demoInvite()
  const me = await currentParticipant()
  return loadPendingInvite(me.id)
}

/** Crée une invitation pour l'autre parent (jeton généré par la base). */
export async function createInvite(email: string): Promise<CoparentInvite> {
  const e = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 254) throw new Error('Adresse e-mail invalide.')

  if (!SUPABASE_ENABLED) {
    const now = new Date()
    const invite: CoparentInvite = {
      id: `inv_${randomHex(4)}`,
      inviteeEmail: e,
      token: randomHex(16),
      status: 'pending',
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 14 * 86_400_000).toISOString(),
    }
    try { storage()?.setItem(DEMO_INVITE_KEY, JSON.stringify(invite)) } catch { /* mémoire seule */ }
    return invite
  }

  const me = await currentParticipant()
  const { data, error } = await sb()
    .from('coparent_links')
    .insert({ user_id: me.id, invitee_email: e })
    .select('id, invitee_email, token, status, created_at, expires_at')
    .single()
  if (error || !data) throw new Error("L'invitation n'a pas pu être créée.")
  return fromInviteRow(data as InviteRow)
}

/** Annule l'invitation en attente. */
export async function cancelInvite(inviteId: string): Promise<void> {
  if (!SUPABASE_ENABLED) {
    storage()?.removeItem(DEMO_INVITE_KEY)
    return
  }
  const { error } = await sb().from('coparent_links').delete().eq('id', inviteId).eq('status', 'pending')
  if (error) throw new Error("L'invitation n'a pas pu être annulée.")
}

/** Accepte une invitation reçue ; retourne l'identifiant de la conversation. */
export async function acceptInvite(token: string): Promise<string> {
  if (!/^[a-f0-9]{32}$/i.test(token)) throw new Error('Invitation invalide ou expirée.')
  if (!SUPABASE_ENABLED) return DEMO_CONVERSATION_ID
  const { data, error } = await sb().rpc('accept_coparent_invite', { p_token: token })
  if (error || typeof data !== 'string') throw new Error('Invitation invalide ou expirée.')
  kickNotifications()
  return data
}
