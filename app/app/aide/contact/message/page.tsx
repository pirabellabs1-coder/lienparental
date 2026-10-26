'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { TopBar } from '@/components/mobile/TopBar'
import { btn } from '@/components/profil/kit'
import { LabeledInput } from '@/components/profil/fields'
import { cn } from '@/lib/cn'

export default function ContactMessagePage() {
  const router = useRouter()
  const [objet, setObjet] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!objet.trim() || message.trim().length < 10) return setError('Renseignez un objet et un message (10 caractères minimum).')
    setError(undefined)
    setLoading(true)
    try {
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: objet, body: message, category: 'contact' }),
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

  return (
    <>
      <TopBar title="Nous contacter" showBack backHref="/app/aide/contact" showBell={false} />
      <form onSubmit={submit} className="space-y-5 px-5 pb-8 pt-4" noValidate>
        <LabeledInput label="Objet" value={objet} onChange={e => setObjet(e.target.value)} placeholder="Résumé de votre demande" maxLength={120} required />
        <div>
          <label htmlFor="msg" className="mb-2 block text-[13px] font-bold text-night-900">Message</label>
          <textarea
            id="msg"
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={6}
            maxLength={4000}
            required
            placeholder="Décrivez votre demande…"
            aria-describedby={error ? 'msg-err' : undefined}
            className="w-full rounded-xl2 border border-night-100 bg-white px-4 py-3 text-[14px] text-night-900 shadow-soft placeholder:text-night-400 focus-visible:border-leaf-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-100"
          />
        </div>
        {error && <p id="msg-err" role="alert" className="text-xs font-medium text-alert-500">{error}</p>}
        <button type="submit" disabled={loading} aria-busy={loading} className={cn(btn.primary, 'text-[13.5px]')}>
          {loading ? 'Envoi…' : 'Envoyer le message'}
        </button>
      </form>
    </>
  )
}
