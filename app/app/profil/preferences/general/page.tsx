'use client'

import { useRouter } from 'next/navigation'
import { TitleBar, btn } from '@/components/profil/kit'
import { LabeledSelect } from '@/components/profil/fields'
import { useSyncedPrefs } from '../_lib/useSyncedPrefs'
import { cn } from '@/lib/cn'

export default function PreferencesGeneralPage() {
  const router = useRouter()
  const { prefs, set, persist, saving, error } = useSyncedPrefs()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    if (await persist()) router.push('/app/profil/preferences')
  }

  return (
    <>
      <TitleBar title="Général" backHref="/app/profil/preferences" subtitle="Personnalisez les paramètres généraux de votre compte." />
      <form onSubmit={submit} className="space-y-7 px-5 pb-8 pt-8">
        <LabeledSelect label="Langue de l’application" value={prefs.langue} onChange={e => set('langue', e.target.value)} options={[
          { value: 'fr', label: 'Français' }, { value: 'en', label: 'English' }, { value: 'es', label: 'Español' },
        ]} />
        <LabeledSelect label="Fuseau horaire" value={prefs.fuseau} onChange={e => set('fuseau', e.target.value)} options={[
          { value: 'Europe/Paris', label: '(GMT+01:00) Paris' }, { value: 'Europe/Brussels', label: '(GMT+01:00) Bruxelles' },
          { value: 'America/Cayenne', label: '(GMT-03:00) Cayenne' }, { value: 'America/Guadeloupe', label: '(GMT-04:00) Guadeloupe' },
          { value: 'Indian/Reunion', label: '(GMT+04:00) La Réunion' }, { value: 'America/Montreal', label: '(GMT-05:00) Montréal' },
        ]} />
        <LabeledSelect label="Format de la date" value={prefs.formatDate} onChange={e => set('formatDate', e.target.value)} options={[
          { value: 'dd/mm/yyyy', label: 'JJ / MM / AAAA' }, { value: 'mm/dd/yyyy', label: 'MM / JJ / AAAA' }, { value: 'yyyy-mm-dd', label: 'AAAA - MM - JJ' },
        ]} />
        <LabeledSelect label="Format de l’heure" value={prefs.formatHeure} onChange={e => set('formatHeure', e.target.value)} options={[
          { value: '24', label: '24 heures' }, { value: '12', label: '12 heures' },
        ]} />
        {error && <p role="alert" className="mt-6 text-sm font-medium text-alert-500">{error}</p>}
        <button type="submit" disabled={saving} aria-busy={saving} className={cn(btn.primary, '!mt-16')}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
      </form>
    </>
  )
}
