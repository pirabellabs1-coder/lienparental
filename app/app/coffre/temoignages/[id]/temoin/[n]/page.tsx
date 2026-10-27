'use client'

import Link from 'next/link'
import { use, useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ScreenHeader } from '@/components/coffre/ScreenHeader'
import { StatusBadge } from '@/components/coffre/StatusBadge'
import { EnvelopeWaiting, ReceivedMedal } from '@/components/coffre/Illustrations'
import { btn } from '@/components/coffre/buttons'
import { useRequests } from '@/components/coffre/store'
import { useAnnounce } from '@/components/coffre/useAnnounce'
import { useVaultI18n } from '@/components/coffre/i18n'
import { testimonyLink } from '@/lib/data/testimonies'

// Maquette « Vue témoin – En attente »
export default function TemoinPage({ params }: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = use(params)
  const t = useTranslations('vault.testimonials')
  const f = useVaultI18n()
  const infoId = useId()
  const { requests, ready } = useRequests()
  const { announce, node } = useAnnounce()
  const [showInfo, setShowInfo] = useState(false)
  const r = requests.find((x) => x.id === id)
  const w = r?.witnesses.find((x) => String(x.n) === n)

  if (!r || !w) {
    return (
      <>
        <ScreenHeader title={t('witnessView.title')} backHref={`/app/coffre/temoignages/${id}`} />
        {ready && <p className="px-6 pt-16 text-center text-[14px] text-night-600">{t('witnessView.notFound')}</p>}
      </>
    )
  }

  const received = w.status === 'recu'

  return (
    <>
      <ScreenHeader title={t('witness', { n: w.n })} backHref={`/app/coffre/temoignages/${r.id}`} />
      <div className="mx-auto w-full max-w-md px-5 text-center">
        <StatusBadge kind={received ? 'termine' : 'attente'}>{received ? t('witnessView.statusReceived') : t('witnessView.statusPending')}</StatusBadge>

        {received ? <ReceivedMedal className="mt-6" /> : <EnvelopeWaiting className="mt-6" />}

        <h2 className="mt-5 text-[17px] font-extrabold text-night-900">
          {received ? t('witnessView.received') : t('witnessView.notSent')}
        </h2>
        <p className="mx-auto mt-2 max-w-[280px] text-[13.5px] leading-relaxed text-night-600">
          {received && w.receivedAt
            ? t('witnessView.sentOn', { date: f.date(w.receivedAt), time: w.receivedTime ?? '' })
            : t('witnessView.invitedOn', { date: f.date(w.invitedAt), time: w.invitedTime })}
        </p>

        {!received && (
          <div className="mt-6 rounded-2xl bg-night-50 px-5 py-4">
            <p className="text-[14px] font-bold text-night-900">{t('witnessView.awaiting')}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-night-600">
              {t('witnessView.notify')}
            </p>
          </div>
        )}

        <div className="mt-6 space-y-1">
          {received ? (
            <Link href={`/app/coffre/temoignages/${r.id}/liste`} className={btn({ variant: 'primary' })}>{t('witnessView.view')}</Link>
          ) : (
            <button type="button" onClick={() => announce(t('reminderSent', { n: w.n }))} className={btn({ variant: 'primary' })}>
              {t('witnessView.remind')}
            </button>
          )}
          <button
            type="button"
            aria-expanded={showInfo}
            aria-controls={infoId}
            onClick={() => setShowInfo((v) => !v)}
            className={btn({ variant: 'ghost', size: 'sm' })}
          >
            {t('witnessView.info')}
          </button>
          <dl id={infoId} hidden={!showInfo} className="rounded-2xl border border-night-100 p-4 text-left text-[13px]">
            <div className="flex justify-between gap-3 py-1"><dt className="text-night-500">{t('witnessView.invitation')}</dt><dd className="font-semibold text-night-900">{t('dateAtTime', { date: f.date(w.invitedAt), time: w.invitedTime })}</dd></div>
            {w.name && <div className="flex justify-between gap-3 py-1"><dt className="text-night-500">{t('witnessView.name')}</dt><dd className="font-semibold text-night-900">{w.name}</dd></div>}
            <div className="flex justify-between gap-3 py-1"><dt className="text-night-500">{t('witnessView.link')}</dt><dd className="truncate font-semibold text-night-900">{testimonyLink(r.token)}</dd></div>
          </dl>
        </div>
      </div>
      {node}
    </>
  )
}
