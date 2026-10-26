'use client'

import { useRouter } from 'next/navigation'
import { Check, Circle, Moon, Sun } from 'lucide-react'
import { TitleBar, btn } from '@/components/profil/kit'
import { type Prefs } from '@/components/profil/usePrefs'
import { useSyncedPrefs } from '../_lib/useSyncedPrefs'
import { cn } from '@/lib/cn'

const THEMES: { value: Prefs['theme']; label: string; icon: React.ReactNode }[] = [
  { value: 'clair', label: 'Clair', icon: <Sun className="h-7 w-7" strokeWidth={1.6} /> },
  { value: 'sombre', label: 'Sombre', icon: <Moon className="h-7 w-7" strokeWidth={1.6} /> },
  { value: 'auto', label: 'Auto', icon: <Circle className="h-7 w-7" strokeWidth={1.6} /> },
]

const COLORS = [
  { value: 'leaf', label: 'Vert', cls: 'bg-leaf-600' },
  { value: 'blue', label: 'Bleu', cls: 'bg-blue-600' },
  { value: 'iris', label: 'Violet', cls: 'bg-iris-500' },
  { value: 'orange', label: 'Orange', cls: 'bg-orange-500' },
  { value: 'red', label: 'Rouge', cls: 'bg-alert-400' },
]

const SIZES: { value: Prefs['taille']; label: string }[] = [
  { value: 'petite', label: 'Petite' },
  { value: 'moyenne', label: 'Moyenne' },
  { value: 'grande', label: 'Grande' },
]

// NOTE: la taille du texte est appliquée globalement par components/a11y/DisplayPrefs
// (via l'événement `lp:prefs-changed` émis par save()). Le thème et la couleur sont
// enregistrés mais pas encore appliqués : le thème sombre arrivera dans une version ultérieure.
export default function PreferencesApparencePage() {
  const router = useRouter()
  const { prefs, set, persist, saving, error } = useSyncedPrefs()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    if (await persist()) router.push('/app/profil/preferences')
  }

  return (
    <>
      <TitleBar title="Apparence" backHref="/app/profil/preferences" subtitle="Personnalisez l’apparence de l’application selon vos préférences." />
      <form onSubmit={submit} className="px-5 pb-8 pt-6">
        <fieldset aria-describedby="apparence-theme-soon">
          <legend className="mb-4 text-[14px] font-bold text-night-900">Thème</legend>
          <div className="grid grid-cols-3 gap-3">
            {THEMES.map(t => {
              const on = prefs.theme === t.value
              return (
                <label
                  key={t.value}
                  className={cn(
                    'relative flex min-h-[104px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl2 border bg-white text-[13px] text-night-900 transition-colors',
                    'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-leaf-400',
                    on ? 'border-leaf-500 bg-leaf-50/40 font-semibold' : 'border-night-100 hover:border-night-200',
                  )}
                >
                  <input type="radio" name="theme" value={t.value} checked={on} onChange={() => set('theme', t.value)} className="sr-only" />
                  <span aria-hidden>{t.icon}</span>
                  {t.label}
                  {on && (
                    <span aria-hidden className="absolute -right-2 -top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-leaf-500 text-white ring-2 ring-white">
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                  )}
                </label>
              )
            })}
          </div>
          <p id="apparence-theme-soon" className="mt-3 text-[12.5px] text-night-500">
            Bientôt disponible. Votre choix est enregistré, le thème sombre arrivera dans une prochaine version.
          </p>
        </fieldset>

        <fieldset className="mt-10" aria-describedby="apparence-couleur-soon">
          <legend className="mb-4 text-[14px] font-bold text-night-900">Couleur principale</legend>
          <div className="flex items-center justify-between px-1">
            {COLORS.map(c => {
              const on = prefs.couleur === c.value
              return (
                <label key={c.value} className="relative inline-flex h-12 w-12 cursor-pointer items-center justify-center rounded-full has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-leaf-500">
                  <input type="radio" name="couleur" value={c.value} checked={on} onChange={() => set('couleur', c.value)} className="sr-only" />
                  <span className="sr-only">{c.label}</span>
                  <span aria-hidden className={cn('inline-flex h-9 w-9 items-center justify-center rounded-full text-white', c.cls, on && 'ring-2 ring-leaf-500 ring-offset-2')}>
                    {on && <Check className="h-4 w-4" strokeWidth={3} />}
                  </span>
                </label>
              )
            })}
          </div>
          <p id="apparence-couleur-soon" className="mt-3 text-[12.5px] text-night-500">
            Bientôt disponible. Votre choix est enregistré et sera appliqué dans une prochaine version.
          </p>
        </fieldset>

        <fieldset className="mt-10">
          <legend className="mb-4 text-[14px] font-bold text-night-900">Taille du texte</legend>
          <div className="flex gap-3">
            {SIZES.map(s => {
              const on = prefs.taille === s.value
              return (
                <label
                  key={s.value}
                  className={cn(
                    'inline-flex min-h-[46px] flex-1 cursor-pointer items-center justify-center rounded-xl2 border bg-white text-[13.5px] text-night-900 transition-colors',
                    'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-leaf-400',
                    on ? 'border-leaf-500 bg-leaf-50/40 font-bold' : 'border-night-100 hover:border-night-200',
                  )}
                >
                  <input type="radio" name="taille" value={s.value} checked={on} onChange={() => set('taille', s.value)} className="sr-only" />
                  {s.label}
                </label>
              )
            })}
          </div>
        </fieldset>

        {error && <p role="alert" className="mt-6 text-sm font-medium text-alert-500">{error}</p>}

        <button type="submit" disabled={saving} aria-busy={saving} className={cn(btn.primary, 'mt-16')}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
      </form>
    </>
  )
}
