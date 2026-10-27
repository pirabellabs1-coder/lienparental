'use client'

/**
 * Coffre-fort « petit drive » : dossiers, partage d'un dossier avec un parent lié,
 * réglage du rangement automatique des pièces jointes de la messagerie.
 *
 * Supabase (0410, 0420) :
 * - `vault_folders` : dossiers et sous-dossiers (6 niveaux), écriture par le propriétaire seul.
 * - `vault_folder_shares` : partage d'un dossier avec UN parent lié, lecture seule pour lui.
 *   Le dossier, ses sous-dossiers et leurs documents (même ajoutés plus tard) lui sont
 *   visibles tant que le partage n'est pas arrêté et que les parents restent liés
 *   (RLS + politique Storage ; fichiers servis par app/api/coffre/fichier/[id]).
 * - `documents.folder_id` : NULL = racine. Supprimer un dossier remet ses documents à la racine.
 * - `vault_settings` : `auto_import_messages` (false par défaut) + dossier cible facultatif.
 *
 * Démo : dossiers d'exemple en sessionStorage (aucune écriture distante), dont un dossier
 * partagé par Thomas (lib/coparents/demo) et un dossier que vous partagez avec lui.
 */
import { z } from 'zod'
import { VAULT_DOCS } from '@/lib/mock-vault'
import { DEMO_ME, DEMO_OTHER } from '@/components/messages/seed'
import { DataError, LIVE, dataMsg, db, requireUserId, toDataError } from './core'
import { familyAuthorNames, sharedByLabel } from './family'
import { kickNotifications } from '@/lib/notify/client'
import type { VaultDocumentRecord } from './vault'

// --- Types ------------------------------------------------------------------

import {
  FOLDER_MAX_DEPTH, FOLDER_NAME_MAX, folderPath, folderSubtreeIds,
  type FolderShare, type SharedWithMe, type VaultFolder,
} from '@/lib/vault/folder-tree'

export {
  FOLDER_MAX_DEPTH, FOLDER_NAME_MAX, flattenFolders, folderAudience, folderPath, folderSubtitle, folderSubtreeIds,
  saveOutcomeMessage, sharedRoots,
  type FolderShare, type SaveOutcome, type SharedWithMe, type VaultFolder,
} from '@/lib/vault/folder-tree'

export type VaultSettings = { autoImportMessages: boolean; autoImportFolderId: string | null }

export const DEFAULT_VAULT_SETTINGS: VaultSettings = { autoImportMessages: false, autoImportFolderId: null }

const nameSchema = () => z.string().trim().min(1, dataMsg('folders.nameRequired')).max(FOLDER_NAME_MAX, dataMsg('folders.nameMax', { max: FOLDER_NAME_MAX }))
  .refine((v) => !/[\u0000-\u001f\u007f]/.test(v), dataMsg('folders.nameInvalid'))
const idSchema = z.string().uuid()

type FolderRow = { id: string; user_id: string; parent_id: string | null; name: string }
type ShareRow = { id: string; folder_id: string; owner_id: string; grantee_id: string; created_at: string }
type SettingsRow = { auto_import_messages: boolean; auto_import_folder_id: string | null }

/** Erreurs Postgres des garde-fous 0410 → messages français. */
function folderError(err: unknown, op: string): DataError {
  const e = (err ?? {}) as { code?: string; hint?: string }
  if (e.code === '23505') return new DataError(dataMsg('folders.nameTaken'), e.code)
  if (e.hint === 'vault_folder_depth') return new DataError(dataMsg('folders.maxDepth', { max: FOLDER_MAX_DEPTH }), 'depth')
  if (e.hint === 'vault_folder_cycle') return new DataError(dataMsg('folders.cycle'), 'cycle')
  if (e.code === '23503') return new DataError(dataMsg('folders.gone'), e.code)
  return toDataError(err, op)
}

// --- Démo (sessionStorage) -----------------------------------------------------

const DEMO_KEY = 'lp.coffre.dossiers.v1'
const AM = 'f_demo_am'
const AM_CONTRATS = 'f_demo_am_contrats'
const ECOLE = 'f_demo_ecole'
const THOMAS_ACTIVITES = 'f_demo_thomas_activites'

