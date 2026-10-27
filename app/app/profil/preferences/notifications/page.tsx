'use client'

import { useRouter } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { Switch } from '@/components/ui'
import { TitleBar, btn } from '@/components/profil/kit'
import { PushDeviceCard } from '@/components/profil/PushDeviceCard'
import { type Prefs } from '@/components/profil/usePrefs'
import { useSyncedPrefs } from '../_lib/useSyncedPrefs'
import { cn } from '@/lib/cn'

type BoolKey = { [K in keyof Prefs]: Prefs[K] extends boolean ? K : never }[keyof Prefs]

// Thèmes : coupent l'appareil et l'e-mail du thème (l'historique in-app reste complet).
const TOPICS: { key: BoolKey; label: string }[] = [
  { key: 'onMessages', label: 'Messages' },
  { key: 'onCalendrier', label: 'Calendrier partagé et rappels' },
  { key: 'onGarde', label: 'Planning de garde et dépenses partagées' },
  { key: 'onDocuments', label: 'Dossiers partagés et témoignages' },
]

// Matrice affichée (lib/notify/events.ts fait foi).
const MATRIX: { label: string; device: boolean; email: string }[] = [
  { label: 'Nouveau message', device: true, email: 'Si non lu après 5 min, 1 par 30 min au plus' },
  { label: 'Événement partagé ajouté, modifié ou annulé', device: true, email: 'Si prévu dans les 14 jours' },
  { label: 'Rappel avant un événement', device: true, email: 'Oui' },
  { label: 'Dossier partagé, témoignage reçu', device: true, email: 'Oui' },
  { label: 'Invitation acceptée', device: true, email: 'Oui' },
  { label: 'Garde ou dépense modifiée par l’autre parent', device: true, email: 'Non' },
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
          <div className="pb-3.5">
            <Switch
              containerClassName="py-3.5"
              label={bold('Notifications du navigateur')}
              description="Alertes sur les appareils où vous les avez activées, même application fermée."
              checked={prefs.notifPush}
              onChange={e => set('notifPush', e.target.checked)}
            />
            <PushDeviceCard accountPushEnabled={prefs.notifPush} />
          </div>
          <Switch
            containerClassName="py-3.5"
            label={bold('Notifications par e-mail')}
            description="Messages restés non lus, partages, rappels et événements partagés proches."
            checked={prefs.notifEmail}
            onChange={e => set('notifEmail', e.target.checked)}
          />
          <Switch
            containerClassName="py-3.5"
            label={bold('Rappels du calendrier')}
            description="Un rappel avant vos événements et ceux que l’autre parent partage avec vous."
            checked={prefs.rappels}
            onChange={e => set('rappels', e.target.checked)}
          />
        </div>

        <fieldset className="mt-4">
          <legend className="mb-1 text-[14px] font-bold text-night-900">À notifier pour</legend>
          <p className="mb-3 text-[12px] text-night-700">Un thème désactivé ne s’affiche plus que dans l’écran Notifications de l’application.</p>
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

        <div className="mt-6 flex gap-3 rounded-xl2 bg-night-50 p-4">
          <ShieldCheck aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-leaf-600" />
          <p className="text-[13px] leading-5 text-night-800">
            Les alertes de sécurité (connexion depuis un nouvel appareil, mot de passe, adresse e-mail, double authentification,
            code du coffre-fort, suppression du compte) sont toujours envoyées par e-mail et dans l’application, quels que soient ces réglages.
          </p>
        </div>

        <details className="mt-4 rounded-xl2 border border-night-100 bg-white px-4 py-3 shadow-soft">
          <summary className="cursor-pointer text-[13px] font-bold text-night-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500">
            Ce que vous recevez, et où
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-[12px] text-night-800">
              <caption className="sr-only">Canaux utilisés pour chaque type de notification</caption>
              <thead>
                <tr className="border-b border-night-100 text-night-900">
                  <th scope="col" className="py-2 pr-2 font-bold">Événement</th>
                  <th scope="col" className="py-2 pr-2 font-bold">Appareil</th>
                  <th scope="col" className="py-2 font-bold">E-mail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-night-100">
                {MATRIX.map(r => (
                  <tr key={r.label}>
                    <th scope="row" className="py-2 pr-2 font-normal">{r.label}</th>
                    <td className="py-2 pr-2">{r.device ? 'Oui' : 'Non'}</td>
                    <td className="py-2">{r.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[12px] text-night-700">Tout apparaît aussi dans l’écran Notifications. Les notifications ne contiennent jamais le texte de vos messages ni le contenu de vos documents.</p>
          </div>
        </details>

        {error && <p role="alert" className="mt-6 text-sm font-medium text-alert-500">{error}</p>}

        <button type="submit" disabled={saving} aria-busy={saving} className={cn(btn.primary, 'mt-10')}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
      </form>
    </>
  )
}
