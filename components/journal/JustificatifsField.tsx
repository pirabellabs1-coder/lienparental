'use client'

import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { FileText, LockKeyhole, Paperclip, X } from 'lucide-react'
import { FieldError, FieldLabel } from '@/components/journal/FormFields'
import { fmtSize } from '@/components/journal/journalData'
import { cn } from '@/lib/cn'
import { useFinanceLabels } from '@/components/journal/financeLabels'
import { MAX_JUSTIFICATIFS, justificatifError, type DepenseJustificatif } from '@/lib/journal-finances'

/** Aperçus locaux (object URL) des images choisies ; libérés à chaque changement et au démontage. */
function usePreviews(files: File[]): (string | null)[] {
  const [urls, setUrls] = useState<(string | null)[]>([])
  useEffect(() => {
    const u = files.map((f) => (f.type.startsWith('image/') && f.type !== 'image/heic' ? URL.createObjectURL(f) : null))
    setUrls(u)
    return () => u.forEach((x) => x && URL.revokeObjectURL(x))
  }, [files])
  return urls
}

/**
 * Plusieurs justificatifs (photo ou PDF, 10 Mo chacun, 10 au total) :
 * justificatifs déjà enregistrés (`kept`, modification) + nouveaux fichiers (`added`).
 */
export function JustificatifsField({
  kept, added, onKeptChange, onAddedChange,
}: {
  kept: DepenseJustificatif[]
  added: File[]
  onKeptChange: (list: DepenseJustificatif[]) => void
  onAddedChange: (list: File[]) => void
}) {
  const t = useTranslations('family.journal.receipts')
  const fl = useFinanceLabels()
  const locale = useLocale()
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string>()
  const previews = usePreviews(added)
  const total = kept.length + added.length
  const full = total >= MAX_JUSTIFICATIFS

  function onFiles(ev: ChangeEvent<HTMLInputElement>) {
    const list = Array.from(ev.target.files ?? [])
    ev.target.value = ''
    setError(undefined)
    if (!list.length) return
    const ok: File[] = []
    const rejected: string[] = []
    for (const f of list) {
      const err = justificatifError(f)
      if (err) rejected.push(t('fileRejected', { name: f.name, error: fl.error(err) ?? err }))
      else ok.push(f)
    }
    const room = MAX_JUSTIFICATIFS - total
    if (ok.length > room) rejected.push(t('tooMany', { max: MAX_JUSTIFICATIFS, count: ok.length - room }))
    if (rejected.length) setError(rejected.join(' '))
    if (ok.length && room > 0) onAddedChange([...added, ...ok.slice(0, room)])
  }

  const refocus = () => requestAnimationFrame(() => inputRef.current?.focus())

  return (
    <div>
      <FieldLabel htmlFor={inputId}>{t('label')}</FieldLabel>

      {total > 0 && (
        <ul className="mb-2.5 space-y-2" aria-label={t('attached')}>
          {kept.map((j, i) => (
            <Item
              key={`k-${j.path ?? j.name}-${i}`}
              name={j.name}
              meta={`${j.sizeBytes ? fmtSize(j.sizeBytes, locale) : ''}${j.sizeBytes ? ' · ' : ''}${t('alreadySaved')}`}
              onRemove={() => { onKeptChange(kept.filter((_, k) => k !== i)); refocus() }}
            />
          ))}
          {added.map((f, i) => (
            <Item
              key={`a-${f.name}-${f.size}-${i}`}
              name={f.name}
              meta={`${fmtSize(f.size, locale)} · ${t('new')}`}
              preview={previews[i] ?? null}
              onRemove={() => { onAddedChange(added.filter((_, k) => k !== i)); refocus() }}
            />
          ))}
        </ul>
      )}

      <label
        htmlFor={inputId}
        aria-disabled={full || undefined}
        className={cn(
          'flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-night-200 bg-white p-3.5 text-center transition-colors',
          'has-[:focus-visible]:border-leaf-500 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-leaf-500',
          full ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-leaf-400 hover:bg-leaf-50/40',
          error && 'border-alert-400',
        )}
      >
        <Paperclip aria-hidden="true" className="h-5 w-5 text-leaf-600" strokeWidth={1.8} />
        <span className="text-[13px] font-semibold text-night-900">
          {full ? t('maxReached') : total ? t('addAnother') : t('addFirst')}
        </span>
        <span className="text-xs text-night-600">{t('hint', { max: MAX_JUSTIFICATIFS })}</span>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          multiple
          disabled={full}
          // Sans image/heic : l'iPhone convertit en JPEG, lisible par l'autre parent sur Android.
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={onFiles}
          aria-describedby={`${inputId}-note${error ? ` ${inputId}-err` : ''}`}
          aria-invalid={error ? true : undefined}
          className="sr-only"
        />
      </label>
      <FieldError id={`${inputId}-err`}>{error}</FieldError>
      <p id={`${inputId}-note`} className="mt-1.5 flex items-center gap-1.5 text-xs text-night-600">
        <LockKeyhole aria-hidden="true" className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
        {total ? `${t('count', { count: total })} · ` : ''}{t('privacy')}
      </p>
    </div>
  )
}

function Item({ name, meta, preview, onRemove }: { name: string; meta: string; preview?: string | null; onRemove: () => void }) {
  const t = useTranslations('family.journal.receipts')
  return (
    <li className="flex items-center gap-3 rounded-xl border border-night-100 bg-white p-2.5">
      <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-night-50">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- aperçu local (object URL)
          <img src={preview} alt="" width={48} height={48} className="h-full w-full object-cover" />
        ) : (
          <FileText aria-hidden="true" className="h-5 w-5 text-night-600" strokeWidth={1.7} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-night-900">{name}</span>
        <span className="block text-xs text-night-600">{meta}</span>
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t('remove', { name })}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-night-700 hover:bg-alert-50 hover:text-alert-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500"
      >
        <X aria-hidden="true" className="h-5 w-5" />
      </button>
    </li>
  )
}