type DemoState = {
  folders: VaultFolder[]
  /** Dossier de chaque document de démonstration (id → dossier ou null). */
  docFolders: Record<string, string | null>
  shares: FolderShare[]
  settings: VaultSettings
}

/** Documents d'exemple rangés dans les dossiers de démonstration. */
export const FOLDER_DEMO_DOCS: VaultDocumentRecord[] = [
  {
    id: 'v_am_1', name: 'Contrat de travail de l’assistante maternelle', type: 'pdf', ext: 'PDF', size: 356_000,
    docDate: '2026-01-05', addedAt: '2026-01-05', addedTime: '20:14', categoryId: 'finances', tone: 'red',
    source: 'Rédigé par moi', confidentialite: 'prive', folderId: AM_CONTRATS,
  },
  {
    id: 'v_am_2', name: 'Attestation Pajemploi de septembre', type: 'pdf', ext: 'PDF', size: 128_000,
    docDate: '2026-10-02', addedAt: '2026-10-03', addedTime: '08:40', categoryId: 'finances', tone: 'red',
    source: 'Pajemploi', confidentialite: 'prive', folderId: AM,
  },
  {
    id: 'v_thomas_1', name: 'Inscription au judo de Noah', type: 'pdf', ext: 'PDF', size: 210_000,
    docDate: '2026-09-12', addedAt: '2026-09-12', addedTime: '19:02', categoryId: 'autres', tone: 'red',
    source: 'Club de judo de Matoury', confidentialite: 'prive', folderId: THOMAS_ACTIVITES,
    sharedBy: { prenom: DEMO_OTHER.prenom },
  },
]

function demoSeed(): DemoState {
  return {
    folders: [
      { id: AM, name: 'Assistante maternelle', parentId: null, ownerId: DEMO_ME.id, mine: true },
      { id: AM_CONTRATS, name: 'Contrats', parentId: AM, ownerId: DEMO_ME.id, mine: true },
      { id: ECOLE, name: 'École', parentId: null, ownerId: DEMO_ME.id, mine: true },
      { id: THOMAS_ACTIVITES, name: 'Activités de Noah', parentId: null, ownerId: DEMO_OTHER.id, mine: false, ownerPrenom: DEMO_OTHER.prenom },
    ],
    docFolders: { v3: ECOLE, v6: ECOLE },
    shares: [{ id: 's_demo_am', folderId: AM, granteeId: DEMO_OTHER.id, granteePrenom: DEMO_OTHER.prenom, createdAt: '2026-10-01T08:00:00.000Z' }],
    settings: { ...DEFAULT_VAULT_SETTINGS },
  }
}

let demoMemory: DemoState | null = null

function demoRead(): DemoState {
  if (typeof window === 'undefined') return demoSeed()
  try {
    const raw = window.sessionStorage.getItem(DEMO_KEY)
    if (raw) {
      const v = JSON.parse(raw) as DemoState
      if (Array.isArray(v.folders) && Array.isArray(v.shares) && v.docFolders && v.settings) return v
    }
  } catch { /* stockage indisponible ou corrompu : état en mémoire */ }
  return demoMemory ?? (demoMemory = demoSeed())
}

function demoWrite(s: DemoState) {
  demoMemory = s
  try { window.sessionStorage.setItem(DEMO_KEY, JSON.stringify(s)) } catch { /* mémoire seule */ }
}

function demoId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

/** Démo : dossier d'un document (surcharges de session, sinon valeur du document). */
export function demoFolderOf(doc: Pick<VaultDocumentRecord, 'id' | 'folderId'>): string | null {
  if (LIVE) return doc.folderId ?? null
  const s = demoRead()
  const id = doc.id in s.docFolders ? s.docFolders[doc.id] : (doc.folderId ?? null)
  // Dossier supprimé entre-temps (y compris pour les pièces rangées depuis la messagerie,
  // stockées ailleurs) : le document revient à la racine, comme `on delete set null`.
  return id && s.folders.some((f) => f.id === id) ? id : null
}

