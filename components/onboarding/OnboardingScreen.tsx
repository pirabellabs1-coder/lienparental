'use client'

import type { FormEvent, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/cn'
import { ProgressDots } from './ProgressDots'

type Props = {
  /** Onboarding step (1-ONBOARDING_TOTAL_STEPS) shown bottom-left/right. Omit to hide progress. */
  step?: number
  /** Back target: href, handler, or `false` to hide. Defaults to history back. */
  back?: string | (() => void) | false
  title?: ReactNode
  subtitle?: ReactNode
  align?: 'left' | 'center'
  /** Rendered above the title (illustration, avatar…). */
  media?: ReactNode
  children?: ReactNode
  /** Actions pinned to the bottom of the screen. */
  footer?: ReactNode
  /** When set, body + footer are wrapped in a <form>. */
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void
  className?: string
}

/**
 * Mobile onboarding screen frame: left back arrow, big left-aligned title,
 * content, actions at the bottom, then progress dots + "n / total".
 */
export function OnboardingScreen({
  step,
  back,
  title,
  subtitle,
  align = 'left',
  media,
  children,
  footer,
  onSubmit,
  className,
}: Props) {
  const router = useRouter()
  const t = useTranslations('onb')
  const onBack =
    back === false
      ? null
      : typeof back === 'function'
        ? back
        : typeof back === 'string'
          ? () => router.push(back)
          : () => router.back()

  const body = (
    <>
      <div className="flex-1">{children}</div>
      {footer && <div className="space-y-3 pt-6">{footer}</div>}
    </>
  )

  return (
    <div className={cn('flex flex-1 flex-col px-6 pb-5 pt-3', className)}>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label={t('back')}
          className="-ml-2.5 grid h-11 w-11 shrink-0 place-items-center rounded-full text-night-900 transition-colors hover:bg-night-50"
        >
          <ArrowLeft className="h-[22px] w-[22px]" aria-hidden="true" />
        </button>
      )}

      {(media || title || subtitle) && (
        <header className={cn('mt-2', align === 'center' && 'text-center')}>
          {media}
          {title && (
            <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-night-900">{title}</h1>
          )}
          {subtitle && (
            <p className={cn('mt-2 text-[15px] leading-relaxed text-night-600', align === 'center' && 'mx-auto max-w-[19rem]')}>
              {subtitle}
            </p>
          )}
        </header>
      )}

      {onSubmit ? (
        <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-1 flex-col">
          {body}
        </form>
      ) : (
        <div className="mt-6 flex flex-1 flex-col">{body}</div>
      )}

      {typeof step === 'number' && <ProgressDots current={step} className="pt-6" />}
    </div>
  )
}
