'use client'
import { useEffect, useState } from 'react'
import { wallClockDate } from '@/lib/tz'

/**
 * « Maintenant » du planning de garde : Date flottante (heures locales, cf. lib/garde) à l'heure
 * murale du fuseau de l'utilisateur. Côté client uniquement (null au premier rendu : pas d'écart
 * d'hydratation).
 */
export function useGardeNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => setNow(wallClockDate()), [])
  return now
}
