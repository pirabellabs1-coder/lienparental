'use client'

import { useEffect } from 'react'
import { isTerritoryCode, territoryCookieString } from '@/lib/guide/territories'

/** Mémorise le territoire affiché (cookie fonctionnel, 1 an) : la prochaine visite du Guide s'ouvre dessus. */
export function rememberGuideTerritory(code: string) {
  if (!isTerritoryCode(code)) return
  try {
    document.cookie = territoryCookieString(code, window.location.protocol === 'https:')
  } catch {
    // Cookies bloqués : le Guide s'ouvrira simplement sur le territoire par défaut.
  }
}

export function RememberGuideTerritory({ code }: { code: string }) {
  useEffect(() => { rememberGuideTerritory(code) }, [code])
  return null
}
