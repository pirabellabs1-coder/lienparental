'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type PointerEvent } from 'react'
import { useTranslations } from 'next-intl'
import { Eraser } from 'lucide-react'
import { cn } from '@/lib/cn'

export type SignaturePadHandle = {
  /** PNG de la signature (fond blanc), ou null si rien n'a été tracé ni saisi. */
  toBlob: () => Promise<Blob | null>
  /** Data URL (PNG par défaut ; JPEG pour le PDF : décodage plus fiable dans @react-pdf/renderer). */
  toDataUrl: (type?: 'image/png' | 'image/jpeg') => string | null
}

type Props = {
  /** Nom complet du témoin : utilisé pour la signature saisie au clavier (alternative accessible). */
  name: string
  onChange: (signed: boolean) => void
  describedBy?: string
}

const W = 600
const H = 200

/**
 * Signature tracée à l'écran (souris, doigt, stylet — Pointer Events), avec une alternative
 * au clavier : le témoin peut taper son nom, rendu dans le cadre. Exportée en PNG.
 */
export const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad({ name, onChange, describedBy }, ref) {
  const t = useTranslations('public.witness.sign')
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const [drawn, setDrawn] = useState(false)
  const [typed, setTyped] = useState(false)

  const ctx = () => canvas.current?.getContext('2d') ?? null

  const clear = useCallback(() => {
    const c = ctx()
    if (!c) return
    c.fillStyle = '#fff'
    c.fillRect(0, 0, W, H)
  }, [])

  useEffect(() => { clear() }, [clear])

  // Signature saisie : nom rendu en italique dans le cadre.
  useEffect(() => {
    if (!typed) return
    const c = ctx()
    if (!c) return
    clear()
    c.fillStyle = '#0b2d5b'
    c.font = 'italic 48px "Brush Script MT", "Segoe Script", cursive'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText(name.trim() || '—', W / 2, H / 2, W - 40)
  }, [typed, name, clear])

  useEffect(() => { onChange(typed ? name.trim().length > 0 : drawn) }, [typed, drawn, name, onChange])

  const pos = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }
  }
  const down = (e: PointerEvent<HTMLCanvasElement>) => {
    if (typed) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    last.current = pos(e)
  }
  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return
    const c = ctx()
    if (!c) return
    const p = pos(e)
    c.strokeStyle = '#0b2d5b'
    c.lineWidth = 3
    c.lineCap = 'round'
    c.lineJoin = 'round'
    c.beginPath()
    c.moveTo(last.current.x, last.current.y)
    c.lineTo(p.x, p.y)
    c.stroke()
    last.current = p
    if (!drawn) setDrawn(true)
  }
  const up = () => {
    drawing.current = false
    last.current = null
  }

  const reset = () => {
    clear()
    setDrawn(false)
    setTyped(false)
  }

  useImperativeHandle(ref, () => ({
    toBlob: () => new Promise((resolve) => {
      if (!canvas.current || !(drawn || (typed && name.trim()))) return resolve(null)
      canvas.current.toBlob((b) => resolve(b), 'image/png')
    }),
    toDataUrl: (type = 'image/png') => (canvas.current && (drawn || (typed && name.trim())) ? canvas.current.toDataURL(type, 0.92) : null),
  }), [drawn, typed, name])

  return (
    <div>
      <canvas
        ref={canvas}
        width={W}
        height={H}
        role="img"
        aria-label={t('padLabel')}
        aria-describedby={describedBy}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        className={cn('block aspect-[3/1] w-full touch-none rounded-xl border-2 border-dashed bg-white', drawn || typed ? 'border-leaf-400' : 'border-night-200')}
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-[13px] text-night-700">
          <input type="checkbox" checked={typed} onChange={(e) => { setDrawn(false); setTyped(e.target.checked); if (!e.target.checked) clear() }} className="h-5 w-5 accent-leaf-500" />
          {t('typeInstead')}
        </label>
        <button type="button" onClick={reset} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-night-700 hover:bg-night-50">
          <Eraser className="h-4 w-4" aria-hidden="true" />
          {t('clear')}
        </button>
      </div>
    </div>
  )
})
