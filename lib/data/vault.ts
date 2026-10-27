'use client'

/**
 * Coffre-fort — documents, catégories, partages.
 *
 * Supabase :
 * - `categories` (unique (user_id, name)) ; catégories par défaut créées au 1er accès.
 * - `documents` : binaire dans le bucket privé `documents` à `${uid}/${uuid}-${safeName}`
 *   (la policy Storage exige 1er segment = auth.uid()), 20 Mo max, PDF/JPG/PNG/DOCX/DOC.
 *   Téléchargement / aperçu : URL signée de 60 s émise par le SERVEUR
 *   (app/api/coffre/fichier/[id], coffre déverrouillé exigé, 0370) ; plus aucune
 *   signature depuis le navigateur. Suppression = corbeille (deleted_at, RPC
 *   soft_delete_document / restore_document), purge définitive manuelle ou par cron à 30 j.
 * - `shares` : jeton aléatoire 32 caractères + expires_at + révocation (revoked_at).
 *
 * Famille (0340, docs/FAMILLE.md) : la RLS renvoie aussi les documents `family_shared`
 * des autres adultes liés ; ils portent `sharedBy` (badge « Partagé par… ») et restent en
 * lecture seule (renommage / déplacement filtrés sur user_id = moi).
 * Dossiers (0410, lib/data/vault-folders.ts) : `folder_id` ; les documents d'un dossier
 * partagé par un autre parent ne figurent pas dans les listes générales, seulement dans
 * « Partagés avec moi » (listFolderDocuments).
 *
 * Démo : données de lib/mock-vault (aucune écriture distante) + `demoExtraDocs()` :
 * document partagé par l'autre parent et pièces rangées depuis la messagerie.
 */
import { z } from 'zod'
import {
  VAULT_CATEGORIES, VAULT_DOCS,
  type VaultCategory, type VaultDocument, type VaultFileType, type VaultIconKey, type VaultTone,
} from '@/lib/mock-vault'
import {
  DOCUMENTS_BUCKET, DataError, LIVE, dataMsg, db, randomToken, requireUserId,
  safeFileName, toDataError, uuid,
} from './core'
import { dayKeyInTz, timeInTz } from '@/lib/tz'
import { familyAuthorNames, sharedByLabel } from './family'

// --- Constantes -------------------------------------------------------------

export const VAULT_MAX_BYTES = 20 * 1024 * 1024
export const TRASH_RETENTION_DAYS = 30

const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

const ICONS: VaultIconKey[] = ['calendar', 'badge', 'health', 'wallet', 'mail', 'shapes', 'folder', 'file', 'heart', 'bank', 'lock']
const TONES: VaultTone[] = ['violet', 'blue', 'green', 'orange', 'pink', 'gray', 'red']

// --- Lignes -----------------------------------------------------------------

type CategoryRow = { id: string; name: string; icon: string | null; color: string | null; visible_filtres: boolean; position: number }
type DocumentRow = {
  id: string
  category_id: string | null
  name: string
  mime: string
  size_bytes: number
  confidentialite: 'standard' | 'confidentiel' | 'tres_confidentiel'
  storage_path: string
  doc_date: string | null
  source: string | null
  description: string | null
  children_ids: string[] | null
  created_at: string
  deleted_at: string | null
  user_id: string
  family_shared: boolean | null
  folder_id: string | null
}
type ShareRow = {
  id: string
  document_id: string
  token: string
  label: string | null
  expires_at: string
  revoked_at: string | null
  download_count: number
  created_at: string
  documents: { name: string } | { name: string }[] | null
}

const CAT_COLUMNS = 'id, name, icon, color, visible_filtres, position'
const DOC_COLUMNS = 'id, category_id, name, mime, size_bytes, confidentialite, storage_path, doc_date, source, description, children_ids, created_at, deleted_at, user_id, family_shared, folder_id'

type Viewer = { userId: string; names: Map<string, string> }

async function viewer(): Promise<Viewer> {
  const [userId, names] = await Promise.all([requireUserId(), familyAuthorNames()])
  return { userId, names }
}

const NOT_AUTHOR = () => dataMsg('vault.notAuthor')

/** Document enrichi pour les écrans « corbeille » et le téléchargement. */
export type VaultDocumentRecord = VaultDocument & { storagePath?: string; deletedAt?: string }

