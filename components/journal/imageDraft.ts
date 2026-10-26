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
