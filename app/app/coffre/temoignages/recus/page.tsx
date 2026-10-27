'use client'

import Link from 'next/link'
import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Eye, EllipsisVertical, X } from 'lucide-react'
import { ActionSheet, ConfirmDialog } from '@/components/ui'
import { ScreenHeader } from '@/components/coffre/ScreenHeader'
import { InitialsAvatar } from '@/components/coffre/InitialsAvatar'
import { btn } from '@/components/coffre/buttons'
import { useHandledTestimonies, useReceivedTestimonies } from '@/components/coffre/store'
import { useAnnounce } from '@/components/coffre/useAnnounce'
import type { ReceivedTestimony } from '@/lib/mock-vault'
import { useVaultI18n } from '@/components/coffre/i18n'

// Maquette « 7. Témoignages en attente »
function EnAttente() {
  const router = useRouter()
  const t = useTranslations('vault.testimonials')
  const f = useVaultI18n()
  const params = useSearchParams()
  const demande = params.get('demande')
  const { handled, mark, ready: handledReady } = useHandledTestimonies()
  const { testimonies, ready: listReady } = useReceivedTestimonies()
  const ready = handledReady && listReady
  const { announce, node } = useAnnounce()
  const [menuFor, setMenuFor] = useState<ReceivedTestimony | null>(null)
  const [toRefuse, setToRefuse] = useState<ReceivedTestimony | null>(null)

  const list = testimonies.filter((tm) => !handled[tm.id] && (!demande || tm.requestId === demande))

  const confirm = async (tm: ReceivedTestimony) => {
    try {
      await mark(tm.id, 'confirme')
      router.push(`/app/coffre/temoignages/confirme?id=${tm.id}`)
    } catch (e) {
      announce(e instanceof Error ? e.message : t('pendingList.confirmFailed'))
    }
  }

  return (
    <>
      <ScreenHeader title={t('pendingList.title')} backHref={demande ? `/app/coffre/temoignages/${demande}` : '/app/coffre/temoignages'} />
      <div className="w-full px-5">
        <p className="mx-auto max-w-[280px] text-center text-[13px] leading-relaxed text-night-600">
          {t('pendingList.lead')}
        </p>

        {ready && list.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-night-200 p-8 text-center text-[13.5px] text-night-500">
            {t('pendingList.empty')}
          </p>
        ) : (
          <ul className="mt-5 space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
            {list.map((tm) => (
              <li key={tm.id} className="rounded-2xl border border-night-100 bg-white p-4 shadow-soft">
                <div className="flex items-center gap-3">
                  <InitialsAvatar initials={tm.initials} tone={tm.tone} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-bold text-night-900">{tm.author}</p>
                    <p className="text-[12.5px] text-night-500">{t('receivedOn', { date: f.date(tm.receivedAt), time: tm.receivedTime })}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMenuFor(tm)}
                    aria-label={t('pendingList.optionsAria', { name: tm.author })}
                    className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-night-500 hover:bg-night-50"
                  >
                    <EllipsisVertical className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Link href={`/app/coffre/temoignages/recu/${tm.id}`} className={btn({ variant: 'secondary', size: 'sm' })} aria-label={t('pendingList.viewAria', { name: tm.author })}>
                    {t('pendingList.view')}
                  </Link>
                  <button type="button" onClick={() => void confirm(tm)} className={btn({ variant: 'primary', size: 'sm' })} aria-label={t('pendingList.confirmAria', { name: tm.author })}>
                    {t('pendingList.confirm')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <Link href="/app/coffre/temoignages?tab=termine" className="mt-5 flex h-12 items-center justify-center rounded-xl border border-night-200 bg-white text-[13.5px] font-semibold text-night-900 hover:bg-night-50 lg:max-w-sm">
          {t('pendingList.seeAllReceived')}
        </Link>
      </div>

      <ActionSheet
        open={menuFor !== null}
        onClose={() => setMenuFor(null)}
        title={menuFor?.author}
        actions={menuFor ? [
          { key: 'voir', label: t('pendingList.viewTestimonial'), icon: <Eye className="h-5 w-5" />, onClick: () => router.push(`/app/coffre/temoignages/recu/${menuFor.id}`) },
          { key: 'refuser', label: t('refuse'), icon: <X className="h-5 w-5" />, variant: 'danger', onClick: () => setToRefuse(menuFor) },
        ] : []}
      />
      <ConfirmDialog
        open={toRefuse !== null}
        onClose={() => setToRefuse(null)}
        onConfirm={async () => {
          if (!toRefuse) return
          try {
            await mark(toRefuse.id, 'refuse')
            announce(t('pendingList.refused', { name: toRefuse.author }))
          } catch (e) {
            announce(e instanceof Error ? e.message : t('pendingList.refuseFailed'))
          }
          setToRefuse(null)
        }}
        title={t('refuseTitle')}
        description={toRefuse ? t('refuseText', { name: toRefuse.author }) : ''}
        confirmLabel={t('refuse')}
      />
      {node}
    </>
  )
}

export default function TemoignagesEnAttentePage() {
  const tc = useTranslations('vault.common')
  return (
    <Suspense fallback={<div className="p-6 text-center text-sm text-night-500" role="status">{tc('loading')}</div>}>
      <EnAttente />
    </Suspense>
  )
}
