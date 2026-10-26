'use client'

import { useEffect, useState } from 'react'

/** Date courante côté client uniquement (null au rendu serveur).
 *  Les mocks et l'affichage des heures dépendent du fuseau du navigateur : on ne rend
 *  ces parties qu'après montage pour éviter tout écart d'hydratation serveur (UTC) / client. */
export function useClientNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => setNow(new Date()), [])
  return now
}