function extOf(name: string) {
  return (name.split('.').pop() ?? '').toLowerCase()
}

function typeOf(mime: string): VaultFileType {
  if (mime === 'application/pdf') return 'pdf'
  if (mime.startsWith('image/')) return 'image'
  if (mime.includes('word')) return 'word'
  return 'autre'
}

function extLabel(mime: string, name: string): string {
  if (mime === 'application/pdf') return 'PDF'
  if (mime === 'image/jpeg') return 'JPG'
  if (mime === 'image/png') return 'PNG'
  if (mime === 'application/msword') return 'DOC'
  if (mime.includes('wordprocessingml')) return 'DOCX'
  return (extOf(name) || 'FICHIER').toUpperCase()
}

function toneOf(mime: string): VaultTone {
  if (mime === 'application/pdf') return 'red'
  if (mime.includes('word')) return 'blue'
  return 'green'
}

function categoryFromRow(r: CategoryRow, count: number): VaultCategory {
  return {
    id: r.id,
    name: r.name,
    icon: (ICONS as string[]).includes(r.icon ?? '') ? (r.icon as VaultIconKey) : 'folder',
    tone: (TONES as string[]).includes(r.color ?? '') ? (r.color as VaultTone) : 'gray',
    count,
    visibleInFilters: r.visible_filtres,
  }
}

function docFromRow(r: DocumentRow, who?: Viewer): VaultDocumentRecord {
  const created = new Date(r.created_at)
  const foreign = Boolean(who && r.user_id && r.user_id !== who.userId)
  return {
    id: r.id,
    name: r.name,
    type: typeOf(r.mime),
    ext: extLabel(r.mime, r.storage_path),
    size: Number(r.size_bytes),
    docDate: r.doc_date ?? dayKeyInTz(created),
    addedAt: dayKeyInTz(created),
    addedTime: timeInTz(created),
    categoryId: r.category_id ?? '',
    tone: toneOf(r.mime),
    source: r.source ?? '',
    description: r.description ?? undefined,
    childIds: r.children_ids ?? [],
    confidentialite: r.confidentialite === 'standard' ? 'partage' : 'prive',
    storagePath: r.storage_path,
    deletedAt: r.deleted_at ?? undefined,
    familyShared: Boolean(r.family_shared),
    folderId: r.folder_id,
    ...(foreign && who ? { sharedBy: { prenom: sharedByLabel(who.names.get(r.user_id)) } } : {}),
  }
}

// --- Démo : documents complémentaires ------------------------------------------

/** Document partagé par l'autre parent (Thomas, lib/coparents/demo), lecture seule. */
const FAMILY_DEMO_DOCS: VaultDocumentRecord[] = [
  {
    id: 'v_fam_1', name: 'Certificat de vaccination de Noah', type: 'pdf', ext: 'PDF', size: 412_000,
    docDate: '2024-04-18', addedAt: '2024-04-18', addedTime: '19:20', categoryId: 'sante', tone: 'red',
    source: 'Centre de PMI de Matoury', description: 'Rappel DTP effectué.', confidentialite: 'partage',
    childIds: ['c_2'], familyShared: true, sharedBy: { prenom: 'Thomas' },
  },
]

function extFromMime(mime: string | undefined, name: string): string {
  // Notes vocales (audio/webm, audio/mp4…) : sous-type court plutôt que le nom sans extension.
  if (mime?.startsWith('audio/')) return (mime.split('/')[1] ?? 'audio').replace(/^x-/, '').slice(0, 4).toUpperCase()
  if (mime) return extLabel(mime, name)
  return (extOf(name) || 'FICHIER').toUpperCase()
}

/**
 * Démo uniquement, à appeler APRÈS montage (lit sessionStorage) : document partagé par
 * l'autre parent + pièces rangées depuis la messagerie (`listDemoVaultImports()`).
 */
