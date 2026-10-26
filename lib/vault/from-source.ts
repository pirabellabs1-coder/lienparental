import 'server-only'
/**
 * Ajout automatique d'un fichier au coffre-fort d'un utilisateur, depuis une
 * source de l'application (messagerie, témoignage, journal...).
 *
 * Réutilisable hors messagerie : n'importe quel Route Handler / Server Action
 * disposant du client service_role peut l'appeler (messagerie :
 * app/app/messages/actions.ts ; témoignages : app/api/temoin/[token]/route.ts).
 *
 * Garanties :
 *   - le binaire est relu côté serveur (taille, signature binaire, SHA-256),
 *     jamais repris d'une métadonnée client ;
 *   - copie dans le bucket privé `documents` à `<userId>/<source>/<ref>.<ext>`
 *     (chemin déterministe : une nouvelle tentative écrase la même copie) ;
 *   - document créé par la fonction SQL `vault_add_from_source` (0330, 0360) :
 *     idempotente par (utilisateur, source, référence) et par empreinte,
 *     donc jamais de doublon dans le coffre ;
 *   - chemin source validé avant toute lecture (M5) ; quota de 100 Mo par
 *     destinataire, par expéditeur et par 24 h (VaultImportQuotaError).
 *
 * Exemple (branché dans app/api/temoin/[token]/route.ts après `record_testimony_submission`) :
 *   await addToVaultFromSource(svc, {
 *     userId: <propriétaire de la demande>, source: 'temoignage', sourceRef: `${testimonyId}:${n}`,
 *     from: { bucket: WITNESS_BUCKET, path: a.path }, name: a.name ?? 'Pièce du témoignage',
 *     categoryName: 'Dossier JAF', description: 'Pièce jointe au témoignage <référence>',
 *   }).catch(() => {}) // jamais bloquant pour le témoin
 */
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export type VaultSource = 'messagerie' | 'temoignage' | 'journal' | 'autre'

export type AddToVaultInput = {
  /** Propriétaire du coffre (identité déjà contrôlée par l'appelant). */
  userId: string
  source: VaultSource
  /** Référence stable dans la source (id du message, "<testimonyId>:<n>"...). */
  sourceRef: string
  /** Objet Storage d'origine (lu avec le service_role). */
  from: { bucket: string; path: string }
  name: string
  categoryName?: string
  /** YYYY-MM-DD ; défaut : aujourd'hui. */
  docDate?: string
  description?: string
  /** Métadonnées de provenance (conversation, expéditeur, date...). */
  meta?: Record<string, unknown>
  messageId?: string
  conversationId?: string
  senderId?: string
}

export type AddToVaultResult = { documentId: string; created: boolean }

export const VAULT_FROM_SOURCE_MAX_BYTES = 20 * 1024 * 1024
const DOCUMENTS_BUCKET = 'documents'

/** Types acceptés et extension de la copie. */
const EXT_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
}

/** Type réel d'après la signature binaire (null si inconnu). */
export function sniffMime(bytes: Uint8Array): string | null {
  const at = (i: number) => bytes[i] ?? -1
  const ascii = (from: number, len: number) => String.fromCharCode(...bytes.slice(from, from + len))
  if (ascii(0, 5) === '%PDF-') return 'application/pdf'
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg'
  if (at(0) === 0x89 && ascii(1, 3) === 'PNG') return 'image/png'
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'image/webp'
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE') return 'audio/wav'
  if (at(0) === 0x1a && at(1) === 0x45 && at(2) === 0xdf && at(3) === 0xa3) return 'audio/webm'
  if (ascii(0, 4) === 'OggS') return 'audio/ogg'
  if (ascii(4, 4) === 'ftyp') {
    const brand = ascii(8, 4)
    if (/^(heic|heix|hevc|mif1|msf1)$/.test(brand)) return 'image/heic'
    return 'audio/mp4'
  }
  if (ascii(0, 3) === 'ID3' || (at(0) === 0xff && (at(1) & 0xe0) === 0xe0)) {
    // MPEG audio ou ADTS (AAC) : même famille de synchronisation.
    return (at(1) & 0x06) === 0 ? 'audio/aac' : 'audio/mpeg'
  }
  return null
}

const UUID_RE = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

