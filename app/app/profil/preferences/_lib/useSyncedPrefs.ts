'use client'
/**
 * Préférences synchronisées.
 * - Toujours : comportement historique de usePrefs (localStorage + événement
 *   `lp:prefs-changed`, écouté par components/a11y/DisplayPrefs).
 * - Supabase configuré : chargement depuis public.preferences au montage
 *   (la base fait foi), puis enregistrement via Server Action (zod + RLS).
 */
import { useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { usePrefs, type Prefs } from '@/components/profil/usePrefs'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { loadPreferences, savePreferences } from '@/lib/auth/actions'

export function useSyncedPrefs() {
  const t = useTranslations('account.prefs')
  const locale = useLocale()
  const { prefs, set: rawSet, save } = usePrefs()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loaded = useRef(false)
  // Langue : tant que l'utilisateur n'a pas choisi dans le sélecteur, on affiche la langue
  // réellement utilisée (cookie lp_locale), pas la valeur locale/enregistrée qui peut dater :
  // sinon « Enregistrer » repassait l'application dans une autre langue sans le dire.
  const langTouched = useRef(false)
  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) => {
    if (k === 'langue') langTouched.current = true
    rawSet(k, v)
  }
  useEffect(() => {
    if (!langTouched.current && prefs.langue !== locale) rawSet('langue', locale)
  }, [prefs.langue, locale, rawSet])

  useEffect(() => {
    if (!SUPABASE_ENABLED || loaded.current) return
    loaded.current = true
    loadPreferences()
      .then(res => {
        if (!res.ok) return
        for (const [k, v] of Object.entries(res.data) as [keyof Prefs, Prefs[keyof Prefs]][]) {
          if (v !== undefined) rawSet(k, v)
        }
      })
      .catch(() => undefined)
  }, [rawSet])

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
      setError(t('saveError'))
      return false
    } finally {
      setSaving(false)
    }
  }

  return { prefs, set, persist, saving, error }
}
