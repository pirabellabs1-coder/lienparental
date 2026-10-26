'use client'

import { useCallback } from 'react'
import { useChildOptions } from '@/lib/data/children'

/** ids d'enfants → « Lina, Noah » (prénoms), d'après la même source que la fiche enfant (démo ou Supabase). */
export function useChildNames() {
  const { options } = useChildOptions()
  return useCallback(
    (ids?: string[]) => (ids?.length ? options.filter((o) => ids.includes(o.id)).map((o) => o.prenom).join(', ') : ''),
    [options],
  )
}
