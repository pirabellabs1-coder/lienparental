'use client'
/**
 * Fenêtres de confirmation des actions sur un compte (fiche et menu « ⋯ » de la liste).
 *  - Avertir / Suspendre / Désactiver : motif obligatoire (liste) + précisions (≤ 500, obligatoires
 *    pour « Autre »), durée pour la suspension ; validation locale avec le schéma de la route.
 *  - Réactiver : note facultative (non envoyée).
 *  - Déconnecter / Renvoyer la vérification : confirmation simple.
 *  - Supprimer : double confirmation (avertissement, puis saisie de SUPPRIMER et de l'adresse).
 * Chaque envoi passe par une route serveur (garde admin, contrôle d'Origin, audit).
 */
import { useRouter } from 'next/navigation'
import { useId, useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { ConfirmDialog, Modal } from '@/components/ui'
import { cn } from '@/lib/cn'
import {
  DETAILS_MAX, DURATION_LABEL, MODERATION_REASONS, MODERATION_REASON_LABEL, SUSPENSION_DURATIONS, actionBodySchema, suspensionUntil,
  type ModAction, type ModerationReason, type ModerationState, type SuspensionDuration,
} from '@/lib/admin/ops/moderation'
import { btnDangerCls, btnPrimaryCls, btnSecondaryCls, fieldCls, fmtDateTime } from '../ui'

export type ActionTarget = {
  id: string
  email: string
  name: string
  state: ModerationState
  until: string | null
  isAdmin: boolean
  isSelf: boolean
  emailVerified: boolean
  /** null : inconnu (liste) ; le texte de suppression reste générique. */
  hasSubscription: boolean | null
}

export type Feedback = { tone: 'ok' | 'err'; text: string }

type SendResult = { ok: true; message: string } | { ok: false; message: string; issues?: { path: string; message: string }[] }

async function send(url: string, init: RequestInit): Promise<SendResult> {
  try {
    const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' })
    const json = await res.json().catch(() => null) as { data?: { message?: string }; error?: { message?: string; issues?: { path: string; message: string }[] } } | null
    if (!res.ok) return { ok: false, message: json?.error?.message ?? 'Action impossible.', issues: json?.error?.issues }
    return { ok: true, message: json?.data?.message ?? 'Action effectuée.' }
  } catch {
    return { ok: false, message: 'Connexion impossible. Vérifiez votre réseau.' }
  }
}

type Props = {
  target: ActionTarget
  action: ModAction
  onClose: () => void
  onDone: (f: Feedback) => void
}

export function AccountActionDialog({ target, action, onClose, onDone }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const post = async (body: Record<string, unknown>): Promise<SendResult> => {
    setBusy(true)
    const r = await send(`/api/admin/comptes/${encodeURIComponent(target.id)}/actions`, { method: 'POST', body: JSON.stringify(body) })
    setBusy(false)
    if (r.ok) {
      onDone({ tone: 'ok', text: r.message })
      router.refresh()
    }
    return r
  }

  if (action === 'warn' || action === 'suspend' || action === 'deactivate' || action === 'reactivate') {
    return <ModerationForm target={target} action={action} busy={busy} onClose={onClose} onSubmit={post} />
  }
  if (action === 'delete') return <DeleteFlow target={target} busy={busy} setBusy={setBusy} onClose={onClose} onDone={onDone} />

  const simple = action === 'force_logout'
    ? {
      title: 'Forcer la déconnexion ?',
      description: `Toutes les sessions de ${target.email} sont fermées. Une page déjà ouverte reste utilisable au plus une heure (durée du jeton en cours). Action journalisée.`,
      label: 'Déconnecter', tone: 'danger' as const,
    }
    : {
      title: 'Renvoyer l’e-mail de vérification ?',
      description: `Un nouveau code de vérification est envoyé à ${target.email}. Action journalisée.`,
      label: 'Renvoyer', tone: 'default' as const,
    }
  return (
    <ConfirmDialog
      open
      onClose={onClose}
      onConfirm={async () => {
        const r = await post({ action })
        if (!r.ok) onDone({ tone: 'err', text: r.message })
        onClose()
      }}
      title={simple.title}
      description={simple.description}
      confirmLabel={simple.label}
      tone={simple.tone}
      loading={busy}
    />
  )
}

// --- Avertir / Suspendre / Désactiver / Réactiver ---------------------------------------------

const FORM_TEXT: Record<'warn' | 'suspend' | 'deactivate' | 'reactivate', { title: string; effect: string; submit: string; danger: boolean }> = {
  warn: {
    title: 'Avertir l’utilisateur',
    effect: 'Un e-mail et une notification dans l’application lui sont envoyés, dans sa langue, avec le motif et un rappel des règles d’usage. Le compte reste accessible. L’avertissement est journalisé et compté.',
    submit: 'Envoyer l’avertissement', danger: false,
  },
  suspend: {
    title: 'Suspendre temporairement le compte',
    effect: 'La connexion est bloquée jusqu’à la date de fin et les sessions ouvertes sont fermées. L’utilisateur est prévenu par e-mail (motif, date de fin, contact). Réactivation automatique à l’échéance ; les données sont conservées.',
    submit: 'Suspendre le compte', danger: true,
  },
  deactivate: {
    title: 'Désactiver le compte',
    effect: 'La connexion est bloquée sans limite de durée, jusqu’à une réactivation manuelle. Les sessions sont fermées et l’utilisateur est prévenu par e-mail. Les données sont conservées.',
    submit: 'Désactiver le compte', danger: true,
  },
  reactivate: {
    title: 'Réactiver le compte',
    effect: 'La suspension ou la désactivation est levée : la connexion redevient possible immédiatement. L’utilisateur reçoit un e-mail « votre compte est réactivé ».',
    submit: 'Réactiver le compte', danger: false,
  },
}

function ModerationForm({ target, action, busy, onClose, onSubmit }: {
  target: ActionTarget
  action: 'warn' | 'suspend' | 'deactivate' | 'reactivate'
  busy: boolean
  onClose: () => void
  onSubmit: (body: Record<string, unknown>) => Promise<SendResult>
}) {
  const txt = FORM_TEXT[action]
  const withReason = action !== 'reactivate'
  const [reason, setReason] = useState<ModerationReason | ''>('')
  const [duration, setDuration] = useState<SuspensionDuration | ''>('')
  const [details, setDetails] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const uid = useId()
  const ids = { reason: `${uid}-reason`, details: `${uid}-details`, duration: `${uid}-duration`, help: `${uid}-help`, count: `${uid}-count` }

  const end = useMemo(() => (duration ? fmtDateTime(suspensionUntil(duration)) : null), [duration])

  const body = (): Record<string, unknown> => {
    const b: Record<string, unknown> = { action }
    if (withReason) b.reason = reason || undefined
    if (action === 'suspend') b.duration = duration || undefined
    if (details.trim()) b.details = details.trim()
    return b
  }

  const submit = async () => {
    setServerError(null)
    const b = body()
    const parsed = actionBodySchema.safeParse(b)
    if (!parsed.success) {
      const e: Record<string, string> = {}
      for (const i of parsed.error.issues) {
        const k = String(i.path[0] ?? 'action')
        e[k] ??= i.message
      }
      setErrors(e)
      document.getElementById(e.duration ? ids.duration : e.reason ? ids.reason : ids.details)?.focus()
      return
    }
    setErrors({})
    const r = await onSubmit(b)
    if (r.ok) { onClose(); return }
    const e: Record<string, string> = {}
    for (const i of r.issues ?? []) e[i.path.split('.')[0] ?? 'action'] ??= i.message
    setErrors(e)
    setServerError(r.message)
  }

  const err = (k: string) => errors[k] ? <p id={`${uid}-${k}-err`} className="mt-1 text-[13px] font-semibold text-alert-600">{errors[k]}</p> : null
  const describedBy = (k: string, ...extra: string[]) => [errors[k] ? `${uid}-${k}-err` : '', ...extra].filter(Boolean).join(' ') || undefined

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={txt.title}
      description={<><span className="font-semibold text-night-900">{target.name}</span> · <span className="break-all font-mono text-[12.5px]">{target.email}</span></>}
      footer={
        <>
          <button type="button" className={btnSecondaryCls} onClick={onClose} disabled={busy}>Annuler</button>
          <button type="button" className={txt.danger ? btnDangerCls : btnPrimaryCls} onClick={() => void submit()} disabled={busy} aria-busy={busy}>
            {busy ? 'Envoi…' : txt.submit}
          </button>
        </>
      }
    >
      <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <p className="rounded-xl bg-night-50 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-night-700">{txt.effect}</p>

        {action === 'suspend' && (
          <fieldset>
            <legend className="mb-1.5 text-[13px] font-bold text-night-900">Durée <span className="text-alert-600" aria-hidden="true">*</span><span className="sr-only"> (obligatoire)</span></legend>
            <div
              id={ids.duration}
              tabIndex={-1}
              role="radiogroup"
              aria-required="true"
              aria-invalid={errors.duration ? true : undefined}
              aria-describedby={describedBy('duration')}
              className="grid grid-cols-2 gap-2 sm:grid-cols-4 focus-visible:outline-none"
            >
              {SUSPENSION_DURATIONS.map((d) => (
                <label
                  key={d}
                  className={cn(
                    'flex min-h-[44px] cursor-pointer items-center justify-center whitespace-nowrap rounded-xl border px-2 text-[14px] font-semibold transition-colors focus-within:ring-2 focus-within:ring-leaf-500',
                    duration === d ? 'border-night-900 bg-night-900 text-white' : 'border-night-200 bg-white text-night-900 hover:bg-night-50',
                  )}
                >
                  <input type="radio" name={`${uid}-dur`} value={d} checked={duration === d} onChange={() => setDuration(d)} className="sr-only" />
                  {DURATION_LABEL[d]}
                </label>
              ))}
            </div>
            {err('duration')}
            {end && <p className="mt-1.5 text-[13px] text-night-600">Fin de la suspension : <strong className="text-night-900">{end}</strong> (heure de Guyane), puis réactivation automatique.</p>}
          </fieldset>
        )}

        {withReason && (
          <div>
            <label htmlFor={ids.reason} className="mb-1 block text-[13px] font-bold text-night-900">
              Motif <span className="text-alert-600" aria-hidden="true">*</span><span className="sr-only"> (obligatoire)</span>
            </label>
            <select
              id={ids.reason}
              value={reason}
              onChange={(e) => setReason(e.target.value as ModerationReason | '')}
              className={fieldCls}
              required
              aria-invalid={errors.reason ? true : undefined}
              aria-describedby={describedBy('reason')}
            >
              <option value="">Choisir un motif…</option>
              {MODERATION_REASONS.map((r) => <option key={r} value={r}>{MODERATION_REASON_LABEL[r]}</option>)}
            </select>
            {err('reason')}
          </div>
        )}

        <div>
          <label htmlFor={ids.details} className="mb-1 block text-[13px] font-bold text-night-900">
            {withReason ? <>Précisions {reason === 'autre' ? <><span className="text-alert-600" aria-hidden="true">*</span><span className="sr-only"> (obligatoires)</span></> : <span className="font-normal text-night-500">(facultatif)</span>}</> : <>Note interne <span className="font-normal text-night-500">(facultative)</span></>}
          </label>
          <textarea
            id={ids.details}
            value={details}
            onChange={(e) => setDetails(e.target.value.slice(0, DETAILS_MAX))}
            maxLength={DETAILS_MAX}
            rows={4}
            className={cn(fieldCls, 'min-h-[104px] resize-y')}
            aria-invalid={errors.details ? true : undefined}
            aria-describedby={describedBy('details', ids.help, ids.count)}
          />
          <div className="mt-1 flex flex-wrap justify-between gap-2 text-[12.5px] text-night-500">
            <p id={ids.help}>
              {withReason
                ? 'Communiquées à l’utilisateur dans l’e-mail : restez factuel, sans donnée sensible ni détail technique.'
                : 'Conservée dans le journal de modération, non envoyée à l’utilisateur.'}
            </p>
            <p id={ids.count} className="tabular-nums" aria-live="polite">{details.length} / {DETAILS_MAX}</p>
          </div>
          {err('details')}
        </div>

        {serverError && <p role="alert" className="rounded-xl border border-alert-200 bg-alert-50 px-3.5 py-2.5 text-[13.5px] font-semibold text-alert-700">{serverError}</p>}
      </form>
    </Modal>
  )
}

