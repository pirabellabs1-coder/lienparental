'use client'

import { useCallback } from 'react'
import type { Child } from '@/lib/mock-data'
import { updateChild, useChildData, useChildrenList } from '@/lib/data/children'

/**
 * Accès « enfant » pour les écrans M04, adossé à lib/data/children :
 * Supabase (table `children`, RLS user_id = auth.uid(), médical chiffré côté serveur)
 * quand il est configuré, sinon mockChildren + surcharges sessionStorage (démo).
 */
export function useChild(id: string) {
  const { data, loading, error, refresh, setData } = useChildData(id)
  const save = useCallback(
    async (patch: Partial<Child>) => {
      await updateChild(id, patch)
      setData((c) => (c ? { ...c, ...patch } : null))
    },
    [id, setData],
  )
  return { child: data ?? undefined, save, loading, error, refresh }
}

/** Liste des enfants + états de chargement. */
export function useChildren() {
  return useChildrenList()
}
