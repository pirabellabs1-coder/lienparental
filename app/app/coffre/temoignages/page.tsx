'use client'

import Link from 'next/link'
import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronRight, Plus } from 'lucide-react'
import { ScreenHeader, headerIconBtn } from '@/components/coffre/ScreenHeader'
import { SegmentedTabs } from '@/components/coffre/SegmentedTabs'
import { StatusBadge } from '@/components/coffre/StatusBadge'
import { btn } from '@/components/coffre/buttons'
import { useRequests } from '@/components/coffre/store'
import { receivedCount } from '@/lib/mock-vault'
import { useVaultI18n } from '@/components/coffre/i18n'
import { cn } from '@/lib/cn'

type Tab = 'attente' | 'termine'

// Maquette « Coffre-fort – Mes demandes » (en attente / terminées)
function MesDemandes() {
  const t = useTranslations('vault.testimonials')
  const f = useVaultI18n()
  const params = useSearchParams()
  const [tab, setTab] = useState<Tab>(params.get('tab') === 'termine' ? 'termine' : 'attente')
  const { requests } = useRequests()
  const counts = {
    attente: requests.filter((r) => r.status === 'attente').length,
    termine: requests.filter((r) => r.status === 'termine').length,
  }
  const list = requests.filter((r) => r.status === tab)

  return (
    <>
      <ScreenHeader
        title={t('list.title')}
        backHref="/app/coffre"
        right={
          <Link href="/app/coffre/temoignages/nouveau" aria-label={t('list.newRequest')} className={cn(headerIconBtn, '-mr-2')}>
            <Plus className="h-6 w-6" strokeWidth={2.2} aria-hidden="true" />
          </Link>
        }
      />
      <div className="w-full px-5">
        <SegmentedTabs
          idPrefix="demandes"
          label={t('list.statusLabel')}
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'attente', label: t('list.pending'), count: counts.attente },
            { key: 'termine', label: t('list.finished'), count: counts.termine },
          ]}
        />

        <div id="demandes-panel" role="tabpanel" aria-labelledby={`demandes-tab-${tab}`} className="mt-4">
          {list.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-night-200 p-8 text-center text-[13.5px] text-night-500">
              {tab === 'attente' ? t('list.emptyPending') : t('list.emptyFinished')}
            </p>
          ) : (
            <ul className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
              {list.map((r) => {
                const got = receivedCount(r)
                return (
                  <li key={r.id}>
                    <Link
                      href={`/app/coffre/temoignages/${r.id}`}
                      className="group flex items-center gap-3 rounded-2xl border border-night-100 bg-white p-4 shadow-soft transition-[box-shadow,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:shadow-card active:scale-[0.99]"
                    >
                      <span className="min-w-0 flex-1">
                        <StatusBadge kind={r.status} />
                        <span className="mt-1.5 block truncate text-[14.5px] font-extrabold text-night-900">{t('subjectTitle', { subject: r.subject })}</span>
                        <span className="mt-0.5 block text-[12.5px] text-night-500">{t('createdOn', { date: f.date(r.createdAt) })}</span>
                        <span className="mt-0.5 block text-[12.5px] text-night-600">
                          <span className={cn('font-bold', r.status === 'termine' ? 'text-leaf-600' : got > 0 ? 'text-iris-600' : 'text-orange-700')}>
                            {got} / {r.witnesses.length}
                          </span>{' '}
                          {t('list.received')}
                        </span>
                        {r.finishedAt && <span className="mt-0.5 block text-[12.5px] text-night-500">{t('list.finishedOn', { date: f.date(r.finishedAt) })}</span>}
                      </span>
                      <ChevronRight className="h-5 w-5 shrink-0 text-night-400 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-0.5" aria-hidden="true" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <Link href="/app/coffre/temoignages/nouveau" className={cn(btn({ variant: 'secondary' }), 'mt-4 lg:max-w-sm')}>
          <Plus className="h-4 w-4" strokeWidth={2.6} aria-hidden="true" /> {t('list.newRequest')}
        </Link>
      </div>
    </>
  )
}

export default function MesDemandesPage() {
  const tc = useTranslations('vault.common')
  return (
    <Suspense fallback={<div className="p-6 text-center text-sm text-night-500" role="status">{tc('loading')}</div>}>
      <MesDemandes />
    </Suspense>
  )
}
