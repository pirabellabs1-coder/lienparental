'use client'

import { defaultGardeConfig, normalizeZone, type GardeConfig } from '@/lib/garde'
import { saveBlob } from '@/lib/download'

// Persistance de démo (sessionStorage) : rien ne quitte l'appareil.
// TODO Supabase : upsert dans `custody_plans` (RLS household_id), lecture au chargement.

const CONFIG_KEY = 'lp.garde.config.v1'
const FLASH_KEY = 'lp.garde.flash'

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

function isConfig(v: unknown): v is GardeConfig {
  if (!v || typeof v !== 'object') return false
  const c = v as Partial<GardeConfig>
  return (
    typeof c.rythme === 'string' &&
    typeof c.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.startDate) &&
    (c.firstParent === 'moi' || c.firstParent === 'autre') &&
    typeof c.handoverWeekday === 'number' &&
    typeof c.handoverTime === 'string' &&
    Array.isArray(c.customPattern) &&
    typeof c.vacances === 'object' && c.vacances !== null
  )
}

export function loadGardeConfig(today: Date): GardeConfig {
  const fallback = defaultGardeConfig(today)
  const raw = storage()?.getItem(CONFIG_KEY)
  if (!raw) return fallback
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isConfig(parsed)) return fallback
    const vacances = { ...fallback.vacances, ...parsed.vacances }
    return { ...fallback, ...parsed, vacances: { ...vacances, zone: normalizeZone(vacances.zone) } }
  } catch {
    return fallback
  }
}

export function saveGardeConfig(config: GardeConfig): void {
  storage()?.setItem(CONFIG_KEY, JSON.stringify(config))
}

/** Message à afficher une seule fois sur l'écran suivant (après une redirection). */
export function setGardeFlash(message: string): void {
  storage()?.setItem(FLASH_KEY, message)
}

export function takeGardeFlash(): string | null {
  const s = storage()
  const msg = s?.getItem(FLASH_KEY) ?? null
  if (msg) s?.removeItem(FLASH_KEY)
  return msg
}

/** Téléchargement côté client d'un contenu texte. */
export function downloadText(content: string, filename: string, mime: string): void {
  saveBlob(new Blob([content], { type: mime }), filename)
}
