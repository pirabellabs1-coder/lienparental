import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/cn'
import { childProfileStatus, type Child } from '@/lib/mock-data'

const SIZES = {
  md: 'h-16 w-16 text-xl',
  xl: 'h-28 w-28 text-4xl',
} as const

/** Round child photo, or initial on a soft green disc when no photo. */
export function ChildAvatar({ child, src, size = 'md', className }: { child: Child; src?: string | null; size?: keyof typeof SIZES; className?: string }) {
  const photo = src ?? child.photoUrl
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center overflow-hidden rounded-full bg-leaf-50 font-extrabold text-leaf-700 ring-1 ring-night-100',
        SIZES[size],
        className,
      )}
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden="true">{child.prenom.charAt(0).toUpperCase()}</span>
      )}
    </span>
  )
}

/** "Profil à jour" (green) / "Informations incomplètes" (orange). Text label, not colour-only. */
export function ChildStatusBadge({ child, className }: { child: Child; className?: string }) {
  const t = useTranslations('family.children.common')
  const ok = childProfileStatus(child) === 'complet'
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold',
        ok ? 'bg-leaf-50 text-leaf-700' : 'bg-orange-50 text-orange-700',
        className,
      )}
    >
      {ok ? t('profileUpToDate') : t('profileIncomplete')}
    </span>
  )
}

/** Icon + label + value row used in the profile recap. */
export function DetailRow({ icon, label, value }: { icon: ReactNode; label: ReactNode; value?: ReactNode }) {
  const t = useTranslations('family.children.common')
  const empty = value === undefined || value === null || value === ''
  return (
    <div className="flex items-start gap-3 py-1.5 text-[13px]">
      <span className="mt-px grid h-5 w-5 shrink-0 place-items-center text-night-500" aria-hidden="true">
        {icon}
      </span>
      <dt className="w-32 shrink-0 text-night-600">{label}</dt>
      <dd className={cn('min-w-0 flex-1 break-words font-semibold', empty ? 'font-medium italic text-night-400' : 'text-night-900')}>
        {empty ? t('notProvided') : value}
      </dd>
    </div>
  )
}
