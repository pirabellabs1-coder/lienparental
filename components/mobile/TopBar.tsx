'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ArrowLeft, Bell } from 'lucide-react'
import { cn } from '@/lib/cn'

type Props = {
  title?: string
  subtitle?: string
  showBack?: boolean
  backHref?: string
  notificationsCount?: number
  showBell?: boolean
  rightSlot?: React.ReactNode
  className?: string
}

// En-tête des écrans secondaires : flèche retour à gauche, titre centré (cf. maquettes).
export function TopBar({
  title,
  subtitle,
  showBack = false,
  backHref,
  notificationsCount = 0,
  showBell = true,
  rightSlot,
  className,
}: Props) {
  const t = useTranslations('shared.topBar')
  const router = useRouter()
  const handleBack = () => (backHref ? router.push(backHref) : router.back())

  return (
    <header
      className={cn('sticky top-0 z-30 bg-white px-4', className)}
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}
    >
      <div className="relative flex h-12 items-center justify-between">
        <div className="flex w-12 items-center">
          {showBack && (
            <button
              type="button"
              onClick={handleBack}
              aria-label={t('back')}
              className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-night-900 hover:bg-night-50"
            >
              <ArrowLeft className="h-[22px] w-[22px]" aria-hidden />
            </button>
          )}
        </div>

        {title && (
          <div className="pointer-events-none absolute inset-x-14 text-center">
            <h1 className="truncate text-[17px] font-bold text-night-900">{title}</h1>
            {subtitle && <p className="truncate text-xs text-night-600">{subtitle}</p>}
          </div>
        )}

        <div className="flex items-center justify-end gap-1">
          {rightSlot}
          {showBell && (
            <Link
              href="/app/notifications"
              aria-label={notificationsCount > 0 ? t('notificationsUnread', { count: String(notificationsCount) }) : t('notifications')}
              className="relative inline-flex h-11 w-11 items-center justify-center rounded-full text-night-900 hover:bg-night-50"
            >
              <Bell className="h-[22px] w-[22px]" aria-hidden />
              {notificationsCount > 0 && (
                <span aria-hidden className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-leaf-500 ring-2 ring-white" />
              )}
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
