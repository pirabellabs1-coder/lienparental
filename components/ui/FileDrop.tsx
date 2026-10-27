'use client'
import { useCallback, useId, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { UploadCloud, X, FileText, Image as ImageIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/cn'

export type FileDropError = 'type' | 'size' | 'count'

export type FileDropProps = {
  label?: string
  hint?: string
  error?: string
  accept?: string
  multiple?: boolean
  maxFiles?: number
  maxSizeMB?: number
  value?: File[]
  defaultValue?: File[]
  onChange?: (files: File[]) => void
  onReject?: (reason: FileDropError, file: File) => void
  helperText?: ReactNode
  className?: string
  disabled?: boolean
  required?: boolean
}

function formatSize(bytes: number, t: (key: string, values: Record<string, string | number>) => string): string {
  if (bytes < 1024) return t('sizeB', { n: bytes })
  if (bytes < 1024 * 1024) return t('sizeKB', { n: (bytes / 1024).toFixed(1) })
  return t('sizeMB', { n: (bytes / 1024 / 1024).toFixed(1) })
}

export function FileDrop({
  label, hint, error, accept, multiple = false, maxFiles = 5, maxSizeMB = 10,
  value, defaultValue = [], onChange, onReject, helperText, className, disabled, required
}: FileDropProps) {
  const t = useTranslations('account.ui.fileDrop')
  const autoId = useId()
  const inputId = `${autoId}-file`
  const hintId = `${autoId}-hint`
  const errorId = `${autoId}-error`
  const inputRef = useRef<HTMLInputElement>(null)
  const [internal, setInternal] = useState<File[]>(defaultValue)
  const [dragOver, setDragOver] = useState(false)
  const [localError, setLocalError] = useState<string | undefined>()

  const files = value ?? internal

  const commit = (next: File[]) => {
    if (value === undefined) setInternal(next)
    onChange?.(next)
  }

  const validate = useCallback((incoming: File[]) => {
    const types = (accept ?? '').split(',').map(s => s.trim()).filter(Boolean)
    const accepted: File[] = []
    for (const f of incoming) {
      if (types.length > 0) {
        const okType = types.some(t => {
          if (t.startsWith('.')) return f.name.toLowerCase().endsWith(t.toLowerCase())
          if (t.endsWith('/*')) return f.type.startsWith(t.slice(0, -1))
          return f.type === t
        })
        if (!okType) { onReject?.('type', f); setLocalError(t('badType', { name: f.name })); continue }
      }
      if (maxSizeMB && f.size > maxSizeMB * 1024 * 1024) {
        onReject?.('size', f); setLocalError(t('tooBig', { max: maxSizeMB })); continue
      }
      accepted.push(f)
    }
    return accepted
  }, [accept, maxSizeMB, onReject, t])

  const handleFiles = useCallback((incoming: FileList | File[]) => {
    setLocalError(undefined)
    const list = Array.from(incoming)
    const valid = validate(list)
    const next = multiple ? [...files, ...valid].slice(0, maxFiles) : valid.slice(0, 1)
    if (next.length < [...files, ...valid].length) {
      onReject?.('count', valid[0])
      setLocalError(t('tooMany', { max: maxFiles }))
    }
    commit(next)
  }, [files, multiple, maxFiles, validate, onReject, t])

  const onDrop = (e: DragEvent) => {
    e.preventDefault(); setDragOver(false)
    if (disabled) return
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files)
  }

  const remove = (idx: number) => {
    commit(files.filter((_, i) => i !== idx))
  }

  const effectiveError = error ?? localError

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-night-900 dark:text-night-50 mb-1.5">
          {label}
          {required && <span className="text-alert-500 ml-0.5" aria-hidden="true">*</span>}
        </label>
      )}
      <div
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); inputRef.current?.click() } }}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
        aria-describedby={[hint ? hintId : null, effectiveError ? errorId : null].filter(Boolean).join(' ') || undefined}
        className={cn(
          'relative flex flex-col items-center justify-center gap-2 min-h-[160px] rounded-xl2 border-2 border-dashed p-6 text-center cursor-pointer transition-colors',
          'bg-white dark:bg-night-900 border-night-200 dark:border-night-700',
          'hover:border-leaf-400 hover:bg-leaf-50/40 dark:hover:bg-leaf-900/10',
          'focus-visible:outline-none focus-visible:border-leaf-500',
          dragOver && 'border-leaf-500 bg-leaf-50 dark:bg-leaf-900/20',
          disabled && 'opacity-50 cursor-not-allowed hover:border-night-200 hover:bg-white',
          effectiveError && 'border-alert-400'
        )}
      >
        <UploadCloud className="h-7 w-7 text-leaf-500" aria-hidden="true" />
        <div className="text-sm font-medium text-night-900 dark:text-night-50">
          {t.rich('drop', { browse: (chunks) => <span className="text-leaf-600 dark:text-leaf-400 underline">{chunks}</span> })}
        </div>
        <p className="text-xs text-night-500 dark:text-night-300">
          {helperText ?? (<>{t('max', { max: maxSizeMB })}{accept ? ` · ${accept}` : ''}</>)}
        </p>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
          className="sr-only"
        />
      </div>

      {files.length > 0 && (
        <ul className="mt-3 space-y-2" aria-label={t('selected')}>
          {files.map((f, i) => {
            const isImage = f.type.startsWith('image/')
            const url = isImage ? URL.createObjectURL(f) : null
            return (
              <li key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-xl2 border border-night-200 dark:border-night-700 bg-white dark:bg-night-900 p-2.5 shadow-soft">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-night-50 dark:bg-night-800 overflow-hidden">
                  {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : isImage ? <ImageIcon className="h-5 w-5 text-night-400" /> : <FileText className="h-5 w-5 text-night-400" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-night-900 dark:text-night-50">{f.name}</p>
                  <p className="text-xs text-night-500 dark:text-night-300">{formatSize(f.size, t)}</p>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); remove(i) }}
                  aria-label={t('remove', { name: f.name })}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-night-500 hover:text-alert-500 hover:bg-alert-50 dark:hover:bg-alert-900/20 focus-visible:outline-none"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {hint && !effectiveError && <p id={hintId} className="mt-1.5 text-xs text-night-500 dark:text-night-300">{hint}</p>}
      {effectiveError && <p id={errorId} role="alert" className="mt-1.5 text-xs font-medium text-alert-500">{effectiveError}</p>}
    </div>
  )
}
