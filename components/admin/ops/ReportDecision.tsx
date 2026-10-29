'use client'
/** Décision sur un signalement de témoignage : rejeter (le témoignage reste) ou supprimer le témoignage. */
import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import { Check, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui'
import { btnDangerCls, btnSecondaryCls, fieldCls } from './ui'

type Decision = 'rejected' | 'removed'

export function ReportDecision({ id, reference }: { id: string; reference: string }) {
  const router = useRouter()
  const [decision, setDecision] = useState<Decision | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const noteId = useId()

  const submit = async () => {
    if (!decision) return
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch(`/api/admin/temoignages/signalements/${encodeURIComponent(id)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ decision, note: note.trim() || undefined }),
      })
      const json = await res.json().catch(() => null) as { error?: { message?: string } } | null
      if (!res.ok) { setErr(json?.error?.message ?? 'Décision impossible.'); return }
      setDecision(null)
      router.refresh()
    } catch {
      setErr('Connexion impossible. Vérifiez votre réseau.')
    } finally {
      setBusy(false)
    }
  }

  const open = (d: Decision) => { setDecision(d); setNote(''); setErr(null) }
  const removing = decision === 'removed'

  return (
    <>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={`${btnSecondaryCls} min-h-[40px] px-3 text-[13px]`} onClick={() => open('rejected')}>
          <Check className="h-4 w-4" aria-hidden="true" /> Rejeter<span className="sr-only"> le signalement {reference}</span>
        </button>
        <button type="button" className={`${btnDangerCls} min-h-[40px] px-3 text-[13px]`} onClick={() => open('removed')}>
          <Trash2 className="h-4 w-4" aria-hidden="true" /> Supprimer<span className="sr-only"> le témoignage {reference}</span>
        </button>
      </div>
      <Modal
        open={decision !== null}
        onClose={() => { if (!busy) setDecision(null) }}
        size="sm"
        title={removing ? `Supprimer le témoignage ${reference} ?` : `Rejeter le signalement ${reference} ?`}
        description={removing
          ? 'Le témoignage et ses pièces jointes sont supprimés définitivement, pour le parent comme pour l’équipe. Action irréversible et journalisée.'
          : 'Le témoignage est conservé tel quel. Le parent voit que son signalement a été examiné. Action journalisée.'}
        footer={
          <>
            <button type="button" className={btnSecondaryCls} onClick={() => setDecision(null)} disabled={busy}>Annuler</button>
            <button type="button" className={removing ? btnDangerCls : btnSecondaryCls} onClick={() => void submit()} disabled={busy}>
              {busy ? 'Enregistrement…' : removing ? 'Supprimer définitivement' : 'Rejeter le signalement'}
            </button>
          </>
        }
      >
        <label htmlFor={noteId} className="mb-1 block text-[13px] font-bold text-night-900">Note interne (facultative)</label>
        <textarea id={noteId} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} className={fieldCls}
          aria-describedby={err ? `${noteId}-err` : undefined} />
        {err && <p id={`${noteId}-err`} role="alert" className="mt-2 text-[13px] font-semibold text-alert-600">{err}</p>}
      </Modal>
    </>
  )
}
