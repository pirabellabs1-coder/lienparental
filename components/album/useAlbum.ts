'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { albumThumbUrls, listAlbumPhotos } from '@/lib/data/album'
import { MAX_THUMBS_PER_REQUEST, type AlbumPhoto } from '@/lib/album/types'

/** Liens signés valables 5 min : on les redemande un peu avant. */
const THUMB_TTL_MS = 4 * 60_000

/**
 * Photos de l'album (les miennes + celles que l'autre parent m'a partagées) et leurs vignettes,
 * chargées par lots. `refreshThumbs` est rappelé quand une vignette ne s'affiche plus (lien expiré).
 */
export function useAlbum() {
  const [photos, setPhotos] = useState<AlbumPhoto[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const signedAt = useRef(0)
  const loadingThumbs = useRef(false)
  // Liste demandée pendant un chargement en cours : rechargée juste après, jamais ignorée
  // (sinon les photos ajoutées entre-temps restaient sans vignette jusqu'au renouvellement).
  const queued = useRef<AlbumPhoto[] | null>(null)

  const loadThumbs = useCallback(async (list: AlbumPhoto[]) => {
    if (list.length === 0) return
    if (loadingThumbs.current) { queued.current = list; return }
    loadingThumbs.current = true
    try {
      const ids = list.map((p) => p.id)
      let failed = false
      for (let i = 0; i < ids.length; i += MAX_THUMBS_PER_REQUEST) {
        const batch = ids.slice(i, i + MAX_THUMBS_PER_REQUEST)
        // Un lot en échec (réseau mobile) est retenté une fois, sans bloquer les lots suivants.
        const urls = await albumThumbUrls(batch).catch(() => new Promise<Record<string, string>>((r) => setTimeout(r, 1200)).then(() => albumThumbUrls(batch))).catch(() => { failed = true; return {} })
        setThumbs((t) => ({ ...t, ...urls }))
      }
      if (!failed) signedAt.current = Date.now()
    } finally {
      loadingThumbs.current = false
      const next = queued.current
      queued.current = null
      if (next) void loadThumbs(next)
    }
  }, [])

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const list = await listAlbumPhotos()
      setPhotos(list)
      void loadThumbs(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhotos((p) => p ?? [])
    }
  }, [loadThumbs])

  useEffect(() => { void refresh() }, [refresh])

  const refreshThumbs = useCallback(() => {
    if (photos && Date.now() - signedAt.current > 30_000) void loadThumbs(photos)
  }, [photos, loadThumbs])

  // Renouvellement avant expiration tant que l'écran est ouvert.
  useEffect(() => {
    if (!photos?.length) return
    const id = window.setInterval(() => void loadThumbs(photos), THUMB_TTL_MS)
    return () => window.clearInterval(id)
  }, [photos, loadThumbs])

  /** Mise à jour locale après une modification (sans recharger toute la liste). */
  const patchLocal = useCallback((id: string, patch: Partial<AlbumPhoto>) => {
    setPhotos((list) => list?.map((p) => (p.id === id ? { ...p, ...patch } : p)) ?? list)
  }, [])
  const removeLocal = useCallback((id: string) => {
    setPhotos((list) => list?.filter((p) => p.id !== id) ?? list)
  }, [])

  return { photos, loading: photos === null, error, thumbs, refresh, refreshThumbs, patchLocal, removeLocal }
}
