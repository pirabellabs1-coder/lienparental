import {
  CalendarRange, SquareUser, Stethoscope, Wallet, Mail, Shapes,
  Folder, FileText, Heart, Landmark, Lock, type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import type { VaultIconKey, VaultTone } from '@/lib/mock-vault'
import { TONES } from './tones'

export const CATEGORY_ICONS: Record<VaultIconKey, LucideIcon> = {
  calendar: CalendarRange,
  badge: SquareUser,
  health: Stethoscope,
  wallet: Wallet,
  mail: Mail,
  shapes: Shapes,
  folder: Folder,
  file: FileText,
  heart: Heart,
  bank: Landmark,
  lock: Lock,
}

/** Icônes du sélecteur « Nouvelle catégorie » (ordre de la maquette). */
export const PICKER_ICONS: VaultIconKey[] = ['folder', 'file', 'heart', 'bank', 'mail', 'lock']

type Props = {
  icon: VaultIconKey
  tone: VaultTone
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZES = {
  sm: { box: 'h-9 w-9 rounded-lg', icon: 'h-[18px] w-[18px]' },
  md: { box: 'h-10 w-10 rounded-xl', icon: 'h-5 w-5' },
  lg: { box: 'h-12 w-12 rounded-xl', icon: 'h-6 w-6' },
}

/** Pastille d'icône de catégorie — décorative (le nom est toujours affiché à côté). */
export function CategoryIcon({ icon, tone, size = 'md', className }: Props) {
  const Icon = CATEGORY_ICONS[icon] ?? Folder
  const s = SIZES[size]
  return (
    <span aria-hidden="true" className={cn('inline-flex shrink-0 items-center justify-center', s.box, TONES[tone].soft, className)}>
      <Icon className={s.icon} strokeWidth={1.9} />
    </span>
  )
}
