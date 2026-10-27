'use client'

import Link from 'next/link'
import { useEffect, useId, useState, type FormEvent } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Loader2, UserPlus } from 'lucide-react'
import { cn } from '@/lib/cn'
import { btn } from '@/components/ui/kit'
import { MAX_TITLE_CHARS, createConversation, type Participant } from '@/lib/messages'
import { Sheet } from './Sheet'
import { Avatar } from './Avatar'
import { useMessagesFormat } from './useMessagesFormat'

type Props = {
  open: boolean
  onClose: () => void
  /** Parents liés (lib/messages → listMessageableParents). */
  linked: Participant[]
  onCreated: (conversationId: string) => void
}

// Clés de messaging.newConversation.suggestions (libellés traduits au rendu).
const SUGGESTIONS = ['holidays', 'school', 'health', 'sharedCosts', 'activities', 'weekend'] as const

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400 focus-visible:ring-offset-2'

/** Nouvelle discussion : un ou plusieurs parents liés et un sujet facultatif. */
export function NewConversationSheet({ open, onClose, linked, onCreated }: Props) {
  const t = useTranslations('messaging.newConversation')
  const { displayName } = useMessagesFormat()
  const uid = useId()
  const [selected, setSelected] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pickError, setPickError] = useState<string | null>(null)

  // À chaque ouverture : un seul parent lié -> présélectionné.
  useEffect(() => {
    if (!open) return
    setSelected(linked.length === 1 ? [linked[0].id] : [])
    setTitle('')
    setError(null)
    setPickError(null)
    setBusy(false)
  }, [open, linked])

  const toggle = (id: string) => {
    setPickError(null)
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (selected.length === 0) {
      setPickError(t('pickError'))
      document.getElementById(`${uid}-p-${linked[0]?.id}`)?.focus()
      return
    }
    setBusy(true)
    setError(null)
    try {
      const id = await createConversation({ participantIds: selected, title })
      onCreated(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('createFailed'))
      setBusy(false)
    }
  }

  const titleHint = `${uid}-title-hint`
  const pickErrId = `${uid}-pick-err`

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('title')}
      description={t('description')}
    >
      {linked.length === 0 ? (
        <div className="space-y-3">
          <p className="text-[14px] text-night-700">
            {t('noLinked')}
          </p>
          <Link href="/app/coparents" onClick={onClose} className={cn(btn.primary, 'w-full')}>
            <UserPlus className="h-5 w-5" aria-hidden="true" />
            {t('inviteParent')}
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-5">
          <fieldset aria-describedby={pickError ? pickErrId : undefined}>
            <legend className="text-[13px] font-bold text-night-900">{t('withWhom')}</legend>
            <ul className="mt-2 space-y-2">
              {linked.map((p) => {
                const checked = selected.includes(p.id)
                const id = `${uid}-p-${p.id}`
                return (
                  <li key={p.id}>
                    <label
                      htmlFor={id}
                      className={cn(
                        'flex min-h-[56px] cursor-pointer items-center gap-3 rounded-2xl border p-2.5 pr-3 transition-colors',
                        'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-leaf-400 has-[:focus-visible]:ring-offset-2',
                        checked ? 'border-leaf-400 bg-leaf-50/60' : 'border-night-100 bg-white hover:bg-night-50/50',
                      )}
                    >
                      <input
                        id={id}
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(p.id)}
                        aria-invalid={pickError ? true : undefined}
                        className="peer sr-only"
                      />
                      <Avatar person={p} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-bold text-night-900">{displayName(p)}</span>
                      </span>
                      <span
                        aria-hidden="true"
                        className={cn(
                          'grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-colors',
                          checked ? 'border-leaf-500 bg-leaf-500 text-white' : 'border-night-200 bg-white text-transparent',
                        )}
                      >
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
            {pickError && (
              <p id={pickErrId} role="alert" className="mt-2 text-[12px] font-semibold text-alert-600">{pickError}</p>
            )}
          </fieldset>

          <div>
            <label htmlFor={`${uid}-title`} className="text-[13px] font-bold text-night-900">
              {t('topic')} <span className="font-normal text-night-600">{t('optional')}</span>
            </label>
            <input
              id={`${uid}-title`}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={MAX_TITLE_CHARS}
              placeholder={t('placeholder')}
              autoComplete="off"
              data-autofocus={linked.length === 1 ? true : undefined}
              aria-describedby={titleHint}
              className="mt-1.5 h-12 w-full rounded-xl border border-night-200 bg-white px-3.5 text-[15px] text-night-900 placeholder:text-night-500 focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-200"
            />
            <p id={titleHint} className="mt-1 text-[11px] text-night-600">
              {t('topicHint')}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={t('suggestionsLabel')}>
              {SUGGESTIONS.map((key) => {
                const s = t(`suggestions.${key}`)
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTitle(s)}
                    aria-pressed={title === s}
                    className={cn(
                      'inline-flex min-h-[44px] items-center rounded-full border px-3.5 text-[12px] font-semibold transition-colors',
                      title === s ? 'border-leaf-400 bg-leaf-50 text-leaf-700' : 'border-night-100 bg-white text-night-800 hover:bg-night-50',
                      focusRing,
                    )}
                  >
                    {s}
                  </button>
                )
              })}
            </div>
          </div>

          {error && <p role="alert" className="rounded-xl bg-alert-50 p-3 text-[13px] font-semibold text-alert-700">{error}</p>}

          <button type="submit" disabled={busy} className={cn(btn.primary, 'w-full')}>
            {busy && <Loader2 className="h-5 w-5 motion-safe:animate-spin" aria-hidden="true" />}
            {busy ? t('creating') : t('start')}
          </button>
        </form>
      )}
    </Sheet>
  )
}
