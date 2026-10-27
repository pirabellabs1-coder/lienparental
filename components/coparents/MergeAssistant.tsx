'use client'

import { useEffect, useId, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ArrowRight, Copy as Duplicate } from 'lucide-react'
import { cn } from '@/lib/cn'
import { btn, card } from '@/components/ui/kit'
import { Modal } from '@/components/ui/Modal'
import type { MergeCandidate } from '@/lib/coparents'
import { frBirth } from './bits'

/** Bandeau « fiche en double » affiché en tête de page. */
export function MergeBanner({ candidate, onOpen }: { candidate: MergeCandidate; onOpen: () => void }) {
  const t = useTranslations('family.coparents.merge')
  const locale = useLocale()
  return (
    <li className={cn(card, 'flex flex-wrap items-center gap-3 border-orange-200 bg-orange-50/40 p-4')}>
      <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-orange-100 text-orange-800">
        <Duplicate className="h-5 w-5" />
      </span>
      <p className="min-w-0 flex-1 text-[13px] text-night-800">
        {t.rich('bannerText', {
          name: candidate.myChild.prenom,
          owner: candidate.sharedChild.ownerPrenom,
          date: frBirth(candidate.dateNaissance, locale),
          strong: (chunks) => <strong className="font-semibold text-night-900">{chunks}</strong>,
        })}
      </p>
      <button type="button" onClick={onOpen} className={cn(btn.secondary, 'w-full sm:w-auto')}>{t('bannerAction')}</button>
    </li>
  )
}

type Props = {
  candidate: MergeCandidate | null
  busy: boolean
  error: string | null
  onClose: () => void
  onMerge: (c: MergeCandidate) => void
  onDismiss: (c: MergeCandidate) => void
}

/** Fusion guidée : comparaison, conséquences, confirmation manuelle explicite. */
export function MergeAssistant({ candidate, busy, error, onClose, onMerge, onDismiss }: Props) {
  const t = useTranslations('family.coparents.merge')
  const locale = useLocale()
  const uid = useId()
  const [confirmed, setConfirmed] = useState(false)
  useEffect(() => { setConfirmed(false) }, [candidate])

  const born = candidate ? frBirth(candidate.dateNaissance, locale) : ''

  return (
    <Modal
      open={!!candidate}
      onClose={busy ? () => undefined : onClose}
      size="lg"
      title={t('title')}
      description={t('description')}
      footer={candidate && (
        <>
          <button type="button" disabled={busy} onClick={() => onDismiss(candidate)} className={btn.secondary}>
            {t('notSame')}
          </button>
          <button type="button" disabled={!confirmed || busy} onClick={() => onMerge(candidate)} className={btn.primary}>
            {busy ? t('merging') : t('merge')}
          </button>
        </>
      )}
    >
      {candidate && (
        <div className="space-y-4">
          <div className="grid items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
            <div className="rounded-xl border border-night-100 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-night-600">{t('yourRecord')}</p>
              <p className="mt-1 text-[15px] font-bold text-night-900">{candidate.myChild.prenom}</p>
              <p className="text-[12px] text-night-600">{t('born', { date: born })}</p>
            </div>
            <ArrowRight className="mx-auto h-5 w-5 rotate-90 text-night-500 sm:rotate-0" aria-hidden="true" />
            <div className="rounded-xl border border-leaf-200 bg-leaf-50/50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-leaf-800">{t('sharedBy', { name: candidate.sharedChild.ownerPrenom })}</p>
              <p className="mt-1 text-[15px] font-bold text-night-900">{candidate.sharedChild.prenom}</p>
              <p className="text-[12px] text-night-600">{t('born', { date: born })}</p>
            </div>
          </div>

          <div>
            <h3 className="text-[14px] font-bold text-night-900">{t('whatHappens')}</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[13px] text-night-800">
              <li>{t('consequence1')}</li>
              <li>{t('consequence2')}</li>
              <li>{t('consequence3')}</li>
              <li>{t('consequence4')}</li>
            </ul>
          </div>

          <label htmlFor={`${uid}-ok`} className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border border-night-200 p-3">
            <input
              id={`${uid}-ok`}
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-leaf-600"
            />
            <span className="text-[13px] font-semibold text-night-900">{t('confirm')}</span>
          </label>

          {error && <p role="alert" className="rounded-xl bg-alert-50 p-3 text-[13px] font-semibold text-alert-700">{error}</p>}
        </div>
      )}
    </Modal>
  )
}
