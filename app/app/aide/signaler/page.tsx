'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ChevronDown, Plus, TriangleAlert, X } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { btn } from '@/components/profil/kit'
import { LabeledInput } from '@/components/profil/fields'
import { cn } from '@/lib/cn'

const MAX_MB = 5

export default function SignalerPage() {
  const router = useRouter()
  const [type, setType] = useState('')
  const [titre, setTitre] = useState('')
  const [description, setDescription] = useState('')
  const [capture, setCapture] = useState<File | null>(null)
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)

  const onFile = (f?: File) => {
    setError(undefined)
    if (!f) return
    if (!f.type.startsWith('image/')) return setError('La capture doit être une image.')
    if (f.size > MAX_MB * 1024 * 1024) return setError(`Image trop lourde (${MAX_MB} Mo maximum).`)
    setCapture(f)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!type || !titre.trim() || !description.trim()) return setError('Renseignez le type, le titre et la description.')
    setError(undefined)
    setLoading(true)
    // NOTE Supabase: insert `support_reports` + upload de la capture dans `storage.reports` (validation serveur).
    await new Promise(r => setTimeout(r, 500))
    router.push('/app/aide/confirmation')
  }

  const fieldCls = 'w-full rounded-xl2 border border-night-100 bg-white px-4 text-[14px] text-night-900 shadow-soft placeholder:text-night-400 focus-visible:border-leaf-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-100'

  return (
    <>
      <TopBar title="Signaler un problème" showBack backHref="/app/aide" showBell={false} />
      <form onSubmit={submit} noValidate className="px-5 pb-8 pt-3">
        <div className="flex flex-col items-center text-center">
          <span aria-hidden className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-alert-50">
            <span className="inline-flex h-12 w-14 items-center justify-center rounded-lg bg-alert-500 text-white">
              <TriangleAlert className="h-6 w-6" strokeWidth={2.2} />
            </span>
          </span>
          <h1 className="mt-4 text-[15px] font-extrabold text-night-900">Aidez-nous à nous améliorer</h1>
          <p className="mt-2 max-w-[280px] text-[12.5px] leading-relaxed text-night-800">
            Vous rencontrez un bug, un problème technique ou vous avez une suggestion d’amélioration ? Faites-le nous savoir.
          </p>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="type" className="mb-2 block text-[13px] font-bold text-night-900">Type de problème</label>
            <div className="relative">
              <select id="type" value={type} onChange={e => setType(e.target.value)} required className={cn(fieldCls, 'min-h-[46px] appearance-none pr-11', !type && 'text-night-500')}>
                <option value="" disabled>Sélectionner un type</option>
                <option value="bug">Bug / dysfonctionnement</option>
                <option value="technique">Problème technique</option>
                <option value="suggestion">Suggestion d’amélioration</option>
                <option value="abus">Contenu abusif</option>
                <option value="autre">Autre</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-night-900" aria-hidden />
            </div>
          </div>

          <LabeledInput label="Titre" value={titre} onChange={e => setTitre(e.target.value)} placeholder="Résumé du problème" maxLength={120} required />

          <div>
            <label htmlFor="desc" className="mb-2 block text-[13px] font-bold text-night-900">Description</label>
            <textarea id="desc" value={description} onChange={e => setDescription(e.target.value)} rows={3} maxLength={4000} required placeholder="Décrivez le problème en détail…" className={cn(fieldCls, 'py-3')} />
          </div>

          <div>
            <p id="capture-label" className="mb-2 text-[12.5px] text-night-800">Ajouter une capture d’écran (optionnel)</p>
            {capture ? (
              <div className="flex min-h-[46px] items-center gap-2 rounded-xl2 border border-night-100 bg-white px-4 shadow-soft">
                <span className="flex-1 truncate text-[13px] text-night-900">{capture.name}</span>
                <button type="button" onClick={() => setCapture(null)} aria-label="Retirer la capture" className="-mr-3 inline-flex h-11 w-11 items-center justify-center rounded-full text-night-700 hover:bg-night-50">
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ) : (
              <>
                <input id="capture" type="file" accept="image/png,image/jpeg,image/webp" className="peer sr-only" aria-labelledby="capture-label" onChange={e => onFile(e.target.files?.[0])} />
                <label htmlFor="capture" className="flex min-h-[46px] cursor-pointer items-center justify-center gap-2 rounded-xl2 border border-night-100 bg-night-50/50 text-[13px] font-bold text-night-900 hover:bg-night-50 peer-focus-visible:ring-2 peer-focus-visible:ring-leaf-400">
                  <Plus className="h-4 w-4" aria-hidden />
                  Ajouter une image
                </label>
              </>
            )}
          </div>

          {error && <p role="alert" className="text-xs font-medium text-alert-500">{error}</p>}

          <button type="submit" disabled={loading} aria-busy={loading} className={cn(btn.primary, 'text-[13.5px]')}>
            {loading ? 'Envoi…' : 'Envoyer le signalement'}
          </button>
        </div>
      </form>
    </>
  )
}