// --- Dossiers ---------------------------------------------------------------------

/** Tous les dossiers visibles : les miens + ceux partagés avec moi (et leurs sous-dossiers). */
export async function listFolders(): Promise<VaultFolder[]> {
  if (!LIVE) return demoRead().folders
  const [me, names, res] = await Promise.all([
    requireUserId(),
    familyAuthorNames(),
    db().from('vault_folders').select('id, user_id, parent_id, name').order('name').limit(2000),
  ])
  if (res.error) throw toDataError(res.error, 'vault.listFolders')
  return ((res.data ?? []) as FolderRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    parentId: r.parent_id,
    ownerId: r.user_id,
    mine: r.user_id === me,
    ...(r.user_id === me ? {} : { ownerPrenom: sharedByLabel(names.get(r.user_id)) }),
  }))
}

export async function createFolder(name: string, parentId: string | null): Promise<VaultFolder> {
  const n = nameSchema().safeParse(name)
  if (!n.success) throw new DataError(n.error.issues[0]?.message ?? dataMsg('folders.nameInvalid'), 'invalid')
  if (!LIVE) {
    const s = demoRead()
    const clash = s.folders.some((f) => f.mine && f.parentId === parentId && f.name.toLocaleLowerCase('fr') === n.data.toLocaleLowerCase('fr'))
    if (clash) throw new DataError(dataMsg('folders.nameTaken'), '23505')
    if (folderPath(s.folders, parentId).length >= FOLDER_MAX_DEPTH) throw new DataError(dataMsg('folders.maxDepth', { max: FOLDER_MAX_DEPTH }), 'depth')
    const f: VaultFolder = { id: demoId('f'), name: n.data, parentId, ownerId: DEMO_ME.id, mine: true }
    demoWrite({ ...s, folders: [...s.folders, f] })
    return f
  }
  if (parentId !== null && !idSchema.safeParse(parentId).success) throw new DataError(dataMsg('folders.parentInvalid'), 'invalid')
  const userId = await requireUserId()
  const { data, error } = await db()
    .from('vault_folders')
    .insert({ user_id: userId, parent_id: parentId, name: n.data })
    .select('id, user_id, parent_id, name')
    .single()
  if (error) throw folderError(error, 'vault.createFolder')
  const r = data as FolderRow
  return { id: r.id, name: r.name, parentId: r.parent_id, ownerId: r.user_id, mine: true }
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const n = nameSchema().safeParse(name)
  if (!n.success) throw new DataError(n.error.issues[0]?.message ?? dataMsg('folders.nameInvalid'), 'invalid')
  if (!LIVE) {
    const s = demoRead()
    const target = s.folders.find((f) => f.id === id && f.mine)
    if (!target) throw new DataError('Dossier introuvable.', 'P0002')
    const clash = s.folders.some((f) => f.mine && f.id !== id && f.parentId === target.parentId && f.name.toLocaleLowerCase('fr') === n.data.toLocaleLowerCase('fr'))
    if (clash) throw new DataError(dataMsg('folders.nameTaken'), '23505')
    demoWrite({ ...s, folders: s.folders.map((f) => (f.id === id ? { ...f, name: n.data } : f)) })
    return
  }
  const userId = await requireUserId()
  const { data, error } = await db().from('vault_folders').update({ name: n.data }).eq('id', id).eq('user_id', userId).select('id')
  if (error) throw folderError(error, 'vault.renameFolder')
  if (!data || data.length === 0) throw new DataError(dataMsg('folders.ownerRename'), 'not_owner')
}

