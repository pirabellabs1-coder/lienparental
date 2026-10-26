'use client'

import { Suspense, useState, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Check, File, FileImage, FileText, FileType, Files, Folder } from 'lucide-react'
import { ScreenHeader } from '@/components/coffre/ScreenHeader'
import { StickyActions } from '@/components/coffre/StickyActions'
import { btn } from '@/components/coffre/buttons'
import { useCategories } from '@/components/coffre/store'
import type { VaultFileType } from '@/lib/mock-vault'

const TYPES: { k: VaultFileType | 'tous'; label: string; icon: ReactNode }[] = [
  { k: 'tous', label: 'Tous les types', icon: <Files className="h-[18px] w-[18px]" /> },
  { k: 'pdf', label: 'PDF', icon: <FileText className="h-[18px] w-[18px]" /> },
  { k: 'image', label: 'Image', icon: <FileImage className="h-[18px] w-[18px]" /> },
  { k: 'word', label: 'Word', icon: <FileType className="h-[18px] w-[18px]" /> },
  { k: 'autre', label: 'Autres', icon: <File className="h-[18px] w-[18px]" /> },
]

function CheckRow({ id, label, icon, checked, onChange }: { id: string; label: string; icon: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex min-h-[44px] cursor-pointer items-center gap-3 py-1">
      <span aria-hidden="true" className="text-night-500">{icon}</span>
      <span className="flex-1 text-[14px] text-night-900">{label}</span>
      <span className="relative flex items-center justify-center">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer h-5 w-5 cursor-pointer appearance-none rounded-[5px] border-2 border-night-300 bg-white transition-colors checked:border-leaf-500 checked:bg-leaf-500"
        />
        <Check className="pointer-events-none absolute h-3.5 w-3.5 text-white opacity-0 peer-checked:opacity-100" strokeWidth={3.2} aria-hidden="true" />
      </span>
    </label>
  )
}

function Filters() {
  const router = useRouter()
  const params = useSearchParams()
  const { categories } = useCategories()

  const [cats, setCats] = useState<string[]>((params.get('cats') ?? '').split(',').filter(Boolean))
  const [types, setTypes] = useState<VaultFileType[]>((params.get('types') ?? '').split(',').filter(Boolean) as VaultFileType[])
  const [du, setDu] = useState(params.get('du') ?? '')
  const [au, setAu] = useState(params.get('au') ?? '')
  const periodError = du && au && du > au ? 'La date de fin doit être postérieure à la date de début.' : ''

  const toggle = <T,>(list: T[], v: T, on: boolean) => (on ? [...list, v] : list.filter((x) => x !== v))

  const reset = () => { setCats([]); setTypes([]); setDu(''); setAu('') }

  const apply = () => {
    if (periodError) return
    const sp = new URLSearchParams()
    const q = params.get('q')
    if (q) sp.set('q', q)
    if (cats.length) sp.set('cats', cats.join(','))
    if (types.length) sp.set('types', types.join(','))
    if (du) sp.set('du', du)
    if (au) sp.set('au', au)
    const qs = sp.toString()
    router.push(`/app/coffre/documents/tous${qs ? `?${qs}` : ''}`)
  }

  return (
    <>
      <ScreenHeader
        title="Filtres"
        leading="close"
        backLabel="Fermer les filtres"
        right={
          <button type="button" onClick={reset} className="-mr-2 inline-flex h-11 items-center rounded-lg px-2 text-[13px] font-bold text-leaf-600 hover:bg-leaf-50">
            Réinitialiser
          </button>
        }
      />
      <div className="px-5">
        <fieldset>
          <legend className="text-[15px] font-extrabold text-night-900">Catégories</legend>
          <p className="text-[12.5px] text-night-500">Sélectionnez une ou plusieurs catégories</p>
          <div className="mt-2">
            {categories.map((c) => (
              <CheckRow
                key={c.id}
                id={`cat-${c.id}`}
                label={c.name}
                icon={<Folder className="h-[18px] w-[18px]" />}
                checked={cats.includes(c.id)}
                onChange={(on) => setCats((xs) => toggle(xs, c.id, on))}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-5">
          <legend className="text-[15px] font-extrabold text-night-900">Type de fichier</legend>
          <div className="mt-2">
            {TYPES.map((t) => (
              <CheckRow
                key={t.k}
                id={`type-${t.k}`}
                label={t.label}
                icon={t.icon}
                checked={t.k === 'tous' ? types.length === 0 : types.includes(t.k)}
                onChange={(on) => {
                  if (t.k === 'tous') { if (on) setTypes([]); return }
                  const k = t.k
                  setTypes((xs) => toggle(xs, k, on))
                }}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-5">
          <legend className="text-[15px] font-extrabold text-night-900">Période</legend>
          <div className="mt-2 space-y-2.5">
            {([['du', 'Du', du, setDu], ['au', 'Au', au, setAu]] as const).map(([id, label, value, set]) => (
              <div key={id} className="flex items-center gap-3">
                <label htmlFor={`periode-${id}`} className="w-10 text-[14px] font-bold text-night-900">{label}</label>
                <div className="flex-1">
                  <input
                    id={`periode-${id}`}
                    type="date"
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    aria-invalid={id === 'au' && periodError ? true : undefined}
                    aria-describedby={id === 'au' && periodError ? 'periode-error' : undefined}
                    className="h-12 w-full rounded-xl border border-night-200 bg-white px-3.5 text-[14px] text-night-900 outline-none focus:border-leaf-500"
                  />
                </div>
              </div>
            ))}
            {periodError && <p id="periode-error" role="alert" className="text-[12.5px] font-semibold text-alert-600">{periodError}</p>}
          </div>
        </fieldset>
      </div>

      <StickyActions>
        <button type="button" onClick={apply} className={btn({ variant: 'primary' })}>Appliquer les filtres</button>
      </StickyActions>
    </>
  )
}

export default function FiltersPage() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-sm text-night-500" role="status">Chargement…</div>}>
      <Filters />
    </Suspense>
  )
}
