'use client'
/**
 * Fil d'un ticket et réponse du support. Statut et priorité modifiables (audit en base),
 * réponse ajoutée au fil (notification in-app au demandeur). Aucune donnée n'est conservée
 * côté navigateur hors de l'écran.
 */
import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import { LoaderCircle, Send } from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  PRIORITY_LABEL, TICKET_PRIORITIES, TICKET_STATUSES, TICKET_STATUS_LABEL,
  type TicketDetail, type TicketPriority, type TicketStatus,
} from '@/lib/admin/ops/types'
import { btnPrimaryCls, btnSecondaryCls, fieldCls, fmtDateTime } from './ui'

async function call<T>(url: string, method: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  try {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) })
    const json = await res.json().catch(() => null) as { data?: T; error?: { message?: string } } | null
    if (!res.ok || !json) return { ok: false, message: json?.error?.message ?? 'Action impossible.' }
    return { ok: true, data: json.data as T }
  } catch {
    return { ok: false, message: 'Connexion impossible. Vérifiez votre réseau.' }
  }
}

export function TicketPanel({ ticket }: { ticket: TicketDetail }) {
  const router = useRouter()
  const [status, setStatus] = useState<TicketStatus>(ticket.status)
  const [priority, setPriority] = useState<TicketPriority>(ticket.priority)
  const [reply, setReply] = useState('')
  const [resolve, setResolve] = useState(false)
  const [busy, setBusy] = useState<'meta' | 'reply' | null>(null)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const ids = { status: useId(), prio: useId(), reply: useId(), resolve: useId(), err: useId() }
  const base = `/api/admin/support/${encodeURIComponent(ticket.id)}`
  const metaDirty = status !== ticket.status || priority !== ticket.priority

  const saveMeta = async () => {
    setBusy('meta')
    const r = await call<{ status: TicketStatus; priority: TicketPriority }>(base, 'PATCH', {
      ...(status !== ticket.status ? { status } : {}), ...(priority !== ticket.priority ? { priority } : {}),
    })
    setBusy(null)
    setMsg(r.ok ? { tone: 'ok', text: 'Ticket mis à jour.' } : { tone: 'err', text: r.message })
    if (r.ok) router.refresh()
  }

  const sendReply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reply.trim()) { setMsg({ tone: 'err', text: 'Rédigez une réponse avant d’envoyer.' }); return }
    setBusy('reply')
    const r = await call(`${base}/reponses`, 'POST', { body: reply, resolve })
    setBusy(null)
    if (!r.ok) { setMsg({ tone: 'err', text: r.message }); return }
    setReply('')
    setResolve(false)
    setMsg({ tone: 'ok', text: resolve ? 'Réponse envoyée, ticket résolu.' : 'Réponse envoyée : l’utilisateur est notifié.' })
    router.refresh()
  }

  const closed = ticket.status === 'closed'

  return (
    <div className="space-y-5">
      <section aria-labelledby="fil-t" className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-soft sm:p-5">
        <h2 id="fil-t" className="text-[16px] font-extrabold text-night-900">Fil de discussion</h2>
        <ol className="mt-3 space-y-3">
          <Bubble from="user" author={ticket.requester.email || 'Utilisateur'} at={ticket.createdAt} body={ticket.body} />
          {ticket.messages.map((m) => (
            <Bubble key={m.id} from={m.from} author={m.from === 'admin' ? 'Support' : ticket.requester.email || 'Utilisateur'} at={m.at} body={m.body} />
          ))}
        </ol>
      </section>

      <section aria-labelledby="suivi-t" className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-soft sm:p-5">
        <h2 id="suivi-t" className="text-[16px] font-extrabold text-night-900">Suivi</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <label htmlFor={ids.status} className="mb-1 block text-[12.5px] font-bold text-night-800">Statut</label>
            <select id={ids.status} value={status} onChange={(e) => setStatus(e.target.value as TicketStatus)} className={fieldCls}>
              {TICKET_STATUSES.map((s) => <option key={s} value={s}>{TICKET_STATUS_LABEL[s]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={ids.prio} className="mb-1 block text-[12.5px] font-bold text-night-800">Priorité</label>
            <select id={ids.prio} value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)} className={fieldCls}>
              {TICKET_PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
            </select>
          </div>
          <button type="button" className={btnSecondaryCls} onClick={() => void saveMeta()} disabled={!metaDirty || busy !== null}>
            {busy === 'meta' && <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />} Enregistrer
          </button>
        </div>
      </section>

      <form onSubmit={sendReply} aria-labelledby="rep-t" className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-soft sm:p-5" noValidate>
        <h2 id="rep-t" className="text-[16px] font-extrabold text-night-900">Répondre</h2>
        {closed && <p className="mt-2 text-[13.5px] text-night-600">Ticket fermé par l’utilisateur : rouvrez-le (statut « Ouvert ») pour répondre.</p>}
        <label htmlFor={ids.reply} className="mt-3 block text-[12.5px] font-bold text-night-800">Votre réponse</label>
        <textarea id={ids.reply} value={reply} onChange={(e) => setReply(e.target.value)} rows={6} maxLength={8000} disabled={closed}
          aria-describedby={msg?.tone === 'err' ? ids.err : undefined}
          className={cn(fieldCls, 'mt-1 min-h-[140px]')} placeholder="Bonjour, …" />
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label htmlFor={ids.resolve} className="inline-flex min-h-[44px] items-center gap-2 text-[14px] text-night-800">
            <input id={ids.resolve} type="checkbox" checked={resolve} onChange={(e) => setResolve(e.target.checked)} disabled={closed}
              className="h-5 w-5 rounded border-night-300 accent-leaf-500" />
            Marquer comme résolu après l’envoi
          </label>
          <button type="submit" className={btnPrimaryCls} disabled={closed || busy !== null || !reply.trim()}>
            {busy === 'reply' ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
            Envoyer
          </button>
        </div>
        <p id={ids.err} role="status" aria-live="polite" className={cn('mt-2 min-h-[1.25rem] text-[13.5px] font-semibold', msg?.tone === 'err' ? 'text-alert-600' : 'text-leaf-700')}>{msg?.text}</p>
      </form>
    </div>
  )
}

function Bubble({ from, author, at, body }: { from: 'user' | 'admin'; author: string; at: string; body: string }) {
  return (
    <li className={cn('flex', from === 'admin' ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[min(85%,640px)] rounded-2xl border p-3', from === 'admin' ? 'border-leaf-100 bg-leaf-50' : 'border-night-100 bg-white')}>
        <p className="flex flex-wrap justify-between gap-x-3 text-[12px] text-night-600">
          <span className="font-semibold text-night-800">{author}</span>
          <time dateTime={at}>{fmtDateTime(at)}</time>
        </p>
        <p className="mt-1 whitespace-pre-line break-words text-[14px] text-night-900">{body}</p>
      </div>
    </li>
  )
}
