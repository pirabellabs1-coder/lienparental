'use client'

import Link from 'next/link'
import { use, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { notFound, useRouter } from 'next/navigation'
import { ArrowLeft, Check, ChevronRight, CircleCheck, FileText, LoaderCircle } from 'lucide-react'
import { Modal } from '@/components/ui'
import { FileIcon } from '@/components/coffre/FileIcon'
import { btn } from '@/components/coffre/buttons'
import { getModele, modelePages } from '@/lib/mock-vault'
import type { ExportFormat } from '@/components/coffre/modeleExport'
import { cn } from '@/lib/cn'

type Phase = 'choose' | 'progress' | 'success' | 'error'
const STEPS = ['file', 'layout', 'compat', 'final'] as const

function WordGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="h-9 w-9" aria-hidden="true" focusable="false">
      <rect x="9" y="4" width="20" height="24" rx="3" fill="#dbeafe" />
      <path d="M17 10h8M17 15h8M17 20h8" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
      <rect x="3" y="8" width="16" height="16" rx="3" fill="#2563eb" />
      <path d="M6.5 12l1.8 8 2-6 2 6 1.8-8" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
function CanvaGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="h-9 w-9" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="canva-g" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#5b45e3" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="14" fill="url(#canva-g)" />
      <path d="M20.5 19.5c-1.2 1.4-2.8 2.2-4.6 2.2-3.2 0-5.4-2.4-5.4-5.6 0-3.5 2.6-6.1 5.6-6.1 1.9 0 3.2 1 3.2 2.3 0 .9-.6 1.5-1.4 1.5-1 0-1.3-.8-1.5-1.5-.2-.6-.4-1-1-1-1.3 0-2.6 1.9-2.6 4.3 0 2 1.1 3.5 2.9 3.5 1.4 0 2.6-.7 3.6-1.9z" fill="#fff" />
    </svg>
  )
}

