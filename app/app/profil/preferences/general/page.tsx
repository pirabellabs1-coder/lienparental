'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { TitleBar, btn } from '@/components/profil/kit'
import { LabeledSelect } from '@/components/profil/fields'
import { useSyncedPrefs } from '../_lib/useSyncedPrefs'
import { cn } from '@/lib/cn'
import { applyLocale } from '@/lib/i18n/actions'

export default function PreferencesGeneralPage() {
  const t = useTranslations('account.prefs.general')
  const router = useRouter()
  const { prefs, set, persist, saving, error } = useSyncedPrefs()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    if (await persist()) {
      // Applique la langue choisie à l’affichage (cookie lp_locale + préférence du compte).
      await applyLocale(prefs.langue)
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
        <LabeledSelect label={t('timezone')} value={prefs.fuseau} onChange={e => set('fuseau', e.target.value)} options={[
          { value: 'Europe/Paris', label: '(GMT+01:00) Paris' }, { value: 'Europe/Brussels', label: t('tz.brussels') },
          { value: 'America/Cayenne', label: '(GMT-03:00) Cayenne' }, { value: 'America/Guadeloupe', label: '(GMT-04:00) Guadeloupe' },
          { value: 'Indian/Reunion', label: t('tz.reunion') }, { value: 'America/Montreal', label: t('tz.montreal') },
        ]} />
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
