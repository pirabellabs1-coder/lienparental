'use client'

import { useId, useState, type FormEvent } from 'react'
import { Check, Copy, Mail, MessageSquareText, Share2, UserPlus } from 'lucide-react'
import { cn } from '@/lib/cn'
import { btn, card } from '@/components/ui/kit'
import { copyText } from '@/components/coffre/CopyLinkField'
import { cancelInvite, createInvite, inviteUrl, type CoparentInvite } from '@/lib/messages'

type Props = {
  invite: CoparentInvite | null
  senderPrenom: string
  onChange: (invite: CoparentInvite | null) => void
  announce: (msg: string) => void
}

/** Invitation de l'autre parent : lien unique partagé par e-mail, SMS ou copie. */
export function InviteCard({ invite, senderPrenom, onChange, announce }: Props) {
  const uid = useId()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const created = await createInvite(email)
      onChange(created)
      announce('Invitation créée. Partagez le lien avec l’autre parent.')
    } catch (err) {
      setError(err instanceof Error ? err.message : "L'invitation n'a pas pu être créée.")
    } finally {
      setBusy(false)
    }
  }

  if (!invite) {
    return (
      <section aria-labelledby={`${uid}-t`} className={cn(card, 'p-4')}>
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-leaf-50 text-leaf-600">
            <UserPlus className="h-5 w-5" strokeWidth={1.9} />
          </span>
          <div className="min-w-0">
            <h2 id={`${uid}-t`} className="text-[15px] font-bold text-night-900">Inviter l&apos;autre parent</h2>
            <p className="mt-0.5 text-[13px] text-night-600">
              Échangez dans un espace horodaté, neutre et réservé à vous deux. L&apos;autre parent crée son compte gratuitement à partir du lien.
            </p>
          </div>
        </div>
        <form onSubmit={submit} className="mt-4 space-y-3" noValidate>
          <div>
            <label htmlFor={`${uid}-email`} className="block text-[13px] font-semibold text-night-900">Adresse e-mail de l&apos;autre parent</label>
            <input
              id={`${uid}-email`}
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${uid}-err` : undefined}
              className="mt-1.5 h-12 w-full rounded-xl border border-night-200 bg-white px-3.5 text-[15px] text-night-900 placeholder:text-night-500 focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-200"
              placeholder="prenom.nom@email.com"
            />
            {error && <p id={`${uid}-err`} role="alert" className="mt-1.5 text-[12px] font-semibold text-alert-600">{error}</p>}
          </div>
          <button type="submit" disabled={busy || email.trim().length === 0} className={cn(btn.primary, 'w-full')}>
            {busy ? 'Création du lien…' : "Créer le lien d'invitation"}
          </button>
        </form>
      </section>
    )
  }

  const url = inviteUrl(invite.token)
  const message = `Bonjour, je t'invite à rejoindre Lien Parental pour échanger au sujet des enfants dans un espace partagé : ${url}`
  const expires = new Date(invite.expiresAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const onCopy = async () => {
    if (await copyText(url)) {
      setCopied(true)
      announce('Lien copié dans le presse-papiers')
      setTimeout(() => setCopied(false), 2200)
    }
  }

  const onShare = async () => {
    try {
      await navigator.share({ title: 'Invitation Lien Parental', text: message })
    } catch { /* partage annulé */ }
  }

  const onCancel = async () => {
    try {
      await cancelInvite(invite.id)
      onChange(null)
      announce('Invitation annulée')
    } catch (err) {
      setError(err instanceof Error ? err.message : "L'invitation n'a pas pu être annulée.")
    }
  }

  return (
    <section aria-labelledby={`${uid}-t`} className={cn(card, 'p-4')}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-700">
          <Mail className="h-5 w-5" strokeWidth={1.9} />
        </span>
        <div className="min-w-0">
          <h2 id={`${uid}-t`} className="text-[15px] font-bold text-night-900">Invitation en attente</h2>
          <p className="mt-0.5 break-words text-[13px] text-night-600">
            Pour {invite.inviteeEmail} · valable jusqu&apos;au {expires}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-night-100 bg-night-50/60 py-1 pl-3.5 pr-1">
        <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-night-800">{url.replace(/^https?:\/\//, '')}</p>
        <button
          type="button"
          onClick={onCopy}
          aria-label={copied ? 'Lien copié' : "Copier le lien d'invitation"}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-night-700 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400"
        >
          {copied ? <Check className="h-5 w-5 text-leaf-600" aria-hidden="true" /> : <Copy className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <a
          href={`mailto:${encodeURIComponent(invite.inviteeEmail)}?subject=${encodeURIComponent(`${senderPrenom} vous invite sur Lien Parental`)}&body=${encodeURIComponent(message)}`}
          className={cn(btn.secondary, 'px-3')}
        >
          <Mail className="h-4 w-4" aria-hidden="true" />
          Par e-mail
        </a>
        <a href={`sms:?&body=${encodeURIComponent(message)}`} className={cn(btn.secondary, 'px-3')}>
          <MessageSquareText className="h-4 w-4" aria-hidden="true" />
          Par SMS
        </a>
        {canShare && (
          <button type="button" onClick={onShare} className={cn(btn.secondary, 'col-span-2')}>
            <Share2 className="h-4 w-4" aria-hidden="true" />
            Partager le lien
          </button>
        )}
      </div>

      {error && <p role="alert" className="mt-2 text-[12px] font-semibold text-alert-600">{error}</p>}

      <button
        type="button"
        onClick={onCancel}
        className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-xl text-[13px] font-semibold text-night-700 hover:bg-night-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400"
      >
        Annuler l&apos;invitation
      </button>
    </section>
  )
}
