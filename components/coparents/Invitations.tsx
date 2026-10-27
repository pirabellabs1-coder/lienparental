'use client'

import { useLocale, useTranslations } from 'next-intl'
import { Clock, Inbox, RefreshCw, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { btn, card } from '@/components/ui/kit'
import type { ReceivedInvitation, SentInvitation } from '@/lib/coparents'
import { PersonAvatar, RoleBadge, frBirth, frDay, joinNames, linkBtn } from './bits'

/** Demande reçue (synchronisation avec un compte existant) : accepter ou refuser. */
export function ReceivedCard({ inv, busy, onAccept, onDecline }: {
  inv: ReceivedInvitation
  busy: boolean
  onAccept: () => void
  onDecline: () => void
}) {
  const t = useTranslations('family.coparents.invitations')
  const locale = useLocale()
  const kids = inv.children.map((c) => (c.dateNaissance ? t('childBorn', { name: c.prenom, date: frBirth(c.dateNaissance, locale) }) : c.prenom))
  return (
    <li className={cn(card, 'border-leaf-200 p-4')}>
      <div className="flex items-start gap-3">
        <PersonAvatar prenom={inv.fromPrenom} nom={inv.fromNom} seed={inv.id} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-night-900">
            {t('invitesYou', { name: `${inv.fromPrenom} ${inv.fromNom}` })} <RoleBadge role={inv.role} className="ml-1 align-middle" />
          </p>
          <p className="mt-1 text-[13px] text-night-700">{t('sharedSpaceOf', { names: joinNames(kids, locale) })}</p>
          <p className="mt-1 flex items-center gap-1.5 text-[12px] text-night-600">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {t('validUntil', { date: frDay(inv.expiresAt, false, locale) })}
          </p>
        </div>
      </div>
      <p className="mt-3 rounded-xl bg-night-50/70 p-3 text-[12px] text-night-700">
        {t('mergeNote')}
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button type="button" disabled={busy} onClick={onAccept} className={btn.primary}>{t('accept')}</button>
        <button type="button" disabled={busy} onClick={onDecline} className={btn.secondary}>{t('decline')}</button>
      </div>
    </li>
  )
}

// Libellés : family.coparents.invitations.status.<statut> (traduits au rendu).
const STATUS: Record<SentInvitation['status'], { cls: string }> = {
  pending: { cls: 'bg-orange-50 text-orange-800 ring-orange-100' },
  expired: { cls: 'bg-night-50 text-night-700 ring-night-100' },
  declined: { cls: 'bg-alert-50 text-alert-700 ring-alert-100' },
}

/** Invitation envoyée : renvoyer (nouveau lien) ou annuler. */
export function SentRow({ inv, busy, onResend, onCancel }: {
  inv: SentInvitation
  busy: boolean
  onResend: () => void
  onCancel: () => void
}) {
  const t = useTranslations('family.coparents.invitations')
  const locale = useLocale()
  const s = STATUS[inv.status]
  return (
    <li className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-night-50 text-night-700">
        <Inbox className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="break-all text-[14px] font-semibold text-night-900">{inv.email}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-night-600">
          <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset', s.cls)}>{t(`status.${inv.status}`)}</span>
          <RoleBadge role={inv.role} />
          <span>{joinNames(inv.children.map((c) => c.prenom), locale)}</span>
          {inv.status === 'pending' && <span>{t('expiresOn', { date: frDay(inv.expiresAt, false, locale) })}</span>}
        </p>
      </div>
      {inv.status !== 'declined' && (
        <div className="flex w-full gap-2 sm:w-auto">
          <button type="button" disabled={busy} onClick={onResend} className={cn(linkBtn, 'flex-1 border border-night-200 bg-white text-night-900 hover:bg-night-50 sm:flex-none')}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {t('resend')}<span className="sr-only"> {t('invitationTo', { email: inv.email })}</span>
          </button>
          <button type="button" disabled={busy} onClick={onCancel} className={cn(linkBtn, 'flex-1 border border-night-200 bg-white text-night-800 hover:bg-night-50 sm:flex-none')}>
            <X className="h-4 w-4" aria-hidden="true" />
            {t('cancel')}<span className="sr-only"> {t('invitationTo', { email: inv.email })}</span>
          </button>
        </div>
      )}
    </li>
  )
}
