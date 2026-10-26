import {
  Baby, HandCoins, HeartPulse, House, PiggyBank, School, ShieldCheck, TreePalm, Users, type LucideIcon,
} from 'lucide-react'
import type { GuideCategoryKey } from '@/lib/guide/types'

export const CATEGORY_ICONS: Record<GuideCategoryKey, LucideIcon> = {
  ecole: School,
  sante: HeartPulse,
  aides: HandCoins,
  argent: PiggyBank,
  assurances: ShieldCheck,
  naissance: Baby,
  separation: Users,
  loisirs: TreePalm,
  logement: House,
}

export function CategoryIcon({ cat, className }: { cat: GuideCategoryKey; className?: string }) {
  const Icon = CATEGORY_ICONS[cat]
  return <Icon className={className} strokeWidth={1.75} aria-hidden="true" />
}
