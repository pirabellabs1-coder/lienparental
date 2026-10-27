'use client'

import { use, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronRight } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { EmptyState, LoadingState } from '@/components/mobile/StateScreens'
import { useClientNow } from '@/components/calendrier/useClientNow'
import { buildIcs, googleCalendarUrl, outlookCalendarUrl } from '@/lib/calendrier'
import { useEvent } from '@/lib/data/calendar'

// M06 — « Ajouter à l'agenda » : confirmation + ouverture dans un agenda externe.
export default function AjouterAgendaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const t = useTranslations('calendar')
  const router = useRouter()
  const { data: event, loading } = useEvent(id)
  const now = useClientNow()
  const back = `/app/calendrier/${id}`

  if (!event && loading) {
    return (
      <>
        <TopBar title={t('agenda.title')} showBack backHref={back} showBell={false} />
        <LoadingState compact title={t('agenda.preparing')} description="" />
      </>
    )
  }

  if (!event) {
    return (
      <>
        <TopBar title={t('agenda.title')} showBack backHref="/app/calendrier" showBell={false} />
        <EmptyState
          title={t('common.eventNotFound')}
          description={t('common.eventNotFoundDesc')}
          primary={{ label: t('common.backToCalendar'), href: '/app/calendrier' }}
        />
      </>
    )
  }

  // Les liens embarquent des horaires dépendant du fuseau client : rendu après montage.
  if (!now) {
    return (
      <>
        <TopBar title={t('agenda.title')} showBack backHref={back} showBell={false} />
        <LoadingState compact title={t('agenda.preparing')} description="" />
      </>
    )
  }

  function downloadIcs() {
    const blob = new Blob([buildIcs(event!)], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${event!.title.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}.ics`
    a.click()
    URL.revokeObjectURL(url)
  }

  const row = 'flex min-h-[56px] w-full items-center gap-3.5 rounded-xl border border-night-100 bg-white px-4 text-left transition-colors hover:bg-night-50/50'

  return (
    <>
      <TopBar title={t('agenda.title')} showBack backHref={back} showBell={false} />

      <div className="px-4 pb-6 pt-4">
        <div className="flex flex-col items-center text-center" role="status">
          <CalendarAddedIllustration />
          <h2 className="mt-5 text-[17px] font-extrabold text-night-900">{t('agenda.added')}</h2>
          <p className="mt-2 max-w-[16rem] text-[12.5px] leading-relaxed text-night-600">
            {t('agenda.addedDesc')}
          </p>
        </div>

        <section aria-labelledby="open-in" className="mt-8">
          <h3 id="open-in" className="mb-2.5 text-[13px] font-bold text-night-900">{t('agenda.openIn')}</h3>
          <ul className="space-y-2.5">
            <li>
              <a href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer" className={row}>
                <GoogleCalIcon />
                <RowLabel>{t('agenda.google')}</RowLabel>
                <span className="sr-only">{t('agenda.newTab')}</span>
              </a>
            </li>
            <li>
              <button type="button" onClick={downloadIcs} className={row}>
                <AppleCalIcon />
                <RowLabel>{t('agenda.apple')}</RowLabel>
              </button>
            </li>
            <li>
              <a href={outlookCalendarUrl(event)} target="_blank" rel="noopener noreferrer" className={row}>
                <OutlookIcon />
                <RowLabel>{t('agenda.outlook')}</RowLabel>
                <span className="sr-only">{t('agenda.newTab')}</span>
              </a>
            </li>
          </ul>
        </section>

        <button
          type="button"
          onClick={() => router.push(back)}
          className="mt-10 flex h-12 w-full items-center justify-center rounded-xl border border-night-200 bg-white text-[14px] font-bold text-night-900 transition-colors hover:bg-night-50"
        >
          {t('agenda.close')}
        </button>
      </div>
    </>
  )
}

function RowLabel({ children }: { children: ReactNode }) {
  return (
    <>
      <span className="flex-1 text-[13px] font-semibold text-night-900">{children}</span>
      <ChevronRight aria-hidden="true" className="h-[18px] w-[18px] text-night-700" />
    </>
  )
}

function CalendarAddedIllustration() {
  return (
    <svg viewBox="0 0 160 130" className="h-[130px] w-[160px] motion-safe:animate-fade-up" aria-hidden="true">
      <circle cx="80" cy="66" r="56" fill="#ecf6ef" />
      <path d="M22 38l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#3fa35d" />
      <circle cx="136" cy="34" r="2.5" fill="#a7d8b5" />
      <rect x="40" y="30" width="72" height="66" rx="10" fill="#fff" stroke="#dde1f5" strokeWidth="2" />
      <path d="M40 40a10 10 0 0 1 10-10h52a10 10 0 0 1 10 10v8H40z" fill="#2e7d32" />
      <rect x="56" y="22" width="5" height="14" rx="2.5" fill="#135628" />
      <rect x="91" y="22" width="5" height="14" rx="2.5" fill="#135628" />
      {[0, 1, 2, 3].map((c) => [0, 1, 2].map((r) => (
        <rect key={`${c}-${r}`} x={50 + c * 14} y={56 + r * 12} width="9" height="7" rx="2" fill="#eef0fb" />
      )))}
      <circle cx="110" cy="92" r="17" fill="#2e7d32" stroke="#fff" strokeWidth="4" />
      <path d="m102 92 5.5 5.5L119 86" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function GoogleCalIcon() {
  return (
    <svg viewBox="0 0 28 28" className="h-7 w-7 shrink-0" aria-hidden="true">
      <rect x="2" y="2" width="24" height="24" rx="5" fill="#fff" stroke="#e5e7eb" />
      <path d="M2 21h5v5H7a5 5 0 0 1-5-5z" fill="#34a853" />
      <path d="M21 2h0a5 5 0 0 1 5 5v0h-5z" fill="#ea4335" />
      <path d="M21 7h5v14h-5z" fill="#fbbc04" />
      <path d="M7 21h14v5H7z" fill="#34a853" />
      <path d="M21 21h5l-5 5z" fill="#ea4335" />
      <path d="M2 7a5 5 0 0 1 5-5h14v5H2z" fill="#4285f4" />
      <text x="14" y="18.5" textAnchor="middle" fontSize="9" fontWeight="700" fill="#4285f4" fontFamily="system-ui, sans-serif">31</text>
    </svg>
  )
}

function AppleCalIcon() {
  return (
    <svg viewBox="0 0 28 28" className="h-7 w-7 shrink-0" aria-hidden="true">
      <rect x="2" y="2" width="24" height="24" rx="5" fill="#fff" stroke="#e5e7eb" />
      <path d="M2 10V7a5 5 0 0 1 5-5h14a5 5 0 0 1 5 5v3z" fill="#ef4444" />
      <text x="14" y="21.5" textAnchor="middle" fontSize="10" fontWeight="700" fill="#111827" fontFamily="system-ui, sans-serif">17</text>
    </svg>
  )
}

function OutlookIcon() {
  return (
    <svg viewBox="0 0 28 28" className="h-7 w-7 shrink-0" aria-hidden="true">
      <rect x="9" y="4" width="17" height="20" rx="3" fill="#28a8ea" />
      <path d="M9 13h17v8a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3z" fill="#0078d4" />
      <rect x="2" y="7" width="14" height="14" rx="2.5" fill="#0f62c4" />
      <ellipse cx="9" cy="14" rx="3.6" ry="4.2" fill="none" stroke="#fff" strokeWidth="2" />
    </svg>
  )
}
