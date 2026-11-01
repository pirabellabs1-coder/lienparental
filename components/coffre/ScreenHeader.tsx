'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/cn'

type Props = {
  title?: ReactNode
  /** Texte additionnel pour lecteurs d'écran (ex. « Étape 2 sur 4 »). */
  srSuffix?: string
  /** Icône de gauche : flèche retour (défaut) ou croix de fermeture. */
  leading?: 'back' | 'close' | 'none'
  /** Destination explicite ; sinon `onBack`, sinon historique. */
  backHref?: string
  onBack?: () => void
  backLabel?: string
  right?: ReactNode
  /** Titre aligné à gauche, grand (écrans racine type « Coffre-fort »). */
  large?: boolean
  className?: string
}

const iconBtn = 'inline-flex h-11 w-11 items-center justify-center rounded-full text-night-900 transition-colors hover:bg-night-50'

/**
 * En-tête des écrans du coffre-fort, fidèle aux maquettes : flèche (ou croix)
 * à gauche, titre centré en gras, actions à droite. Pas de cloche sur les sous-écrans.
 */
export function ScreenHeader({ title, srSuffix, leading = 'back', backHref, onBack, backLabel, right, large, className }: Props) {
  const router = useRouter()
  const t = useTranslations('vault.common')
  const Icon = leading === 'close' ? X : ArrowLeft
  const label = backLabel ?? (leading === 'close' ? t('close') : t('back'))

  const lead =
    leading === 'none' ? null : onBack ? (
      <button type="button" onClick={onBack} aria-label={label} className={cn(iconBtn, '-ml-2')}>
        <Icon className="h-[22px] w-[22px]" aria-hidden="true" />
      </button>
    ) : backHref ? (
      <Link href={backHref} aria-label={label} className={cn(iconBtn, '-ml-2')}>
        <Icon className="h-[22px] w-[22px]" aria-hidden="true" />
      </Link>
    ) : (
      <button type="button" onClick={() => router.back()} aria-label={label} className={cn(iconBtn, '-ml-2')}>
        <Icon className="h-[22px] w-[22px]" aria-hidden="true" />
      </button>
    )

  return (
    <header
      className={cn('sticky top-0 z-30 bg-white/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-white/85', className)}
      data-safe-top style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}
    >
      {large ? (
        <div className="flex h-14 items-center justify-between gap-2">
          {lead}
          <h1 className="min-w-0 flex-1 truncate text-[24px] font-extrabold tracking-[-0.02em] text-night-900">
            {title}
            {srSuffix && <span className="sr-only"> — {srSuffix}</span>}
          </h1>
          <div className="flex items-center gap-1">{right}</div>
        </div>
      ) : (
        <div className="relative flex h-14 items-center justify-between">
          <div className="flex w-12 items-center">{lead}</div>
          {title && (
            <h1 className="absolute inset-x-14 truncate text-center text-[17px] font-bold text-night-900">
              {title}
              {srSuffix && <span className="sr-only"> — {srSuffix}</span>}
            </h1>
          )}
          <div className="relative z-10 flex min-w-12 items-center justify-end gap-1">{right}</div>
        </div>
      )}
    </header>
  )
}

export const headerIconBtn = iconBtn