export async function demoExtraDocs(): Promise<VaultDocumentRecord[]> {
  if (LIVE) return []
  const { listDemoVaultImports } = await import('@/lib/messages')
  const imports = listDemoVaultImports().map((v): VaultDocumentRecord => {
    const added = new Date(v.addedAt)
    const mime = v.mime ?? EXT_MIME[extOf(v.name)] ?? ''
    const cat = VAULT_CATEGORIES.find((c) => c.name === v.categoryName) ?? VAULT_CATEGORIES.find((c) => c.name === 'Courriers')
    return {
      id: v.documentId,
      name: v.name,
      type: typeOf(mime),
      ext: extFromMime(mime || undefined, v.name),
      size: v.size ?? 0,
      docDate: dayKeyInTz(added),
      addedAt: dayKeyInTz(added),
      addedTime: timeInTz(added),
      categoryId: cat?.id ?? '',
      tone: toneOf(mime),
      source: 'Messagerie',
      description: 'Pièce jointe rangée depuis la messagerie.',
      confidentialite: 'prive',
      folderId: v.folderId ?? null,
    }
  })
  return [...FAMILY_DEMO_DOCS, ...imports]
}

// --- Catégories -------------------------------------------------------------

async function seedDefaultCategories(userId: string) {
  const rows = VAULT_CATEGORIES.map((c, i) => ({
    user_id: userId, name: c.name, icon: c.icon, color: c.tone, visible_filtres: true, position: i,
  }))
  // Idempotent (unique (user_id, name)) : deux onglets ouverts ne créent pas de doublons.
  const { error } = await db().from('categories').upsert(rows, { onConflict: 'user_id,name', ignoreDuplicates: true })
  if (error) throw toDataError(error, 'vault.seedCategories')
}

export async function listCategories(): Promise<VaultCategory[]> {
  if (!LIVE) return VAULT_CATEGORIES
  const load = () => db().from('categories').select(CAT_COLUMNS).order('position').order('created_at').limit(100)
  let { data, error } = await load()
  if (error) throw toDataError(error, 'vault.listCategories')
  if ((data ?? []).length === 0) {
    await seedDefaultCategories(await requireUserId())
    ;({ data, error } = await load())
    if (error) throw toDataError(error, 'vault.listCategories')
  }
  // Compteurs : documents actifs par catégorie (une requête légère, colonnes minimales).
  const { data: docs, error: dErr } = await db().from('documents').select('category_id').is('deleted_at', null).limit(5000)
  if (dErr) throw toDataError(dErr, 'vault.countDocs')
  const counts = new Map<string, number>()
  for (const d of (docs ?? []) as { category_id: string | null }[]) {
    if (d.category_id) counts.set(d.category_id, (counts.get(d.category_id) ?? 0) + 1)
  }
  return ((data ?? []) as CategoryRow[]).map((r) => categoryFromRow(r, counts.get(r.id) ?? 0))
}

const categorySchema = () => z.object({
  name: z.string().trim().min(1, dataMsg('vault.categoryNameRequired')).max(40),
  icon: z.enum(ICONS as [VaultIconKey, ...VaultIconKey[]]),
  tone: z.enum(TONES as [VaultTone, ...VaultTone[]]),
  visibleInFilters: z.boolean(),
})

export async function createCategory(input: Pick<VaultCategory, 'name' | 'icon' | 'tone' | 'visibleInFilters'>): Promise<VaultCategory> {
  const p = categorySchema().safeParse(input)
  if (!p.success) throw new DataError(p.error.issues[0]?.message ?? dataMsg('vault.categoryInvalid'), 'invalid')
  const userId = await requireUserId()
  const { data, error } = await db()
    .from('categories')
    .insert({ user_id: userId, name: p.data.name, icon: p.data.icon, color: p.data.tone, visible_filtres: p.data.visibleInFilters, position: 1000 })
    .select(CAT_COLUMNS)
    .single()
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new DataError(dataMsg('vault.categoryTaken'), '23505')
    throw toDataError(error, 'vault.createCategory')
  }
  return categoryFromRow(data as CategoryRow, 0)
}

/** Supprime une catégorie ; ses documents sont rangés dans « Autres » (ou sans catégorie). */
export async function removeCategory(id: string): Promise<void> {
  const { data: others } = await db().from('categories').select('id').eq('name', 'Autres').neq('id', id).limit(1)
  const target = (others as { id: string }[] | null)?.[0]?.id ?? null
  const { error: mErr } = await db().from('documents').update({ category_id: target }).eq('category_id', id)
  if (mErr) throw toDataError(mErr, 'vault.moveDocs')
  const { error } = await db().from('categories').delete().eq('id', id)
  if (error) throw toDataError(error, 'vault.removeCategory')
}

