'use client'
import { useRef, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Modal } from './Modal'
import { Button } from './Button'

type Props = {
  open: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title?: ReactNode
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  loading?: boolean
  tone?: 'danger' | 'default'
}

export function ConfirmDialog({
  open, onClose, onConfirm,
  title = 'Confirmer l’action',
  description = 'Cette action est irréversible.',
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  loading,
  tone = 'danger',
}: Props) {
  const cancelRef = useRef<HTMLElement>(null)

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      initialFocusRef={cancelRef}
      title={
        <span className="flex items-center gap-2">
          {tone === 'danger' && (
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-alert-100 text-alert-500" aria-hidden="true">
              <AlertTriangle className="h-5 w-5" />
            </span>
          )}
          <span>{title}</span>
        </span>
      }
      description={description}
      footer={
        <>
          <Button ref={cancelRef as React.RefObject<HTMLButtonElement>} variant="secondary" onClick={onClose} disabled={loading}>{cancelLabel}</Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={() => void onConfirm()}
            disabled={loading}
          >
            {loading ? 'Patientez…' : confirmLabel}
          </Button>
        </>
      }
    />
  )
}
