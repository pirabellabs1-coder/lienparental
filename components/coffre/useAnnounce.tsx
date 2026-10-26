'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'

/**
 * Message de retour éphémère (bandeau + région aria-live) — le Toaster global
 * n'étant pas monté dans l'app, chaque écran gère son propre retour visuel.
 */
export function useAnnounce(duration = 2600) {
  const [message, setMessage] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const announce = useCallback((msg: string) => {
    setMessage(msg)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setMessage(''), duration)
  }, [duration])

  const node = (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4"
      style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {message && (
        <p className="pointer-events-auto inline-flex max-w-[400px] items-center gap-2 rounded-2xl bg-night-900 px-4 py-3 text-[13px] font-semibold text-white shadow-card motion-safe:animate-fade-up">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-leaf-300" aria-hidden="true" />
          {message}
        </p>
      )}
    </div>
  )

  return { announce, node }
}
