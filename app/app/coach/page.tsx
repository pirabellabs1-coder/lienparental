'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Menu, FileImage, FileText, History, Archive, Gauge, ArrowLeft, WandSparkles, MessagesSquare } from 'lucide-react'
import { ActionSheet } from '@/components/ui'
import { RobotMascot } from '@/components/coach/RobotMascot'
import { btn, LegalNote } from '@/components/coach/ui'
import {
  DOC_ACCEPT,
  IMAGE_ACCEPT,
  draftFromFile,
  saveDraft,
  setPendingFile,
  takePrefill,
  validateFile,
} from '@/components/coach/session'

const MAX = 2000

// M09 — Coach parental IA · étape 1 « Écrire ou importer » (maquette 12.12.07 (2)).
export default function CoachPage() {
  const router = useRouter()
  const [text, setText] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [error, setError] = useState('')
  const imageRef = useRef<HTMLInputElement>(null)
  const docRef = useRef<HTMLInputElement>(null)
  const textareaId = useId()
  const errorId = useId()

  // Question éventuellement saisie depuis le dashboard.
  useEffect(() => {
    const prefill = takePrefill()
    if (prefill) setText(prefill.slice(0, MAX))
  }, [])

  const onFile = (file: File | undefined, accept: 'image' | 'doc') => {
    if (!file) return
    const err = validateFile(file, accept)
    if (err) {
      setError(err)
      return
    }
    setError('')
    setPendingFile(file)
    saveDraft(draftFromFile(file))
    router.push('/app/coach/document')
  }

  const submitText = (e: React.FormEvent) => {
    e.preventDefault()
    const value = text.trim()
    if (!value) return
    setPendingFile(null)
    saveDraft({ kind: 'message', name: 'Message écrit', text: value, createdAt: new Date().toISOString() })
    router.push('/app/coach/document')
  }

  return (
    <div className="w-full">
      {/* En-tête : menu à gauche, titre centré (maquette) */}
      <header
        className="sticky top-0 z-30 bg-white px-4"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}
      >
        <div className="relative flex h-12 items-center justify-between">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Menu du Coach IA"
            aria-haspopup="dialog"
            className="-ml-2 grid h-11 w-11 place-items-center rounded-full text-night-900 hover:bg-night-50"
          >
            <Menu className="h-[22px] w-[22px]" aria-hidden="true" />
          </button>
          <h1 className="pointer-events-none absolute inset-x-14 truncate text-center text-[15px] font-bold text-night-900">
            Coach parental IA
          </h1>
          <span className="w-11" aria-hidden="true" />
        </div>
      </header>

      <div className="px-5 pb-8 pt-4">
        <div className="flex justify-center">
          <RobotMascot variant="head" size={76} />
        </div>

        <div className="mt-5 text-center">
          <h2 className="text-[21px] font-bold text-night-900">Écrivez votre message</h2>
          <p className="mx-auto mt-3 max-w-[280px] text-[13px] leading-relaxed text-night-700">
            Ou ajoutez une capture d’écran ou un document pour obtenir une reformulation adaptée.
          </p>
        </div>

        <form onSubmit={submitText} className="mt-6">
          <div className="rounded-xl2 border border-night-100 bg-white p-3.5 shadow-soft focus-within:border-iris-300">
            <label htmlFor={textareaId} className="sr-only">
              Votre message à reformuler
            </label>
            <textarea
              id={textareaId}
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX))}
              maxLength={MAX}
              rows={6}
              placeholder="Écrivez votre message ici…"
              aria-describedby={`${textareaId}-count`}
              className="block w-full resize-none border-0 bg-transparent p-0 text-[14px] leading-relaxed text-night-900 placeholder:text-night-400 focus:outline-none focus:ring-0"
            />
            <p id={`${textareaId}-count`} className="mt-1 text-right text-[12px] tabular-nums text-night-500">
              {text.length}/{MAX}
              <span className="sr-only"> caractères</span>
            </p>
          </div>

          <div className="mt-4 space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
            <UploadOption
              icon={<FileImage className="h-5 w-5" aria-hidden="true" />}
              title="Ajouter une capture d’écran"
              hint="(Image JPG, PNG)"
              onClick={() => imageRef.current?.click()}
              describedBy={error ? errorId : undefined}
            />
            <UploadOption
              icon={<FileText className="h-5 w-5" aria-hidden="true" />}
              title="Ajouter un document"
              hint="(PDF ou texte)"
              onClick={() => docRef.current?.click()}
              describedBy={error ? errorId : undefined}
            />
            <input
              ref={imageRef}
              type="file"
              accept={IMAGE_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                onFile(e.target.files?.[0], 'image')
                e.target.value = ''
              }}
            />
            <input
              ref={docRef}
              type="file"
              accept={DOC_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                onFile(e.target.files?.[0], 'doc')
                e.target.value = ''
              }}
            />
          </div>

          <p id={errorId} role="alert" className="mt-2 text-[12px] font-medium text-alert-600 empty:hidden">
            {error}
          </p>

          {/* Absent de la maquette à vide : n'apparaît qu'une fois un message saisi. */}
          {text.trim() && (
            <button type="submit" className={`${btn.primary} mt-4`}>
              <WandSparkles className="h-5 w-5" aria-hidden="true" />
              Analyser mon message
            </button>
          )}
        </form>

        <Link
          href="/app/coach/assistant"
          className="mt-6 flex min-h-[56px] items-center gap-4 rounded-xl2 border border-iris-200 bg-iris-50/60 px-4 py-3.5 text-left transition hover:border-iris-300 hover:bg-iris-50"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-iris-600" aria-hidden="true">
            <MessagesSquare className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-[14px] font-bold text-night-900">Demandez à votre Coach</span>
            <span className="mt-0.5 block text-[12px] text-night-600">Résumé du mois, documents, frais, message à préparer…</span>
          </span>
        </Link>

        <LegalNote className="mt-6" />
      </div>

      <ActionSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Coach parental IA"
        actions={[
          { key: 'ask', label: 'Demandez à votre Coach', icon: <MessagesSquare className="h-5 w-5" />, onClick: () => router.push('/app/coach/assistant') },
          { key: 'hist', label: 'Historique', icon: <History className="h-5 w-5" />, onClick: () => router.push('/app/coach/historique') },
          { key: 'arch', label: 'Archives', icon: <Archive className="h-5 w-5" />, onClick: () => router.push('/app/coach/archives') },
          { key: 'use', label: 'Mon utilisation', icon: <Gauge className="h-5 w-5" />, onClick: () => router.push('/app/coach/utilisation') },
          { key: 'home', label: "Retour à l'accueil", icon: <ArrowLeft className="h-5 w-5" />, onClick: () => router.push('/app') },
        ]}
      />
    </div>
  )
}

function UploadOption({
  icon,
  title,
  hint,
  onClick,
  describedBy,
}: {
  icon: React.ReactNode
  title: string
  hint: string
  onClick: () => void
  describedBy?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-describedby={describedBy}
      className="flex w-full items-center gap-4 rounded-xl2 border border-night-100 bg-white px-4 py-4 text-left shadow-soft transition hover:border-iris-200 hover:bg-iris-50/40 active:scale-[.99]"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border-2 border-night-800 text-night-900">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-bold text-night-900">{title}</span>
        <span className="mt-0.5 block text-[12px] text-night-600">{hint}</span>
      </span>
    </button>
  )
}
