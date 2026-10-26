'use client'

import { useRouter } from 'next/navigation'
import { Switch } from '@/components/ui'
import { TitleBar, btn } from '@/components/profil/kit'
import { type Prefs } from '@/components/profil/usePrefs'
import { useSyncedPrefs } from '../_lib/useSyncedPrefs'
import { cn } from '@/lib/cn'

const HOURS = Array.from({ length: 24 * 2 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, '0')
  const m = i % 2 ? '30' : '00'
  return { value: `${h}:${m}`, label: `${h}:${m}` }
})

type BoolKey = { [K in keyof Prefs]: Prefs[K] extends boolean ? K : never }[keyof Prefs]

const TOPICS: { key: BoolKey; label: string }[] = [
  { key: 'onMessages', label: 'Nouveaux messages' },
  { key: 'onGarde', label: 'Rappels de garde' },
  { key: 'onCalendrier', label: 'Événements du calendrier' },
  { key: 'onDocuments', label: 'Partages de documents' },
]

export default function PreferencesNotificationsPage() {
  const router = useRouter()
  const { prefs, set, persist, saving, error } = useSyncedPrefs()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    if (await persist()) router.push('/app/profil/preferences')
  }

  const bold = (t: string) => <span className="text-[14px] font-bold">{t}</span>

  return (
    <>
      <TitleBar title="Notifications" backHref="/app/profil/preferences" subtitle="Choisissez comment et quand vous souhaitez être notifié." />
      <form onSubmit={submit} className="px-5 pb-8 pt-5">
        <div className="divide-y divide-night-100">
          <Switch containerClassName="py-3.5" label={bold('Notifications push')} description="Recevez des notifications sur votre appareil." checked={prefs.notifPush} onChange={e => set('notifPush', e.target.checked)} />
          <div className="py-3.5">
            <Switch containerClassName="py-0" label={bold('Rappels journaliers')} description="Recevez un rappel chaque jour à l’heure choisie." checked={prefs.rappels} onChange={e => set('rappels', e.target.checked)} />
            {prefs.rappels && (
              <div className="mt-3">
                <label htmlFor="rappel-heure" className="mb-1.5 ml-1 block text-[12px] text-night-800">Heure du rappel</label>
                <div className="relative">
                  <select
                    id="rappel-heure"
                    value={prefs.rappelHeure}
                    onChange={e => set('rappelHeure', e.target.value)}
                    className="min-h-[48px] w-full appearance-none rounded-xl2 border border-night-100 bg-white pl-4 pr-11 text-[14px] font-bold text-night-900 shadow-soft focus-visible:border-leaf-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-100"
                  >
                    {HOURS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
                  </select>
                  <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute right-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 fill-none stroke-night-900 stroke-2"><path d="m6 9 6 6 6-6" /></svg>
                </div>
              </div>
            )}
          </div>
          <Switch containerClassName="py-3.5" label={bold('Notifications e-mail')} description="Recevez des notifications par e-mail." checked={prefs.notifEmail} onChange={e => set('notifEmail', e.target.checked)} />
        </div>

        <fieldset className="mt-1">
          <legend className="mb-3 text-[14px] font-bold text-night-900">À notifier pour</legend>
          <div className="divide-y divide-night-100 rounded-xl2 border border-night-100 bg-white px-4 shadow-soft">
            {TOPICS.map(t => (
              <Switch
                key={t.key}
                containerClassName="min-h-[50px] py-1.5"
                label={<span className="text-[13px] font-normal">{t.label}</span>}
                checked={prefs[t.key]}
                onChange={e => set(t.key, e.target.checked)}
              />
            ))}
          </div>
        </fieldset>

        {error && <p role="alert" className="mt-6 text-sm font-medium text-alert-500">{error}</p>}

        <button type="submit" disabled={saving} aria-busy={saving} className={cn(btn.primary, 'mt-10')}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
      </form>
    </>
  )
}
