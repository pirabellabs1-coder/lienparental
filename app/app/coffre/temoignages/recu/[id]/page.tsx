'use client'

import { use, useId, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronDown, Flag, FileText, ShieldAlert, UserRound } from 'lucide-react'
import { ConfirmDialog, Modal } from '@/components/ui'
import { ScreenHeader } from '@/components/coffre/ScreenHeader'
import { StatusBadge } from '@/components/coffre/StatusBadge'
import { InitialsAvatar } from '@/components/coffre/InitialsAvatar'
import { btn } from '@/components/coffre/buttons'
import { useHandledTestimonies, useReceivedTestimonies, useTestimonyReports } from '@/components/coffre/store'
import { REPORT_REASONS, type ReportReason } from '@/lib/data/testimonies'
import { LoadingState } from '@/components/mobile/StateScreens'
import { useVaultI18n } from '@/components/coffre/i18n'
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

/**
 * Signalement d'un témoignage reçu (0570) : motif obligatoire, précisions obligatoires pour « Autre ».
 * Le témoignage n'est jamais supprimable par le parent ; l'équipe examine et peut le retirer.
 */
function ReportDialog({ open, onClose, onSend }: { open: boolean; onClose: () => void; onSend: (reason: ReportReason, details: string) => Promise<void> }) {
  const t = useTranslations('vault.testimonials.received')
  const [reason, setReason] = useState<ReportReason | ''>('')
  const [details, setDetails] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const legendId = useId()
  const detailsId = useId()

  const submit = async () => {
    if (!reason) { setError(t('reasonRequired')); return }
    if (reason === 'autre' && !details.trim()) { setError(t('detailsRequired')); return }
    setBusy(true)
    setError('')
    try {
      await onSend(reason, details.trim())
      setReason('')
      setDetails('')
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t('reportFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => { if (!busy) onClose() }}
      size="sm"
      title={t('reportTitle')}
      description={t('reportText')}
      footer={
        <>
          <button type="button" className={btn({ variant: 'secondary' })} onClick={onClose} disabled={busy}>{t('cancel')}</button>
          <button type="button" className={btn({ variant: 'primary' })} onClick={() => void submit()} disabled={busy} aria-busy={busy}>
            {busy ? t('sending') : t('send')}
          </button>
        </>
      }
    >
      <fieldset aria-describedby={error ? `${legendId}-err` : undefined}>
        <legend id={legendId} className="mb-2 text-[13.5px] font-bold text-night-900">{t('reasonLabel')}</legend>
        <div className="space-y-1.5">
          {REPORT_REASONS.map((r) => (
            <label key={r} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-night-100 px-3 text-[14px] text-night-800 has-[:checked]:border-night-600 has-[:checked]:bg-night-50">
              <input type="radio" name="report-reason" value={r} checked={reason === r} onChange={() => { setReason(r); setError('') }} className="h-4 w-4 accent-night-700" />
              {t(`reasons.${r}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <label htmlFor={detailsId} className="mb-1 mt-4 block text-[13.5px] font-bold text-night-900">{t('detailsLabel')}</label>
      <textarea
        id={detailsId}
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        maxLength={1000}
        rows={3}
        aria-describedby={`${detailsId}-hint`}
        className="w-full rounded-xl border border-night-200 px-3 py-2 text-[14px] text-night-900 focus:border-night-600 focus:outline-none focus:ring-2 focus:ring-night-200"
      />
      <p id={`${detailsId}-hint`} className="mt-1 text-[12px] text-night-500">{t('detailsHint')}</p>
      {error && <p id={`${legendId}-err`} role="alert" className="mt-3 text-[13px] font-semibold text-alert-600">{error}</p>}
    </Modal>
  )
}

// Maquette « 8. Témoignage reçu »
export default function TemoignageRecuPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const t = useTranslations('vault.testimonials')
  const f = useVaultI18n()
  const { testimonies, ready } = useReceivedTestimonies()
  const tm = testimonies.find((x) => x.id === id)
  const { mark } = useHandledTestimonies()
  const [refuseOpen, setRefuseOpen] = useState(false)
  const [failure, setFailure] = useState('')
  const { reports, report } = useTestimonyReports()
  const [reportOpen, setReportOpen] = useState(false)
  const [reportSent, setReportSent] = useState(false)

  if (!tm && !ready) {
    return (
      <>
        <ScreenHeader title={t('received.title')} backHref="/app/coffre/temoignages/recus" />
        <LoadingState compact title={t('received.loading')} description="" />
      </>
    )
  }

  if (!tm) {
    return (
      <>
        <ScreenHeader title={t('received.title')} backHref="/app/coffre/temoignages/recus" />
        <p className="px-6 pt-16 text-center text-[14px] text-night-600">{t('received.notFound')}</p>
      </>
    )
  }

  return (
    <>
      <ScreenHeader title={t('received.title')} backHref="/app/coffre/temoignages/recus" />
      <div className="w-full px-5">
        <div className="flex items-center gap-3.5">
          <InitialsAvatar initials={tm.initials} tone={tm.tone} size="lg" />
          <div className="min-w-0">
            <h2 className="text-[16px] font-extrabold text-night-900">{tm.author}</h2>
            <p className="text-[12.5px] text-night-500">{t('receivedOn', { date: f.date(tm.receivedAt), time: tm.receivedTime })}</p>
            <StatusBadge kind="attente-iris" className="mt-1" />
          </div>
        </div>

        <section aria-labelledby="resume" className="mt-6">
          <h3 id="resume" className="text-[14px] font-extrabold text-night-900">{t('received.summary')}</h3>
          <p className="mt-2 text-[13.5px] leading-relaxed text-night-700">{tm.summary}</p>
        </section>

        <div className="mt-5 space-y-3">
          <Disclosure icon={<FileText className="h-5 w-5" />} title={t('received.details')} subtitle={t('received.detailsSub')}>
            <ul className="list-disc space-y-1.5 pl-4">
              {tm.facts.map((fact) => <li key={fact}>{fact}</li>)}
            </ul>
          </Disclosure>
          <Disclosure icon={<UserRound className="h-5 w-5" />} title={t('received.witnessInfo')} subtitle={t('received.witnessInfoSub')}>
            <dl className="space-y-1">
              <div className="flex justify-between gap-3"><dt className="text-night-500">{t('received.relation')}</dt><dd className="text-right font-semibold text-night-900">{tm.relation}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-night-500">{t('received.knows')}</dt><dd className="text-right font-semibold text-night-900">{tm.knownSince}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-night-500">{t('received.receivedOn')}</dt><dd className="text-right font-semibold text-night-900">{t('dateAtTime', { date: f.date(tm.receivedAt), time: tm.receivedTime })}</dd></div>
            </dl>
          </Disclosure>
        </div>

        <div className="mt-8 space-y-3 lg:max-w-sm">
          {failure && <p role="alert" className="text-center text-[13px] font-semibold text-alert-600">{failure}</p>}
          <button
            type="button"
            onClick={async () => {
              try {
                await mark(tm.id, 'confirme')
                router.push(`/app/coffre/temoignages/confirme?id=${tm.id}`)
              } catch (e) {
                setFailure(e instanceof Error ? e.message : t('received.confirmFailed'))
              }
            }}
            className={btn({ variant: 'primary' })}
          >
            {t('received.confirm')}
          </button>
          <button type="button" onClick={() => setRefuseOpen(true)} className={btn({ variant: 'secondary' })}>
            {t('refuse')}
          </button>
        </div>

        {/* Témoignage irréversible : seule voie de retrait, le signalement examiné par l'équipe. */}
        <section aria-labelledby="permanent" className="mt-8 rounded-2xl border border-gold-200 bg-gold-50 p-4 lg:max-w-xl">
          <h3 id="permanent" className="flex items-center gap-2 text-[14px] font-extrabold text-night-900">
            <ShieldAlert className="h-5 w-5 shrink-0 text-gold-700" aria-hidden="true" />
            {t('received.permanentTitle')}
          </h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-night-700">{t('received.permanentText')}</p>
          {reports[tm.id] === 'open' || reportSent ? (
            <p role="status" className="mt-3 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[13px] font-semibold text-night-800 ring-1 ring-gold-200">
              <Flag className="h-4 w-4 text-gold-700" aria-hidden="true" />
              {reportSent ? t('received.sent') : t('received.statusOpen')}
            </p>
          ) : (
            <>
              {reports[tm.id] === 'rejected' && <p className="mt-3 text-[13px] font-semibold text-night-700">{t('received.statusRejected')}</p>}
              <button type="button" onClick={() => setReportOpen(true)} className={cn(btn({ variant: 'secondary' }), 'mt-3 w-auto gap-2 px-4')}>
                <Flag className="h-4 w-4" aria-hidden="true" />
                {t('received.report')}
              </button>
            </>
          )}
        </section>
      </div>

      <ReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        onSend={async (reason, details) => {
          await report(tm.id, reason, details || undefined)
          setReportOpen(false)
          setReportSent(true)
        }}
      />

      <ConfirmDialog
        open={refuseOpen}
        onClose={() => setRefuseOpen(false)}
        onConfirm={async () => {
          try {
            await mark(tm.id, 'refuse')
            setRefuseOpen(false)
            router.push('/app/coffre/temoignages/recus')
          } catch (e) {
            setRefuseOpen(false)
            setFailure(e instanceof Error ? e.message : t('received.refuseFailed'))
          }
        }}
        title={t('refuseTitle')}
        description={t('refuseText', { name: tm.author })}
        confirmLabel={t('refuse')}
      />
    </>
  )
}
