'use client'
/**
 * Actions d'administration d'un compte : suspendre / réactiver, renvoyer l'e-mail de
 * vérification, forcer la déconnexion, supprimer. Chaque action passe par une route
 * serveur (garde admin, contrôle d'Origin, audit). Suppression : double confirmation
 * (dialogue, puis saisie de « SUPPRIMER » et de l'adresse exacte du compte).
 */
import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import { LogOut, MailCheck, ShieldOff, ShieldCheck, Trash2 } from 'lucide-react'
import { ConfirmDialog, Modal } from '@/components/ui'
import { cn } from '@/lib/cn'
import type { AccountAction } from '@/lib/admin/ops/types'
import { btnDangerCls, btnSecondaryCls, fieldCls } from './ui'

type Props = {
  id: string
  email: string
  status: 'actif' | 'non_verifie' | 'suspendu' | 'supprime'
  isAdminAccount: boolean
  emailVerified: boolean
  hasSubscription: boolean
}

async function send(url: string, init: RequestInit): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  try {
    const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' })
    const json = await res.json().catch(() => null) as { data?: { message?: string }; error?: { message?: string } } | null
    if (!res.ok) return { ok: false, message: json?.error?.message ?? 'Action impossible.' }
    return { ok: true, message: json?.data?.message ?? 'Action effectuée.' }
  } catch {
    return { ok: false, message: 'Connexion impossible. Vérifiez votre réseau.' }
  }
}

const CONFIRM: Record<AccountAction, { title: string; description: string; label: string; tone: 'danger' | 'default' }> = {
  suspend: {
    title: 'Suspendre ce compte ?',
    description: 'La personne ne pourra plus se connecter et ses sessions ouvertes seront fermées. Ses données sont conservées. Action journalisée.',
    label: 'Suspendre', tone: 'danger',
  },
  reactivate: { title: 'Réactiver ce compte ?', description: 'La connexion redevient possible immédiatement. Action journalisée.', label: 'Réactiver', tone: 'default' },
  resend_verification: { title: 'Renvoyer l’e-mail de vérification ?', description: 'Un nouveau code de vérification est envoyé à l’adresse du compte. Action journalisée.', label: 'Renvoyer', tone: 'default' },
  force_logout: {
    title: 'Forcer la déconnexion ?',
    description: 'Toutes les sessions de ce compte sont fermées. Une page déjà ouverte reste utilisable au plus une heure (durée du jeton en cours). Action journalisée.',
    label: 'Déconnecter', tone: 'danger',
  },
}

export function AccountActions({ id, email, status, isAdminAccount, emailVerified, hasSubscription }: Props) {
  const router = useRouter()
  const [pending, setPending] = useState<AccountAction | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [delStep, setDelStep] = useState<0 | 1 | 2>(0)
  const [word, setWord] = useState('')
  const [typed, setTyped] = useState('')
  const wordId = useId()
  const mailId = useId()

  if (status === 'supprime') {
    return <p className="text-[13.5px] text-night-600">Compte supprimé : aucune action possible (purge automatique sous 30 jours).</p>
  }

  const run = async (action: AccountAction) => {
    setBusy(true)
    const r = await send(`/api/admin/comptes/${encodeURIComponent(id)}/actions`, { method: 'POST', body: JSON.stringify({ action }) })
    setBusy(false)
    setPending(null)
    setMsg({ tone: r.ok ? 'ok' : 'err', text: r.message })
    if (r.ok) router.refresh()
  }

  const remove = async () => {
    setBusy(true)
    const r = await send(`/api/admin/comptes/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ confirm: word.trim(), email: typed.trim() }) })
    setBusy(false)
    if (!r.ok) { setMsg({ tone: 'err', text: r.message }); return }
    setDelStep(0)
    setMsg({ tone: 'ok', text: r.message })
    router.refresh()
  }

  const canDelete = word.trim() === 'SUPPRIMER' && typed.trim().toLowerCase() === email.toLowerCase()

  return (
    <div>
      {isAdminAccount ? (
        <p className="mb-3 text-[13.5px] text-night-600">Compte administrateur : suspension et suppression désactivées ici (retirez d’abord le rôle en base).</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {!isAdminAccount && (status === 'suspendu' ? (
          <button type="button" className={btnSecondaryCls} onClick={() => setPending('reactivate')} disabled={busy}>
            <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Réactiver
          </button>
        ) : (
          <button type="button" className={btnDangerCls} onClick={() => setPending('suspend')} disabled={busy}>
            <ShieldOff className="h-4 w-4" aria-hidden="true" /> Suspendre
          </button>
        ))}
        {!emailVerified && (
          <button type="button" className={btnSecondaryCls} onClick={() => setPending('resend_verification')} disabled={busy}>
            <MailCheck className="h-4 w-4" aria-hidden="true" /> Renvoyer l’e-mail de vérification
          </button>
        )}
        <button type="button" className={btnSecondaryCls} onClick={() => setPending('force_logout')} disabled={busy}>
          <LogOut className="h-4 w-4" aria-hidden="true" /> Forcer la déconnexion
        </button>
        {!isAdminAccount && (
          <button type="button" className={btnDangerCls} onClick={() => { setDelStep(1); setWord(''); setTyped('') }} disabled={busy}>
            <Trash2 className="h-4 w-4" aria-hidden="true" /> Supprimer le compte
          </button>
        )}
      </div>
      <p role="status" aria-live="polite" className={cn('mt-2 min-h-[1.25rem] text-[13.5px] font-semibold', msg?.tone === 'err' ? 'text-alert-600' : 'text-leaf-700')}>
        {msg?.text}
      </p>

      {pending && (
        <ConfirmDialog
          open
          onClose={() => setPending(null)}
          onConfirm={() => run(pending)}
          title={CONFIRM[pending].title}
          description={CONFIRM[pending].description}
          confirmLabel={CONFIRM[pending].label}
          tone={CONFIRM[pending].tone}
          loading={busy}
        />
      )}

      {/* Suppression, étape 1 : avertissement */}
      <ConfirmDialog
        open={delStep === 1}
        onClose={() => setDelStep(0)}
        onConfirm={() => setDelStep(2)}
        title="Supprimer ce compte ?"
        description={`L’identité est anonymisée immédiatement, la connexion est fermée${hasSubscription ? ', l’abonnement Stripe est résilié sur-le-champ (sans prorata)' : ''} et toutes les données sont purgées définitivement sous 30 jours. Cette action est irréversible.`}
        confirmLabel="Continuer"
        tone="danger"
      />

      {/* Suppression, étape 2 : saisie de confirmation */}
      <Modal
        open={delStep === 2}
        onClose={() => setDelStep(0)}
        size="sm"
        title="Confirmer la suppression"
        description="Deuxième confirmation : saisissez le mot SUPPRIMER puis l’adresse e-mail exacte du compte."
        footer={
          <>
            <button type="button" className={btnSecondaryCls} onClick={() => setDelStep(0)} disabled={busy}>Annuler</button>
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
            <input id={mailId} value={typed} onChange={(e) => setTyped(e.target.value)} className={fieldCls} autoComplete="off" spellCheck={false} inputMode="email" placeholder={email} />
          </div>
          {msg?.tone === 'err' && <p role="alert" className="text-[13px] font-semibold text-alert-600">{msg.text}</p>}
        </div>
      </Modal>
    </div>
  )
}
