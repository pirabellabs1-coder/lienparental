'use client'

import { Suspense, useId, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Check } from 'lucide-react'
import { Switch } from '@/components/ui'
import { ScreenHeader } from '@/components/coffre/ScreenHeader'
import { CATEGORY_ICONS, ICON_LABELS, PICKER_ICONS } from '@/components/coffre/CategoryIcon'
import { PICKER_TONES, TONES } from '@/components/coffre/tones'
import { useCategories } from '@/components/coffre/store'
import type { VaultIconKey, VaultTone } from '@/lib/mock-vault'
import { cn } from '@/lib/cn'

function NewCategory() {
  const router = useRouter()
  const params = useSearchParams()
  const uid = useId()
  const { categories, add } = useCategories()

  const [name, setName] = useState('')
  const [icon, setIcon] = useState<VaultIconKey>('file')
  const [tone, setTone] = useState<VaultTone>('green')
  const [desc, setDesc] = useState('')
  const [visible, setVisible] = useState(true)
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const trimmed = name.trim()
  const duplicate = categories.some((c) => c.name.toLocaleLowerCase('fr') === trimmed.toLocaleLowerCase('fr'))
  const error = !trimmed ? 'Indiquez un nom de catégorie.' : duplicate ? 'Une catégorie porte déjà ce nom.' : ''

  const save = async () => {
    setTried(true)
    if (error || saving) return
    const slug = trimmed.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    setSaving(true)
    setSaveError('')
    try {
      // Supabase : insert categories (user_id de la session, unique (user_id, name)). Démo : sessionStorage.
      await add({ id: `${slug || 'cat'}-${Date.now().toString(36)}`, name: trimmed, icon, tone, count: 0, description: desc.trim() || undefined, visibleInFilters: visible })
      router.push(params.get('from') === 'ajouter' ? '/app/coffre/ajouter' : '/app/coffre/categories')
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Enregistrement impossible.')
      setSaving(false)
    }
  }

  // Sélecteurs en groupe radio natif : flèches clavier gratuites, état exposé.
  return (
    <>
      <ScreenHeader
        title="Nouvelle catégorie"
        right={
          <button type="button" onClick={() => void save()} disabled={saving} className="-mr-2 inline-flex h-11 items-center rounded-lg px-2 text-[13px] font-bold text-leaf-600 hover:bg-leaf-50">
            Enregistrer
          </button>
        }
      />
      <div className="space-y-6 px-5 pt-1">
        <div>
          <label htmlFor={`${uid}-name`} className="mb-1.5 block text-[13px] font-bold text-night-900">
            Nom de la catégorie<span className="text-alert-500" aria-hidden="true"> *</span>
          </label>
          <input
            id={`${uid}-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex. : Assurances"
            maxLength={40}
            aria-required="true"
            aria-invalid={tried && !!error}
            aria-describedby={tried && error ? `${uid}-name-error` : undefined}
            className={cn(
              'h-12 w-full rounded-xl border bg-white px-3.5 text-[14px] text-night-900 outline-none placeholder:text-night-400 focus:border-leaf-500',
              tried && error ? 'border-alert-400' : 'border-night-200',
            )}
          />
          {tried && error && <p id={`${uid}-name-error`} role="alert" className="mt-1.5 text-[12.5px] font-semibold text-alert-600">{error}</p>}
          {saveError && <p role="alert" className="mt-1.5 text-[12.5px] font-semibold text-alert-600">{saveError}</p>}
        </div>

        <fieldset>
          <legend className="text-[13px] font-bold text-night-900">Icône</legend>
          <div className="mt-2 grid grid-cols-6 gap-2">
            {PICKER_ICONS.map((k) => {
              const Icon = CATEGORY_ICONS[k]
              const on = icon === k
              return (
                <label key={k} className="relative cursor-pointer">
                  <input type="radio" name={`${uid}-icon`} value={k} checked={on} onChange={() => setIcon(k)} className="peer sr-only" />
                  <span className="sr-only">{ICON_LABELS[k]}</span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex aspect-square w-full items-center justify-center rounded-xl border transition-colors peer-focus-visible:ring-4 peer-focus-visible:ring-leaf-200',
                      on ? cn('border-transparent ring-2', TONES[tone].soft, TONES[tone].ring) : 'border-night-200 bg-white text-night-700 hover:bg-night-50',
                    )}
                  >
                    <Icon className="h-[22px] w-[22px]" strokeWidth={1.9} />
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-[13px] font-bold text-night-900">Couleur</legend>
          <div className="mt-2 flex items-center gap-3">
            {PICKER_TONES.map((t) => {
              const on = tone === t
              return (
                <label key={t} className="relative cursor-pointer">
                  <input type="radio" name={`${uid}-tone`} value={t} checked={on} onChange={() => setTone(t)} className="peer sr-only" />
                  <span className="sr-only">{TONES[t].label}</span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex h-11 w-11 items-center justify-center rounded-full ring-offset-2 transition-shadow peer-focus-visible:ring-4 peer-focus-visible:ring-leaf-200',
                      on ? cn(TONES[t].solid, 'ring-2', TONES[t].ring) : cn('border-[2.5px] bg-white', t === 'gray' ? 'border-slate-300 bg-slate-200' : ''),
                    )}
                    style={on ? undefined : { borderColor: undefined }}
                  >
                    {on ? (
                      <Check className="h-5 w-5 text-white" strokeWidth={3} />
                    ) : (
                      <span className={cn('h-7 w-7 rounded-full border-[2.5px] bg-white', {
                        violet: 'border-iris-500', blue: 'border-blue-600', green: 'border-leaf-500', orange: 'border-orange-500 bg-orange-500', pink: 'border-pink-500', gray: 'border-slate-300 bg-slate-300', red: 'border-alert-500',
                      }[t])} />
                    )}
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>

        <div>
          <label htmlFor={`${uid}-desc`} className="mb-1.5 block text-[13px] font-bold text-night-900">Description (facultatif)</label>
          <input
            id={`${uid}-desc`}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Ajoutez une description"
            maxLength={140}
            className="h-12 w-full rounded-xl border border-night-200 bg-white px-3.5 text-[14px] text-night-900 outline-none placeholder:text-night-400 focus:border-leaf-500"
          />
        </div>

        <Switch
          label={<span className="font-bold">Visible dans mes filtres</span>}
          checked={visible}
          onChange={(e) => setVisible(e.target.checked)}
        />
      </div>

    </>
  )
}

export default function NewCategoryPage() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-sm text-night-500" role="status">Chargement…</div>}>
      <NewCategory />
    </Suspense>
  )
}
