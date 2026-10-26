'use client'

import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

/** Three-slot header: left action, centred title (h1), right action — as in the mockups. */
export function EnfantsHeader({ title, left, right }: { title: ReactNode; left?: ReactNode; right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 -mx-4 bg-white/95 px-2 pt-2 backdrop-blur md:-mx-6 md:px-4">
      <div className="grid min-h-[52px] grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="flex justify-start">{left}</div>
        <h1 className="truncate text-center text-[16px] font-extrabold text-night-900">{title}</h1>
        <div className="flex justify-end">{right}</div>
      </div>
    </header>
  )
}

export function BackButton({ href, label = 'Retour' }: { href?: string; label?: string }) {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => (href ? router.push(href) : router.back())}
      aria-label={label}
      className="grid h-11 w-11 place-items-center rounded-full text-night-900 transition-colors hover:bg-night-50"
    >
      <ArrowLeft className="h-[22px] w-[22px]" aria-hidden="true" />
    </button>
  )
}
