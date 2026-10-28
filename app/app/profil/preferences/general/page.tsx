'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { TitleBar, btn } from '@/components/profil/kit'
import { LabeledSelect } from '@/components/profil/fields'
import { useSyncedPrefs } from '../_lib/useSyncedPrefs'
import { cn } from '@/lib/cn'
import { applyLocale } from '@/lib/i18n/actions'
import { applyTimeZone } from '@/lib/tz-actions'
import { deviceTz } from '@/lib/tz'
import { useTimeZone, useTimeZonePreference } from '@/components/tz/TimeZoneProvider'
import { useTzOptions } from '@/components/tz/useTzOptions'

export default function PreferencesGeneralPage() {
  const t = useTranslations('account.prefs.general')
  const router = useRouter()
  const tt = useTranslations('shared.timezones')
  const { prefs, set, persist, saving, error } = useSyncedPrefs()
  // Fuseau : valeur réellement appliquée (préférence du compte ou cookie de cet appareil) tant
  // que l'utilisateur n'a pas touché au sélecteur (le stockage local peut dater).
  const activeTz = useTimeZone()
  const tzPreference = useTimeZonePreference()
  const tzTouched = useRef(false)
  useEffect(() => {
    if (tzTouched.current) return
    const v = tzPreference ?? activeTz
    if (prefs.fuseau !== v) set('fuseau', v)
  }, [tzPreference, activeTz, prefs.fuseau, set])
  const tzOptions = useTzOptions(prefs.fuseau)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    if (await persist()) {
      // Applique la langue choisie à l’affichage (cookie lp_locale + préférence du compte).
      await applyLocale(prefs.langue)
      // Fuseau : cookie de l'appareil (+ compte) ; le rafraîchissement recalcule toutes les heures.
      if (prefs.fuseau) await applyTimeZone(prefs.fuseau, deviceTz())
      router.refresh()
      router.push('/app/profil/preferences')
    }
  }

  return (
    <>
      <TitleBar title={t('title')} backHref="/app/profil/preferences" subtitle={t('subtitle')} />
      <form onSubmit={submit} className="space-y-7 px-5 pb-8 pt-8">
        {/* Noms natifs, jamais traduits. */}
        <LabeledSelect label={t('language')} value={prefs.langue} onChange={e => set('langue', e.target.value)} options={[
          { value: 'fr', label: 'Français' }, { value: 'en', label: 'English' }, { value: 'pt', label: 'Português' },
        ]} />
        <div>
          <LabeledSelect label={t('timezone')} value={prefs.fuseau} onChange={e => { tzTouched.current = true; set('fuseau', e.target.value) }} options={tzOptions} aria-describedby="tz-hint" />
          <p id="tz-hint" className="mt-2 text-xs text-night-500">{tt('hint')}</p>
        </div>
        <LabeledSelect label={t('dateFormat')} value={prefs.formatDate} onChange={e => set('formatDate', e.target.value)} options={[
          { value: 'dd/mm/yyyy', label: t('dmy') }, { value: 'mm/dd/yyyy', label: t('mdy') }, { value: 'yyyy-mm-dd', label: t('ymd') },
        ]} />
        <LabeledSelect label={t('timeFormat')} value={prefs.formatHeure} onChange={e => set('formatHeure', e.target.value)} options={[
          { value: '24', label: t('h24') }, { value: '12', label: t('h12') },
        ]} />
        {error && <p role="alert" className="mt-6 text-sm font-medium text-alert-500">{error}</p>}
        <button type="submit" disabled={saving} aria-busy={saving} className={cn(btn.primary, '!mt-16')}>{saving ? t('saving') : t('save')}</button>
      </form>
    </>
  )
}
