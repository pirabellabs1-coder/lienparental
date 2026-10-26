'use client'

import Link from 'next/link'
import { Suspense, use, useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  CalendarDays, ChevronRight, Clock, Download, Eye, FileText, FolderInput, FolderOpen,
  HardDrive, Landmark, Lock, Pencil, Share2, Trash2,
} from 'lucide-react'
import { Button, Input, Modal } from '@/components/ui'
import { ScreenHeader, headerIconBtn } from '@/components/coffre/ScreenHeader'
import { FileIcon } from '@/components/coffre/FileIcon'
import { CategoryIcon } from '@/components/coffre/CategoryIcon'
import { useCategories, useDeletedDocs, useVaultDoc } from '@/components/coffre/store'
import { LoadingState } from '@/components/mobile/StateScreens'
import { moveDocument, renameDocument } from '@/lib/data/vault'
import { useAnnounce } from '@/components/coffre/useAnnounce'
import { shareDocument, startDownload, startPreview } from '@/components/coffre/useDocActions'
import { SharedByBadge } from '@/components/famille/SharedByBadge'
import { frDate, frSize } from '@/lib/mock-vault'
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

  // Document partagé par un autre adulte : lecture seule (aucune modale de modification).
  const readOnly = Boolean(base?.sharedBy)
  useEffect(() => { if (params.get('deplacer') === '1' && base && !base.sharedBy) setMoveOpen(true) }, [params, base])

  // Supabase : le document arrive après montage → on synchronise l'état local une fois chargé.
  const baseId = base?.id
  useEffect(() => {
    if (!base) return
    setName(base.name)
    setDraftName(base.name)
    setCategoryId(base.categoryId)
    setMoveTo(base.categoryId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseId])

  if (!base && loading) {
    return (
      <>
        <ScreenHeader title="Détail du document" backHref="/app/coffre/documents" />
        <LoadingState compact title="Chargement du document" description="" />
      </>
    )
  }

  if (!base || (ready && deleted.includes(id))) {
    return (
      <>
        <ScreenHeader title="Détail du document" backHref="/app/coffre/documents" />
        <div className="px-6 pt-16 text-center">
          <p className="text-[16px] font-bold text-night-900">Document introuvable</p>
          <p className="mt-1 text-[13px] text-night-500">Il a peut-être été supprimé ou déplacé.</p>
          <Link href="/app/coffre/documents/tous" className="mt-5 inline-flex h-11 items-center rounded-xl px-4 text-[14px] font-bold text-leaf-600 hover:bg-leaf-50">
            Voir tous les documents
          </Link>
        </div>
      </>
    )
  }

  const category = categories.find((c) => c.id === categoryId)
  const doc = { ...base, name }

  return (
    <>
      <ScreenHeader
        title="Détail du document"
        backHref="/app/coffre/documents"
        right={readOnly ? undefined : (
          <button type="button" onClick={() => { setDraftName(name); setRenameOpen(true) }} aria-label="Renommer le document" className={cn(headerIconBtn, '-mr-2')}>
            <Pencil className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      />

      <div className="px-5">
        <div className="flex flex-col items-center pt-3 text-center">
          <FileIcon tone={doc.tone} label={doc.ext === 'DOCX' ? 'W' : doc.ext} size="xl" framed />
          <h2 className="mt-3 text-[18px] font-extrabold text-night-900">{doc.name}</h2>
          <p className="text-[13px] text-night-500">{doc.ext} <span aria-hidden="true">•</span> {frSize(doc.size)}</p>
          {doc.sharedBy && <SharedByBadge prenom={doc.sharedBy.prenom} className="mt-2" />}
        </div>

        {doc.sharedBy && (
          <p role="note" className="mt-4 flex items-start gap-2.5 rounded-xl border border-night-100 bg-night-50/60 px-3.5 py-3 text-[13px] leading-relaxed text-night-800">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-night-600" aria-hidden="true" />
            <span>
              <span className="font-bold text-night-900">Lecture seule.</span>{' '}
              {doc.sharedBy.prenom} a partagé ce document avec vous : vous pouvez le consulter et le télécharger. Seul son auteur peut le renommer, le déplacer ou le supprimer.
            </span>
          </p>
        )}

        <section aria-labelledby="infos" className="mt-6">
          <h3 id="infos" className="text-[15px] font-extrabold text-night-900">Informations</h3>
          <dl className="mt-1 divide-y divide-night-100">
            <InfoRow icon={<FolderOpen className="h-[18px] w-[18px]" />} label="Catégorie">
              {category?.name ?? '—'}
            </InfoRow>
            <InfoRow icon={<CalendarDays className="h-[18px] w-[18px]" />} label="Date du document">{frDate(doc.docDate)}</InfoRow>
            <InfoRow icon={<Clock className="h-[18px] w-[18px]" />} label="Ajouté le">{frDate(doc.addedAt)} à {doc.addedTime.replace(':', 'h')}</InfoRow>
            <InfoRow icon={<Landmark className="h-[18px] w-[18px]" />} label="Source">{doc.source}</InfoRow>
            <InfoRow icon={<HardDrive className="h-[18px] w-[18px]" />} label="Taille">{frSize(doc.size)}</InfoRow>
            {doc.description && (
              <InfoRow icon={<FileText className="h-[18px] w-[18px]" />} label="Description">{doc.description}</InfoRow>
            )}
          </dl>
        </section>

        <section aria-labelledby="actions" className="mt-5">
          <h3 id="actions" className="text-[15px] font-extrabold text-night-900">Actions</h3>
          <div className="mt-1 divide-y divide-night-100">
            {(doc.type === 'pdf' || doc.type === 'image') && (
              <ActionRow icon={<Eye className="h-5 w-5" />} label="Aperçu" onClick={() => { void startPreview(doc, announce) }} />
            )}
            <ActionRow icon={<Download className="h-5 w-5" />} label="Télécharger" onClick={() => { void startDownload(doc, announce) }} />
            {/* Document d'un autre adulte (docs/FAMILLE.md) : ni partage, ni déplacement, ni suppression. */}
            {!readOnly && (
              <>
                <ActionRow icon={<Share2 className="h-5 w-5" />} label="Partager" onClick={() => { void shareDocument(doc).then((m) => m && announce(m)) }} />
                <ActionRow icon={<FolderInput className="h-5 w-5" />} label="Déplacer" onClick={() => { setMoveTo(categoryId); setMoveOpen(true) }} />
                <ActionRow icon={<Trash2 className="h-5 w-5" />} label="Supprimer" href={`/app/coffre/documents/${doc.id}/supprimer`} danger />
              </>
            )}
          </div>
        </section>
      </div>

      <Modal
        open={renameOpen && !readOnly}
        onClose={() => setRenameOpen(false)}
        title="Renommer le document"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenameOpen(false)}>Annuler</Button>
            <Button
              variant="primary"
              disabled={!draftName.trim()}
              onClick={async () => {
                const next = draftName.trim()
                try {
                  await renameDocument(doc.id, next)
                  setName(next)
                  setRenameOpen(false)
                  announce('Document renommé')
                } catch (e) {
                  announce(e instanceof Error ? e.message : 'Renommage impossible')
                }
              }}
            >
              Enregistrer
            </Button>
          </>
        }
      >
        <Input label="Nom du document" value={draftName} onChange={(e) => setDraftName(e.target.value)} required maxLength={120} />
      </Modal>

      <Modal
        open={moveOpen && !readOnly}
        onClose={() => setMoveOpen(false)}
        title="Déplacer vers…"
        description="Choisissez la nouvelle catégorie du document."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setMoveOpen(false)}>Annuler</Button>
            <Button
              variant="primary"
              onClick={async () => {
                try {
                  await moveDocument(doc.id, moveTo)
                  setCategoryId(moveTo)
                  setMoveOpen(false)
                  announce(`Déplacé vers ${categories.find((c) => c.id === moveTo)?.name ?? 'la catégorie'}`)
                } catch (e) {
                  announce(e instanceof Error ? e.message : 'Déplacement impossible')
                }
              }}
            >
              Déplacer
            </Button>
          </>
        }
      >
        <fieldset>
          <legend className="sr-only">Catégorie de destination</legend>
          {categories.map((c) => (
            <label key={c.id} className="flex min-h-[48px] cursor-pointer items-center gap-3">
              <CategoryIcon icon={c.icon} tone={c.tone} size="sm" />
              <span className="flex-1 text-[14px] font-semibold text-night-900">{c.name}</span>
              <input type="radio" name="move-to" value={c.id} checked={moveTo === c.id} onChange={() => setMoveTo(c.id)} className="h-5 w-5 accent-leaf-500" />
            </label>
          ))}
        </fieldset>
      </Modal>
      {node}
    </>
  )
}

export default function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <Suspense fallback={<div className="p-6 text-center text-sm text-night-500" role="status">Chargement…</div>}>
      <DocumentDetail id={id} />
    </Suspense>
  )
}
