'use client'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/cn'
import { useCloseOnBack } from '@/components/ui/useCloseOnBack'

type Props = {
  open: boolean
  onClose: () => void
  title?: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  closeOnBackdrop?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
  initialFocusRef?: React.RefObject<HTMLElement | null>
}

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function Modal({ open, onClose, title, description, children, footer, closeOnBackdrop = true, size = 'md', className, initialFocusRef }: Props) {
  const t = useTranslations('account.ui.modal')
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousActive = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descId = useId()

  // Dernières valeurs dans des refs : l'effet ne dépend que de `open`, un nouveau rendu
  // du parent (onClose recréé, état « loading »…) ne vole donc jamais le focus.
  const onCloseRef = useRef(onClose)
  const initialFocus = useRef(initialFocusRef)
  useEffect(() => {
    onCloseRef.current = onClose
    initialFocus.current = initialFocusRef
  })

  useCloseOnBack(open, onClose)

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCloseRef.current() }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    previousActive.current = document.activeElement as HTMLElement
    document.addEventListener('keydown', handleKey)
    const body = document.body
    const prev = body.style.overflow
    body.style.overflow = 'hidden'
    const t = setTimeout(() => {
      const target = initialFocus.current?.current ?? dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE) ?? dialogRef.current
      target?.focus()
    }, 10)
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', handleKey)
      body.style.overflow = prev
      previousActive.current?.focus()
    }
  }, [open])

  if (!open) return null

  const sizeCls = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-md'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center pwa-safe"
      aria-hidden={!open}
    >
      <div
        className="absolute inset-0 bg-night-950/60 backdrop-blur-sm"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          'relative w-full rounded-t-xl3 sm:rounded-xl3 bg-white dark:bg-night-900 shadow-card border border-night-100 dark:border-night-800',
          'max-h-[92dvh] overflow-hidden flex flex-col animate-fade-up',
          sizeCls, className
        )}
      >
        {(title || true) && (
          <div className="flex items-start justify-between gap-4 px-5 pt-5">
            <div className="min-w-0">
              {title && <h2 id={titleId} className="font-display text-xl text-night-900 dark:text-night-50">{title}</h2>}
              {description && <p id={descId} className="mt-1 text-sm text-night-500 dark:text-night-300">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('close')}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-night-500 hover:bg-night-50 dark:hover:bg-night-800 focus-visible:outline-none"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        )}
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        {footer && (
          <div className="px-5 pb-5 pt-2 border-t border-night-100 dark:border-night-800 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
