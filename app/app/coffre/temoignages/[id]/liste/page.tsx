'use client'

import Link from 'next/link'
import { use } from 'react'
import { useTranslations } from 'next-intl'
import { Download } from 'lucide-react'
import { ScreenHeader } from '@/components/coffre/ScreenHeader'
import { btn } from '@/components/coffre/buttons'
import { useReceivedTestimonies, useRequests } from '@/components/coffre/store'
import { LIVE } from '@/lib/data/core'
import type { ReceivedTestimonyRecord } from '@/lib/data/testimonies'
import { useAnnounce } from '@/components/coffre/useAnnounce'
import { useVaultI18n } from '@/components/coffre/i18n'
import { saveBlob } from '@/lib/download'

// Maquette « Témoignages reçus » (liste téléchargeable d'une demande)
export default function TemoignagesRecusListePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const t = useTranslations('vault.testimonials')
  const f = useVaultI18n()
  const { requests, ready } = useRequests()
  const { announce, node } = useAnnounce()
  const r = requests.find((x) => x.id === id)
  const recus = r?.witnesses.filter((w) => w.status === 'recu') ?? []
  const { testimonies } = useReceivedTestimonies()
  // Témoin n = n-ième témoignage reçu (ordre d'arrivée), comme dans lib/data/testimonies.
  const ofRequest = testimonies.filter((tm) => tm.requestId === id).slice().reverse()

  // Supabase : export texte horodaté du témoignage tel qu'envoyé (pas de PDF côté client).
  const download = (items: ReceivedTestimonyRecord[], label: string) => {
    if (!LIVE) { announce(t('download.started', { label })); return }
    if (items.length === 0) { announce(t('download.none')); return }
    const text = items.map((tm) => [
      t('download.fileHeader', { ref: tm.reference ?? '', name: tm.author }),
      t('receivedOn', { date: f.date(tm.receivedAt), time: tm.receivedTime }),
      t('download.fileRelation', { relation: tm.relation }),
      '',
      tm.fullText ?? tm.summary,
    ].join('\n')).join('\n\n----------------------------------------\n\n')
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    saveBlob(blob, `temoignages-${id.slice(0, 8)}.txt`)
    announce(t('download.started', { label }))
  }

  return (
    <>
      <ScreenHeader title={t('download.title')} backHref={`/app/coffre/temoignages/${id}`} />
      <div className="w-full px-5">
        {ready && recus.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-night-200 p-8 text-center text-[13.5px] text-night-500">
            {t('download.empty')}
          </p>
        ) : (
          <ul className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
            {recus.map((w) => (
              <li key={w.n} className="flex items-center gap-3 rounded-2xl border border-night-100 bg-white p-4 shadow-soft">
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-bold text-night-900">{t('witness', { n: w.n })}</p>
                  {w.receivedAt && <p className="mt-1 text-[12.5px] text-night-600">{t('receivedOn', { date: f.date(w.receivedAt), time: w.receivedTime ?? '' })}</p>}
                  <p className="text-[12.5px] text-night-500">{t('download.format')} <span aria-hidden="true">•</span> {t('download.pages', { count: w.pages ?? 1 })}</p>
                </div>
                <button
                  type="button"
                  onClick={() => download(ofRequest[w.n - 1] ? [ofRequest[w.n - 1]] : [], t('download.ofWitness', { n: w.n }))}
                  aria-label={t('download.witnessAria', { n: w.n })}
                  className="-mr-1.5 inline-flex h-11 w-11 items-center justify-center rounded-full text-night-800 hover:bg-night-50"
                >
                  <Download className="h-5 w-5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 space-y-3 lg:max-w-sm">
          {recus.length > 0 && (
            <button type="button" onClick={() => download(ofRequest, t('download.ofAll'))} className={btn({ variant: 'primary' })}>
              {t('download.all')}
            </button>
          )}
          <Link href={`/app/coffre/temoignages/${id}`} className={btn({ variant: 'secondary' })}>
            {t('download.backToRequest')}
          </Link>
        </div>
      </div>
      {node}
    </>
  )
}