// --- Suppression (double confirmation) ----------------------------------------------------------

function DeleteFlow({ target, busy, setBusy, onClose, onDone }: {
  target: ActionTarget
  busy: boolean
  setBusy: (b: boolean) => void
  onClose: () => void
  onDone: (f: Feedback) => void
}) {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2>(1)
  const [word, setWord] = useState('')
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const wordId = useId()
  const mailId = useId()
  const canDelete = word.trim() === 'SUPPRIMER' && typed.trim().toLowerCase() === target.email.toLowerCase()
  const billing = target.hasSubscription === null
    ? ', un éventuel abonnement Stripe est résilié sur-le-champ (sans prorata)'
    : target.hasSubscription ? ', l’abonnement Stripe est résilié sur-le-champ (sans prorata)' : ''

  const remove = async () => {
    setBusy(true)
    const r = await send(`/api/admin/comptes/${encodeURIComponent(target.id)}`, { method: 'DELETE', body: JSON.stringify({ confirm: word.trim(), email: typed.trim() }) })
    setBusy(false)
    if (!r.ok) { setError(r.message); return }
    onDone({ tone: 'ok', text: r.message })
    onClose()
    router.refresh()
  }

  if (step === 1) {
    return (
      <ConfirmDialog
        open
        onClose={onClose}
        onConfirm={() => setStep(2)}
        title="Supprimer ce compte ?"
        description={`L’identité de ${target.email} est anonymisée immédiatement, la connexion est fermée${billing} et toutes les données sont purgées définitivement sous 30 jours. Cette action est irréversible.`}
        confirmLabel="Continuer"
        tone="danger"
      />
    )
  }
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Confirmer la suppression"
      description="Deuxième confirmation : saisissez le mot SUPPRIMER puis l’adresse e-mail exacte du compte."
      footer={
        <>
          <button type="button" className={btnSecondaryCls} onClick={onClose} disabled={busy}>Annuler</button>
          <button type="button" className={btnDangerCls} onClick={() => void remove()} disabled={!canDelete || busy}>
            <Trash2 className="h-4 w-4" aria-hidden="true" /> {busy ? 'Suppression…' : 'Supprimer définitivement'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label htmlFor={wordId} className="mb-1 block text-[13px] font-bold text-night-900">Tapez SUPPRIMER</label>
          <input id={wordId} value={word} onChange={(e) => setWord(e.target.value)} className={fieldCls} autoComplete="off" spellCheck={false} />
        </div>
        <div>
          <label htmlFor={mailId} className="mb-1 block text-[13px] font-bold text-night-900">Adresse e-mail du compte</label>
          <input id={mailId} value={typed} onChange={(e) => setTyped(e.target.value)} className={fieldCls} autoComplete="off" spellCheck={false} inputMode="email" placeholder={target.email} />
        </div>
        {error && <p role="alert" className="text-[13px] font-semibold text-alert-600">{error}</p>}
      </div>
    </Modal>
  )
}
