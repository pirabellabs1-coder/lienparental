'use client'

import { useId, useState, type FormEvent } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/cn'
import { btn } from '@/components/ui/kit'
import { createFamilyInvitation, type GuardianRole, type IssuedInvitation } from '@/lib/coparents'
import { isValidEmail } from '@/lib/coparents/validation'
import { dePrenom } from './bits'

type ChildOption = { id: string; prenom: string }

type Props = {
  childOptions: ChildOption[]
  /**
   * Enfants dont je suis TITULAIRE (0360, M2 : seul le titulaire invite au rôle « parent »).
   * Absent = tous (onboarding : mes propres fiches).
   */
  ownerChildIds?: string[]
  defaultChildIds?: string[]
  defaultRole?: GuardianRole
  onCreated: (issued: IssuedInvitation) => void
  submitLabel?: string
  /** Bouton secondaire (ex. « Passer cette étape »), rendu sous le bouton principal. */
  secondary?: React.ReactNode
}

// Titres et aides : family.coparents.inviteForm.roles.<rôle>.{title,help} (traduits au rendu).
const ROLES: { value: GuardianRole }[] = [{ value: 'parent' }, { value: 'proche' }]

/** Formulaire d'invitation : e-mail nominatif, rôle, enfants concernés. Erreurs liées aux champs. */
export function InviteForm({ childOptions, ownerChildIds, defaultChildIds, defaultRole = 'parent', onCreated, submitLabel, secondary }: Props) {
  const t = useTranslations('family.coparents.inviteForm')
  const uid = useId()
  const owned = (id: string) => !ownerChildIds || ownerChildIds.includes(id)
  // Rôle « parent » proposé seulement si je suis titulaire d'au moins une fiche (la base
  // refuse sinon : 42501 owner_only) ; il ne porte alors que sur mes fiches.
  const canInviteParent = childOptions.some((c) => owned(c.id))
  const notOwned = childOptions.filter((c) => !owned(c.id))
  const roles = canInviteParent ? ROLES : ROLES.filter((r) => r.value !== 'parent')
  const initialRole: GuardianRole = canInviteParent ? defaultRole : 'proche'
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<GuardianRole>(initialRole)
  const [childIds, setChildIds] = useState<string[]>(() => {
    const ids = defaultChildIds ?? childOptions.map((c) => c.id)
    return initialRole === 'parent' ? ids.filter(owned) : ids
  })
  const [errors, setErrors] = useState<{ email?: string; children?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)

  const toggleChild = (id: string) =>
    setChildIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  const chooseRole = (next: GuardianRole) => {
    setRole(next)
    // Passage à « parent » : les fiches dont je ne suis pas titulaire sont retirées.
    if (next === 'parent') setChildIds((ids) => ids.filter(owned))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next: typeof errors = {}
    if (!isValidEmail(email)) next.email = t('emailInvalid')
    if (childIds.length === 0) next.children = t('childrenRequired')
    setErrors(next)
    if (next.email || next.children) {
      document.getElementById(next.email ? `${uid}-email` : `${uid}-child-0`)?.focus()
      return
    }
    setBusy(true)
    try {
      onCreated(await createFamilyInvitation({ email, role, childIds }))
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : t('createFailed') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div>
        <label htmlFor={`${uid}-email`} className="block text-[13px] font-bold text-night-900">{t('emailLabel')}</label>
        <p id={`${uid}-email-hint`} className="mt-0.5 text-[12px] text-night-600">{t('emailHint')}</p>
        <input
          id={`${uid}-email`}
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={[`${uid}-email-hint`, errors.email && `${uid}-email-err`].filter(Boolean).join(' ')}
          placeholder={t('emailPlaceholder')}
          className="mt-1.5 h-12 w-full rounded-xl border border-night-200 bg-white px-3.5 text-[15px] text-night-900 placeholder:text-night-500 focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-200 aria-[invalid=true]:border-alert-500"
        />
        {errors.email && <p id={`${uid}-email-err`} className="mt-1.5 text-[12px] font-semibold text-alert-600">{errors.email}</p>}
      </div>

      <fieldset>
        <legend className="text-[13px] font-bold text-night-900">{t('role')}</legend>
        <div className={cn('mt-2 grid gap-2', roles.length > 1 && 'sm:grid-cols-2')}>
          {roles.map((r) => (
            <label
              key={r.value}
              className={cn(
                'flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors focus-within:ring-2 focus-within:ring-leaf-400 focus-within:ring-offset-2',
                role === r.value ? 'border-leaf-500 bg-leaf-50/60' : 'border-night-200 bg-white hover:bg-night-50',
              )}
            >
              <input
                type="radio"
                name={`${uid}-role`}
                value={r.value}
                checked={role === r.value}
                onChange={() => chooseRole(r.value)}
                aria-describedby={`${uid}-role-${r.value}`}
                className="mt-0.5 h-5 w-5 shrink-0 accent-leaf-600"
              />
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold text-night-900">{t(`roles.${r.value}.title`)}</span>
                <span id={`${uid}-role-${r.value}`} className="mt-0.5 block text-[12px] leading-snug text-night-600">{t(`roles.${r.value}.help`)}</span>
              </span>
            </label>
          ))}
        </div>
        {notOwned.length > 0 && (
          <p id={`${uid}-owner-note`} className="mt-2 rounded-xl bg-night-50/70 p-3 text-[12px] leading-relaxed text-night-700">
            {canInviteParent
              ? t('notOwner', { dePrenom: dePrenom(notOwned.map((c) => c.prenom).join(', ')), names: notOwned.map((c) => c.prenom).join(', ') })
              : t('notOwnerAny')}
          </p>
        )}
      </fieldset>

      {childOptions.length > 0 && (
        <fieldset aria-describedby={errors.children ? `${uid}-children-err` : undefined}>
          <legend className="text-[13px] font-bold text-night-900">{t('children')}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {childOptions.map((c, i) => {
              const checked = childIds.includes(c.id)
              const locked = role === 'parent' && !owned(c.id)
              return (
                <label
                  key={c.id}
                  className={cn(
                    'inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full border px-4 text-[14px] font-semibold transition-colors focus-within:ring-2 focus-within:ring-leaf-400 focus-within:ring-offset-2',
                    checked ? 'border-leaf-500 bg-leaf-50 text-leaf-800' : 'border-night-200 bg-white text-night-800 hover:bg-night-50',
                    locked && 'cursor-not-allowed opacity-60 hover:bg-white',
                  )}
                >
                  <input
                    id={`${uid}-child-${i}`}
                    type="checkbox"
                    checked={checked}
                    disabled={locked}
                    aria-describedby={locked ? `${uid}-owner-note` : undefined}
                    onChange={() => toggleChild(c.id)}
                    aria-invalid={errors.children ? true : undefined}
                    className="h-4 w-4 accent-leaf-600"
                  />
                  {c.prenom}
                </label>
              )
            })}
          </div>
          {errors.children && <p id={`${uid}-children-err`} className="mt-1.5 text-[12px] font-semibold text-alert-600">{errors.children}</p>}
        </fieldset>
      )}

      {errors.form && <p role="alert" className="rounded-xl bg-alert-50 p-3 text-[13px] font-semibold text-alert-700">{errors.form}</p>}

      <div className="space-y-2.5">
        <button type="submit" disabled={busy} className={cn(btn.primary, 'w-full')}>
          {busy ? t('creating') : submitLabel ?? t('submit')}
        </button>
        {secondary}
      </div>
    </form>
  )
}
