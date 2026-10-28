'use client'

import { useTranslations } from 'next-intl'
import { cn } from '@/lib/cn'
import { intlLocale } from '@/lib/i18n/config'
import { currentTz } from '@/lib/tz'
import type { FamilyRole } from '@/lib/coparents/types'

// Petites briques visuelles de la liaison des parents.

const ROLE_TONE: Record<FamilyRole, string> = {
  owner: 'bg-night-50 text-night-800 ring-night-100',
  parent: 'bg-leaf-50 text-leaf-800 ring-leaf-100',
  proche: 'bg-sky-50 text-sky-800 ring-sky-100',
}

export function RoleBadge({ role, className }: { role: FamilyRole; className?: string }) {
  const t = useTranslations('family.coparents.roles')
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset', ROLE_TONE[role], className)}>
      {t(role)}
    </span>
  )
}

const AVATAR_TONE = ['bg-sky-50 text-sky-700', 'bg-leaf-50 text-leaf-700', 'bg-orange-50 text-orange-700', 'bg-night-50 text-night-700']

export function PersonAvatar({ prenom, nom, seed, size = 'md' }: { prenom: string; nom?: string; seed: string; size?: 'sm' | 'md' }) {
  const letters = `${prenom.charAt(0)}${(nom ?? '').charAt(0)}`.toUpperCase() || '?'
  const tone = AVATAR_TONE[[...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_TONE.length]
  return (
    <span aria-hidden="true" className={cn('grid shrink-0 place-items-center rounded-full font-bold', tone, size === 'sm' ? 'h-9 w-9 text-[12px]' : 'h-11 w-11 text-[14px]')}>
      {letters}
    </span>
  )
}

// Les helpers de date acceptent la locale next-intl (défaut 'fr' : rendu historique).
export function frDay(iso: string, withYear = false, locale = 'fr'): string {
  return new Date(iso).toLocaleDateString(intlLocale(locale), { day: 'numeric', month: 'long', ...(withYear ? { year: 'numeric' } : {}), timeZone: currentTz() })
}

/** Date de naissance yyyy-mm-dd → « 12 mai 2019 » (sans décalage de fuseau). */
export function frBirth(day: string | null | undefined, locale = 'fr'): string {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return ''
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(intlLocale(locale), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export function joinNames(names: string[], locale = 'fr'): string {
  if (names.length <= 1) return names[0] ?? ''
  if (locale !== 'fr') return new Intl.ListFormat(intlLocale(locale), { type: 'conjunction' }).format(names)
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`
}

export const linkBtn =
  'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'

/** « de Lina » / « d’Emma » (élision devant une voyelle). */
export function dePrenom(prenom: string): string {
  return /^[aeiouyàâäéèêëîïôöùûüÿæœ]/i.test(prenom.trim()) ? `d’${prenom}` : `de ${prenom}`
}
