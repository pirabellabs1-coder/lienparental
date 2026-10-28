'use client'
import { useEffect, useState } from 'react'

// Préférences utilisateur, persistées localement en attendant la table Supabase.
// NOTE Supabase: remplacer par `user_preferences` (une ligne par user, RLS user_id).
export type Prefs = {
  langue: string
  fuseau: string
  formatDate: string
  formatHeure: string
  notifPush: boolean
  rappels: boolean
  rappelHeure: string
  notifEmail: boolean
  onMessages: boolean
  onGarde: boolean
  onCalendrier: boolean
  onDocuments: boolean
  theme: 'clair' | 'sombre' | 'auto'
  couleur: string
  taille: 'petite' | 'moyenne' | 'grande'
}

export const DEFAULT_PREFS: Prefs = {
  langue: 'fr',
  // '' = jamais choisi : le fuseau appliqué vient de components/tz/TimeZoneProvider.
  fuseau: '',
  formatDate: 'dd/mm/yyyy',
  formatHeure: '24',
  notifPush: true,
  rappels: true,
  rappelHeure: '20:00',
  notifEmail: true,
  onMessages: true,
  onGarde: true,
  onCalendrier: true,
  onDocuments: true,
  theme: 'clair',
  couleur: 'leaf',
  taille: 'moyenne',
}

const KEY = 'lp-prefs'
export const PREFS_STORAGE_KEY = KEY
/** Émis après chaque enregistrement ; écouté par components/a11y/DisplayPrefs. */
export const PREFS_CHANGED_EVENT = 'lp:prefs-changed'

export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) setPrefs({ ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) })
    } catch { /* stockage indisponible : valeurs par défaut */ }
  }, [])

  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) => setPrefs(p => ({ ...p, [k]: v }))

  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(prefs)) } catch { /* ignoré */ }
    // Les préférences sont transmises dans `detail` : elles s'appliquent même si le stockage a échoué.
    window.dispatchEvent(new CustomEvent<Prefs>(PREFS_CHANGED_EVENT, { detail: prefs }))
  }

  return { prefs, set, save }
}
