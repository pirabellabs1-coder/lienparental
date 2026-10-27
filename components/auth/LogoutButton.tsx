'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { LogOut } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui'
import { signOutAndRedirect } from '@/lib/auth/browser'
import { cn } from '@/lib/cn'

type Props = {
  /** `sidebar` : ligne de menu ; `icon` : bouton rond (en-tête mobile) ; `button` : bouton pleine largeur. */
  variant?: 'sidebar' | 'icon' | 'button'
  className?: string
}

// Déconnexion accessible partout (menu web, en-tête mobile, profil), avec confirmation.
export function LogoutButton({ variant = 'sidebar', className }: Props) {
  const t = useTranslations('account.profile.home.logout')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const trigger =
    variant === 'icon' ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('button')}
        className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-full text-night-900 hover:bg-night-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500', className)}
      >
        <LogOut className="h-[22px] w-[22px]" strokeWidth={1.8} aria-hidden />
      </button>
    ) : variant === 'button' ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn('inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-night-200 bg-white font-semibold text-night-900 hover:bg-night-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500', className)}
      >
        <LogOut className="h-5 w-5" strokeWidth={1.8} aria-hidden />
        {t('button')}
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn('flex h-11 w-full items-center gap-3 rounded-xl px-3 text-[14.5px] font-semibold text-night-800 transition-colors hover:bg-alert-50 hover:text-alert-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500', className)}
      >
        <LogOut className="h-5 w-5" strokeWidth={1.7} aria-hidden />
        {t('button')}
      </button>
    )

  return (
    <>
      {trigger}
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => {
          setLoading(true)
          void signOutAndRedirect('/onboarding/connexion')
        }}
        loading={loading}
        title={t('title')}
        description={t('description')}
        confirmLabel={t('confirm')}
        tone="danger"
      />
    </>
  )
}
