'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ShieldCheck } from 'lucide-react'
import { Switch } from '@/components/ui'
import { TitleBar, btn } from '@/components/profil/kit'
import { PushDeviceCard } from '@/components/profil/PushDeviceCard'
import { type Prefs } from '@/components/profil/usePrefs'
import { useSyncedPrefs } from '../_lib/useSyncedPrefs'
import { cn } from '@/lib/cn'

type BoolKey = { [K in keyof Prefs]: Prefs[K] extends boolean ? K : never }[keyof Prefs]

// Thèmes : coupent l'appareil et l'e-mail du thème (l'historique in-app reste complet).
// Libellés traduits au rendu : account.prefs.notifications.topics.{key}.
const TOPICS: { key: BoolKey }[] = [
  { key: 'onMessages' },
  { key: 'onCalendrier' },
  { key: 'onGarde' },
  { key: 'onDocuments' },
]

// Matrice affichée (lib/notify/events.ts fait foi). Libellés : account.prefs.notifications.matrix.{id}.
const MATRIX: { id: string; device: boolean; email: 'emailMessage' | 'emailEvent' | 'yes' | 'no' }[] = [
  { id: 'message', device: true, email: 'emailMessage' },
  { id: 'event', device: true, email: 'emailEvent' },
  { id: 'reminder', device: true, email: 'yes' },
  { id: 'folder', device: true, email: 'yes' },
  { id: 'invitation', device: true, email: 'yes' },
  { id: 'custody', device: true, email: 'no' },
]

export default function PreferencesNotificationsPage() {
  const t = useTranslations('account.prefs.notifications')
  const router = useRouter()
  const { prefs, set, persist, saving, error } = useSyncedPrefs()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    if (await persist()) router.push('/app/profil/preferences')
  }

  const bold = (text: string) => <span className="text-[14px] font-bold">{text}</span>

  return (
    <>
      <TitleBar title={t('title')} backHref="/app/profil/preferences" subtitle={t('subtitle')} />
      <form onSubmit={submit} className="px-5 pb-8 pt-5">
        <div className="divide-y divide-night-100">
          <div className="pb-3.5">
            <Switch
              containerClassName="py-3.5"
              label={bold(t('push'))}
              description={t('pushText')}
              checked={prefs.notifPush}
              onChange={e => set('notifPush', e.target.checked)}
            />
            <PushDeviceCard accountPushEnabled={prefs.notifPush} />
          </div>
          <Switch
            containerClassName="py-3.5"
            label={bold(t('email'))}
            description={t('emailText')}
            checked={prefs.notifEmail}
            onChange={e => set('notifEmail', e.target.checked)}
          />
          <Switch
            containerClassName="py-3.5"
            label={bold(t('reminders'))}
            description={t('remindersText')}
            checked={prefs.rappels}
            onChange={e => set('rappels', e.target.checked)}
          />
        </div>

        <fieldset className="mt-4">
          <legend className="mb-1 text-[14px] font-bold text-night-900">{t('topicsTitle')}</legend>
          <p className="mb-3 text-[12px] text-night-700">{t('topicsText')}</p>
          <div className="divide-y divide-night-100 rounded-xl2 border border-night-100 bg-white px-4 shadow-soft">
            {TOPICS.map(topic => (
              <Switch
                key={topic.key}
                containerClassName="min-h-[50px] py-1.5"
                label={<span className="text-[13px] font-normal">{t(`topics.${topic.key}`)}</span>}
                checked={prefs[topic.key]}
                onChange={e => set(topic.key, e.target.checked)}
              />
            ))}
          </div>
        </fieldset>

        <div className="mt-6 flex gap-3 rounded-xl2 bg-night-50 p-4">
          <ShieldCheck aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-leaf-600" />
          <p className="text-[13px] leading-5 text-night-800">
            {t('security')}
          </p>
        </div>

        <details className="mt-4 rounded-xl2 border border-night-100 bg-white px-4 py-3 shadow-soft">
          <summary className="cursor-pointer text-[13px] font-bold text-night-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500">
            {t('matrixTitle')}
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-[12px] text-night-800">
              <caption className="sr-only">{t('matrixCaption')}</caption>
              <thead>
                <tr className="border-b border-night-100 text-night-900">
                  <th scope="col" className="py-2 pr-2 font-bold">{t('colEvent')}</th>
                  <th scope="col" className="py-2 pr-2 font-bold">{t('colDevice')}</th>
                  <th scope="col" className="py-2 font-bold">{t('colEmail')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-night-100">
                {MATRIX.map(r => (
                  <tr key={r.id}>
                    <th scope="row" className="py-2 pr-2 font-normal">{t(`matrix.${r.id}`)}</th>
                    <td className="py-2 pr-2">{r.device ? t('yes') : t('no')}</td>
                    <td className="py-2">{t(r.email)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[12px] text-night-700">{t('matrixNote')}</p>
          </div>
        </details>

        {error && <p role="alert" className="mt-6 text-sm font-medium text-alert-500">{error}</p>}

        <button type="submit" disabled={saving} aria-busy={saving} className={cn(btn.primary, 'mt-10')}>{saving ? t('saving') : t('save')}</button>
      </form>
    </>
  )
}
