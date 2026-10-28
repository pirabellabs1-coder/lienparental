'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Check, Clock3, Copy, Eye, KeyRound, Link2, ShieldOff } from 'lucide-react'
import { cn } from '@/lib/cn'
import { btn, card } from '@/components/ui/kit'
import { copyText } from '@/components/coffre/CopyLinkField'
import { Sheet } from '@/components/messages/Sheet'
import { shareStatus, type ShareSummary } from '@/lib/partages'
import { intlLocale } from '@/lib/i18n/config'
import { currentTz } from '@/lib/tz'

const dayOf = (iso: string, locale: string) =>
  new Date(iso).toLocaleDateString(intlLocale(locale), { day: 'numeric', month: 'long', timeZone: currentTz() })
const timeOf = (iso: string, locale: string) =>
  new Date(iso).toLocaleTimeString(intlLocale(locale), { hour: '2-digit', minute: '2-digit', timeZone: currentTz() })

// Libellés : family.courtFile.shareList.status.<statut> (traduits au rendu).
const STATUS_BADGE = {
  active: { cls: 'bg-leaf-50 text-leaf-700 ring-leaf-200' },
  expired: { cls: 'bg-night-50 text-night-700 ring-night-200' },
  revoked: { cls: 'bg-alert-50 text-alert-700 ring-alert-200' },
} as const

type Props = {
  shares: ShareSummary[]
  onRevoke: (id: string) => Promise<void>
  announce: (msg: string) => void
}

/** Partages créés : statut, contenu, expiration, consultations, révocation. */
export function ShareList({ shares, onRevoke, announce }: Props) {
  const t = useTranslations('family.courtFile.shareList')
  const locale = useLocale()
  const stamp = (iso: string) => t('stamp', { date: dayOf(iso, locale), time: timeOf(iso, locale) })
  /** Équivalent traduit de scopeSummary (lib/partages). */
  const scopeSummary = (scope: ShareSummary['scope']) => {
    const parts: string[] = []
    if (scope.journal) parts.push(t('scope.journal'))
    if (scope.documentIds.length) parts.push(t('scope.documents', { count: scope.documentIds.length }))
    if (scope.testimonyIds.length) parts.push(t('scope.testimonies', { count: scope.testimonyIds.length }))
    if (scope.messages) parts.push(t('scope.messages'))
    return parts.length ? parts.join(', ') : t('scope.none')
  }
  const [confirm, setConfirm] = useState<ShareSummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  if (shares.length === 0) {
    return (
      <div className={cn(card, 'flex items-start gap-3 p-4')}>
        <Link2 className="mt-0.5 h-5 w-5 shrink-0 text-night-600" aria-hidden="true" />
        <p className="text-[13px] text-night-700">{t('empty')}</p>
      </div>
    )
  }

  const copy = async (s: ShareSummary) => {
    if (await copyText(`${window.location.origin}${s.path}`)) {
      setCopiedId(s.id)
      announce(t('copiedAnnounce'))
      setTimeout(() => setCopiedId((c) => (c === s.id ? null : c)), 2200)
    }
  }

  const revoke = async () => {
    if (!confirm) return
    setBusy(true)
    setError(null)
    try {
      await onRevoke(confirm.id)
      announce(t('revokedAnnounce', { label: confirm.label }))
      setConfirm(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('revokeFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <ul className="space-y-3">
        {shares.map((s) => {
          const st = shareStatus(s)
          const badge = STATUS_BADGE[st]
          return (
            <li key={s.id} className={cn(card, 'p-4', st !== 'active' && 'bg-night-50/30')}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-[14px] font-bold text-night-900">{s.label}</h3>
                  <p className="mt-0.5 text-[12px] text-night-600">{t('content', { value: scopeSummary(s.scope) })}</p>
                </div>
                <span className={cn('inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset', badge.cls)}>{t(`status.${st}`)}</span>
              </div>

              <ul className="mt-3 space-y-1.5 text-[12px] text-night-700">
                <li className="flex items-center gap-2">
                  <Clock3 className="h-3.5 w-3.5 shrink-0 text-night-600" aria-hidden="true" />
                  {st === 'revoked' && s.revokedAt ? t('revokedOn', { date: stamp(s.revokedAt) }) : st === 'expired' ? t('expiredOn', { date: stamp(s.expiresAt) }) : t('expiresOn', { date: stamp(s.expiresAt) })}
                </li>
                <li className="flex items-center gap-2">
                  <KeyRound className="h-3.5 w-3.5 shrink-0 text-night-600" aria-hidden="true" />
                  {s.hasCode ? t('withCode') : t('withoutCode')}
                </li>
                <li className="flex items-center gap-2">
                  <Eye className="h-3.5 w-3.5 shrink-0 text-night-600" aria-hidden="true" />
                  {s.accessCount === 0
                    ? t('notViewed')
                    : `${t('viewedOn', { date: stamp(s.accesses[0]) })}${s.accessCount > 1 ? ` · ${t('viewsCount', { count: s.accessCount })}` : ''}`}
                </li>
              </ul>

              {s.accessCount > 1 && (
                <details className="mt-2 text-[12px] text-night-700">
                  <summary className="inline-flex min-h-[44px] cursor-pointer items-center font-semibold text-night-800">{t('history')}</summary>
                  <ul className="mt-1 space-y-1 pl-1">
                    {s.accesses.map((a) => <li key={a}>{t('viewedOn', { date: stamp(a) })}</li>)}
                  </ul>
                </details>
              )}

              {st === 'active' && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => void copy(s)} className={cn(btn.secondary, 'h-11 px-3 text-[13px]')}>
                    {copiedId === s.id ? <Check className="h-4 w-4 text-leaf-600" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                    {copiedId === s.id ? t('copied') : t('copyLink')}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setError(null); setConfirm(s) }}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-alert-200 bg-white px-3 text-[13px] font-semibold text-alert-700 transition hover:bg-alert-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alert-400 focus-visible:ring-offset-2"
                  >
                    <ShieldOff className="h-4 w-4" aria-hidden="true" />
                    {t('revoke')}
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <Sheet
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={t('revokeTitle')}
        description={confirm ? t('revokeText', { label: confirm.label }) : undefined}
      >
        {error && <p role="alert" className="mb-3 rounded-xl bg-alert-50 p-3 text-[13px] font-semibold text-alert-700">{error}</p>}
        <div className="grid gap-2">
          <button type="button" onClick={() => void revoke()} disabled={busy} className={cn(btn.danger, 'w-full')}>
            {busy ? t('revoking') : t('revokeLink')}
          </button>
          <button type="button" onClick={() => setConfirm(null)} className={cn(btn.secondary, 'w-full')} data-autofocus>
            {t('cancel')}
          </button>
        </div>
      </Sheet>
    </>
  )
}
