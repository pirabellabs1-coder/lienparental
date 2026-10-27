'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Check, Circle, Moon, Sun } from 'lucide-react'
import { TitleBar, btn } from '@/components/profil/kit'
import { type Prefs } from '@/components/profil/usePrefs'
import { useSyncedPrefs } from '../_lib/useSyncedPrefs'
import { cn } from '@/lib/cn'

// Libellés traduits au rendu : account.prefs.appearance.themes / colors / sizes.{value}.
const THEMES: { value: Prefs['theme']; icon: React.ReactNode }[] = [
  { value: 'clair', icon: <Sun className="h-7 w-7" strokeWidth={1.6} /> },
  { value: 'sombre', icon: <Moon className="h-7 w-7" strokeWidth={1.6} /> },
  { value: 'auto', icon: <Circle className="h-7 w-7" strokeWidth={1.6} /> },
]

const COLORS = [
  { value: 'leaf', cls: 'bg-leaf-600' },
  { value: 'blue', cls: 'bg-blue-600' },
  { value: 'iris', cls: 'bg-iris-500' },
  { value: 'orange', cls: 'bg-orange-500' },
  { value: 'red', cls: 'bg-alert-400' },
]

const SIZES: { value: Prefs['taille'] }[] = [
  { value: 'petite' },
  { value: 'moyenne' },
  { value: 'grande' },
]

// NOTE: la taille du texte est appliquée globalement par components/a11y/DisplayPrefs
// (via l'événement `lp:prefs-changed` émis par save()). Le thème et la couleur sont
// enregistrés mais pas encore appliqués : le thème sombre arrivera dans une version ultérieure.
export default function PreferencesApparencePage() {
  const t = useTranslations('account.prefs.appearance')
  const router = useRouter()
  const { prefs, set, persist, saving, error } = useSyncedPrefs()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    if (await persist()) router.push('/app/profil/preferences')
  }

  return (
    <>
      <TitleBar title={t('title')} backHref="/app/profil/preferences" subtitle={t('subtitle')} />
      <form onSubmit={submit} className="px-5 pb-8 pt-6">
        <fieldset aria-describedby="apparence-theme-soon">
          <legend className="mb-4 text-[14px] font-bold text-night-900">{t('theme')}</legend>
          <div className="grid grid-cols-3 gap-3">
            {THEMES.map(th => {
              const on = prefs.theme === th.value
              return (
                <label
                  key={th.value}
                  className={cn(
                    'relative flex min-h-[104px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl2 border bg-white text-[13px] text-night-900 transition-colors',
                    'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-leaf-400',
                    on ? 'border-leaf-500 bg-leaf-50/40 font-semibold' : 'border-night-100 hover:border-night-200',
                  )}
                >
                  <input type="radio" name="theme" value={th.value} checked={on} onChange={() => set('theme', th.value)} className="sr-only" />
                  <span aria-hidden>{th.icon}</span>
                  {t(`themes.${th.value}`)}
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
            {t('themeSoon')}
          </p>
        </fieldset>

        <fieldset className="mt-10" aria-describedby="apparence-couleur-soon">
          <legend className="mb-4 text-[14px] font-bold text-night-900">{t('color')}</legend>
          <div className="flex items-center justify-between px-1">
            {COLORS.map(c => {
              const on = prefs.couleur === c.value
              return (
                <label key={c.value} className="relative inline-flex h-12 w-12 cursor-pointer items-center justify-center rounded-full has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-leaf-500">
                  <input type="radio" name="couleur" value={c.value} checked={on} onChange={() => set('couleur', c.value)} className="sr-only" />
                  <span className="sr-only">{t(`colors.${c.value}`)}</span>
                  <span aria-hidden className={cn('inline-flex h-9 w-9 items-center justify-center rounded-full text-white', c.cls, on && 'ring-2 ring-leaf-500 ring-offset-2')}>
                    {on && <Check className="h-4 w-4" strokeWidth={3} />}
                  </span>
                </label>
              )
            })}
          </div>
          <p id="apparence-couleur-soon" className="mt-3 text-[12.5px] text-night-500">
            {t('colorSoon')}
          </p>
        </fieldset>

        <fieldset className="mt-10">
          <legend className="mb-4 text-[14px] font-bold text-night-900">{t('size')}</legend>
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
                  {t(`sizes.${s.value}`)}
                </label>
              )
            })}
          </div>
        </fieldset>

        {error && <p role="alert" className="mt-6 text-sm font-medium text-alert-500">{error}</p>}

        <button type="submit" disabled={saving} aria-busy={saving} className={cn(btn.primary, 'mt-16')}>{saving ? t('saving') : t('save')}</button>
      </form>
    </>
  )
}
