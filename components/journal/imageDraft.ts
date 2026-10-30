'use client'

import { useSyncExternalStore } from 'react'

// Brouillon d'images partagé entre « Ajouter un événement » / « Détail » et l'écran
// « Ajouter des images ». Vit en mémoire (module) : il survit à la navigation client
// mais pas à un rechargement — les fichiers ne sont jamais persistés côté navigateur.
// Supabase plug-in point : à l'enregistrement, uploader chaque `file` dans le storage privé.

export type DraftImage = {
  id: string
  file: File
  /** Object URL pour l'aperçu (images uniquement) */
  previewUrl?: string
}

export const MAX_FILES = 10
export const MAX_SIZE_BYTES = 10 * 1024 * 1024

const drafts = new Map<string, DraftImage[]>()
const listeners = new Set<() => void>()
const EMPTY: DraftImage[] = []

function emit() {
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

export function getDraft(key: string): DraftImage[] {
  return drafts.get(key) ?? EMPTY
}

/** Remplace le brouillon ; révoque les aperçus qui ne sont plus utilisés. */
export function setDraft(key: string, next: DraftImage[]) {
  const keep = new Set(next.map((d) => d.id))
  for (const d of getDraft(key)) if (!keep.has(d.id) && d.previewUrl) URL.revokeObjectURL(d.previewUrl)
  drafts.set(key, next)
  emit()
}

export function clearDraft(key: string) {
  setDraft(key, [])
  drafts.delete(key)
  forms.delete(key)
}

export function useImageDraft(key: string): DraftImage[] {
  return useSyncExternalStore(subscribe, () => getDraft(key), () => EMPTY)
}

let seq = 0
export function toDraftImage(file: File): DraftImage {
  seq += 1
  return {
    id: `${Date.now().toString(36)}-${seq}`,
    file,
    previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
  }
}

// Brouillon des champs du formulaire, le temps de l'aller-retour vers « Ajouter des images »
// (l'écran du formulaire est démonté pendant ce temps). Même vie que les images : mémoire seule.
// Durée de vie courte : quitté par le menu, il ne doit pas réapparaître dans une saisie ultérieure.
const FORM_DRAFT_TTL_MS = 15 * 60 * 1000
const forms = new Map<string, { value: unknown; at: number }>()

export function saveFormDraft<T>(key: string, value: T) {
  forms.set(key, { value, at: Date.now() })
}

export function peekFormDraft<T>(key: string): T | undefined {
  const d = forms.get(key)
  return d && Date.now() - d.at < FORM_DRAFT_TTL_MS ? (d.value as T) : undefined
}

export function dropFormDraft(key: string) {
  forms.delete(key)
}
