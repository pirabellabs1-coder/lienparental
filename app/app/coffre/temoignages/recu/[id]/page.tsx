'use client'

import { use, useId, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, FileText, UserRound } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui'
import { ScreenHeader } from '@/components/coffre/ScreenHeader'
import { StatusBadge } from '@/components/coffre/StatusBadge'
import { InitialsAvatar } from '@/components/coffre/InitialsAvatar'
import { btn } from '@/components/coffre/buttons'
import { useHandledTestimonies, useReceivedTestimonies } from '@/components/coffre/store'
import { LoadingState } from '@/components/mobile/StateScreens'
import { frDate } from '@/lib/mock-vault'
import { cn } from '@/lib/cn'

function Disclosure({ icon, title, subtitle, children }: { icon: ReactNode; title: string; subtitle: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <div className="rounded-2xl border border-night-100 bg-white shadow-soft">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span aria-hidden="true" className="text-night-700">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-bold text-night-900">{title}</span>
          <span className="block truncate text-[12.5px] text-night-500">{subtitle}</span>
        </span>
        <ChevronDown className={cn('h-5 w-5 text-night-400 transition-transform motion-reduce:transition-none', open ? 'rotate-180' : '-rotate-90')} aria-hidden="true" />
      </button>
      <div id={id} hidden={!open} className="border-t border-night-100 px-4 py-3 text-[13px] leading-relaxed text-night-700">
        {children}
      </div>
    </div>
  )
}

// Maquette « 8. Témoignage reçu »
export default function TemoignageRecuPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { testimonies, ready } = useReceivedTestimonies()
  const t = testimonies.find((x) => x.id === id)
  const { mark } = useHandledTestimonies()
  const [refuseOpen, setRefuseOpen] = useState(false)
  const [failure, setFailure] = useState('')

  if (!t && !ready) {
    return (
      <>
        <ScreenHeader title="Témoignage" backHref="/app/coffre/temoignages/recus" />
        <LoadingState compact title="Chargement du témoignage" description="" />
      </>
    )
  }

  if (!t) {
    return (
      <>
        <ScreenHeader title="Témoignage" backHref="/app/coffre/temoignages/recus" />
        <p className="px-6 pt-16 text-center text-[14px] text-night-600">Témoignage introuvable.</p>
      </>
    )
  }

  return (
    <>
      <ScreenHeader title="Témoignage" backHref="/app/coffre/temoignages/recus" />
      <div className="w-full px-5">
        <div className="flex items-center gap-3.5">
          <InitialsAvatar initials={t.initials} tone={t.tone} size="lg" />
          <div className="min-w-0">
            <h2 className="text-[16px] font-extrabold text-night-900">{t.author}</h2>
            <p className="text-[12.5px] text-night-500">Reçu le {frDate(t.receivedAt)} à {t.receivedTime}</p>
            <StatusBadge kind="attente-iris" className="mt-1" />
          </div>
        </div>

        <section aria-labelledby="resume" className="mt-6">
          <h3 id="resume" className="text-[14px] font-extrabold text-night-900">Résumé du témoignage</h3>
          <p className="mt-2 text-[13.5px] leading-relaxed text-night-700">{t.summary}</p>
        </section>

        <div className="mt-5 space-y-3">
          <Disclosure icon={<FileText className="h-5 w-5" />} title="Détails complets" subtitle="Voir tout le témoignage">
            <ul className="list-disc space-y-1.5 pl-4">
              {t.facts.map((f) => <li key={f}>{f}</li>)}
            </ul>
          </Disclosure>
          <Disclosure icon={<UserRound className="h-5 w-5" />} title="Informations du témoin" subtitle="Lien, date, contexte…">
            <dl className="space-y-1">
              <div className="flex justify-between gap-3"><dt className="text-night-500">Lien</dt><dd className="text-right font-semibold text-night-900">{t.relation}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-night-500">Connaît l’enfant</dt><dd className="text-right font-semibold text-night-900">{t.knownSince}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-night-500">Reçu le</dt><dd className="text-right font-semibold text-night-900">{frDate(t.receivedAt)} à {t.receivedTime}</dd></div>
            </dl>
          </Disclosure>
        </div>

        <div className="mt-8 space-y-3 lg:max-w-sm">
          {failure && <p role="alert" className="text-center text-[13px] font-semibold text-alert-600">{failure}</p>}
          <button
            type="button"
            onClick={async () => {
              try {
                await mark(t.id, 'confirme')
                router.push(`/app/coffre/temoignages/confirme?id=${t.id}`)
              } catch (e) {
                setFailure(e instanceof Error ? e.message : 'Confirmation impossible.')
              }
            }}
            className={btn({ variant: 'primary' })}
          >
            Confirmer ce témoignage
          </button>
          <button type="button" onClick={() => setRefuseOpen(true)} className={btn({ variant: 'secondary' })}>
            Refuser
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={refuseOpen}
        onClose={() => setRefuseOpen(false)}
        onConfirm={async () => {
          try {
            await mark(t.id, 'refuse')
            setRefuseOpen(false)
            router.push('/app/coffre/temoignages/recus')
          } catch (e) {
            setRefuseOpen(false)
            setFailure(e instanceof Error ? e.message : 'Refus impossible.')
          }
        }}
        title="Refuser ce témoignage ?"
        description={`Le témoignage de ${t.author} ne sera pas conservé dans votre coffre-fort. Cette action est irréversible.`}
        confirmLabel="Refuser"
      />
    </>
  )
}
