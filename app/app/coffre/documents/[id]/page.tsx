'use client'

import Link from 'next/link'
import { Suspense, use, useEffect, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  CalendarDays, ChevronRight, Clock, Download, Eye, FileText, Folder, FolderInput, FolderOpen,
  HardDrive, Landmark, Lock, Pencil, Share2, Trash2,
} from 'lucide-react'
import { Button, Input, Modal } from '@/components/ui'
import { ScreenHeader, headerIconBtn } from '@/components/coffre/ScreenHeader'
import { FileIcon } from '@/components/coffre/FileIcon'
import { CategoryIcon } from '@/components/coffre/CategoryIcon'
import { useCategories, useDeletedDocs, useFolders, useVaultDoc } from '@/components/coffre/store'
import { FolderPickerSheet } from '@/components/coffre/FolderSheets'
import { folderPath, moveDocumentToFolder } from '@/lib/data/vault-folders'
import { LoadingState } from '@/components/mobile/StateScreens'
import { moveDocument, renameDocument, updateDocDate } from '@/lib/data/vault'
import { todayKey } from '@/lib/tz'
import { useAnnounce } from '@/components/coffre/useAnnounce'
import { shareDocument, startDownload, startPreview } from '@/components/coffre/useDocActions'
import { SharedByBadge } from '@/components/famille/SharedByBadge'
import { useVaultI18n } from '@/components/coffre/i18n'
import { cn } from '@/lib/cn'

function InfoRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-2.5">
      <span aria-hidden="true" className="mt-0.5 text-night-500">{icon}</span>
      <div className="min-w-0 flex-1">
        <dt className="text-[12px] font-semibold text-night-500">{label}</dt>
        <dd className="text-[14px] text-night-900">{children}</dd>
      </div>
    </div>
  )
}

function ActionRow({ icon, label, onClick, href, danger }: { icon: ReactNode; label: string; onClick?: () => void; href?: string; danger?: boolean }) {
  const cls = cn(
    'flex min-h-[52px] w-full items-center gap-3 px-1 text-left text-[14.5px] font-semibold transition-colors hover:bg-night-50/60',
    danger ? 'text-alert-600' : 'text-night-900',
  )
  const inner = (
    <>
      <span aria-hidden="true" className={danger ? 'text-alert-500' : 'text-night-700'}>{icon}</span>
      <span className="flex-1">{label}</span>
      <ChevronRight className={cn('h-5 w-5', danger ? 'text-alert-400' : 'text-night-400')} aria-hidden="true" />
    </>
  )
  return href ? <Link href={href} className={cls}>{inner}</Link> : <button type="button" onClick={onClick} className={cls}>{inner}</button>
}

