'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

type Props = {
  open: boolean
  onClose: () => void
  title: ReactNode
  /** Petit pictogramme/étiquette au-dessus du titre */
  eyebrow?: ReactNode
  description?: ReactNode
  children?: ReactNode
  className?: string
}

/**
 * Feuille modale basée sur <dialog> natif : piège du focus, Échap et
 * restitution du focus fournis par la plateforme. Ancrée en bas sur mobile,
 * centrée sur ordinateur.
 */
export function Sheet({ open, onClose, title, eyebrow, description, children, className }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const uid = useId()
  const titleId = `${uid}-title`
  const descId = `${uid}-desc`

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      d.showModal()
      // Élément à privilégier (sinon : premier élément focalisable, choix natif).
      d.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    }
    if (!open && d.open) d.close()
  }, [open])

  useEffect(() => {
    const d = ref.current
    if (!d) return
    const onCancel = (e: Event) => { e.preventDefault(); onClose() }
    d.addEventListener('cancel', onCancel)
    return () => d.removeEventListener('cancel', onCancel)
  }, [onClose])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      className={cn(
        'fixed inset-x-0 bottom-0 top-auto m-0 max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-3xl bg-white p-0 text-night-900 shadow-card',
        'backdrop:bg-night-950/60 backdrop:backdrop-blur-[2px]',
        'lg:inset-0 lg:m-auto lg:h-fit lg:max-w-lg lg:rounded-3xl',
        'open:motion-safe:animate-fade-up',
        className,
      )}
    >
      {open && (
        <div className="px-5 pb-5 pt-3" style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}>
          <div aria-hidden="true" className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-night-100 lg:hidden" />
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              {eyebrow}
              <h2 id={titleId} className="text-[17px] font-extrabold leading-snug text-night-900">{title}</h2>
              {description && <p id={descId} className="mt-1 text-[13px] text-night-600">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="-mr-2 -mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-night-700 hover:bg-night-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div className="mt-4">{children}</div>
        </div>
      )}
    </dialog>
  )
}
