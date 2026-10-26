'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ChevronDown, TriangleAlert } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { btn } from '@/components/profil/kit'
import { LabeledInput } from '@/components/profil/fields'
import { cn } from '@/lib/cn'

export default function SignalerPage() {
  const router = useRouter()
  const [type, setType] = useState('')
  const [titre, setTitre] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!type || !titre.trim() || description.trim().length < 10) return setError('Renseignez le type, le titre et la description (10 caractères minimum).')
    setError(undefined)
    setLoading(true)
    try {
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: titre, body: description, category: type }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => null)
        setError(j?.error?.message ?? 'Envoi impossible.')
        setLoading(false)
        return
      }
      router.push('/app/aide/confirmation')
    } catch {
      setError('Envoi impossible.')
      setLoading(false)
    }
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
            <textarea id="desc" aria-describedby={error ? 'signal-err' : undefined} value={description} onChange={e => setDescription(e.target.value)} rows={3} maxLength={4000} required placeholder="Décrivez le problème en détail…" className={cn(fieldCls, 'py-3')} />
          </div>

          {error && <p id="signal-err" role="alert" className="text-xs font-medium text-alert-500">{error}</p>}

          <button type="submit" disabled={loading} aria-busy={loading} className={cn(btn.primary, 'text-[13.5px]')}>
            {loading ? 'Envoi…' : 'Envoyer le signalement'}
          </button>
        </div>
      </form>
    </>
  )
}
