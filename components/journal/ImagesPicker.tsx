'use client'

import { useEffect, useRef, useState, type DragEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, ChevronRight, FileText, Image as ImageIcon, Images, X } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { cn } from '@/lib/cn'
import { SubmitBar } from './FormFields'
import { fmtSize } from './journalData'
import {
  MAX_FILES, MAX_SIZE_BYTES, getDraft, setDraft, toDraftImage, type DraftImage,
} from './imageDraft'

const ACCEPT_ALL = 'image/*,application/pdf'

function isAccepted(f: File) {
  return f.type.startsWith('image/') || f.type === 'application/pdf'
}

/** Écran « Ajouter des images » (maquette Journal, 5e écran). `draftKey` = 'nouveau' ou id d'entrée. */
export function ImagesPicker({ draftKey }: { draftKey: string }) {
  const router = useRouter()
  const [items, setItems] = useState<DraftImage[]>(() => getDraft(draftKey))
  const [error, setError] = useState<string>()
  const [dragging, setDragging] = useState(false)
  const committed = useRef(false)
  const itemsRef = useRef(items)
  itemsRef.current = items

  const anyInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const galleryInput = useRef<HTMLInputElement>(null)
  const docInput = useRef<HTMLInputElement>(null)

  // Sortie sans valider : libère les aperçus créés ici et non retenus dans le brouillon.
  useEffect(() => () => {
    if (committed.current) return
    const inDraft = new Set(getDraft(draftKey).map((d) => d.id))
    for (const d of itemsRef.current) if (!inDraft.has(d.id) && d.previewUrl) URL.revokeObjectURL(d.previewUrl)
  }, [draftKey])

  function addFiles(list: FileList | File[] | null) {
    if (!list) return
    const files = Array.from(list)
    const problems: string[] = []
    const room = MAX_FILES - items.length
    const accepted: DraftImage[] = []
    for (const f of files) {
      if (!isAccepted(f)) { problems.push(`« ${f.name} » : format non pris en charge.`); continue }
      if (f.size > MAX_SIZE_BYTES) { problems.push(`« ${f.name} » dépasse 10 Mo.`); continue }
      if (accepted.length >= room) { problems.push(`Limite de ${MAX_FILES} fichiers atteinte.`); break }
      accepted.push(toDraftImage(f))
    }
    setError(problems.length ? problems.join(' ') : undefined)
    if (accepted.length) setItems((prev) => [...prev, ...accepted])
  }

  function remove(id: string) {
    const inDraft = getDraft(draftKey).some((d) => d.id === id)
    setItems((prev) => {
      const target = prev.find((d) => d.id === id)
      if (target?.previewUrl && !inDraft) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((d) => d.id !== id)
    })
    setError(undefined)
  }

  function validate() {
    committed.current = true
    setDraft(draftKey, items)
    router.back()
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }

  const sources = [
    { key: 'camera', label: 'Prendre une photo', icon: Camera, ref: cameraInput },
    { key: 'gallery', label: 'Choisir dans la galerie', icon: Images, ref: galleryInput },
    { key: 'doc', label: 'Importer un document', icon: FileText, ref: docInput },
  ] as const

  const full = items.length >= MAX_FILES

  return (
    <>
      <TopBar title="Ajouter des images" showBack showBell={false} />

      <div className="min-h-[calc(100dvh-12.5rem)] space-y-6 px-4 pb-6 pt-3">
        <button
          type="button"
          onClick={() => anyInput.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          disabled={full}
          aria-describedby="images-limits"
          className={cn(
            'flex w-full flex-col items-center justify-center rounded-2xl border bg-white px-6 py-7 text-center transition-colors disabled:opacity-60',
            dragging ? 'border-leaf-500 bg-leaf-50' : 'border-night-100 hover:border-night-200',
          )}
        >
          <ImageIcon aria-hidden="true" className="h-8 w-8 text-night-900" strokeWidth={1.7} />
          <span className="mt-3 text-[13px] font-bold text-night-900">Ajouter des photos ou documents</span>
          <span id="images-limits" className="mt-1 text-[11px] text-night-600">
            Jusqu&apos;à {MAX_FILES} fichiers (10 Mo max. par fichier)
          </span>
        </button>

        {error && (
          <p role="alert" className="rounded-xl bg-alert-50 px-4 py-3 text-xs font-medium text-alert-700">{error}</p>
        )}

        <section aria-labelledby="sources-title">
          <h2 id="sources-title" className="mb-2.5 text-[13px] font-bold text-night-900">Sources</h2>
          <ul className="space-y-2">
            {sources.map(({ key, label, icon: Icon, ref }) => (
              <li key={key}>
                <button
                  type="button"
                  disabled={full}
                  onClick={() => ref.current?.click()}
                  className="flex min-h-[52px] w-full items-center gap-3.5 rounded-xl border border-night-100 bg-white px-4 text-left transition-colors hover:bg-night-50/50 disabled:opacity-60"
                >
                  <Icon aria-hidden="true" className="h-5 w-5 text-night-900" strokeWidth={1.8} />
                  <span className="flex-1 text-[13px] font-semibold text-night-900">{label}</span>
                  <ChevronRight aria-hidden="true" className="h-[18px] w-[18px] text-night-700" />
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="added-title" aria-live="polite">
          <h2 id="added-title" className="mb-2.5 text-[13px] font-bold text-night-900">
            Images ajoutées ({items.length})
          </h2>
          {items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-night-200 px-4 py-5 text-center text-xs text-night-600">
              Aucune image pour le moment.
            </p>
          ) : (
            <ul className="space-y-2">
              {items.map((d) => (
                <li key={d.id} className="flex items-center gap-3.5 rounded-xl border border-night-100 bg-white py-2.5 pl-3 pr-1.5">
                  {d.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- aperçu local (object URL)
                    <img src={d.previewUrl} alt="" width={48} height={40} className="h-10 w-12 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span aria-hidden="true" className="grid h-10 w-12 shrink-0 place-items-center rounded-lg bg-night-50 text-night-700">
                      <FileText className="h-5 w-5" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-night-900">{d.file.name}</p>
                    <p className="text-[11px] text-night-600">{fmtSize(d.file.size)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(d.id)}
                    aria-label={`Retirer ${d.file.name}`}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-night-900 hover:bg-night-50"
                  >
                    <X aria-hidden="true" className="h-[18px] w-[18px]" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div
        className="sticky z-20 bg-white/95 px-4 pb-3 pt-2 backdrop-blur"
        style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <SubmitBar type="button" onClick={validate}>
          {items.length ? `Valider (${items.length})` : 'Valider'}
        </SubmitBar>
      </div>

      {/* Entrées fichier natives (déclenchées par les boutons ci-dessus) */}
      <div className="sr-only">
        <input ref={anyInput} type="file" accept={ACCEPT_ALL} multiple tabIndex={-1} aria-hidden="true"
          onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" tabIndex={-1} aria-hidden="true"
          onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
        <input ref={galleryInput} type="file" accept="image/*" multiple tabIndex={-1} aria-hidden="true"
          onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
        <input ref={docInput} type="file" accept={ACCEPT_ALL} multiple tabIndex={-1} aria-hidden="true"
          onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
      </div>
    </>
  )
}
