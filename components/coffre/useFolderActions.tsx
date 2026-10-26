'use client'

import { useCallback, useState } from 'react'
import { ConfirmDialog } from '@/components/ui'
import { FolderNameSheet, ShareFolderSheet } from './FolderSheets'
import { listLinkedParents } from '@/lib/coparents/client'
import type { LinkedParent } from '@/lib/coparents/types'
import {
  createFolder, deleteFolder, renameFolder, shareFolder, unshareFolder,
  type FolderShare, type VaultFolder,
} from '@/lib/data/vault-folders'

/**
 * Actions sur MES dossiers (créer, renommer, partager, supprimer) et leurs feuilles.
 * Partagé par la liste des dossiers et l'écran d'un dossier.
 * Erreurs affichées DANS la feuille ouverte (role="alert") ; les annonces globales ne
 * sont émises qu'une fois la feuille refermée (création, renommage, suppression).
 */
export function useFolderActions({ shares, refresh, announce, onCreated, onDeleted }: {
  shares: FolderShare[]
  refresh: () => Promise<void>
  announce: (m: string) => void
  onCreated?: (f: VaultFolder) => void
  /** Suppression réussie : si fourni, appelé AVANT tout rechargement (ex. quitter l'écran). */
  onDeleted?: (f: VaultFolder) => void
}) {
  const [createIn, setCreateIn] = useState<{ parentId: string | null } | null>(null)
  const [renaming, setRenaming] = useState<VaultFolder | null>(null)
  const [sharing, setSharing] = useState<VaultFolder | null>(null)
  const [deleting, setDeleting] = useState<VaultFolder | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [parents, setParents] = useState<LinkedParent[] | null>(null)
  const [parentsError, setParentsError] = useState<string | null>(null)

  // Échec : affiché avec « Réessayer », jamais mis en cache comme « aucun parent lié ».
  const loadParents = useCallback(() => {
    setParentsError(null)
    setParents(null)
    listLinkedParents().then(setParents, (e: unknown) => {
      setParentsError(e instanceof Error && e.message ? e.message : 'Vérifiez votre connexion puis réessayez.')
    })
  }, [])

  const openShare = useCallback((f: VaultFolder) => {
    setSharing(f)
    if (parents === null || parentsError) loadParents()
  }, [parents, parentsError, loadParents])

  const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback)

  const sheets = (
    <>
      <FolderNameSheet
        open={createIn !== null}
        onClose={() => setCreateIn(null)}
        title={createIn?.parentId ? 'Nouveau sous-dossier' : 'Nouveau dossier'}
        submitLabel="Créer"
        onSubmit={async (name) => {
          try {
            const f = await createFolder(name, createIn?.parentId ?? null)
            setCreateIn(null)
            await refresh()
            announce(`Dossier « ${f.name} » créé`)
            onCreated?.(f)
            return null
          } catch (e) {
            return message(e, 'Création impossible. Réessayez.')
          }
        }}
      />
      <FolderNameSheet
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Renommer le dossier"
        initial={renaming?.name ?? ''}
        submitLabel="Enregistrer"
        onSubmit={async (name) => {
          if (!renaming) return null
          try {
            await renameFolder(renaming.id, name)
            setRenaming(null)
            await refresh()
            announce('Dossier renommé')
            return null
          } catch (e) {
            return message(e, 'Renommage impossible. Réessayez.')
          }
        }}
      />
      <ShareFolderSheet
        open={sharing !== null}
        onClose={() => setSharing(null)}
        folder={sharing}
        parents={parents}
        parentsError={parentsError}
        onRetryParents={loadParents}
        shares={shares.filter((s) => s.folderId === sharing?.id)}
        onShare={async (p) => {
          if (!sharing) return ''
          await shareFolder(sharing.id, { userId: p.userId, prenom: p.prenom })
          await refresh()
          return `Dossier partagé avec ${p.prenom}.`
        }}
        onUnshare={async (s) => {
          await unshareFolder(s.id)
          await refresh()
          return `Partage arrêté : ${s.granteePrenom} n’a plus accès au dossier.`
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => { setDeleting(null); setDeleteError(null) }}
        loading={deleteBusy}
        onConfirm={async () => {
          if (!deleting) return
          const f = deleting
          setDeleteBusy(true)
          setDeleteError(null)
          try {
            await deleteFolder(f.id)
            setDeleting(null)
            announce(`Dossier « ${f.name} » supprimé`)
            if (onDeleted) onDeleted(f)
            else await refresh()
          } catch (e) {
            setDeleteError(message(e, 'Suppression impossible. Réessayez.'))
          } finally {
            setDeleteBusy(false)
          }
        }}
        title="Supprimer ce dossier ?"
        description={deleting ? (
          <>
            « {deleting.name} » et ses sous-dossiers seront supprimés. Les documents qu’ils contiennent ne sont pas supprimés : ils reviennent dans le coffre-fort, sans dossier. Les partages de ce dossier s’arrêtent.
            {deleteError && <span role="alert" className="mt-2 block font-semibold text-alert-600">{deleteError}</span>}
          </>
        ) : ''}
        confirmLabel="Supprimer le dossier"
        tone="danger"
      />
    </>
  )

  return {
    openCreate: (parentId: string | null) => setCreateIn({ parentId }),
    openRename: setRenaming,
    openShare,
    askDelete: (f: VaultFolder) => { setDeleteError(null); setDeleting(f) },
    sheets,
  }
}
