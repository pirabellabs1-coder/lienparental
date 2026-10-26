'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCheck, CheckCircle2, FileImage, FileText, Lock, RefreshCw, Trash2, WandSparkles } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { btn, ScreenTitle } from '@/components/coach/ui'
import {
  DOC_ACCEPT,
  IMAGE_ACCEPT,
  clearDraft,
  draftFromFile,
  getPendingFile,
  loadDraft,
  saveDraft,
  setPendingFile,
  timeLabel,
  validateFile,
  type CoachDraft,
} from '@/components/coach/session'
import { mockCoachCapture } from '@/lib/mock-data'
import { LIVE } from '@/lib/data/core'

// Brouillon de démonstration quand on arrive ici sans rien avoir importé (démo uniquement :
// un compte réel voit un état vide, jamais la capture fictive).
const DEMO: CoachDraft = { kind: 'capture', name: mockCoachCapture.title, createdAt: '' }

const RECOGNIZED: Record<CoachDraft['kind'], string> = {
  capture: 'Il s’agit d’une capture d’écran. L’IA va lire la conversation et analyser son contenu.',
  pdf: 'Il s’agit d’un document PDF. L’IA va analyser son contenu et son ton.',
  word: 'Les documents Word ne sont pas encore pris en charge : enregistrez-le en PDF.',
  document: 'Il s’agit d’un document texte. L’IA va analyser son contenu et son ton.',
  message: 'Il s’agit d’un message écrit. L’IA va analyser le ton et la formulation.',
}

