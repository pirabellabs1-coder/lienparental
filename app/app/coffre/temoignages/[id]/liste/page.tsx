'use client'

import Link from 'next/link'
import { use } from 'react'
import { Download } from 'lucide-react'
import { ScreenHeader } from '@/components/coffre/ScreenHeader'
import { btn } from '@/components/coffre/buttons'
import { useReceivedTestimonies, useRequests } from '@/components/coffre/store'
import { LIVE } from '@/lib/data/core'
import type { ReceivedTestimonyRecord } from '@/lib/data/testimonies'
import { useAnnounce } from '@/components/coffre/useAnnounce'
import { frDate } from '@/lib/mock-vault'

// Maquette « Témoignages reçus » (liste téléchargeable d'une demande)
export default function TemoignagesRecusListePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { requests, ready } = useRequests()
  const { announce, node } = useAnnounce()
  const r = requests.find((x) => x.id === id)
  const recus = r?.witnesses.filter((w) => w.status === 'recu') ?? []
  const { testimonies } = useReceivedTestimonies()
  // Témoin n = n-ième témoignage reçu (ordre d'arrivée), comme dans lib/data/testimonies.
  const ofRequest = testimonies.filter((t) => t.requestId === id).slice().reverse()

  // Supabase : export texte horodaté du témoignage tel qu'envoyé (pas de PDF côté client).
  const download = (items: ReceivedTestimonyRecord[], label: string) => {
    if (!LIVE) { announce(`Téléchargement ${label} lancé`); return }
    if (items.length === 0) { announce('Aucun témoignage à télécharger'); return }
    const text = items.map((t) => [
      `Témoignage ${t.reference ?? ''} — ${t.author}`,
      `Reçu le ${frDate(t.receivedAt)} à ${t.receivedTime}`,
      `Lien avec la famille : ${t.relation}`,
      '',
      t.fullText ?? t.summary,
    ].join('\n')).join('\n\n----------------------------------------\n\n')
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `temoignages-${id.slice(0, 8)}.txt`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    announce(`Téléchargement ${label} lancé`)
  }

  return (
    <>
      <ScreenHeader title="Témoignages reçus" backHref={`/app/coffre/temoignages/${id}`} />
      <div className="w-full px-5">
        {ready && recus.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-night-200 p-8 text-center text-[13.5px] text-night-500">
            Aucun témoignage reçu pour le moment.
          </p>
        ) : (
          <ul className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
            {recus.map((w) => (
              <li key={w.n} className="flex items-center gap-3 rounded-2xl border border-night-100 bg-white p-4 shadow-soft">
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-bold text-night-900">Témoin {w.n}</p>
                  {w.receivedAt && <p className="mt-1 text-[12.5px] text-night-600">Reçu le {frDate(w.receivedAt)} à {w.receivedTime}</p>}
                  <p className="text-[12.5px] text-night-500">Format PDF <span aria-hidden="true">•</span> {w.pages ?? 1} page{(w.pages ?? 1) > 1 ? 's' : ''}</p>
                </div>
                <button
                  type="button"
                  onClick={() => download(ofRequest[w.n - 1] ? [ofRequest[w.n - 1]] : [], `du témoin ${w.n}`)}
                  aria-label={`Télécharger le témoignage du témoin ${w.n}`}
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
            <button type="button" onClick={() => download(ofRequest, 'de tous les témoignages')} className={btn({ variant: 'primary' })}>
              Télécharger tous les témoignages
            </button>
          )}
          <Link href={`/app/coffre/temoignages/${id}`} className={btn({ variant: 'secondary' })}>
            Retour à la demande
          </Link>
        </div>
      </div>
      {node}
    </>
  )
}
