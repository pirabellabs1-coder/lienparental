'use client'

import { useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { localWallTime, weekdayNames } from '@/components/calendrier/useCalFormat'
import { intlLocale } from '@/lib/i18n/config'
import {
  capitalize, type GardeConfig, type GardeNames, type Handover, type HandoversIcsText, type Rythme,
} from '@/lib/garde'

// Formatage localisé du planning de garde (dates en heure LOCALE, cf. lib/garde).
// Les prénoms (GardeNames) sont déjà localisés par useGardeNames.

/** Noms des vacances (lib/garde → SCHOOL_HOLIDAYS[].nom) → clés calendar.custody.holidays.* */
const HOLIDAY_KEYS: Record<string, string> = {
  'Vacances de la Toussaint': 'toussaint',
  'Vacances de Noël': 'noel',
  'Vacances de Carnaval': 'carnaval',
  "Vacances d'hiver": 'hiver',
  'Vacances de Pâques': 'paques',
  'Vacances de printemps': 'printemps',
}
const SUMMER = /^Vacances d'été (\d{4})$/

export function useGardeFormat(names: GardeNames) {
  const locale = useLocale()
  const t = useTranslations('calendar.custody')

  return useMemo(() => {
    const loc = intlLocale(locale)
    /** Paramètres ICU des phrases avec l'autre parent (`known` : contractions du portugais). */
    const who = { coParent: names.coParent, known: names.coParentKnown ? 'yes' : 'no' }
    /** Accord du verbe avec les enfants (pluriel ICU). */
    const count = names.childrenPlural ? 2 : 1
    /** « 18h », « 18h30 » (fr / pt), « 6:00 PM » (en) */
    const hour = (d: Date) => localWallTime(`${d.getHours()}:${d.getMinutes()}`, locale)
    const rythme = (r: Rythme) => t(`rythmes.${r}`)
    const lieu = (c: Pick<GardeConfig, 'lieu' | 'lieuAutre'>) =>
      c.lieu === 'autre' ? c.lieuAutre?.trim() || t('lieu.autre') : t(`lieu.${c.lieu}`, who)

    return {
      locale,
      who,
      count,
      hour,
      rythme,
      lieu,
      weekdays: weekdayNames(locale),
      monthYear: (d: Date) => d.toLocaleDateString(loc, { month: 'long', year: 'numeric' }),
      /** « vendredi 30 octobre à 18h » */
      handoverDate: (d: Date) =>
        t('handoverAt', { date: d.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' }), time: hour(d) }),
      holiday: (nom: string | null) => {
        if (!nom) return null
        const key = HOLIDAY_KEYS[nom]
        if (key) return t(`holidays.${key}`)
        const summer = SUMMER.exec(nom)
        return summer ? t('holidays.ete', { year: summer[1] }) : nom
      },
      /** Libellés traduits de l'export .ics (lib/garde → buildHandoversIcs). */
      icsText: (config: GardeConfig): HandoversIcsText => {
        const dest = (h: Handover) => (h.to === 'moi' ? t('ics.toMine') : t('ics.toOther', who))
        return {
          calName: t('ics.calName'),
          location: lieu(config),
          summary: (h) => t('ics.summary', { children: names.children, dest: dest(h) }),
          description: (h) =>
            t('ics.description', { children: capitalize(names.children), count, dest: dest(h), rythme: rythme(config.rythme) }),
          alarm: t('ics.alarm'),
        }
      },
    }
  }, [locale, t, names])
}
