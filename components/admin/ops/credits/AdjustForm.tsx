'use client'
/** Ajustement manuel d'un solde de crédits IA : motif obligatoire, journalisé, jamais négatif. */
import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { btnPrimaryCls, fieldCls } from '../ui'

const newKey = () => crypto.randomUUID().replace(/-/g, '')

export function AdjustForm({ userId, disabled }: { userId: string; disabled: boolean }) {
  const router = useRouter()
  const [wallet, setWallet] = useState<'monthly' | 'purchased'>('purchased')
  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState('')
  // Une clé par intention : un double clic n'ajuste qu'une fois ; renouvelée après succès ou modification.
  const [key, setKey] = useState(newKey)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const ids = { wallet: useId(), delta: useId(), reason: useId() }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/admin/credits/adjust', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, wallet, delta: Number(delta), reason, key }),
      })
      const json = await res.json().catch(() => null) as { data?: { outcome: string; total: number | null }; error?: { message?: string } } | null
      if (!res.ok) { setMsg({ tone: 'error', text: json?.error?.message ?? 'Ajustement impossible.' }); return }
      setMsg({ tone: 'ok', text: json?.data?.outcome === 'duplicate' ? 'Déjà enregistré (aucun second ajustement).' : `Ajustement enregistré. Nouveau total : ${json?.data?.total ?? '—'} crédits.` })
      setDelta('')
      setReason('')
      setKey(newKey())
      router.refresh()
    } catch {
      setMsg({ tone: 'error', text: 'Connexion impossible. Vérifiez votre réseau.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 text-[14px]">
      <fieldset disabled={disabled || busy} className="grid gap-3 sm:grid-cols-3">
        <label htmlFor={ids.wallet} className="block">
          <span className="mb-1 block text-[13px] text-night-700">Solde</span>
          <select id={ids.wallet} className={fieldCls} value={wallet} onChange={(e) => { setWallet(e.target.value as 'monthly' | 'purchased'); setKey(newKey()) }}>
            <option value="purchased">Acheté (B) — lot admin, validité standard</option>
            <option value="monthly">Mensuel (A) — période en cours seulement</option>
          </select>
        </label>
        <label htmlFor={ids.delta} className="block">
          <span className="mb-1 block text-[13px] text-night-700">Crédits (+ ajout, − retrait)</span>
          <input id={ids.delta} type="number" step={1} min={-1000} max={1000} required className={fieldCls} value={delta} onChange={(e) => { setDelta(e.target.value); setKey(newKey()) }} />
        </label>
        <label htmlFor={ids.reason} className="block sm:col-span-3">
          <span className="mb-1 block text-[13px] text-night-700">Motif (obligatoire, visible dans le journal des crédits)</span>
          <textarea id={ids.reason} required minLength={5} maxLength={500} rows={2} className={fieldCls} value={reason} onChange={(e) => { setReason(e.target.value); setKey(newKey()) }} />
        </label>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={btnPrimaryCls} disabled={disabled || busy || !Number(delta) || reason.trim().length < 5}>
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> {busy ? 'Enregistrement…' : 'Ajuster le solde'}
        </button>
        <p role={msg?.tone === 'error' ? 'alert' : 'status'} className={msg?.tone === 'error' ? 'text-[13px] font-medium text-alert-700' : 'text-[13px] text-leaf-700'}>{msg?.text}</p>
      </div>
    </form>
  )
}
