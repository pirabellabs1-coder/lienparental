'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/cn'

type Props = {
  /** URL affichée sans protocole (ex. lienparental.fr/t/AB7XkL). */
  link: string
  label?: string
  tone?: 'iris' | 'night'
  variant?: 'card' | 'field'
  className?: string
}

/** Copie dans le presse-papiers avec repli pour navigateurs sans Clipboard API. */
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

/** Bloc « Lien de témoignage » + bouton copier, avec confirmation annoncée (aria-live). */
export function CopyLinkField({ link, label = 'Lien de témoignage', tone = 'iris', variant = 'card', className }: Props) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const onCopy = async () => {
    const ok = await copyText(`https://${link}`)
    if (!ok) return
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 2200)
  }

  const linkCls = tone === 'iris' ? 'text-iris-600' : 'text-night-700'

  return (
    <div
      className={cn(
        'flex items-center gap-3',
        variant === 'card' ? 'rounded-2xl border border-night-100 bg-white px-4 py-3 shadow-soft' : 'rounded-xl border border-night-100 bg-night-50/60 px-4 py-2',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {variant === 'card' && <p className="text-[13px] font-bold text-night-900">{label}</p>}
        <p className={cn('truncate text-[14px] font-semibold', linkCls)}>{link}</p>
      </div>
      <button
        type="button"
        onClick={onCopy}
        aria-label={copied ? 'Lien copié' : `Copier le lien ${link}`}
        className={cn(
          'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors',
          copied ? 'bg-leaf-50 text-leaf-600' : 'text-night-700 hover:bg-night-50',
        )}
      >
        {copied ? <Check className="h-5 w-5" aria-hidden="true" /> : <Copy className="h-5 w-5" aria-hidden="true" />}
      </button>
      <span className="sr-only" role="status" aria-live="polite">{copied ? 'Lien copié dans le presse-papiers' : ''}</span>
    </div>
  )
}