function DocumentDetail({ id }: { id: string }) {
  const t = useTranslations('vault.docDetail')
  const tc = useTranslations('vault.common')
  const ta = useTranslations('vault.docActions')
  const f = useVaultI18n()
  const params = useSearchParams()
  const { doc: base, loading } = useVaultDoc(id)
  const { categories } = useCategories()
  const { deleted, ready } = useDeletedDocs()
  const { announce, node } = useAnnounce()

  const [name, setName] = useState(base?.name ?? '')
  const [draftName, setDraftName] = useState(name)
  const [categoryId, setCategoryId] = useState(base?.categoryId ?? '')
  const [moveTo, setMoveTo] = useState(categoryId)
  const [renameOpen, setRenameOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [docDate, setDocDate] = useState(base?.docDate ?? '')
  const [draftDate, setDraftDate] = useState(docDate)
  const [dateOpen, setDateOpen] = useState(false)
  const isPhoto = base?.type === 'image'
  const { folders } = useFolders()
  // Dossier : celui du document (qui peut arriver après coup, ex. démo après montage),
  // sauf une fois rangé ici (valeur locale). `undefined` = pas encore modifié ici.
  const [folderOverride, setFolderOverride] = useState<string | null | undefined>(undefined)
  const folderId = folderOverride !== undefined ? folderOverride : (base?.folderId ?? null)
  const [folderOpen, setFolderOpen] = useState(false)

  // Document partagé par un autre adulte : lecture seule (aucune modale de modification).
  const readOnly = Boolean(base?.sharedBy)
  // ?deplacer=1 / ?dossier=1 : ouvre la feuille UNE fois (dépendances stables : l'objet
  // document peut être recréé à chaque rendu), puis retire le paramètre de l'adresse.
  const intent = params.get('dossier') === '1' ? 'dossier' : params.get('deplacer') === '1' ? 'deplacer' : null
  const handledIntent = useRef(false)
  const baseReady = Boolean(base)
  useEffect(() => {
    if (!intent || !baseReady || handledIntent.current) return
    handledIntent.current = true
    if (!readOnly) {
      if (intent === 'dossier') setFolderOpen(true)
      else setMoveOpen(true)
    }
    window.history.replaceState(window.history.state, '', window.location.pathname)
  }, [intent, baseReady, readOnly])

  // Supabase : le document arrive après montage → on synchronise l'état local une fois chargé.
  const baseId = base?.id
  useEffect(() => {
    if (!base) return
    setName(base.name)
    setDraftName(base.name)
    setCategoryId(base.categoryId)
    setMoveTo(base.categoryId)
    setDocDate(base.docDate)
    setDraftDate(base.docDate)
    setFolderOverride(undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseId])

  if (!base && loading) {
    return (
      <>
        <ScreenHeader title={t('title')} backHref="/app/coffre/documents" />
        <LoadingState compact title={t('loading')} description="" />
      </>
    )
  }

  if (!base || (ready && deleted.includes(id))) {
    return (
      <>
        <ScreenHeader title={t('title')} backHref="/app/coffre/documents" />
        <div className="px-6 pt-16 text-center">
          <p className="text-[16px] font-bold text-night-900">{t('notFound')}</p>
          <p className="mt-1 text-[13px] text-night-500">{t('notFoundText')}</p>
          <Link href="/app/coffre/documents/tous" className="mt-5 inline-flex h-11 items-center rounded-xl px-4 text-[14px] font-bold text-leaf-600 hover:bg-leaf-50">
            {t('seeAll')}
          </Link>
        </div>
      </>
    )
  }

  const category = categories.find((c) => c.id === categoryId)
  const folderTrail = folderPath(folders, folderId)
  const doc = { ...base, name, docDate }

  return (
    <>
      <ScreenHeader
        title={t('title')}
        backHref="/app/coffre/documents"
        right={readOnly ? undefined : (
          <button type="button" onClick={() => { setDraftName(name); setRenameOpen(true) }} aria-label={t('renameAria')} className={cn(headerIconBtn, '-mr-2')}>
            <Pencil className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      />

      <div className="px-5">
        <div className="flex flex-col items-center pt-3 text-center">
          <FileIcon tone={doc.tone} label={doc.ext === 'DOCX' ? 'W' : doc.ext} size="xl" framed />
          <h2 className="mt-3 text-[18px] font-extrabold text-night-900">{doc.name}</h2>
          <p className="text-[13px] text-night-500">{doc.ext} <span aria-hidden="true">•</span> {f.size(doc.size)}</p>
          {doc.sharedBy && <SharedByBadge prenom={doc.sharedBy.prenom} className="mt-2" />}
        </div>

        {doc.sharedBy && (
          <p role="note" className="mt-4 flex items-start gap-2.5 rounded-xl border border-night-100 bg-night-50/60 px-3.5 py-3 text-[13px] leading-relaxed text-night-800">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-night-600" aria-hidden="true" />
            <span>
              <span className="font-bold text-night-900">{t('readOnly')}</span>{' '}
              {t('readOnlyText', { name: doc.sharedBy.prenom })}
            </span>
          </p>
        )}

        <section aria-labelledby="infos" className="mt-6">
          <h3 id="infos" className="text-[15px] font-extrabold text-night-900">{t('info')}</h3>
          <dl className="mt-1 divide-y divide-night-100">
            <InfoRow icon={<FolderOpen className="h-[18px] w-[18px]" />} label={t('category')}>
              {category ? f.category(category.name) : '—'}
            </InfoRow>
            <InfoRow icon={<Folder className="h-[18px] w-[18px]" />} label={t('folder')}>
              {folderTrail.length > 0 ? (
                <Link href={`/app/coffre/dossiers/${encodeURIComponent(folderTrail[folderTrail.length - 1].id)}`} className="font-semibold text-leaf-700 underline-offset-2 hover:underline">
                  {folderTrail.map((f) => f.name).join(' / ')}
                </Link>
              ) : t('noFolder')}
            </InfoRow>
            <InfoRow icon={<CalendarDays className="h-[18px] w-[18px]" />} label={t(isPhoto ? 'photoDate' : 'docDate')}>
              <span className="flex items-center justify-between gap-3">
                <span>{f.date(doc.docDate)}</span>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => { setDraftDate(doc.docDate); setDateOpen(true) }}
                    className="rounded text-[12.5px] font-bold text-leaf-700 underline decoration-2 underline-offset-2"
                  >
                    {t('editDate')}
                  </button>
                )}
              </span>
            </InfoRow>
            <InfoRow icon={<Clock className="h-[18px] w-[18px]" />} label={t('addedOn')}>{t('addedValue', { date: f.date(doc.addedAt), time: f.locale === 'fr' ? doc.addedTime.replace(':', 'h') : doc.addedTime })}</InfoRow>
            <InfoRow icon={<Landmark className="h-[18px] w-[18px]" />} label={t('source')}>{f.source(doc.source)}</InfoRow>
            <InfoRow icon={<HardDrive className="h-[18px] w-[18px]" />} label={t('size')}>{f.size(doc.size)}</InfoRow>
            {doc.description && (
              <InfoRow icon={<FileText className="h-[18px] w-[18px]" />} label={t('description')}>{doc.description}</InfoRow>
            )}
          </dl>
        </section>

        <section aria-labelledby="actions" className="mt-5">
          <h3 id="actions" className="text-[15px] font-extrabold text-night-900">{t('actions')}</h3>
          <div className="mt-1 divide-y divide-night-100">
            {(doc.type === 'pdf' || doc.type === 'image') && (
              <ActionRow icon={<Eye className="h-5 w-5" />} label={t('preview')} onClick={() => { void startPreview(doc, announce, ta) }} />
            )}
            <ActionRow icon={<Download className="h-5 w-5" />} label={tc('download')} onClick={() => { void startDownload(doc, announce, ta) }} />
            {/* Document d'un autre adulte (docs/FAMILLE.md) : ni partage, ni déplacement, ni suppression. */}
            {!readOnly && (
              <>
                <ActionRow icon={<Share2 className="h-5 w-5" />} label={tc('share')} onClick={() => { void shareDocument(doc, ta).then((m) => m && announce(m)) }} />
                <ActionRow icon={<Folder className="h-5 w-5" />} label={ta('toFolder')} onClick={() => setFolderOpen(true)} />
                <ActionRow icon={<FolderInput className="h-5 w-5" />} label={ta('changeCategory')} onClick={() => { setMoveTo(categoryId); setMoveOpen(true) }} />
                <ActionRow icon={<Trash2 className="h-5 w-5" />} label={tc('delete')} href={`/app/coffre/documents/${doc.id}/supprimer`} danger />
              </>
            )}
          </div>
        </section>
      </div>

      <Modal
        open={renameOpen && !readOnly}
        onClose={() => setRenameOpen(false)}
        title={t('renameAria')}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenameOpen(false)}>{tc('cancel')}</Button>
            <Button
              variant="primary"
              disabled={!draftName.trim()}
              onClick={async () => {
                const next = draftName.trim()
                try {
                  await renameDocument(doc.id, next)
                  setName(next)
                  setRenameOpen(false)
                  announce(t('renamed'))
                } catch (e) {
                  announce(e instanceof Error ? e.message : t('renameFailed'))
                }
              }}
            >
              {tc('save')}
            </Button>
          </>
        }
      >
        <Input label={t('nameLabel')} value={draftName} onChange={(e) => setDraftName(e.target.value)} required maxLength={120} />
      </Modal>

      <Modal
        open={moveOpen && !readOnly}
        onClose={() => setMoveOpen(false)}
        title={t('moveTitle')}
        description={t('moveDescription')}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setMoveOpen(false)}>{tc('cancel')}</Button>
            <Button
              variant="primary"
              onClick={async () => {
                try {
                  await moveDocument(doc.id, moveTo)
                  setCategoryId(moveTo)
                  setMoveOpen(false)
                  announce(t('moved', { name: (() => { const c = categories.find((x) => x.id === moveTo); return c ? f.category(c.name) : t('theCategory') })() }))
                } catch (e) {
                  announce(e instanceof Error ? e.message : t('moveFailed'))
                }
              }}
            >
              {t('move')}
            </Button>
          </>
        }
      >
        <fieldset>
          <legend className="sr-only">{t('destination')}</legend>
          {categories.map((c) => (
            <label key={c.id} className="flex min-h-[48px] cursor-pointer items-center gap-3">
              <CategoryIcon icon={c.icon} tone={c.tone} size="sm" />
              <span className="flex-1 text-[14px] font-semibold text-night-900">{f.category(c.name)}</span>
              <input type="radio" name="move-to" value={c.id} checked={moveTo === c.id} onChange={() => setMoveTo(c.id)} className="h-5 w-5 accent-leaf-500" />
            </label>
          ))}
        </fieldset>
      </Modal>
      <Modal
        open={dateOpen && !readOnly}
        onClose={() => setDateOpen(false)}
        title={t(isPhoto ? 'photoDateTitle' : 'dateTitle')}
        description={t(isPhoto ? 'photoDateDescription' : 'dateDescription')}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDateOpen(false)}>{tc('cancel')}</Button>
            <Button
              variant="primary"
              disabled={!draftDate || draftDate === doc.docDate}
              onClick={async () => {
                try {
                  await updateDocDate(doc.id, draftDate)
                  setDocDate(draftDate)
                  setDateOpen(false)
                  announce(t('dateUpdated'))
                } catch (e) {
                  announce(e instanceof Error ? e.message : t('dateFailed'))
                }
              }}
            >
              {tc('save')}
            </Button>
          </>
        }
      >
        <Input
          type="date"
          label={t(isPhoto ? 'photoDate' : 'docDate')}
          value={draftDate}
          onChange={(e) => setDraftDate(e.target.value)}
          max={isPhoto ? todayKey() : undefined}
          required
        />
      </Modal>
      <FolderPickerSheet
        open={folderOpen && !readOnly}
        onClose={() => setFolderOpen(false)}
        title={ta('toFolder')}
        description={t('folderDescription')}
        folders={folders}
        initial={folderId}
        confirmLabel={t('file')}
        onConfirm={async (next) => {
          try {
            await moveDocumentToFolder(doc.id, next)
            setFolderOverride(next)
            setFolderOpen(false)
            announce(next ? t('filedIn', { name: folders.find((fo) => fo.id === next)?.name ?? t('theFolder') }) : t('removedFromFolder'))
            return null
          } catch (e) {
            return e instanceof Error ? e.message : t('fileFailed')
          }
        }}
      />
      {node}
    </>
  )
}

export default function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const tc = useTranslations('vault.common')
  return (
    <Suspense fallback={<div className="p-6 text-center text-sm text-night-500" role="status">{tc('loading')}</div>}>
      <DocumentDetail id={id} />
    </Suspense>
  )
}
