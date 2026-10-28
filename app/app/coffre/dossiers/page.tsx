'use client'

import { useTranslations } from 'next-intl'
import { Folder, FolderPlus, Users } from 'lucide-react'
import { ScreenHeader, headerIconBtn } from '@/components/coffre/ScreenHeader'
import { ListRow } from '@/components/coffre/ListRow'
import { DocRow } from '@/components/coffre/DocRow'
import { useFolders, useVaultDocs } from '@/components/coffre/store'
import { useAnnounce } from '@/components/coffre/useAnnounce'
import { useDocActions } from '@/components/coffre/useDocActions'
import { useFolderActions } from '@/components/coffre/useFolderActions'
import { btn } from '@/components/coffre/buttons'
import { ErrorState, LoadingState } from '@/components/mobile/StateScreens'
import { cn } from '@/lib/cn'
import { sharedRoots } from '@/lib/data/vault-folders'
import { useFolderSubtitle } from '@/components/coffre/i18n'

// Coffre-fort : dossiers (petit « drive »), dossiers partagés avec moi, documents sans dossier.
export default function DossiersPage() {
  const t = useTranslations('vault.folders')
  const tc = useTranslations('vault.common')
  const td = useTranslations('vault.docs')
  const folderSubtitle = useFolderSubtitle()
  const { folders, shares, sharedWithMe, initialLoading, error, refresh } = useFolders()
  const { docs, loading: docsLoading, error: docsError, refresh: refreshDocs } = useVaultDocs()
  const { announce, node } = useAnnounce()
  const { openActions, sheet } = useDocActions(announce, { onRemoved: refreshDocs })
  const actions = useFolderActions({ shares, refresh, announce })

  const mine = folders.filter((f) => f.mine && f.parentId === null).sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  const myDocs = docs.filter((d) => !d.sharedBy)
  const loose = myDocs.filter((d) => !d.folderId)
  const countIn = (id: string) => myDocs.filter((d) => d.folderId === id).length
  // Un dossier partagé dont l'ancêtre est aussi partagé avec moi n'apparaît qu'une fois.
  const sharedList = sharedRoots(sharedWithMe, folders)

  return (
    <>
      <ScreenHeader
        large
        title={t('list.title')}
        backHref="/app/coffre/documents"
        right={
          <button type="button" onClick={() => actions.openCreate(null)} aria-label={t('newFolder')} aria-haspopup="dialog" className={cn(headerIconBtn, '-mr-2')}>
            <FolderPlus className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
          </button>
        }
      />

      <div className="px-5 pb-8">
        <p className="text-[14px] leading-relaxed text-night-600">
          {t('list.lead')}
        </p>

        {initialLoading ? (
          <LoadingState compact title={t('list.loading')} description="" />
        ) : error ? (
          <ErrorState compact description={error.message} primary={{ label: tc('retry'), onClick: () => void refresh() }} />
        ) : (
          <>
            <section aria-labelledby="mes-dossiers" className="mt-5">
              <h2 id="mes-dossiers" className="text-[15px] font-extrabold text-night-900">{t('list.mine')}</h2>
              {mine.length === 0 ? (
                <div className="mt-2 rounded-2xl border border-dashed border-night-200 p-6 text-center">
                  <p className="text-[14px] font-bold text-night-900">{t('list.emptyTitle')}</p>
                  <p className="mt-1 text-[13px] text-night-500">{t('list.emptyText')}</p>
                  <button type="button" onClick={() => actions.openCreate(null)} aria-haspopup="dialog" className={cn(btn({ variant: 'secondary', full: false }), 'mt-4')}>
                    <FolderPlus className="h-5 w-5" aria-hidden="true" /> {t('newFolder')}
                  </button>
                </div>
              ) : (
                <ul className="mt-2 space-y-2.5">
                  {mine.map((f) => (
                    <li key={f.id}>
                      <ListRow
                        href={`/app/coffre/dossiers/${encodeURIComponent(f.id)}`}
                        icon={<Folder className="h-6 w-6 shrink-0 text-leaf-600" strokeWidth={1.9} aria-hidden="true" />}
                        title={f.name}
                        subtitle={folderSubtitle(f, folders, countIn(f.id), shares)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="partages-avec-moi" className="mt-7">
              <h2 id="partages-avec-moi" className="text-[15px] font-extrabold text-night-900">{t('list.sharedWithMe')}</h2>
              {sharedList.length === 0 ? (
                <p className="mt-2 text-[13px] text-night-500">
                  {t('list.sharedEmpty')}
                </p>
              ) : (
                <ul className="mt-2 space-y-2.5">
                  {sharedList.map((s) => {
                    const f = folders.find((x) => x.id === s.folderId)
                    return (
                      <li key={s.shareId}>
                        <ListRow
                          href={`/app/coffre/dossiers/${encodeURIComponent(s.folderId)}`}
                          icon={<Users className="h-6 w-6 shrink-0 text-iris-500" strokeWidth={1.9} aria-hidden="true" />}
                          title={f?.name ?? t('list.sharedFolder')}
                          subtitle={t('list.sharedBy', { name: s.ownerPrenom })}
                        />
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            <section aria-labelledby="sans-dossier" className="mt-7">
              <h2 id="sans-dossier" className="text-[15px] font-extrabold text-night-900">{t('list.loose')}</h2>
              {docsLoading ? (
                <LoadingState compact title={td('loading')} description="" />
              ) : docsError ? (
                <ErrorState compact description={docsError.message} primary={{ label: tc('retry'), onClick: () => void refreshDocs() }} />
              ) : myDocs.length === 0 ? (
                <p className="mt-2 text-[13px] text-night-500">{t('list.noDocs')}</p>
              ) : loose.length === 0 ? (
                <p className="mt-2 text-[13px] text-night-500">{t('list.allFiled')}</p>
              ) : (
                <ul className="mt-2 space-y-2.5 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
                  {loose.map((d) => <li key={d.id}><DocRow doc={d} onMore={openActions} /></li>)}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
      {actions.sheets}
      {sheet}
      {node}
    </>
  )
}
