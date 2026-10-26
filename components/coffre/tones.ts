import type { VaultTone } from '@/lib/mock-vault'

/**
 * Classes Tailwind statiques par teinte de catégorie (le JIT a besoin de
 * chaînes littérales). `soft` = pastille claire, `solid` = aplat, `text` = texte.
 */
export const TONES: Record<VaultTone, { soft: string; solid: string; text: string; ring: string; label: string }> = {
  violet: { soft: 'bg-iris-50 text-iris-500',     solid: 'bg-iris-500',   text: 'text-iris-600',   ring: 'ring-iris-500',   label: 'Violet' },
  blue:   { soft: 'bg-blue-50 text-blue-600',     solid: 'bg-blue-600',   text: 'text-blue-700',   ring: 'ring-blue-600',   label: 'Bleu' },
  green:  { soft: 'bg-leaf-50 text-leaf-500',     solid: 'bg-leaf-500',   text: 'text-leaf-600',   ring: 'ring-leaf-500',   label: 'Vert' },
  orange: { soft: 'bg-orange-50 text-orange-500', solid: 'bg-orange-500', text: 'text-orange-700', ring: 'ring-orange-500', label: 'Orange' },
  pink:   { soft: 'bg-pink-50 text-pink-500',     solid: 'bg-pink-500',   text: 'text-pink-700',   ring: 'ring-pink-500',   label: 'Rose' },
  gray:   { soft: 'bg-slate-100 text-slate-500',  solid: 'bg-slate-400',  text: 'text-slate-600',  ring: 'ring-slate-400',  label: 'Gris' },
  red:    { soft: 'bg-alert-50 text-alert-500',   solid: 'bg-alert-500',  text: 'text-alert-600',  ring: 'ring-alert-500',  label: 'Rouge' },
}

/** Couleurs proposées dans « Nouvelle catégorie » (ordre de la maquette). */
export const PICKER_TONES: VaultTone[] = ['violet', 'blue', 'green', 'orange', 'pink', 'gray']
