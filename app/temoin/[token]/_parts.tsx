'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/cn'

/** Desktop: centred white card on a light page. Mobile: full screen (mockup). */
export function WitnessFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-white pwa-safe md:bg-[radial-gradient(1200px_600px_at_50%_-10%,#eef0fb_0%,#f6f7fb_45%,#f6f7fb_100%)] md:px-4">
      <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-white md:my-10 md:min-h-[min(820px,calc(100dvh-5rem))] md:max-w-[440px] md:overflow-hidden md:rounded-3xl md:border md:border-night-100/70 md:shadow-[0_1px_2px_rgba(11,45,91,0.06),0_24px_60px_-24px_rgba(11,45,91,0.18)]">
        {children}
      </main>
    </div>
  )
}

/** Top bar: back arrow + centred title, optional "n / N" counter beneath. */
export function WitnessHeader({
  title,
  counter,
  onBack,
}: {
  title: ReactNode
  counter?: [number, number]
  onBack?: () => void
}) {
  const t = useTranslations('public.witness')
  return (
    <header className="px-4 pt-3">
      <div className="relative flex min-h-[44px] items-center justify-center">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={t('back')}
            className="absolute left-0 grid h-11 w-11 place-items-center rounded-full text-night-900 transition-colors hover:bg-night-50"
          >
            <ArrowLeft className="h-[22px] w-[22px]" aria-hidden="true" />
          </button>
        )}
        <h1
          id="witness-title"
          tabIndex={-1}
          className="px-12 text-center text-[16px] font-extrabold leading-snug text-night-900 outline-none"
        >
          {title}
        </h1>
      </div>
      {counter && (
        <p className="mt-0.5 text-center text-[13px] font-semibold tabular-nums text-night-500">
          <span aria-hidden="true">
            {counter[0]} / {counter[1]}
          </span>
          <span className="sr-only">
            {t('questionOf', { n: counter[0], total: counter[1] })}
          </span>
        </p>
      )}
    </header>
  )
}

/** Small dots row at the bottom (current = green). Decorative. */
export function WitnessDots({ current, total }: { current: number; total: number }) {
  if (total < 2) return null
  return (
    <div className="flex justify-center gap-1.5 pt-5" aria-hidden="true">
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className={cn('h-1.5 w-1.5 rounded-full', i + 1 === current ? 'bg-leaf-500' : 'bg-night-100')} />
      ))}
    </div>
  )
}

/** Screen body + bottom actions. */
export function WitnessBody({ children, footer, className }: { children: ReactNode; footer?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-1 flex-col px-6 pb-5 pt-5', className)}>
      <div className="flex-1">{children}</div>
      {footer && <div className="space-y-2 pt-6">{footer}</div>}
    </div>
  )
}

/** Question label styling (larger than standard field labels). */
export function Q({ children }: { children: ReactNode }) {
  return <span className="block text-[15px] font-bold leading-snug text-night-900">{children}</span>
}

export function SkipLink({ onClick }: { onClick: () => void }) {
  const t = useTranslations('public.witness')
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-[44px] w-full items-center justify-center text-[13px] font-semibold text-night-500 underline-offset-4 hover:text-night-900 hover:underline"
    >
      {t('skip')}
    </button>
  )
}
