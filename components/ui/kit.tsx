import { cn } from '@/lib/cn'

// Briques visuelles partagées (cartes, boutons) — anciennement components/frais/kit.

export const card =
  'rounded-2xl border border-night-100 bg-white shadow-[0_1px_2px_rgba(11,45,91,0.05),0_12px_30px_-18px_rgba(11,45,91,0.2)]'

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400 focus-visible:ring-offset-2'

export const btn = {
  primary: cn(
    'inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-leaf-500 px-5 text-[14px] font-semibold text-white transition hover:bg-leaf-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
    focusRing,
  ),
  secondary: cn(
    'inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-night-200 bg-white px-5 text-[14px] font-semibold text-night-900 transition hover:bg-night-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
    focusRing,
  ),
  danger: cn(
    'inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-alert-500 px-5 text-[14px] font-semibold text-white transition hover:bg-alert-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
    focusRing,
  ),
}