// M09 — étape 2 « Document ajouté » (maquette 12.12.07 (2)).
export default function CoachDocumentPage() {
  const router = useRouter()
  const [draft, setDraft] = useState<CoachDraft | null>(null)
  const [savedToVault, setSavedToVault] = useState(false)
  const [error, setError] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [empty, setEmpty] = useState(false)

  useEffect(() => {
    const saved = loadDraft()
    if (!saved && LIVE) {
      setEmpty(true)
      return
    }
    setDraft(saved ?? DEMO)
    setFile(getPendingFile())
  }, [])

  // Aperçu local de la capture (URL blob, jamais envoyée ailleurs que dans l'analyse).
  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) return setPreviewUrl(null)
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  if (empty) {
    return (
      <>
        <TopBar title="Coach parental IA" showBack backHref="/app/coach" showBell={false} />
        <div className="w-full px-5 pt-8">
          <ScreenTitle title="Aucun document importé" subtitle="Ajoutez une capture d’écran, un PDF ou un message depuis l’accueil du Coach pour lancer une analyse." />
          <Link href="/app/coach" className={`${btn.primary} mt-6`}>
            Importer un contenu
          </Link>
        </div>
      </>
    )
  }

  if (!draft) {
    return (
      <>
        <TopBar title="Coach parental IA" showBack backHref="/app/coach" showBell={false} />
        <div className="w-full px-5 pt-10" aria-busy="true">
          <div className="mx-auto h-6 w-48 animate-pulse rounded bg-night-50" />
          <div className="mt-6 h-40 animate-pulse rounded-xl2 bg-night-50" />
        </div>
      </>
    )
  }

  const isDemo = draft === DEMO
  const isMessage = draft.kind === 'message'
  const title = isMessage ? 'Message écrit' : draft.kind === 'capture' && isDemo ? mockCoachCapture.title : draft.name
  const added = draft.createdAt ? timeLabel(draft.createdAt) : mockCoachCapture.addedLabel
  // Pour une capture, on affiche les messages « reconnus » (OCR simulé).
  const lines: { text: string; time?: string }[] = isMessage
    ? (draft.text ?? '').split(/\n+/).filter(Boolean).map((t) => ({ text: t }))
    : draft.kind === 'capture' && isDemo
      ? mockCoachCapture.messages
      : []
  const fileMissing = !isDemo && !isMessage && !file

  const replaceFile = (file: File | undefined) => {
    if (!file) return
    const isImage = file.type.startsWith('image/')
    const err = validateFile(file, isImage ? 'image' : 'doc')
    if (err) return setError(err)
    setError('')
    const d = draftFromFile(file)
    setPendingFile(file)
    setFile(file)
    saveDraft(d)
    setDraft(d)
    setSavedToVault(false)
  }

  return (
    <>
      <TopBar title="Coach parental IA" showBack backHref="/app/coach" showBell={false} />

      <div className="w-full px-5 pb-8 pt-3">
        <ScreenTitle title={isMessage ? 'Message ajouté' : 'Document ajouté'} subtitle="Votre fichier est importé et prêt à être analysé." />

        {/* Fichier + aperçu */}
        <section aria-label="Fichier importé" className="mt-5 overflow-hidden rounded-xl2 border border-night-100 bg-white shadow-soft">
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border-2 border-night-800 text-night-900" aria-hidden="true">
              {draft.kind === 'capture' ? <FileImage className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-bold text-night-900">{title}</p>
              <p className="text-[12px] text-night-600">
                {added}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                clearDraft()
                setPendingFile(null)
                router.push('/app/coach')
              }}
              aria-label={`Retirer ${title}`}
              className="-mr-1.5 grid h-11 w-11 shrink-0 place-items-center rounded-full text-night-900 hover:bg-alert-50 hover:text-alert-500"
            >
              <Trash2 className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- aperçu blob local
            <img src={previewUrl} alt={`Aperçu de ${title}`} className="mx-3 mb-3 max-h-80 w-[calc(100%-1.5rem)] rounded-xl bg-night-50 object-contain" />
          )}

          {lines.length > 0 && (
            <ul className="mx-3 mb-3 space-y-0.5 rounded-xl bg-night-50/70 px-4 py-3">
              {lines.map((l, i) => (
                <li key={i} className="flex items-start justify-between gap-3 py-1.5 text-[12.5px] text-night-900">
                  <span className="min-w-0 break-words">{l.text}</span>
                  {l.time && (
                    <span className="flex shrink-0 items-center gap-1 text-[11px] text-night-500">
                      {l.time}
                      <CheckCheck className="h-3.5 w-3.5 text-iris-500" aria-hidden="true" />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {fileMissing && (
          <p role="alert" className="mt-4 rounded-xl2 border border-gold-200 bg-gold-50 p-4 text-[12.5px] leading-relaxed text-night-800">
            Le fichier n’est plus disponible après le rechargement de la page. Utilisez « Ajouter un autre document » pour l’importer à nouveau.
          </p>
        )}

        {/* Reconnaissance */}
        <section className="mt-4 flex gap-3 rounded-xl2 border border-leaf-100 bg-leaf-50/70 p-4" aria-live="polite">
          <CheckCircle2 className="h-6 w-6 shrink-0 fill-leaf-500 text-white" aria-hidden="true" />
          <div>
            <h3 className="text-[14px] font-bold text-night-900">Document reconnu</h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-night-700">{RECOGNIZED[draft.kind]}</p>
          </div>
        </section>

        <div className="mt-6 space-y-3.5">
          <button type="button" onClick={() => router.push('/app/coach/analyse')} disabled={fileMissing || draft.kind === 'word'} className={btn.primary}>
            <WandSparkles className="h-5 w-5" aria-hidden="true" />
            Lancer l’analyse
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} className={btn.secondary}>
            <RefreshCw className="h-5 w-5" aria-hidden="true" />
            Ajouter un autre document
          </button>
          <button
            type="button"
            onClick={() => setSavedToVault(true)}
            aria-pressed={savedToVault}
            className={btn.secondary}
          >
            {savedToVault ? (
              <CheckCircle2 className="h-5 w-5 text-leaf-500" aria-hidden="true" />
            ) : (
              <Lock className="h-5 w-5" aria-hidden="true" />
            )}
            {savedToVault ? 'Ajouté au coffre-fort' : 'Ajouter au coffre-fort'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={`${IMAGE_ACCEPT},${DOC_ACCEPT}`}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              replaceFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </div>

        <p role="alert" className="mt-3 text-center text-[12px] font-medium text-alert-600 empty:hidden">
          {error}
        </p>
        <p role="status" aria-live="polite" className="sr-only">
          {savedToVault ? 'Copie enregistrée dans votre coffre-fort.' : ''}
        </p>
      </div>
    </>
  )
}
