'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Onboarding draft kept in sessionStorage so the recap screen reflects what
 * the user typed. Never stores the password.
 * Photos are kept as in-memory object URLs only (not persisted).
 * With Supabase, `child.id` is the public.children id once saved (re-editing
 * from the recap updates the same row instead of inserting a duplicate).
 */
export type OnboardingChildDraft = { id?: string; prenom: string; dateNaissance: string; classe?: string }

export type OnboardingDraft = {
  prenom?: string
  nom?: string
  email?: string
  child?: OnboardingChildDraft | null
}

const KEY = 'lp:onboarding-draft'

function safeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null
  } catch {
    return null
  }
}

export function readDraft(): OnboardingDraft {
  const s = safeStorage()
  if (!s) return {}
  try {
    const raw = s.getItem(KEY)
    return raw ? (JSON.parse(raw) as OnboardingDraft) : {}
  } catch {
    return {}
  }
}

export function writeDraft(patch: Partial<OnboardingDraft>) {
  const s = safeStorage()
  if (!s) return
  try {
    s.setItem(KEY, JSON.stringify({ ...readDraft(), ...patch }))
  } catch {
    /* quota / private mode: ignore, draft is a convenience only */
  }
}

export function clearDraft() {
  safeStorage()?.removeItem(KEY)
  setDraftPhoto('parent', null)
  setDraftPhoto('child', null)
}

/** Hydrates the draft after mount (avoids SSR/client mismatch). */
export function useOnboardingDraft() {
  const [draft, setDraft] = useState<OnboardingDraft>({})
  const [ready, setReady] = useState(false)
  useEffect(() => {
    setDraft(readDraft())
    setReady(true)
  }, [])
  const update = useCallback((patch: Partial<OnboardingDraft>) => {
    writeDraft(patch)
    setDraft((d) => ({ ...d, ...patch }))
  }, [])
  return { draft, update, ready }
}

// --- photos (memory only) ---------------------------------------------------
type PhotoKind = 'parent' | 'child'
const photos: Partial<Record<PhotoKind, string>> = {}

export function getDraftPhoto(kind: PhotoKind): string | null {
  return photos[kind] ?? null
}

export function setDraftPhoto(kind: PhotoKind, url: string | null) {
  const prev = photos[kind]
  if (prev && prev !== url) URL.revokeObjectURL(prev)
  if (url) photos[kind] = url
  else delete photos[kind]
}
