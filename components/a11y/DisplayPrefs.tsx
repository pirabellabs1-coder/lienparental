'use client'

import { useEffect } from 'react'
import { PREFS_CHANGED_EVENT, PREFS_STORAGE_KEY, type Prefs } from '@/components/profil/usePrefs'

type TextSize = Prefs['taille']
const SIZES: readonly TextSize[] = ['petite', 'moyenne', 'grande']

function isTextSize(v: unknown): v is TextSize {
  return typeof v === 'string' && (SIZES as readonly string[]).includes(v)
}

function readStoredSize(): TextSize {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY)
    if (!raw) return 'moyenne'
    const parsed = JSON.parse(raw) as Partial<Prefs> | null
    return isTextSize(parsed?.taille) ? parsed.taille : 'moyenne'
  } catch {
    return 'moyenne'
  }
}

function apply(size: TextSize) {
  document.documentElement.setAttribute('data-text-size', size)
}

/**
 * Applique les préférences d'affichage (CDC M12-05) sur <html> :
 * `data-text-size="petite|moyenne|grande"`. Les règles CSS correspondantes sont dans app/globals.css.
 * Se synchronise avec les autres onglets (événement `storage`) et avec l'écran Apparence
 * (événement `lp:prefs-changed` émis par usePrefs().save()).
 * Le thème et la couleur principale restent stockés mais ne sont pas encore appliqués.
 */
export function DisplayPrefs() {
  useEffect(() => {
    apply(readStoredSize())

    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === PREFS_STORAGE_KEY) apply(readStoredSize())
    }
    const onChanged = (e: Event) => {
      const detail = (e as CustomEvent<Partial<Prefs> | undefined>).detail
      apply(isTextSize(detail?.taille) ? detail.taille : readStoredSize())
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener(PREFS_CHANGED_EVENT, onChanged)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(PREFS_CHANGED_EVENT, onChanged)
    }
  }, [])

  return null
}