/**
 * M5 (audit v3) : chemin exact d'une pièce jointe de messagerie,
 * `<conversationId>/<uuid>.<ext>` (même règle que chk_messages_attachment_path, 0360).
 */
export function isMessageAttachmentPath(path: string, conversationId: string): boolean {
  // Postgres écrit les uuid en minuscules : on compare à la forme canonique.
  const conv = conversationId.toLowerCase()
  if (!new RegExp(`^${UUID_RE}$`).test(conv)) return false
  return new RegExp(`^${conv}/${UUID_RE}[.][a-z0-9]{1,5}$`).test(path)
}

/** Chemin Storage relatif sans traversée ni segment vide (autres sources). */
function isSafeObjectPath(path: string): boolean {
  return path.length > 0 && path.length <= 400
    && /^[A-Za-z0-9._/-]+$/.test(path)
    && path.split('/').every((seg) => seg.length > 0 && seg !== '.' && seg !== '..')
}

/** Erreur métier : quota quotidien d'import atteint (vault_add_from_source, 54000). */
export class VaultImportQuotaError extends Error {
  constructor() {
    super('quota_exceeded')
  }
}

function safeRef(ref: string): string {
  return ref.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 100) || 'ref'
}

/**
 * Copie un objet Storage dans le coffre de `userId` et crée le document
 * correspondant (ou retrouve celui qui existe déjà).
 */
export async function addToVaultFromSource(admin: SupabaseClient, input: AddToVaultInput): Promise<AddToVaultResult> {
  // M5 : jamais de lecture service_role sur un chemin non conforme (le service_role
  // contourne les politiques Storage : le chemin est la seule barrière).
  if (input.from.bucket === 'message-attachments') {
    if (!input.conversationId || !isMessageAttachmentPath(input.from.path, input.conversationId)) throw new Error('bad_source_path')
  } else if (!isSafeObjectPath(input.from.path)) {
    throw new Error('bad_source_path')
  }
  const dl = await admin.storage.from(input.from.bucket).download(input.from.path)
  if (dl.error || !dl.data) throw new Error('source_unavailable')
  const bytes = new Uint8Array(await dl.data.arrayBuffer())
  if (bytes.byteLength === 0 || bytes.byteLength > VAULT_FROM_SOURCE_MAX_BYTES) throw new Error('bad_size')

  const mime = sniffMime(bytes)
  if (!mime || !EXT_BY_MIME[mime]) throw new Error('bad_type')
  const checksum = createHash('sha256').update(bytes).digest('hex')

  const path = `${input.userId}/${input.source}/${safeRef(input.sourceRef)}.${EXT_BY_MIME[mime]}`
  const up = await admin.storage.from(DOCUMENTS_BUCKET).upload(path, bytes, { contentType: mime, upsert: true })
  if (up.error) throw new Error('copy_failed')

  const { data, error } = await admin.rpc('vault_add_from_source', {
    p_user_id: input.userId,
    p_source: input.source,
    p_source_ref: input.sourceRef,
    p_storage_path: path,
    p_name: input.name.slice(0, 120),
    p_mime: mime,
    p_size: bytes.byteLength,
    p_category_name: input.categoryName ?? 'Courriers',
    p_doc_date: input.docDate ?? null,
    p_description: input.description?.slice(0, 280) ?? null,
    p_checksum: checksum,
    p_meta: input.meta ?? {},
    p_message_id: input.messageId ?? null,
    p_conversation_id: input.conversationId ?? null,
    p_sender_id: input.senderId ?? null,
  })
  if (error) {
    await admin.storage.from(DOCUMENTS_BUCKET).remove([path]).catch(() => {})
    if (error.code === '54000' && error.hint === 'vault_import_quota') throw new VaultImportQuotaError()
    throw new Error('db_failed')
  }
  const row = (Array.isArray(data) ? data[0] : data) as { document_id: string; storage_path: string; created: boolean } | null
  if (!row?.document_id) throw new Error('db_failed')
  // Contenu déjà présent dans le coffre : on supprime la copie superflue.
  if (row.storage_path !== path) await admin.storage.from(DOCUMENTS_BUCKET).remove([path]).catch(() => {})
  return { documentId: row.document_id, created: row.created }
}
