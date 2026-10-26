'use client'

import Link from 'next/link'
import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Ellipsis, Folder, FolderPlus, Lock, Pencil, Plus, Share2, Trash2, Users } from 'lucide-react'
import { ActionSheet } from '@/components/ui'
import { ScreenHeader, headerIconBtn } from '@/components/coffre/ScreenHeader'
import { Breadcrumb } from '@/components/coffre/Breadcrumb'
import { ListRow } from '@/components/coffre/ListRow'
import { DocRow } from '@/components/coffre/DocRow'
import { StickyActions } from '@/components/coffre/StickyActions'
import { btn } from '@/components/coffre/buttons'
import { useFolderDocs, useFolders, useVaultDocs } from '@/components/coffre/store'
import { useAnnounce } from '@/components/coffre/useAnnounce'
import { useDocActions } from '@/components/coffre/useDocActions'
import { useFolderActions } from '@/components/coffre/useFolderActions'
import { ErrorState, LoadingState } from '@/components/mobile/StateScreens'
import { cn } from '@/lib/cn'
import { FOLDER_MAX_DEPTH, folderPath, folderSubtitle } from '@/lib/data/vault-folders'

// Coffre-fort : contenu d'un dossier (le mien, ou partagé avec moi en lecture seule).
export default function DossierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = use(params)
  const id = decodeURIComponent(rawId)
  const router = useRouter()
  const { folders, shares, initialLoading, error, refresh } = useFolders()
  const { docs: myDocs } = useVaultDocs()
  const { docs, loading: docsLoading, error: docsError, refresh: refreshDocs } = useFolderDocs(id)
  const { announce, node } = useAnnounce()
  const { openActions, sheet } = useDocActions(announce)
  const [menuOpen, setMenuOpen] = useState(false)
  const actions = useFolderActions({
    shares,
    refresh: async () => { await refresh(); await refreshDocs() },
    announce,
    // Quitter l'écran du dossier supprimé avant tout rechargement (pas d'écran « introuvable »).
    onDeleted: (f) => router.replace(f.parentId ? `/app/coffre/dossiers/${encodeURIComponent(f.parentId)}` : '/app/coffre/dossiers'),
  })

  const folder = folders.find((f) => f.id === id)

  // Écran de chargement au PREMIER chargement seulement : un rechargement (après un partage,
  // un renommage…) garde l'écran et ses feuilles ouvertes. Les feuilles sont toujours rendues.
  if (initialLoading) {
    return (
      <>
        <ScreenHeader title="Dossier" backHref="/app/coffre/dossiers" />
        <LoadingState compact title="Chargement du dossier" description="" />
        {actions.sheets}
      </>
    )
  }
  if (error && !folder) {
    return (
      <>
        <ScreenHeader title="Dossier" backHref="/app/coffre/dossiers" />
        <ErrorState compact description={error.message} primary={{ label: 'Réessayer', onClick: () => void refresh() }} secondary={{ label: 'Tous les dossiers', href: '/app/coffre/dossiers' }} />
        {actions.sheets}
      </>
    )
  }
  if (!folder) {
    return (
      <>
        {actions.sheets}
        <ScreenHeader title="Dossier" backHref="/app/coffre/dossiers" />
        <div className="px-6 pt-16 text-center">
          <p className="text-[16px] font-bold text-night-900">Dossier introuvable</p>
          <p className="mt-1 text-[13px] text-night-500">Il a peut-être été supprimé, ou son partage a été arrêté.</p>
          <Link href="/app/coffre/dossiers" className="mt-5 inline-flex h-11 items-center rounded-xl px-4 text-[14px] font-bold text-leaf-600 hover:bg-leaf-50">
            Voir tous les dossiers
          </Link>
        </div>
      </>
    )
  }

  const path = folderPath(folders, folder.id)
  const parentHref = folder.parentId && folders.some((f) => f.id === folder.parentId)
    ? `/app/coffre/dossiers/${encodeURIComponent(folder.parentId)}`
    : '/app/coffre/dossiers'
  const crumbs = [
    { label: 'Dossiers', href: '/app/coffre/dossiers' },
    ...path.map((f) => ({ label: f.name, href: `/app/coffre/dossiers/${encodeURIComponent(f.id)}` })),
  ]
  const children = folders.filter((f) => f.parentId === folder.id).sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  const readOnly = !folder.mine
  // Partages de ce dossier ou d'un dossier parent (le contenu est alors visible aussi).
  const pathIds = new Set(path.map((f) => f.id))
  const direct = shares.filter((s) => s.folderId === folder.id)
  const inherited = shares.filter((s) => s.folderId !== folder.id && pathIds.has(s.folderId))
  const canNest = path.length < FOLDER_MAX_DEPTH
  const countIn = (fid: string) => myDocs.filter((d) => !d.sharedBy && d.folderId === fid).length

  return (
    <>
      <ScreenHeader
        title={folder.name}
        backHref={parentHref}
        right={readOnly ? undefined : (
          <button type="button" onClick={() => setMenuOpen(true)} aria-label={`Actions du dossier ${folder.name}`} aria-haspopup="dialog" className={cn(headerIconBtn, '-mr-2')}>
            <Ellipsis className="h-6 w-6" aria-hidden="true" />
          </button>
        )}
      />

      <div className="px-5">
        <Breadcrumb items={crumbs} />

        {readOnly ? (
          <p role="note" className="mt-2 flex items-start gap-2.5 rounded-xl border border-iris-100 bg-iris-50/60 px-3.5 py-3 text-[13px] leading-relaxed text-night-800">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-iris-600" aria-hidden="true" />
            <span>
              <span className="font-bold text-night-900">Partagé par {folder.ownerPrenom ?? 'un parent lié'}, lecture seule.</span>{' '}
              Vous pouvez consulter et télécharger les documents. Seul {folder.ownerPrenom ?? 'son propriétaire'} peut les modifier.
            </span>
          </p>
        ) : (direct.length > 0 || inherited.length > 0) && (
          <div className="mt-2 flex items-start gap-2.5 rounded-xl border border-leaf-100 bg-leaf-50/60 px-3.5 py-3 text-[13px] leading-relaxed text-night-800">
            <Users className="mt-0.5 h-4 w-4 shrink-0 text-leaf-700" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              {direct.length > 0 && (
                <p><span className="font-bold text-night-900">Partagé avec {direct.map((s) => s.granteePrenom).join(', ')}</span> en lecture seule, y compris les documents ajoutés plus tard.</p>
              )}
              {inherited.length > 0 && (
                <p className={direct.length > 0 ? 'mt-1' : undefined}>
                  Visible aussi par {[...new Set(inherited.map((s) => s.granteePrenom))].join(', ')} : un dossier parent est partagé.
                </p>
              )}
              <button type="button" onClick={() => actions.openShare(folder)} aria-haspopup="dialog" className="mt-1 inline-flex min-h-[44px] items-center font-bold text-leaf-700 underline-offset-2 hover:underline">
                Gérer le partage
              </button>
            </div>
          </div>
        )}

        <section aria-labelledby="sous-dossiers" className="mt-5">
          <div className="flex items-center justify-between">
            <h2 id="sous-dossiers" className="text-[15px] font-extrabold text-night-900">Sous-dossiers</h2>
            {!readOnly && canNest && (
              <button type="button" onClick={() => actions.openCreate(folder.id)} aria-haspopup="dialog" className="-mr-2 inline-flex h-11 items-center gap-1 px-2 text-[13px] font-bold text-leaf-600">
                <FolderPlus className="h-4 w-4" aria-hidden="true" /> Nouveau
              </button>
            )}
          </div>
          {children.length === 0 ? (
            <p className="mt-1 text-[13px] text-night-500">Aucun sous-dossier.</p>
          ) : (
            <ul className="mt-2 space-y-2.5">
              {children.map((f) => (
                <li key={f.id}>
                  <ListRow
                    href={`/app/coffre/dossiers/${encodeURIComponent(f.id)}`}
                    icon={<Folder className={cn('h-6 w-6 shrink-0', readOnly ? 'text-iris-500' : 'text-leaf-600')} strokeWidth={1.9} aria-hidden="true" />}
                    title={f.name}
                    subtitle={readOnly
                      ? (() => { const n = folders.filter((x) => x.parentId === f.id).length; return n ? `${n} sous-dossier${n > 1 ? 's' : ''}` : 'Dossier' })()
                      : folderSubtitle(f, folders, countIn(f.id), shares)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="docs-dossier" className="mt-6">
          <h2 id="docs-dossier" className="text-[15px] font-extrabold text-night-900">Documents</h2>
          {docsLoading ? (
            <LoadingState compact title="Chargement des documents" description="" />
          ) : docsError ? (
            <ErrorState compact description={docsError.message} primary={{ label: 'Réessayer', onClick: () => void refreshDocs() }} />
          ) : docs.length === 0 ? (
            <p className="mt-2 rounded-2xl border border-dashed border-night-200 p-6 text-center text-[13px] text-night-500">
              {readOnly ? 'Ce dossier ne contient aucun document pour le moment.' : 'Aucun document dans ce dossier. Ajoutez-en un, ou rangez-y un document existant avec « Ranger dans un dossier ».'}
            </p>
          ) : (
            <ul className="mt-2 space-y-2.5 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
              {docs.map((d) => <li key={d.id}><DocRow doc={d} onMore={openActions} /></li>)}
            </ul>
          )}
        </section>
      </div>

      {!readOnly && (
        <StickyActions>
          <Link href={`/app/coffre/ajouter?dossier=${encodeURIComponent(folder.id)}`} className={btn({ variant: 'primary' })}>
            <Plus className="h-5 w-5" aria-hidden="true" /> Ajouter un document ici
          </Link>
        </StickyActions>
      )}

      <ActionSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={folder.name}
        actions={readOnly ? [] : [
          ...(canNest ? [{ key: 'sub', label: 'Nouveau sous-dossier', icon: <FolderPlus className="h-5 w-5" />, onClick: () => actions.openCreate(folder.id) }] : []),
          { key: 'rename', label: 'Renommer', icon: <Pencil className="h-5 w-5" />, onClick: () => actions.openRename(folder) },
          { key: 'share', label: 'Partager avec l’autre parent', icon: <Share2 className="h-5 w-5" />, onClick: () => actions.openShare(folder) },
          { key: 'del', label: 'Supprimer le dossier', icon: <Trash2 className="h-5 w-5" />, variant: 'danger' as const, onClick: () => actions.askDelete(folder) },
        ]}
      />
      {actions.sheets}
      {sheet}
      {node}
    </>
  )
}
