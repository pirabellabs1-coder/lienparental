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

  const loadThumbs = useCallback(async (list: AlbumPhoto[]) => {
    if (loadingThumbs.current || list.length === 0) return
    loadingThumbs.current = true
    try {
      const ids = list.map((p) => p.id)
      const out: Record<string, string> = {}
      for (let i = 0; i < ids.length; i += MAX_THUMBS_PER_REQUEST) {
        Object.assign(out, await albumThumbUrls(ids.slice(i, i + MAX_THUMBS_PER_REQUEST)))
        setThumbs((t) => ({ ...t, ...out }))
      }
      signedAt.current = Date.now()
    } catch {
      // Vignettes indisponibles : les cases restent en attente ; la liste reste utilisable.
    } finally {
      loadingThumbs.current = false
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
