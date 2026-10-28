'use client'
import { useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { tzChoiceKey, utcOffsetLabel } from '@/lib/timezones'

/**
 * Libellé traduit d'un fuseau : « Paris (UTC+01:00) ». Fuseau hors liste : nom IANA lisible
 * (« America/New York »). Décalage calculé à l'instant présent (heure d'été comprise).
 */
export function useTzLabel() {
  const t = useTranslations('shared.timezones')
  return useCallback((tz: string, withOffset = true) => {
    const key = tzChoiceKey(tz)
    const name = key ? t(`zones.${key}`) : tz.replace(/_/g, ' ')
    const offset = withOffset ? utcOffsetLabel(tz) : ''
    return offset ? `${name} (${offset})` : name
  }, [t])
}
