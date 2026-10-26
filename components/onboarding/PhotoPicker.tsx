'use client'

import { useId, useRef, useState, type ChangeEvent } from 'react'
import { Camera, User } from 'lucide-react'
import { cn } from '@/lib/cn'
import { ChildAvatarIllustration } from '@/components/illustrations'

const MAX_BYTES = 5 * 1024 * 1024

type Props = {
  kind: 'parent' | 'child'
  /** Current object URL (or remote URL) of the photo. */
  value: string | null
  /** Receives a fresh object URL, or null when removed. Caller owns revocation. */
  onChange: (url: string | null) => void
  label?: string
  className?: string
}

/**
 * Optional photo picker — round placeholder + camera badge + green
 * "Ajouter une photo (facultatif)" caption (mockup steps 8 & 9).
 * Native file input stays keyboard-focusable; focus ring shown on the visual.
 */
export function PhotoPicker({ kind, value, onChange, label = 'Ajouter une photo', className }: Props) {
  const id = useId()
  const errId = `${id}-err`
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Format non pris en charge. Choisissez une image (JPG, PNG, HEIC…).')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('Image trop lourde (5 Mo maximum).')
      return
    }
    setError(null)
    onChange(URL.createObjectURL(file))
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-4">
        <label
          htmlFor={id}
          className="group relative block shrink-0 cursor-pointer rounded-full has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-leaf-200"
        >
          <input
            ref={inputRef}
            id={id}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={onFile}
            aria-describedby={error ? errId : undefined}
          />
          <span
            className={cn(
              'grid h-[72px] w-[72px] place-items-center overflow-hidden rounded-full',
              kind === 'parent' && !value && 'border border-night-100 bg-night-50 text-night-300',
            )}
          >
            {value ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={value} alt="" className="h-full w-full object-cover" />
            ) : kind === 'child' ? (
              <ChildAvatarIllustration className="h-full w-full" />
            ) : (
              <User className="h-9 w-9" aria-hidden="true" />
            )}
          </span>
          <span
            className={cn(
              'absolute -bottom-0.5 -right-0.5 grid h-7 w-7 place-items-center rounded-full text-white ring-[3px] ring-white transition-transform group-hover:scale-105 motion-reduce:transition-none',
              kind === 'child' ? 'bg-leaf-500' : 'bg-night-900',
            )}
            aria-hidden="true"
          >
            <Camera className="h-3.5 w-3.5" />
          </span>
          <span className="sr-only">{value ? 'Changer la photo' : label} (facultatif)</span>
        </label>

        <div className="min-w-0 text-[13px] font-bold leading-snug text-leaf-600">
          {/* Visual caption only — the input above carries the accessible name. */}
          <span className="block cursor-pointer" aria-hidden="true" onClick={() => inputRef.current?.click()}>
            {value ? 'Changer la photo' : label}
            <br />
            <span className="font-semibold">(facultatif)</span>
          </span>
          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="mt-0.5 block min-h-[32px] text-xs font-semibold text-night-500 underline-offset-2 hover:underline"
            >
              Retirer la photo
            </button>
          )}
        </div>
      </div>
      {error && (
        <p id={errId} role="alert" className="mt-2 text-xs font-semibold text-alert-600">
          {error}
        </p>
      )}
    </div>
  )
}
