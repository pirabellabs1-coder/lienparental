/**
 * Dossiers du coffre-fort (0410) : types et aides PURES (aucune dépendance navigateur ni
 * Supabase), testées par tests/vault-folders.test.ts. Réexportées par lib/data/vault-folders.
 */

export type VaultFolder = {
  id: string
  name: string
  parentId: string | null
  ownerId: string
  /** Dossier qui m'appartient (sinon : partagé avec moi, lecture seule). */
  mine: boolean
  /** Prénom du propriétaire pour un dossier partagé avec moi. */
  ownerPrenom?: string
}

/** Partage actif d'un de MES dossiers. */
export type FolderShare = { id: string; folderId: string; granteeId: string; granteePrenom: string; createdAt: string }

/** Dossier racine qu'un autre parent partage avec moi. */
export type SharedWithMe = { shareId: string; folderId: string; ownerId: string; ownerPrenom: string; createdAt: string }

export const FOLDER_NAME_MAX = 60
export const FOLDER_MAX_DEPTH = 6

/**
 * Chemin racine → dossier (fil d'Ariane), limité aux dossiers fournis : s'arrête à un
 * parent absent (dossier partagé dont l'ancêtre n'est pas visible) et à un cycle.
 */
export function folderPath(folders: VaultFolder[], id: string | null): VaultFolder[] {
  const byId = new Map(folders.map((f) => [f.id, f]))
  const out: VaultFolder[] = []
  const seen = new Set<string>()
  let cur = id ? byId.get(id) : undefined
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    out.unshift(cur)
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return out
}

/** Arborescence aplatie (ordre alphabétique, profondeur) pour un sélecteur. */
export function flattenFolders(folders: VaultFolder[], rootId: string | null = null, depth = 0, seen = new Set<string>()): Array<VaultFolder & { depth: number }> {
  if (depth > 32) return []
  return folders
    .filter((f) => f.parentId === rootId && !seen.has(f.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    .flatMap((f) => {
      seen.add(f.id)
      return [{ ...f, depth }, ...flattenFolders(folders, f.id, depth + 1, seen)]
    })
}

/** Identifiants d'un dossier et de tous ses descendants (cycles tolérés). */
export function folderSubtreeIds(folders: VaultFolder[], id: string): Set<string> {
  const out = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const f of folders) {
      if (f.parentId && out.has(f.parentId) && !out.has(f.id)) { out.add(f.id); grew = true }
    }
  }
  return out
}

/** « 2 sous-dossiers · 3 documents ici · Partagé avec Thomas » (documents directement dans le dossier). */
export function folderSubtitle(f: VaultFolder, folders: VaultFolder[], docCount: number, shares: FolderShare[]): string {
  const subs = folders.filter((x) => x.parentId === f.id).length
  const parts = [
    subs > 0 ? `${subs} sous-dossier${subs > 1 ? 's' : ''}` : null,
    `${docCount} document${docCount > 1 ? 's' : ''} ici`,
  ]
  const with_ = shares.filter((s) => s.folderId === f.id).map((s) => s.granteePrenom)
  if (with_.length) parts.push(`Partagé avec ${with_.join(', ')}`)
  return parts.filter(Boolean).join(' · ')
}

/**
 * Prénoms des parents qui voient ce dossier (partage du dossier ou d'un ancêtre).
 * Sert à prévenir avant de ranger automatiquement des pièces dans un dossier partagé.
 */
export function folderAudience(folders: VaultFolder[], shares: FolderShare[], id: string | null): string[] {
  if (!id) return []
  const ids = new Set(folderPath(folders, id).map((f) => f.id))
  return [...new Set(shares.filter((s) => ids.has(s.folderId)).map((s) => s.granteePrenom))]
}

/**
 * « Partagés avec moi » : une seule entrée par arborescence. Un dossier partagé dont un
 * ancêtre visible est lui aussi partagé avec moi n'apparaît pas une seconde fois.
 */
export function sharedRoots(shared: SharedWithMe[], folders: VaultFolder[]): SharedWithMe[] {
  const roots = new Set(shared.map((s) => s.folderId))
  const seen = new Set<string>()
  return shared.filter((s) => {
    if (seen.has(s.folderId)) return false
    seen.add(s.folderId)
    return !folderPath(folders, s.folderId).slice(0, -1).some((a) => roots.has(a.id))
  })
}

/* ---- « Mettre au coffre-fort » : message selon le résultat --------------------- */

export type SaveOutcome = {
  /** Document créé par cette action (false : déjà présent dans le coffre). */
  created: boolean
  /** Rangé dans le dossier demandé (null : aucun dossier demandé). */
  placed: boolean | null
  /** Dossier où se trouve le document (nom), s'il est rangé. */
  folderName: string | null
}

export function saveOutcomeMessage(o: SaveOutcome): string {
  if (!o.created) {
    return o.folderName ? `Déjà dans votre coffre-fort (dossier « ${o.folderName} »)` : 'Déjà dans votre coffre-fort'
  }
  if (o.placed === false) return 'Ajouté au coffre-fort, mais pas dans le dossier choisi'
  return o.folderName ? `Pièce jointe ajoutée au coffre-fort, dossier « ${o.folderName} »` : 'Pièce jointe ajoutée au coffre-fort'
}