/** Supprime un dossier et ses sous-dossiers ; leurs documents reviennent à la racine du coffre. */
export async function deleteFolder(id: string): Promise<void> {
  if (!LIVE) {
    const s = demoRead()
    if (!s.folders.some((f) => f.id === id && f.mine)) throw new DataError('Dossier introuvable.', 'P0002')
    const gone = folderSubtreeIds(s.folders, id)
    const docFolders = { ...s.docFolders }
    for (const d of [...VAULT_DOCS, ...FOLDER_DEMO_DOCS]) {
      if (gone.has(demoFolderOf(d) ?? '')) docFolders[d.id] = null
    }
    for (const [k, v] of Object.entries(docFolders)) if (v && gone.has(v)) docFolders[k] = null
    demoWrite({
      ...s,
      folders: s.folders.filter((f) => !gone.has(f.id)),
      shares: s.shares.filter((x) => !gone.has(x.folderId)),
      docFolders,
      settings: s.settings.autoImportFolderId && gone.has(s.settings.autoImportFolderId)
        ? { ...s.settings, autoImportFolderId: null }
        : s.settings,
    })
    return
  }
  const userId = await requireUserId()
  const { data, error } = await db().from('vault_folders').delete().eq('id', id).eq('user_id', userId).select('id')
  if (error) throw folderError(error, 'vault.deleteFolder')
  if (!data || data.length === 0) throw new DataError(dataMsg('folders.ownerDelete'), 'not_owner')
}

/** Range un de MES documents dans un de MES dossiers (null = racine). */
export async function moveDocumentToFolder(documentId: string, folderId: string | null): Promise<void> {
  if (!LIVE) {
    const s = demoRead()
    if (folderId && !s.folders.some((f) => f.id === folderId && f.mine)) throw new DataError('Dossier introuvable.', 'P0002')
    demoWrite({ ...s, docFolders: { ...s.docFolders, [documentId]: folderId } })
    return
  }
  if (folderId !== null && !idSchema.safeParse(folderId).success) throw new DataError(dataMsg('folders.folderInvalid'), 'invalid')
  const userId = await requireUserId()
  const { data, error } = await db().from('documents').update({ folder_id: folderId }).eq('id', documentId).eq('user_id', userId).select('id')
  if (error) throw folderError(error, 'vault.moveToFolder')
  if (!data || data.length === 0) throw new DataError(dataMsg('folders.notAuthorMove'), 'not_author')
}

// --- Partages ---------------------------------------------------------------------

/** Partages actifs de MES dossiers. */
export async function listMyFolderShares(): Promise<FolderShare[]> {
  if (!LIVE) return demoRead().shares
  const [me, names] = await Promise.all([requireUserId(), familyAuthorNames()])
  const { data, error } = await db()
    .from('vault_folder_shares')
    .select('id, folder_id, owner_id, grantee_id, created_at')
    .eq('owner_id', me)
    .is('revoked_at', null)
    .order('created_at')
    .limit(500)
  if (error) throw toDataError(error, 'vault.listFolderShares')
  return ((data ?? []) as ShareRow[]).map((r) => ({
    id: r.id, folderId: r.folder_id, granteeId: r.grantee_id, createdAt: r.created_at,
    granteePrenom: sharedByLabel(names.get(r.grantee_id)),
  }))
}

/** Dossiers que d'autres parents partagent avec moi (racines du partage). */
export async function listSharedWithMe(): Promise<SharedWithMe[]> {
  if (!LIVE) {
    return demoRead().folders
      .filter((f) => !f.mine && f.parentId === null)
      .map((f) => ({ shareId: `s_${f.id}`, folderId: f.id, ownerId: f.ownerId, ownerPrenom: f.ownerPrenom ?? dataMsg('family.linkedParent'), createdAt: '2026-09-12T19:00:00.000Z' }))
  }
  const [me, names] = await Promise.all([requireUserId(), familyAuthorNames()])
  const { data, error } = await db()
    .from('vault_folder_shares')
    .select('id, folder_id, owner_id, grantee_id, created_at')
    .eq('grantee_id', me)
    .is('revoked_at', null)
    .order('created_at')
    .limit(500)
  if (error) throw toDataError(error, 'vault.listSharedWithMe')
  return ((data ?? []) as ShareRow[]).map((r) => ({
    shareId: r.id, folderId: r.folder_id, ownerId: r.owner_id, createdAt: r.created_at,
    ownerPrenom: sharedByLabel(names.get(r.owner_id)),
  }))
}

