'use client'
/**
 * Préférences synchronisées.
 * - Toujours : comportement historique de usePrefs (localStorage + événement
 *   `lp:prefs-changed`, écouté par components/a11y/DisplayPrefs).
 * - Supabase configuré : chargement depuis public.preferences au montage
 *   (la base fait foi), puis enregistrement via Server Action (zod + RLS).
 */
import { useEffect, useRef, useState } from 'react'
import { usePrefs, type Prefs } from '@/components/profil/usePrefs'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { loadPreferences, savePreferences } from '@/lib/auth/actions'

export function useSyncedPrefs() {
  const { prefs, set, save } = usePrefs()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loaded = useRef(false)

  useEffect(() => {
    if (!SUPABASE_ENABLED || loaded.current) return
    loaded.current = true
    loadPreferences()
      .then(res => {
        if (!res.ok) return
        for (const [k, v] of Object.entries(res.data) as [keyof Prefs, Prefs[keyof Prefs]][]) {
          if (v !== undefined) set(k, v)
        }
      })
      .catch(() => undefined)
  }, [set])

  /** Enregistre ; renvoie true si l'utilisateur peut quitter l'écran. */
  const persist = async (): Promise<boolean> => {
    setError(null)
    save() // localStorage + lp:prefs-changed (application immédiate, y compris en démo)
    if (!SUPABASE_ENABLED) return true
    setSaving(true)
    try {
      const res = await savePreferences(prefs)
      if (!res.ok) { setError(res.error); return false }
      return true
    } catch {
      setError('Enregistrement impossible pour le moment. Réessayez dans un instant.')
      return false
    } finally {
      setSaving(false)
    }
  }

  return { prefs, set, persist, saving, error }
}
