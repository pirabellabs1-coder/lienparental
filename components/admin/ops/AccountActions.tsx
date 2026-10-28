'use client'
/**
 * Actions d'administration d'un compte (fiche) : avertir, suspendre, désactiver / réactiver,
 * forcer la déconnexion, renvoyer l'e-mail de vérification, supprimer. Toutes les actions
 * restent visibles : une action impossible (son propre compte, un administrateur, un compte
 * supprimé, état incompatible) est désactivée AVEC son explication, jamais masquée.
 * Chaque action ouvre une fenêtre de confirmation (motif, durée) : voir AccountActionDialog.
 */
import { useId, useState } from 'react'
import { AlertTriangle, Ban, Clock, LogOut, MailCheck, ShieldCheck, Trash2, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  MOD_ACTION_LABEL, actionAvailability, targetBlockReason, visibleActions, type ModAction,
} from '@/lib/admin/ops/moderation'
import { AccountActionDialog, type ActionTarget, type Feedback } from './moderation/AccountActionDialog'
import { btnDangerCls, btnPrimaryCls, btnSecondaryCls } from './ui'

export const ACTION_ICON: Record<ModAction, LucideIcon> = {
  warn: AlertTriangle, suspend: Clock, deactivate: Ban, reactivate: ShieldCheck,
  force_logout: LogOut, resend_verification: MailCheck, delete: Trash2,
}
const DANGER: ReadonlySet<ModAction> = new Set(['suspend', 'deactivate', 'delete'])
const MODERATION: ReadonlySet<ModAction> = new Set(['warn', 'suspend', 'deactivate', 'reactivate'])

export function AccountActions({ target }: { target: ActionTarget }) {
  const [open, setOpen] = useState<ModAction | null>(null)
  const [msg, setMsg] = useState<Feedback | null>(null)
  const noteId = useId()
  const avail = actionAvailability(target)
  const shared = targetBlockReason(target)
  const actions = visibleActions(target)

  const button = (a: ModAction) => {
    const av = avail[a]
    const Icon = ACTION_ICON[a]
    const base = a === 'reactivate' ? btnPrimaryCls : DANGER.has(a) ? btnDangerCls : btnSecondaryCls
    const reasonId = `${noteId}-${a}`
    const ownReason = !av.allowed && av.reason !== shared
    return (
      <div key={a} className="flex flex-col items-start">
        <button
          type="button"
          className={cn(base, !av.allowed && 'cursor-not-allowed opacity-50 hover:bg-white')}
          aria-disabled={!av.allowed || undefined}
          aria-describedby={!av.allowed ? (ownReason ? reasonId : noteId) : undefined}
          onClick={() => { if (av.allowed) { setMsg(null); setOpen(a) } }}
        >
          <Icon className="h-4 w-4" aria-hidden="true" /> {MOD_ACTION_LABEL[a]}
        </button>
        {ownReason && <span id={reasonId} className="mt-1 max-w-[260px] text-[12px] leading-snug text-night-500">{av.reason}</span>}
      </div>
    )
  }

  return (
    <div>
      {shared && (
        <p id={noteId} className="mb-3 rounded-xl border border-night-100 bg-night-50 px-3.5 py-2.5 text-[13.5px] text-night-700">
          {shared}
          {target.isAdmin && !target.isSelf && target.state !== 'supprime' ? ' La déconnexion forcée reste possible (session compromise).' : ''}
        </p>
      )}
      <div className="space-y-4">
        <div>
          <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-night-500">Modération</h3>
          <div className="flex flex-wrap items-start gap-2">{actions.filter((a) => MODERATION.has(a)).map(button)}</div>
        </div>
        <div>
          <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-night-500">Compte</h3>
          <div className="flex flex-wrap items-start gap-2">{actions.filter((a) => !MODERATION.has(a)).map(button)}</div>
        </div>
      </div>
      <p role="status" aria-live="polite" className={cn('mt-3 min-h-[1.25rem] text-[13.5px] font-semibold', msg?.tone === 'err' ? 'text-alert-600' : 'text-leaf-700')}>
        {msg?.text}
      </p>

      {open && <AccountActionDialog target={target} action={open} onClose={() => setOpen(null)} onDone={setMsg} />}
    </div>
  )
}
