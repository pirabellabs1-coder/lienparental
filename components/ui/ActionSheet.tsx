'use client'
import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/cn'
import { useCloseOnBack } from '@/components/ui/useCloseOnBack'

export type ActionSheetAction = {
  key?: string
  label: string
  icon?: ReactNode
  onClick?: () => void
  variant?: 'default' | 'danger'
  disabled?: boolean
}

type Props = {
  open: boolean
  onClose: () => void
  title?: ReactNode
  description?: ReactNode
  actions: ActionSheetAction[]
  cancelLabel?: string
  className?: string
}

const FOCUSABLE = 'button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])'

export function ActionSheet({ open, onClose, title, description, actions, cancelLabel, className }: Props) {
  const t = useTranslations('account.ui.confirm')
  const ref = useRef<HTMLDivElement>(null)
  const previousActive = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descId = useId()

  const onKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
    if (e.key === 'Tab' && ref.current) {
      const items = ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)
      if (items.length === 0) return
      const first = items[0], last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
  }, [onClose])

  useCloseOnBack(open, onClose)

  useEffect(() => {
    if (!open) return
    previousActive.current = document.activeElement as HTMLElement
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const t = setTimeout(() => ref.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus(), 10)
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      previousActive.current?.focus()
    }
  }, [open, onKey])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center pwa-safe" aria-hidden={!open}>
      <div className="absolute inset-0 bg-night-950/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        className={cn('relative w-full max-w-md animate-fade-up px-3 pb-3', className)}
      >
        <div className="rounded-xl3 bg-white dark:bg-night-900 shadow-card border border-night-100 dark:border-night-800 overflow-hidden">
          {(title || description) && (
            <div className="px-5 py-4 text-center border-b border-night-100 dark:border-night-800">
              {title && <h2 id={titleId} className="text-sm font-semibold text-night-900 dark:text-night-50">{title}</h2>}
              {description && <p id={descId} className="mt-1 text-xs text-night-500 dark:text-night-300">{description}</p>}
            </div>
          )}
          <ul className="divide-y divide-night-100 dark:divide-night-800">
            {actions.map((a, i) => (
              <li key={a.key ?? i}>
                <button
                  type="button"
                  onClick={() => { a.onClick?.(); onClose() }}
                  disabled={a.disabled}
                  className={cn(
                    'flex w-full items-center gap-3 px-5 py-4 text-left text-base font-medium min-h-[56px]',
                    'hover:bg-night-50 dark:hover:bg-night-800 focus-visible:outline-none focus-visible:bg-night-50 dark:focus-visible:bg-night-800',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    a.variant === 'danger' ? 'text-alert-500' : 'text-night-900 dark:text-night-50'
                  )}
                >
                  {a.icon && <span aria-hidden="true" className="shrink-0">{a.icon}</span>}
                  <span className="flex-1">{a.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 flex w-full items-center justify-center rounded-xl3 bg-white dark:bg-night-900 border border-night-100 dark:border-night-800 px-5 py-4 text-base font-semibold text-night-900 dark:text-night-50 shadow-card min-h-[56px] focus-visible:outline-none"
        >
          {cancelLabel ?? t('cancel')}
        </button>
      </div>
    </div>
  )
}