// --- Documents --------------------------------------------------------------

export async function listDocuments(opts: { trash?: boolean } = {}): Promise<VaultDocumentRecord[]> {
  if (!LIVE) return VAULT_DOCS
  const who = await viewer()
  let q = db().from('documents').select(DOC_COLUMNS)
  // Corbeille : uniquement MES documents (un document partagé supprimé par son auteur n'y apparaît pas).
  q = opts.trash
    ? q.not('deleted_at', 'is', null).eq('user_id', who.userId).order('deleted_at', { ascending: false })
    : q.is('deleted_at', null).order('created_at', { ascending: false })
  const { data, error } = await q.limit(1000)
  if (error) throw toDataError(error, 'vault.listDocuments')
  return ((data ?? []) as DocumentRow[])
    // Documents d'un autre parent visibles seulement par un dossier partagé (0410) :
    // consultés depuis « Partagés avec moi », pas mêlés au coffre personnel.
    .filter((r) => r.user_id === who.userId || r.family_shared)
    .map((r) => docFromRow(r, who))
}

/** Documents actifs d'un dossier (le mien, ou un dossier partagé avec moi : RLS 0410). */
export async function listFolderDocuments(folderId: string): Promise<VaultDocumentRecord[]> {
  if (!z.string().uuid().safeParse(folderId).success) return []
  const who = await viewer()
  const { data, error } = await db()
    .from('documents')
    .select(DOC_COLUMNS)
    .eq('folder_id', folderId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1000)
  if (error) throw toDataError(error, 'vault.listFolderDocuments')
  return ((data ?? []) as DocumentRow[]).map((r) => docFromRow(r, who))
}

export async function getDocument(id: string): Promise<VaultDocumentRecord | null> {
  if (!LIVE) return VAULT_DOCS.find((d) => d.id === id) ?? null
  if (!z.string().uuid().safeParse(id).success) return null
  const [who, { data, error }] = await Promise.all([
    viewer(),
    db().from('documents').select(DOC_COLUMNS).eq('id', id).is('deleted_at', null).maybeSingle(),
  ])
  if (error) throw toDataError(error, 'vault.getDocument')
  return data ? docFromRow(data as DocumentRow, who) : null
}

/** Valide un fichier (extension, type, taille). Renvoie le type MIME retenu. */
export function validateVaultFile(file: File): string {
  const ext = extOf(file.name)
  const mime = EXT_MIME[ext]
  if (!mime) throw new DataError(dataMsg('vault.badType'), 'bad_type')
  // Le type déclaré par le navigateur doit être cohérent avec l'extension (s'il est fourni).
  if (file.type && file.type !== mime && !(ext === 'jpg' && file.type === 'image/jpeg')) {
    throw new DataError(dataMsg('vault.contentMismatch'), 'bad_type')
  }
  if (file.size <= 0) throw new DataError(dataMsg('vault.empty'), 'empty')
  if (file.size > VAULT_MAX_BYTES) throw new DataError(dataMsg('vault.tooLarge'), 'too_large')
  return mime
}

const uploadMetaSchema = () => z.object({
  name: z.string().trim().min(1, dataMsg('vault.docNameRequired')).max(120),
  description: z.string().trim().max(280).optional(),
  docDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, dataMsg('vault.docDateRequired')),
  source: z.string().trim().max(120).optional(),
  confidentialite: z.enum(['prive', 'partage']),
  categoryId: z.string().uuid().nullable(),
  /** Enfants concernés (documents.children_ids, 0004). */
  childIds: z.array(z.string().uuid()).max(20).optional(),
  /** Dossier de destination (0410) ; absent = racine. */
  folderId: z.string().uuid().nullable().optional(),
})
export type UploadMeta = z.infer<ReturnType<typeof uploadMetaSchema>>

