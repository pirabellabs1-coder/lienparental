'use client'

import Link from 'next/link'
import { use } from 'react'
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
import { frDate, receivedCount } from '@/lib/mock-vault'

// Maquettes « Détail de la demande » (en attente / avancement partiel / terminée)
export default function DemandeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { requests, ready } = useRequests()
  const { handled } = useHandledTestimonies()
  const { testimonies } = useReceivedTestimonies()
  const { announce, node } = useAnnounce()
  const r = requests.find((x) => x.id === id)

  if (!r) {
    return (
      <>
        <ScreenHeader title="Détail de la demande" backHref="/app/coffre/temoignages" />
        {!ready && <LoadingState compact title="Chargement de la demande" description="" />}
        {ready && (
          <div className="px-6 pt-16 text-center">
            <p className="text-[16px] font-bold text-night-900">Demande introuvable</p>
            <Link href="/app/coffre/temoignages" className="mt-4 inline-flex h-11 items-center rounded-xl px-4 text-[14px] font-semibold text-leaf-600 hover:underline">
              Retour à mes demandes
            </Link>
          </div>
        )}
      </>
    )
  }

  const got = receivedCount(r)
  const total = r.witnesses.length
  const done = r.status === 'termine'
  const pending = r.witnesses.filter((w) => w.status === 'envoi')
  const toConfirm = testimonies.filter((t) => t.requestId === r.id && !handled[t.id])

  return (
    <>
      <ScreenHeader title={`Témoignage – ${r.subject}`} backHref="/app/coffre/temoignages" />
      <div className="w-full px-5">
        <StatusBadge kind={r.status} />
        <p className="mt-1.5 text-[12.5px] text-night-500">Créée le {frDate(r.createdAt)}</p>

        <CopyLinkField className="mt-4" link={testimonyLink(r.token)} tone={done ? 'night' : 'iris'} />

        <section aria-labelledby="avancement" className="mt-5">
          <h2 id="avancement" className="text-[14px] font-extrabold text-night-900">Statut d’avancement</h2>
          <p className="mt-1 text-[13px] text-night-600">
            <span className="font-bold text-night-900">{got} / {total}</span> témoignages reçus
          </p>
          <ProgressBar className="mt-2" value={got} max={total} tone={done ? 'leaf' : 'iris'} label="Témoignages reçus" />
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
                    Témoin {w.n}
                  </Link>
                  <p className={w.status === 'recu' ? 'text-[12.5px] text-leaf-600' : 'text-[12.5px] text-night-500'}>
                    {w.status === 'recu' && w.receivedAt
                      ? `Reçu le ${frDate(w.receivedAt)} à ${w.receivedTime}`
                      : 'En attente d’envoi'}
                  </p>
                </div>
                {w.status === 'recu' ? (
                  <Check className="h-5 w-5 shrink-0 text-leaf-500" aria-hidden="true" />
                ) : (
                  <button
                    type="button"
                    onClick={() => announce(`Relance envoyée au témoin ${w.n}`)}
                    aria-label={`Relancer le témoin ${w.n}`}
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
              Voir les témoignages
            </Link>
          )}
          {!done && pending.length > 0 && (
            <button
              type="button"
              onClick={() => announce(`Relance envoyée à ${pending.length} témoin${pending.length > 1 ? 's' : ''}`)}
              className={btn({ variant: 'secondary' })}
            >
              Relancer les témoins
            </button>
          )}
        </div>
      </div>
      {node}
    </>
  )
}