/** Partage un de mes dossiers (et ses sous-dossiers) avec un parent lié, en lecture seule. */
export async function shareFolder(folderId: string, grantee: { userId: string; prenom: string }): Promise<FolderShare> {
  if (!LIVE) {
    const s = demoRead()
    if (s.shares.some((x) => x.folderId === folderId && x.granteeId === grantee.userId)) {
      throw new DataError(dataMsg('folders.alreadyShared'), '23505')
    }
    const share: FolderShare = { id: demoId('s'), folderId, granteeId: grantee.userId, granteePrenom: grantee.prenom, createdAt: new Date().toISOString() }
    demoWrite({ ...s, shares: [...s.shares, share] })
    return share
  }
  if (!idSchema.safeParse(folderId).success || !idSchema.safeParse(grantee.userId).success) throw new DataError(dataMsg('folders.shareInvalid'), 'invalid')
  const me = await requireUserId()
  const { data, error } = await db()
    .from('vault_folder_shares')
    .insert({ folder_id: folderId, owner_id: me, grantee_id: grantee.userId })
    .select('id, folder_id, owner_id, grantee_id, created_at')
    .single()
  if (error) {
    const code = (error as { code?: string }).code
    if (code === '23505') throw new DataError(dataMsg('folders.alreadyShared'), code)
    if (code === '42501') throw new DataError(dataMsg('folders.shareNotLinked'), code)
    throw folderError(error, 'vault.shareFolder')
  }
  const r = data as ShareRow
  kickNotifications()
  return { id: r.id, folderId: r.folder_id, granteeId: r.grantee_id, granteePrenom: grantee.prenom, createdAt: r.created_at }
}

/** Arrête un partage : l'autre parent perd l'accès immédiatement. */
export async function unshareFolder(shareId: string): Promise<void> {
  if (!LIVE) {
    const s = demoRead()
    demoWrite({ ...s, shares: s.shares.filter((x) => x.id !== shareId) })
    return
  }
  const me = await requireUserId()
  const { data, error } = await db()
    .from('vault_folder_shares')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', shareId)
    .eq('owner_id', me)
    .is('revoked_at', null)
    .select('id')
  if (error) throw toDataError(error, 'vault.unshareFolder')
  if (!data || data.length === 0) throw new DataError(dataMsg('folders.shareAlreadyStopped'), 'P0002')
}

// --- Documents d'un dossier (démo) -----------------------------------------------------

/** Démo : documents de démonstration avec leur dossier courant. */
export function demoDocsWithFolders(docs: VaultDocumentRecord[]): VaultDocumentRecord[] {
  return docs.map((d) => ({ ...d, folderId: demoFolderOf(d) }))
}

// --- Réglages -------------------------------------------------------------------------

export async function getVaultSettings(): Promise<VaultSettings> {
  if (!LIVE) return demoRead().settings
  const { data, error } = await db().from('vault_settings').select('auto_import_messages, auto_import_folder_id').maybeSingle()
  if (error) throw toDataError(error, 'vault.getSettings')
  const r = data as SettingsRow | null
  return r ? { autoImportMessages: r.auto_import_messages, autoImportFolderId: r.auto_import_folder_id } : { ...DEFAULT_VAULT_SETTINGS }
}

export async function saveVaultSettings(next: VaultSettings): Promise<VaultSettings> {
  const folderId = next.autoImportFolderId
  if (!LIVE) {
    const s = demoRead()
    const settings = { autoImportMessages: next.autoImportMessages, autoImportFolderId: folderId && s.folders.some((f) => f.id === folderId && f.mine) ? folderId : null }
    demoWrite({ ...s, settings })
    return settings
  }
  if (folderId !== null && !idSchema.safeParse(folderId).success) throw new DataError(dataMsg('folders.folderInvalid'), 'invalid')
  const userId = await requireUserId()
  const { data, error } = await db()
    .from('vault_settings')
    .upsert({ user_id: userId, auto_import_messages: next.autoImportMessages, auto_import_folder_id: folderId }, { onConflict: 'user_id' })
    .select('auto_import_messages, auto_import_folder_id')
    .single()
  if (error) throw folderError(error, 'vault.saveSettings')
  const r = data as SettingsRow
  return { autoImportMessages: r.auto_import_messages, autoImportFolderId: r.auto_import_folder_id }
}