/** Envoie le fichier dans Storage puis crée la ligne `documents` (rollback Storage si l'insert échoue). */
export async function uploadDocument(file: File, meta: UploadMeta): Promise<VaultDocumentRecord> {
  const mime = validateVaultFile(file)
  const p = uploadMetaSchema().safeParse(meta)
  if (!p.success) throw new DataError(p.error.issues[0]?.message ?? dataMsg('errors.invalidShort'), 'invalid')
  const userId = await requireUserId()
  const path = `${userId}/${uuid()}-${safeFileName(file.name)}`

  const { error: upErr } = await db().storage.from(DOCUMENTS_BUCKET).upload(path, file, { contentType: mime, upsert: false, cacheControl: '0' })
  if (upErr) throw toDataError(upErr, 'vault.upload', dataMsg('vault.uploadFailed'))

  const { data, error } = await db()
    .from('documents')
    .insert({
      user_id: userId,
      category_id: p.data.categoryId,
      name: p.data.name,
      mime,
      size_bytes: file.size,
      confidentialite: p.data.confidentialite === 'partage' ? 'standard' : 'confidentiel',
      storage_path: path,
      doc_date: p.data.docDate,
      source: p.data.source || null,
      description: p.data.description || null,
      children_ids: p.data.childIds ?? [],
      folder_id: p.data.folderId ?? null,
    })
    .select(DOC_COLUMNS)
    .single()
  if (error) {
    await db().storage.from(DOCUMENTS_BUCKET).remove([path])
    throw toDataError(error, 'vault.insertDocument')
  }
  return docFromRow(data as DocumentRow)
}

export async function renameDocument(id: string, name: string): Promise<void> {
  const n = z.string().trim().min(1).max(120).safeParse(name)
  if (!n.success) throw new DataError(dataMsg('vault.docNameInvalid'), 'invalid')
  if (!LIVE) return
  const userId = await requireUserId()
  const { data, error } = await db().from('documents').update({ name: n.data }).eq('id', id).eq('user_id', userId).select('id')
  if (error) throw toDataError(error, 'vault.rename')
  if (!data || data.length === 0) throw new DataError(NOT_AUTHOR(), 'not_author')
}

export async function moveDocument(id: string, categoryId: string): Promise<void> {
  if (!LIVE) return
  const userId = await requireUserId()
  const { data, error } = await db().from('documents').update({ category_id: categoryId || null }).eq('id', id).eq('user_id', userId).select('id')
  if (error) throw toDataError(error, 'vault.move')
  if (!data || data.length === 0) throw new DataError(NOT_AUTHOR(), 'not_author')
}

/** Mise à la corbeille (30 jours). */
export async function trashDocument(id: string): Promise<void> {
  const { error } = await db().rpc('soft_delete_document', { p_document_id: id })
  if (error) throw toDataError(error, 'vault.trash')
}

export async function restoreDocument(id: string): Promise<void> {
  const { error } = await db().rpc('restore_document', { p_document_id: id })
  if (error) throw toDataError(error, 'vault.restore', dataMsg('vault.restoreFailed'))
}

/** Suppression définitive depuis la corbeille : ligne puis fichier. */
export async function purgeDocument(doc: Pick<VaultDocumentRecord, 'id' | 'storagePath'>): Promise<void> {
  const { error } = await db().from('documents').delete().eq('id', doc.id).not('deleted_at', 'is', null)
  if (error) throw toDataError(error, 'vault.purge')
  if (doc.storagePath) {
    const { error: sErr } = await db().storage.from(DOCUMENTS_BUCKET).remove([doc.storagePath])
    // Ligne déjà supprimée : un fichier orphelin sera ramassé par le job de purge.
    if (sErr) console.warn('[data] vault.purge storage (code ' + String((sErr as { statusCode?: string }).statusCode ?? 'unknown') + ')')
  }
}

/** Route serveur des fichiers du coffre (session + coffre déverrouillé + droit d'accès). */
export function documentFileRoute(id: string, mode: 'telecharger' | 'apercu' = 'telecharger'): string {
  return `/api/coffre/fichier/${encodeURIComponent(id)}?mode=${mode}`
}

/**
 * URL signée COURTE (60 s) d'un fichier du coffre, obtenue auprès du serveur
 * (app/api/coffre/fichier/[id]) : le navigateur ne signe plus rien lui-même. Le serveur
 * vérifie la session, le verrou du coffre et le droit d'accès (propriétaire ou gardien d'un
 * document partagé) ; les refus arrivent ici en DataError françaises (coffre verrouillé…).
 */