// Maquettes « Télécharger / Exporter » → « Exportation en cours » → « Téléchargement réussi »
export default function ExportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const tr = useTranslations('coach.templates')
  const router = useRouter()
  const found = getModele(slug)

  const [phase, setPhase] = useState<Phase>('choose')
  const [format, setFormat] = useState<ExportFormat>('pdf')
  const [progress, setProgress] = useState(0)
  const [file, setFile] = useState<{ blob: Blob; filename: string } | null>(null)
  const [saved, setSaved] = useState(false)
  const successHeading = useRef<HTMLHeadingElement>(null)
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  useEffect(() => { if (phase === 'success') successHeading.current?.focus() }, [phase])

  if (!found) notFound()
  const m = found

  const start = async (f: ExportFormat) => {
    setFormat(f)
    setPhase('progress')
    setProgress(0)
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
    try {
      const mod = await import('@/components/coffre/modeleExport')
      if (!alive.current) return
      setProgress(1)
      const built = mod.buildModeleFile(m, f)
      await wait(500); if (!alive.current) return
      setProgress(2)
      const result = await built
      await wait(450); if (!alive.current) return
      setProgress(3)
      await wait(400); if (!alive.current) return
      setFile(result)
      setProgress(4)
      setPhase('success')
    } catch {
      if (alive.current) setPhase('error')
    }
  }

  const saveFile = async () => {
    if (!file) return
    const { downloadBlob } = await import('@/components/coffre/modeleExport')
    downloadBlob(file.blob, file.filename)
    setSaved(true)
  }
  const openFile = () => {
    if (!file) return
    const url = URL.createObjectURL(file.blob)
    window.open(url, '_blank', 'noopener')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const pages = modelePages(m)
  const ext = format === 'word' ? 'doc' : 'pdf'
  const displayName = `${m.title}${format === 'canva' ? ' (Canva)' : ''}.${ext}`
  const sizeKo = file ? Math.max(1, Math.round(file.blob.size / 1024)) : 0

  /* ----------------------------- Succès ----------------------------- */
  if (phase === 'success') {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-leaf-600 text-white">
        <div
          className="relative mx-auto flex min-h-full w-full max-w-md flex-col px-6 pb-8"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 3.5rem)' }}
        >
          <svg viewBox="0 0 100 60" className="pointer-events-none absolute inset-x-0 top-6 h-44 w-full opacity-60" aria-hidden="true">
            {[[10, 10], [24, 30], [80, 8], [90, 34], [64, 20], [40, 6], [16, 50], [86, 52]].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={i % 2 ? 0.7 : 1} fill="white" />
            ))}
          </svg>
          <span aria-hidden="true" className="relative mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-white motion-safe:animate-fade-up">
            <Check className="h-12 w-12 text-leaf-600" strokeWidth={3} />
          </span>
          <h1 ref={successHeading} tabIndex={-1} className="mt-6 text-center text-[22px] font-extrabold outline-none">
            {tr('export.success')}
          </h1>
          <p className="mt-1 text-center text-[14px] text-white/90">{tr('export.ready')}</p>

          <div className="mt-7 flex items-center gap-3.5 rounded-2xl bg-white p-4 text-night-900 shadow-card">
            <FileIcon tone={format === 'word' ? 'blue' : 'red'} label={format === 'word' ? 'W' : 'PDF'} size="lg" />
            <div className="min-w-0">
              <p className="text-[14.5px] font-bold leading-snug">{displayName}</p>
              <p className="mt-1 text-[12.5px] text-night-500">
                {tr('pages', { count: pages })} <span aria-hidden="true">•</span> {tr('export.sizeKb', { size: sizeKo })}
              </p>
            </div>
          </div>

          <div className="mt-8 space-y-3">
            <button type="button" onClick={openFile} className={cn(btn({ variant: 'primary' }), 'bg-leaf-500 shadow-none ring-1 ring-white/25 hover:bg-leaf-400')}>
              {tr('export.openFile')}
            </button>
            <button type="button" onClick={() => void saveFile()} className={cn(btn({ variant: 'secondary' }), 'border-[1.5px] border-white/80 bg-transparent text-white hover:bg-white/10')}>
              {saved ? <><CircleCheck className="h-[18px] w-[18px]" aria-hidden="true" /> {tr('export.saved')}</> : tr('export.saveToFiles')}
            </button>
            <Link href="/app/modeles" className={cn(btn({ variant: 'secondary' }), 'border-[1.5px] border-white/80 bg-transparent text-white hover:bg-white/10')}>
              {tr('export.back')}
            </Link>
          </div>
          <p className="sr-only" role="status" aria-live="polite">{saved ? tr('export.savedStatus') : ''}</p>
        </div>
      </div>
    )
  }

  /* ------------------------ Préparation / erreur ------------------------ */
  if (phase === 'progress' || phase === 'error') {
    return (
      <div className="mx-auto flex min-h-[calc(100dvh-6rem)] w-full max-w-md flex-col justify-center px-8 py-10">
        <span aria-hidden="true" className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-night-100 bg-white text-leaf-500 shadow-soft">
          <FileText className="h-9 w-9" strokeWidth={1.8} />
        </span>
        {phase === 'error' ? (
          <div role="alert" className="mt-6 text-center">
            <p className="text-[16px] font-extrabold text-night-900">{tr('export.failedTitle')}</p>
            <p className="mt-1 text-[13px] text-night-600">{tr('export.failedHint')}</p>
            <div className="mt-6 space-y-3">
              <button type="button" onClick={() => void start(format)} className={btn({ variant: 'primary' })}>{tr('export.retry')}</button>
              <button type="button" onClick={() => setPhase('choose')} className={btn({ variant: 'secondary' })}>{tr('export.otherFormat')}</button>
            </div>
          </div>
        ) : (
          <>
            <h1 className="mt-6 text-center text-[16px] font-extrabold text-night-900">{tr('export.preparing')}</h1>
            <p className="mt-1 text-center text-[13px] text-night-600">{tr('export.wait')}</p>
            <ol className="mx-auto mt-10 w-full max-w-[260px] space-y-5" aria-live="polite">
              {STEPS.map((s, i) => {
                const state = i < progress ? 'done' : i === progress ? 'doing' : 'todo'
                return (
                  <li key={s} className="flex items-center gap-3 text-[13.5px]">
                    {state === 'done' ? (
                      <CircleCheck className="h-5 w-5 text-leaf-500" aria-hidden="true" />
                    ) : state === 'doing' ? (
                      <LoaderCircle className="h-5 w-5 text-night-400 motion-safe:animate-spin" aria-hidden="true" />
                    ) : (
                      <span aria-hidden="true" className="h-5 w-5 rounded-full border-2 border-night-200" />
                    )}
                    <span className={state === 'todo' ? 'text-night-400' : 'text-night-800'}>
                      {tr(`export.steps.${s}`)}
                      <span className="sr-only">{state === 'done' ? tr('export.stepDone') : state === 'doing' ? tr('export.stepDoing') : ''}</span>
                    </span>
                  </li>
                )
              })}
            </ol>
          </>
        )}
      </div>
    )
  }

  /* ------------------------- Choix du format ------------------------- */
  const options: { k: ExportFormat; title: string; desc: string; icon: React.ReactNode }[] = [
    { k: 'pdf', title: 'PDF', desc: tr('export.pdfDesc'), icon: <FileIcon tone="red" label="PDF" size="md" /> },
    { k: 'word', title: 'Word (.docx)', desc: tr('export.wordDesc'), icon: <WordGlyph /> },
    { k: 'canva', title: 'Canva', desc: tr('export.canvaDesc'), icon: <CanvaGlyph /> },
  ]

  return (
    <>
      {/* Arrière-plan : le détail du modèle, assombri par la feuille. */}
      <div aria-hidden="true" className="px-4 pt-4">
        <ArrowLeft className="h-[22px] w-[22px] text-night-900" />
        <div className="mt-6 flex justify-center">
          <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-leaf-50 text-leaf-500">
            <FileText className="h-9 w-9" />
          </span>
        </div>
        <p className="mt-4 text-center text-[18px] font-extrabold text-night-900">{m.title}</p>
      </div>

      <Modal
        open
        onClose={() => router.push(`/app/modeles/${m.slug}/lecture`)}
        title={<span className="text-[18px] font-extrabold">{tr('export.modalTitle')}</span>}
        description={tr('export.modalDesc')}
      >
        <ul className="space-y-3 pb-2">
          {options.map((o) => {
            const selected = o.k === format
            return (
              <li key={o.k}>
                <button
                  type="button"
                  onClick={() => void start(o.k)}
                  aria-label={tr('export.optionLabel', { title: o.title, desc: o.desc })}
                  className={cn(
                    'flex min-h-[72px] w-full items-center gap-3.5 rounded-2xl border bg-white px-4 py-3 text-left transition-colors hover:bg-night-50/60',
                    selected ? 'border-leaf-200' : 'border-night-100',
                  )}
                >
                  <span className="flex w-9 shrink-0 justify-center">{o.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-bold text-night-900">{o.title}</span>
                    <span className="block text-[12.5px] text-night-500">{o.desc}</span>
                  </span>
                  {selected ? (
                    <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-full bg-leaf-500 text-white">
                      <Check className="h-4 w-4" strokeWidth={3} />
                    </span>
                  ) : (
                    <ChevronRight className="h-5 w-5 text-night-400" aria-hidden="true" />
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </Modal>
    </>
  )
}
