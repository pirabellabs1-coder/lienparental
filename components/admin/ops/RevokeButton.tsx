'use client'
/** Révocation d'un lien de témoignage encore ouvert, avec motif contrôlé (aucun texte libre). */
import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import { Ban } from 'lucide-react'
import { Modal } from '@/components/ui'
import { REVOKE_REASONS, REVOKE_REASON_LABEL, type RevokeReason } from '@/lib/admin/ops/types'
import { btnDangerCls, btnSecondaryCls, fieldCls } from './ui'

export function RevokeButton({ id, label }: { id: string; label: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<RevokeReason | ''>('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const selId = useId()

  const submit = async () => {
    if (!reason) { setErr('Choisissez un motif.'); return }
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch(`/api/admin/temoignages/${encodeURIComponent(id)}/revoquer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ reason }),
      })
      const json = await res.json().catch(() => null) as { data?: { revoked: boolean }; error?: { message?: string } } | null
      if (!res.ok) { setErr(json?.error?.message ?? 'Révocation impossible.'); return }
      setOpen(false)
      router.refresh()
    } catch {
      setErr('Connexion impossible. Vérifiez votre réseau.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" className={`${btnSecondaryCls} min-h-[40px] px-3 text-[13px]`} onClick={() => { setOpen(true); setReason(''); setErr(null) }}>
        <Ban className="h-4 w-4" aria-hidden="true" /> Révoquer<span className="sr-only"> le lien {label}</span>
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title="Révoquer ce lien de témoignage ?"
        description="Le témoin ne pourra plus ouvrir ni envoyer ce formulaire. Le parent voit la demande comme révoquée. Aucun contenu n’est lu ni supprimé. Action journalisée."
        footer={
          <>
            <button type="button" className={btnSecondaryCls} onClick={() => setOpen(false)} disabled={busy}>Annuler</button>
            <button type="button" className={btnDangerCls} onClick={() => void submit()} disabled={busy || !reason}>{busy ? 'Révocation…' : 'Révoquer le lien'}</button>
          </>
        }
      >
        <label htmlFor={selId} className="mb-1 block text-[13px] font-bold text-night-900">Motif</label>
        <select id={selId} value={reason} onChange={(e) => setReason(e.target.value as RevokeReason)} className={fieldCls}
          aria-invalid={err ? true : undefined} aria-describedby={err ? `${selId}-err` : undefined}>
          <option value="" disabled>Choisir un motif</option>
          {REVOKE_REASONS.map((r) => <option key={r} value={r}>{REVOKE_REASON_LABEL[r]}</option>)}
        </select>
        {err && <p id={`${selId}-err`} role="alert" className="mt-2 text-[13px] font-semibold text-alert-600">{err}</p>}
      </Modal>
    </>
  )
}