export async function documentFileUrl(doc: Pick<VaultDocumentRecord, 'id'>, mode: 'telecharger' | 'apercu' = 'telecharger'): Promise<string> {
  if (!LIVE) throw new DataError(dataMsg('vault.demoFiles'), 'demo')
  let res: Response
  try {
    res = await fetch(`${documentFileRoute(doc.id, mode)}&format=json`, { credentials: 'same-origin', cache: 'no-store' })
  } catch {
    throw new DataError(dataMsg('errors.network'), 'network')
  }
  const body = (await res.json().catch(() => null)) as { url?: string; error?: { code?: string; message?: string } } | null
  if (!res.ok || !body?.url) {
    const code = body?.error?.code ?? String(res.status)
    throw new DataError(body?.error?.message ?? dataMsg('vault.downloadFailed'), code)
  }
  return body.url
}

/** Déclenche le téléchargement navigateur via une URL signée courte émise par le serveur. */
export async function downloadDocument(doc: Pick<VaultDocumentRecord, 'id'>): Promise<void> {
  const url = await documentFileUrl(doc, 'telecharger')
  const a = document.createElement('a')
  a.href = url
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/**
 * Aperçu dans un nouvel onglet (PDF, images ; les autres formats sont téléchargés).
 * L'onglet est ouvert AVANT l'appel réseau (sinon bloqué comme fenêtre surgissante),
 * puis refermé si le serveur refuse.
 */
export async function previewDocument(doc: Pick<VaultDocumentRecord, 'id'>): Promise<void> {
  const w = window.open('about:blank', '_blank')
  try {
    const url = await documentFileUrl(doc, 'apercu')
    if (w) {
      w.opener = null
      w.location.replace(url)
    } else {
      window.location.assign(url)
    }
  } catch (e) {
    w?.close()
    throw e
  }
}

// --- Partages ---------------------------------------------------------------

export type ShareItem = {
  id: string
  documentId: string
  docName: string
  label?: string
  expiresAt: string
  url: string
}

export function shareUrl(token: string): string {
  return `${window.location.origin}/api/partages/${token}`
}

export async function listActiveShares(): Promise<ShareItem[]> {
  const { data, error } = await db()
    .from('shares')
    .select('id, document_id, token, label, expires_at, revoked_at, download_count, created_at, documents(name)')
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: true })
    .limit(200)
  if (error) throw toDataError(error, 'vault.listShares')
  return ((data ?? []) as unknown as ShareRow[]).map((r) => {
    const d = Array.isArray(r.documents) ? r.documents[0] : r.documents
    return { id: r.id, documentId: r.document_id, docName: d?.name ?? 'Document', label: r.label ?? undefined, expiresAt: r.expires_at, url: shareUrl(r.token) }
  })
}

/** Crée un lien de partage expirable (par défaut 7 jours). */
export async function createShare(documentId: string, opts: { days?: number; label?: string } = {}): Promise<ShareItem> {
  const days = Math.min(Math.max(opts.days ?? 7, 1), 30)
  const userId = await requireUserId()
  const token = randomToken(32)
  const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString()
  const { data, error } = await db()
    .from('shares')
    .insert({ user_id: userId, document_id: documentId, token, expires_at: expiresAt, label: opts.label?.trim().slice(0, 120) || null })
    .select('id')
    .single()
  if (error) throw toDataError(error, 'vault.createShare')
  return { id: (data as { id: string }).id, documentId, docName: '', expiresAt, url: shareUrl(token) }
}

export async function revokeShare(id: string): Promise<void> {
  const { error } = await db().from('shares').update({ revoked_at: new Date().toISOString() }).eq('id', id).is('revoked_at', null)
  if (error) throw toDataError(error, 'vault.revokeShare')
}

/** « Expire dans 2 jours » / « dans 3 h » / « dans 15 min ». */
export function expiresInLabel(iso: string, now = Date.now()): string {
  const ms = new Date(iso).getTime() - now
  if (ms <= 0) return dataMsg('vault.expired')
  const min = Math.round(ms / 60_000)
  if (min < 60) return dataMsg('vault.expiresInMin', { n: min })
  const h = Math.round(min / 60)
  if (h < 48) return dataMsg('vault.expiresInHours', { n: h })
  return dataMsg('vault.expiresInDays', { n: Math.round(h / 24) })
}
