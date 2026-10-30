'use client'

import Link from 'next/link'
import { use, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, CircleCheck, Send } from 'lucide-react'
import { ScreenHeader } from '@/components/coffre/ScreenHeader'
import { StatusBadge } from '@/components/coffre/StatusBadge'
import { CopyLinkField } from '@/components/coffre/CopyLinkField'
import { ProgressBar } from '@/components/coffre/ProgressBar'
import { btn } from '@/components/coffre/buttons'
import { useHandledTestimonies, useReceivedTestimonies, useRequests } from '@/components/coffre/store'
import { LoadingState } from '@/components/mobile/StateScreens'
import { testimonyLink } from '@/lib/data/testimonies'
import { useAnnounce } from '@/components/coffre/useAnnounce'
import { useRemindWitness } from '@/components/coffre/useRemindWitness'
import { receivedCount } from '@/lib/mock-vault'
import { useVaultI18n } from '@/components/coffre/i18n'

// Maquettes « Détail de la demande » (en attente / avancement partiel / terminée)
export default function DemandeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const t = useTranslations('vault.testimonials')
  const f = useVaultI18n()
  const { requests, ready, close } = useRequests()
  const [confirmClose, setConfirmClose] = useState(false)
  const [closing, setClosing] = useState(false)
  const [closeError, setCloseError] = useState<string | null>(null)
  const { handled } = useHandledTestimonies()
  const { testimonies } = useReceivedTestimonies()
  const { announce, node } = useAnnounce()
  const remind = useRemindWitness(announce)
  const r = requests.find((x) => x.id === id)

  if (!r) {
    return (
      <>
        <ScreenHeader title={t('request.title')} backHref="/app/coffre/temoignages" />
        {!ready && <LoadingState compact title={t('request.loading')} description="" />}
        {ready && (
          <div className="px-6 pt-16 text-center">
            <p className="text-[16px] font-bold text-night-900">{t('request.notFound')}</p>
            <Link href="/app/coffre/temoignages" className="mt-4 inline-flex h-11 items-center rounded-xl px-4 text-[14px] font-semibold text-leaf-600 hover:underline">
              {t('request.backToList')}
            </Link>
          </div>
        )}
      </>
    )
  }

  const got = receivedCount(r)
  // Lien réutilisable : tant que la demande est ouverte, une ligne « en attente » invite un témoin de plus.
  const total = r.witnesses.length

  const doClose = async () => {
    setClosing(true)
    setCloseError(null)
    try {
      await close(r.id)
      setConfirmClose(false)
      announce(t('request.closed'))
    } catch {
      setCloseError(t('request.closeFailed'))
    } finally {
      setClosing(false)
    }
  }
  const done = r.status === 'termine'
  const pending = r.witnesses.filter((w) => w.status === 'envoi')
  const toConfirm = testimonies.filter((tm) => tm.requestId === r.id && !handled[tm.id])

  return (
    <>
      <ScreenHeader title={t('subjectTitle', { subject: r.subject })} backHref="/app/coffre/temoignages" />
      <div className="w-full px-5">
        <StatusBadge kind={r.status} />
        <p className="mt-1.5 text-[12.5px] text-night-500">{t('createdOn', { date: f.date(r.createdAt) })}</p>

        <CopyLinkField className="mt-4" link={testimonyLink(r.token)} tone={done ? 'night' : 'iris'} />

        <section aria-labelledby="avancement" className="mt-5">
          <h2 id="avancement" className="text-[14px] font-extrabold text-night-900">{t('request.progress')}</h2>
          <p className="mt-1 text-[13px] text-night-600">
            <span className="font-bold text-night-900">{got} / {total}</span> {t('list.received')}
          </p>
          {!done && got > 0 && <p className="mt-1 text-[12.5px] text-night-600">{t('request.stillOpen')}</p>}
          <ProgressBar className="mt-2" value={got} max={total} tone={done ? 'leaf' : 'iris'} label={t('request.receivedLabel')} />
        </section>

        {total > 0 && (
          <ul className="mt-5 divide-y divide-night-100 rounded-2xl border border-night-100 bg-white shadow-soft">
            {r.witnesses.map((w) => (
              <li key={w.n} className="relative flex items-center gap-3 px-4 py-3">
                {w.status === 'recu' && <CircleCheck className="h-5 w-5 shrink-0 text-leaf-500" aria-hidden="true" />}
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/app/coffre/temoignages/${r.id}/temoin/${w.n}`}
                    className="block text-[14px] font-bold text-night-900 after:absolute after:inset-0 after:content-['']"
                  >
                    {t('witness', { n: w.n })}
                  </Link>
                  <p className={w.status === 'recu' ? 'text-[12.5px] text-leaf-600' : 'text-[12.5px] text-night-500'}>
                    {w.status === 'recu' && w.receivedAt
                      ? t('receivedOn', { date: f.date(w.receivedAt), time: w.receivedTime ?? '' })
                      : t('request.awaiting')}
                  </p>
                </div>
                {w.status === 'recu' ? (
                  <Check className="h-5 w-5 shrink-0 text-leaf-500" aria-hidden="true" />
                ) : (
                  <button
                    type="button"
                    onClick={() => void remind(r.token, t('reminderSent', { n: w.n }))}
                    aria-label={t('request.remindAria', { n: w.n })}
                    className="relative z-10 -mr-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-night-700 hover:bg-night-50"
                  >
                    <Send className="h-5 w-5" aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 space-y-3 lg:max-w-sm">
          {(done || toConfirm.length > 0) && (
            <Link
              href={done ? `/app/coffre/temoignages/${r.id}/liste` : `/app/coffre/temoignages/recus?demande=${r.id}`}
              className={btn({ variant: 'secondary' })}
            >
              {t('request.seeTestimonials')}
            </Link>
          )}
          {!done && pending.length > 0 && (
            <button
              type="button"
              onClick={() => void remind(r.token, t('request.remindedAll', { count: pending.length }))}
              className={btn({ variant: 'secondary' })}
            >
              {t('request.remindAll')}
            </button>
          )}
          {!done && pending.length > 0 && <p className="text-[12px] leading-relaxed text-night-500">{t('request.remindHint')}</p>}
          {!done && (confirmClose ? (
            <div role="group" aria-labelledby="close-confirm" className="rounded-2xl border border-night-100 bg-night-50/60 p-4">
              <p id="close-confirm" className="text-[13px] leading-relaxed text-night-800">{t('request.closeConfirm', { count: got })}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => void doClose()} disabled={closing} aria-busy={closing} className={btn({ variant: 'primary' })}>
                  {closing ? t('request.closing') : t('request.closeYes')}
                </button>
                <button type="button" onClick={() => setConfirmClose(false)} disabled={closing} className={btn({ variant: 'secondary' })}>
                  {t('request.closeCancel')}
                </button>
              </div>
              {closeError && <p role="alert" className="mt-2 text-[12.5px] font-semibold text-alert-600">{closeError}</p>}
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmClose(true)} className={btn({ variant: 'secondary' })}>
              {t('request.close')}
            </button>
          ))}
        </div>
      </div>
      {node}
    </>
  )
}
