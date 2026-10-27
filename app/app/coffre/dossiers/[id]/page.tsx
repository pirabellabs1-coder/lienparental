'use client'

import Link from 'next/link'
import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
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
import { FOLDER_MAX_DEPTH, folderPath } from '@/lib/data/vault-folders'
import { useFolderSubtitle } from '@/components/coffre/i18n'

// Coffre-fort : contenu d'un dossier (le mien, ou partagé avec moi en lecture seule).
export default function DossierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = use(params)
  const id = decodeURIComponent(rawId)
  const router = useRouter()
  const t = useTranslations('vault.folders')
  const tc = useTranslations('vault.common')
  const td = useTranslations('vault.docs')
  const folderSubtitle = useFolderSubtitle()
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
        <ScreenHeader title={t('detail.title')} backHref="/app/coffre/dossiers" />
        <LoadingState compact title={t('detail.loading')} description="" />
        {actions.sheets}
      </>
    )
  }
  if (error && !folder) {
    return (
      <>
        <ScreenHeader title={t('detail.title')} backHref="/app/coffre/dossiers" />
        <ErrorState compact description={error.message} primary={{ label: tc('retry'), onClick: () => void refresh() }} secondary={{ label: t('detail.allFolders'), href: '/app/coffre/dossiers' }} />
        {actions.sheets}
      </>
    )
  }
  if (!folder) {
    return (
      <>
        {actions.sheets}
        <ScreenHeader title={t('detail.title')} backHref="/app/coffre/dossiers" />
        <div className="px-6 pt-16 text-center">
          <p className="text-[16px] font-bold text-night-900">{t('detail.notFound')}</p>
          <p className="mt-1 text-[13px] text-night-500">{t('detail.notFoundText')}</p>
          <Link href="/app/coffre/dossiers" className="mt-5 inline-flex h-11 items-center rounded-xl px-4 text-[14px] font-bold text-leaf-600 hover:bg-leaf-50">
            {t('detail.seeAll')}
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
    { label: t('list.title'), href: '/app/coffre/dossiers' },
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
          <button type="button" onClick={() => setMenuOpen(true)} aria-label={t('detail.actionsAria', { name: folder.name })} aria-haspopup="dialog" className={cn(headerIconBtn, '-mr-2')}>
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
              <span className="font-bold text-night-900">{t('detail.sharedByTitle', { name: folder.ownerPrenom ?? t('detail.aLinkedParent') })}</span>{' '}
              {t('detail.sharedByText', { name: folder.ownerPrenom ?? t('detail.itsOwner') })}
            </span>
          </p>
        ) : (direct.length > 0 || inherited.length > 0) && (
          <div className="mt-2 flex items-start gap-2.5 rounded-xl border border-leaf-100 bg-leaf-50/60 px-3.5 py-3 text-[13px] leading-relaxed text-night-800">
            <Users className="mt-0.5 h-4 w-4 shrink-0 text-leaf-700" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              {direct.length > 0 && (
                <p><span className="font-bold text-night-900">{t('detail.sharedWithTitle', { names: direct.map((s) => s.granteePrenom).join(', ') })}</span>{t('detail.sharedWithText')}</p>
              )}
              {inherited.length > 0 && (
                <p className={direct.length > 0 ? 'mt-1' : undefined}>
                  {t('detail.inherited', { names: [...new Set(inherited.map((s) => s.granteePrenom))].join(', ') })}
                </p>
              )}
              <button type="button" onClick={() => actions.openShare(folder)} aria-haspopup="dialog" className="mt-1 inline-flex min-h-[44px] items-center font-bold text-leaf-700 underline-offset-2 hover:underline">
                {t('detail.manageShare')}
              </button>
            </div>
          </div>
        )}

        <section aria-labelledby="sous-dossiers" className="mt-5">
          <div className="flex items-center justify-between">
            <h2 id="sous-dossiers" className="text-[15px] font-extrabold text-night-900">{t('detail.subfolders')}</h2>
            {!readOnly && canNest && (
              <button type="button" onClick={() => actions.openCreate(folder.id)} aria-haspopup="dialog" className="-mr-2 inline-flex h-11 items-center gap-1 px-2 text-[13px] font-bold text-leaf-600">
                <FolderPlus className="h-4 w-4" aria-hidden="true" /> {t('detail.new')}
              </button>
            )}
          </div>
          {children.length === 0 ? (
            <p className="mt-1 text-[13px] text-night-500">{t('detail.noSubfolders')}</p>
          ) : (
            <ul className="mt-2 space-y-2.5">
              {children.map((f) => (
                <li key={f.id}>
                  <ListRow
                    href={`/app/coffre/dossiers/${encodeURIComponent(f.id)}`}
                    icon={<Folder className={cn('h-6 w-6 shrink-0', readOnly ? 'text-iris-500' : 'text-leaf-600')} strokeWidth={1.9} aria-hidden="true" />}
                    title={f.name}
                    subtitle={readOnly
                      ? (() => { const n = folders.filter((x) => x.parentId === f.id).length; return n ? t('subCount', { count: n }) : t('detail.folder') })()
                      : folderSubtitle(f, folders, countIn(f.id), shares)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="docs-dossier" className="mt-6">
          <h2 id="docs-dossier" className="text-[15px] font-extrabold text-night-900">{tc('documents')}</h2>
          {docsLoading ? (
            <LoadingState compact title={td('loading')} description="" />
          ) : docsError ? (
            <ErrorState compact description={docsError.message} primary={{ label: tc('retry'), onClick: () => void refreshDocs() }} />
          ) : docs.length === 0 ? (
            <p className="mt-2 rounded-2xl border border-dashed border-night-200 p-6 text-center text-[13px] text-night-500">
              {readOnly ? t('detail.emptyReadOnly') : t('detail.empty')}
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
            <Plus className="h-5 w-5" aria-hidden="true" /> {t('detail.addHere')}
          </Link>
        </StickyActions>
      )}

      <ActionSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={folder.name}
        actions={readOnly ? [] : [
          ...(canNest ? [{ key: 'sub', label: t('newSubfolder'), icon: <FolderPlus className="h-5 w-5" />, onClick: () => actions.openCreate(folder.id) }] : []),
          { key: 'rename', label: t('detail.rename'), icon: <Pencil className="h-5 w-5" />, onClick: () => actions.openRename(folder) },
          { key: 'share', label: t('detail.shareWithOther'), icon: <Share2 className="h-5 w-5" />, onClick: () => actions.openShare(folder) },
          { key: 'del', label: t('deleteConfirm'), icon: <Trash2 className="h-5 w-5" />, variant: 'danger' as const, onClick: () => actions.askDelete(folder) },
        ]}
      />
      {actions.sheets}
      {sheet}
      {node}
    </>
  )
}
