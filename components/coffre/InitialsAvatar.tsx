import { cn } from '@/lib/cn'
import type { VaultTone } from '@/lib/mock-vault'

const RING: Record<VaultTone, string> = {
  green: 'bg-leaf-50 text-leaf-600 ring-leaf-200',
  violet: 'bg-iris-50 text-iris-600 ring-iris-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  orange: 'bg-orange-50 text-orange-700 ring-orange-200',
  pink: 'bg-pink-50 text-pink-700 ring-pink-200',
  gray: 'bg-slate-100 text-slate-600 ring-slate-200',
  red: 'bg-alert-50 text-alert-600 ring-alert-200',
}

/** Pastille d'initiales des témoins (« SD », « ML »…). Décorative : le nom est affiché à côté. */
export function InitialsAvatar({ initials, tone, size = 'md', className }: { initials: string; tone: VaultTone; size?: 'md' | 'lg'; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-extrabold ring-2',
        size === 'lg' ? 'h-14 w-14 text-[17px]' : 'h-11 w-11 text-[14px]',
        RING[tone],
        className,
      )}
    >
      {initials}
    </span>
  )
}
