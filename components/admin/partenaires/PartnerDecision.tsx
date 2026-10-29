'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { btnDangerCls, btnPrimaryCls, btnSecondaryCls, fieldCls } from '@/components/admin/ops/ui'
import { PARTNER_CATEGORIES, type PartnerCategory } from '@/lib/partenaires/catalog'
import type { ApplicationStatus } from '@/lib/partenaires/server'

type Initial = { category: PartnerCategory; publicName: string; tagline: string; displayOrder: number }

/** Décision sur une candidature : publier (catégorie, nom, accroche, ordre), refuser, masquer. */
export function PartnerDecision({ id, status, hasLogo, initial, categoryLabels }: {
  id: string
  status: ApplicationStatus
  hasLogo: boolean
  initial: Initial
  categoryLabels: Record<PartnerCategory, string>
}) {
  const router = useRouter()
  const [f, setF] = useState(initial)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const send = async (body: Record<string, unknown>, label: string) => {
    setBusy(label)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/partenaires/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
      if (!res.ok) { setMessage({ tone: 'error', text: json?.error?.message ?? 'Décision impossible.' }); return }
      setMessage({ tone: 'ok', text: body.action === 'approve' ? 'Partenaire publié : il apparaît maintenant sur le site.' : body.action === 'hide' ? 'Partenaire masqué du site.' : 'Candidature refusée.' })
      router.refresh()
    } catch {
      setMessage({ tone: 'error', text: 'Connexion impossible. Réessayez.' })
    } finally {
      setBusy(null)
    }
  }

  const approve = (e: FormEvent) => {
    e.preventDefault()
    void send({ action: 'approve', category: f.category, publicName: f.publicName, tagline: f.tagline, displayOrder: f.displayOrder }, 'approve')
  }

  return (
    <form onSubmit={approve} className="space-y-4">
      <div>
        <label htmlFor="pd-cat" className="mb-1 block text-[13.5px] font-semibold text-night-900">Catégorie sur le site</label>
        <select id="pd-cat" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as PartnerCategory })} className={fieldCls}>
          {PARTNER_CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabels[c]}</option>)}
        </select>
        <p className="mt-1 text-[12.5px] text-night-600">Proposée d’après le profil déclaré.</p>
      </div>
      <div>
        <label htmlFor="pd-name" className="mb-1 block text-[13.5px] font-semibold text-night-900">Nom affiché</label>
        <input id="pd-name" value={f.publicName} onChange={(e) => setF({ ...f, publicName: e.target.value })} required minLength={2} maxLength={120} className={fieldCls} />
      </div>
      <div>
        <label htmlFor="pd-tag" className="mb-1 block text-[13.5px] font-semibold text-night-900">Accroche (facultatif)</label>
        <input id="pd-tag" value={f.tagline} onChange={(e) => setF({ ...f, tagline: e.target.value })} maxLength={80} placeholder="Ex. : Guyane, Parent solo…" className={fieldCls} />
      </div>
      <div>
        <label htmlFor="pd-order" className="mb-1 block text-[13.5px] font-semibold text-night-900">Ordre d’affichage</label>
        <input id="pd-order" type="number" min={0} max={10000} value={f.displayOrder} onChange={(e) => setF({ ...f, displayOrder: Number(e.target.value) || 0 })} className={fieldCls} />
        <p className="mt-1 text-[12.5px] text-night-600">Plus petit = affiché en premier.</p>
      </div>

      {message && <p role={message.tone === 'error' ? 'alert' : 'status'} className={message.tone === 'error' ? 'text-[13.5px] font-semibold text-alert-700' : 'text-[13.5px] font-semibold text-leaf-700'}>{message.text}</p>}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={!hasLogo || busy !== null} aria-busy={busy === 'approve'} className={btnPrimaryCls}>
          {status === 'approved' ? 'Mettre à jour' : 'Valider et publier'}
        </button>
        {status === 'approved' && (
          <button type="button" disabled={busy !== null} onClick={() => void send({ action: 'hide' }, 'hide')} className={btnSecondaryCls}>Masquer du site</button>
        )}
        {status !== 'rejected' && status !== 'approved' && (
          <button type="button" disabled={busy !== null} onClick={() => void send({ action: 'reject' }, 'reject')} className={btnDangerCls}>Refuser</button>
        )}
      </div>
      {!hasLogo && <p className="text-[12.5px] text-night-600">Publication impossible sans logo.</p>}
    </form>
  )
}
