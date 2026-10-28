'use client'
import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { TIMEZONE_CHOICES, TZ_AUTO } from '@/lib/timezones'
import { deviceTz } from '@/lib/tz'
import { useTzLabel } from './useTzLabel'

/**
 * Options du sélecteur « Fuseau horaire » : Automatique (appareil), fuseaux proposés,
 * et la valeur actuelle si elle est hors liste (fuseau adopté automatiquement, ex. Europe/Berlin).
 */
export function useTzOptions(current: string): { value: string; label: string }[] {
  const t = useTranslations('shared.timezones')
  const label = useTzLabel()
  // Fuseau de l'appareil lu après le montage : même rendu côté serveur et à l'hydratation.
  const [device, setDevice] = useState<string | null>(null)
  useEffect(() => setDevice(deviceTz()), [])
  return useMemo(() => {
    const opts = [
      { value: TZ_AUTO, label: device ? t('autoNow', { zone: label(device) }) : t('auto') },
      ...TIMEZONE_CHOICES.map(c => ({ value: c.value as string, label: label(c.value) })),
    ]
    if (current && !opts.some(o => o.value === current)) opts.splice(1, 0, { value: current, label: label(current) })
    return opts
  }, [current, device, label, t])
}
