'use client'

import Link from 'next/link'
import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EllipsisVertical, X } from 'lucide-react'
import { ActionSheet, ConfirmDialog } from '@/components/ui'
import { ScreenHeader } from '@/components/coffre/ScreenHeader'
import { InitialsAvatar } from '@/components/coffre/InitialsAvatar'
import { btn } from '@/components/coffre/buttons'
import { useHandledTestimonies, useReceivedTestimonies } from '@/components/coffre/store'
import { useAnnounce } from '@/components/coffre/useAnnounce'
import { frDate, type ReceivedTestimony } from '@/lib/mock-vault'

// Maquette « 7. Témoignages en attente »
function EnAttente() {
  const router = useRouter()
  const params = useSearchParams()
  const demande = params.get('demande')
  const { handled, mark, ready: handledReady } = useHandledTestimonies()
  const { testimonies, ready: listReady } = useReceivedTestimonies()
  const ready = handledReady && listReady
  const { announce, node } = useAnnounce()
  const [menuFor, setMenuFor] = useState<ReceivedTestimony | null>(null)
  const [toRefuse, setToRefuse] = useState<ReceivedTestimony | null>(null)

  const list = testimonies.filter((t) => !handled[t.id] && (!demande || t.requestId === demande))

  const confirm = async (t: ReceivedTestimony) => {
    try {
      await mark(t.id, 'confirme')
      router.push(`/app/coffre/temoignages/confirme?id=${t.id}`)
    } catch (e) {
      announce(e instanceof Error ? e.message : 'Confirmation impossible')
    }
  }

  return (
    <>
      <ScreenHeader title="Témoignages en attente" backHref={demande ? `/app/coffre/temoignages/${demande}` : '/app/coffre/temoignages'} />
      <div className="w-full px-5">
        <p className="mx-auto max-w-[280px] text-center text-[13px] leading-relaxed text-night-600">
          Ces témoignages sont en attente de votre confirmation.
        </p>

        {ready && list.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-night-200 p-8 text-center text-[13.5px] text-night-500">
            Aucun témoignage en attente de confirmation.
          </p>
        ) : (
          <ul className="mt-5 space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
            {list.map((t) => (
              <li key={t.id} className="rounded-2xl border border-night-100 bg-white p-4 shadow-soft">
                <div className="flex items-center gap-3">
                  <InitialsAvatar initials={t.initials} tone={t.tone} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-bold text-night-900">{t.author}</p>
                    <p className="text-[12.5px] text-night-500">Reçu le {frDate(t.receivedAt)} à {t.receivedTime}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMenuFor(t)}
                    aria-label={`Options pour le témoignage de ${t.author}`}
                    className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-night-500 hover:bg-night-50"
                  >
                    <EllipsisVertical className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Link href={`/app/coffre/temoignages/recu/${t.id}`} className={btn({ variant: 'secondary', size: 'sm' })} aria-label={`Voir le témoignage de ${t.author}`}>
                    Voir
                  </Link>
                  <button type="button" onClick={() => void confirm(t)} className={btn({ variant: 'primary', size: 'sm' })} aria-label={`Confirmer le témoignage de ${t.author}`}>
                    Confirmer
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <Link href="/app/coffre/temoignages?tab=termine" className="mt-5 flex h-12 items-center justify-center rounded-xl border border-night-200 bg-white text-[13.5px] font-semibold text-night-900 hover:bg-night-50 lg:max-w-sm">
          Voir tous les témoignages reçus
        </Link>
      </div>

      <ActionSheet
        open={menuFor !== null}
        onClose={() => setMenuFor(null)}
        title={menuFor?.author}
        actions={menuFor ? [
          { key: 'voir', label: 'Voir le témoignage', icon: <Eye className="h-5 w-5" />, onClick: () => router.push(`/app/coffre/temoignages/recu/${menuFor.id}`) },
          { key: 'refuser', label: 'Refuser', icon: <X className="h-5 w-5" />, variant: 'danger', onClick: () => setToRefuse(menuFor) },
        ] : []}
      />
      <ConfirmDialog
        open={toRefuse !== null}
        onClose={() => setToRefuse(null)}
        onConfirm={async () => {
          if (!toRefuse) return
          try {
            await mark(toRefuse.id, 'refuse')
            announce(`Témoignage de ${toRefuse.author} refusé`)
          } catch (e) {
            announce(e instanceof Error ? e.message : 'Refus impossible')
          }
          setToRefuse(null)
        }}
        title="Refuser ce témoignage ?"
        description={toRefuse ? `Le témoignage de ${toRefuse.author} ne sera pas conservé dans votre coffre-fort. Cette action est irréversible.` : ''}
        confirmLabel="Refuser"
      />
      {node}
    </>
  )
}

export default function TemoignagesEnAttentePage() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-sm text-night-500" role="status">Chargement…</div>}>
      <EnAttente />
    </Suspense>
  )
}
