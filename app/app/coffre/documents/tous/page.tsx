'use client'

import Link from 'next/link'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ListFilter, Search } from 'lucide-react'
import { ScreenHeader, headerIconBtn } from '@/components/coffre/ScreenHeader'
import { DocRow } from '@/components/coffre/DocRow'
import { useCategories, useVaultDocs } from '@/components/coffre/store'
import { ErrorState, LoadingState } from '@/components/mobile/StateScreens'
import { useAnnounce } from '@/components/coffre/useAnnounce'
import { useDocActions } from '@/components/coffre/useDocActions'
import type { VaultFileType } from '@/lib/mock-vault'

type Sort = 'recent' | 'ancien' | 'nom' | 'taille'
/** Ordre des tris ; libellés : vault.allDocs.sorts.* */
const SORTS: Sort[] = ['recent', 'ancien', 'nom', 'taille']

function AllDocuments() {
  const t = useTranslations('vault.allDocs')
  const td = useTranslations('vault.docs')
  const tc = useTranslations('vault.common')
  const params = useSearchParams()
  const { docs, loading, error, refresh } = useVaultDocs()
  const { categories } = useCategories()
  const catName = (id: string) => categories.find((c) => c.id === id)?.name
  const { announce, node } = useAnnounce()
  const { openActions, sheet } = useDocActions(announce, { onRemoved: refresh })
  const ta = useTranslations('vault.docActions')
  // Retour de « Supprimer le document » : confirmation de la mise à la corbeille.
  const trashed = params.get('corbeille') === '1'
  useEffect(() => {
    if (trashed) announce(ta('movedToTrashShort'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trashed])

  const [q, setQ] = useState(params.get('q') ?? '')
  const [sort, setSort] = useState<Sort>('recent')
  const cats = (params.get('cats') ?? '').split(',').filter(Boolean)
  const types = (params.get('types') ?? '').split(',').filter(Boolean) as VaultFileType[]
  const du = params.get('du') ?? ''
  const au = params.get('au') ?? ''
  const activeFilters = cats.length + types.length + (du ? 1 : 0) + (au ? 1 : 0)

  const list = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('fr')
    const out = docs.filter((d) =>
      (cats.length === 0 || cats.includes(d.categoryId)) &&
      (types.length === 0 || types.includes(d.type)) &&
      (!du || d.docDate >= du) &&
      (!au || d.docDate <= au) &&
      (!needle || d.name.toLocaleLowerCase('fr').includes(needle) || d.source.toLocaleLowerCase('fr').includes(needle)),
    )
    return out.sort((a, b) =>
      // Ex æquo sur la date du document : départagé par la date d'ajout.
      sort === 'recent' ? b.docDate.localeCompare(a.docDate) || b.addedAt.localeCompare(a.addedAt)
      : sort === 'ancien' ? a.docDate.localeCompare(b.docDate) || a.addedAt.localeCompare(b.addedAt)
      : sort === 'nom' ? a.name.localeCompare(b.name, 'fr')
      : b.size - a.size,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, sort, docs, params])

  const filtersHref = `/app/coffre/documents/filtres?${params.toString()}`

  return (
    <>
      <ScreenHeader title={td('all')} backHref="/app/coffre/documents" />
      <div className="px-5">
        <div role="search" className="flex items-center gap-2">
          <label htmlFor="all-search" className="sr-only">{td('search')}</label>
          <div className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-xl border border-night-100 bg-white px-3.5 shadow-soft focus-within:border-leaf-500">
            <Search className="h-[18px] w-[18px] shrink-0 text-night-400" aria-hidden="true" />
            <input
              id="all-search"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={td('search')}
              className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-night-900 outline-none placeholder:text-night-400"
            />
          </div>
          <Link href={filtersHref} aria-label={activeFilters ? t('filtersActive', { count: activeFilters }) : t('filters')} className={`${headerIconBtn} relative h-12 w-12 border border-night-100 bg-white shadow-soft`}>
            <ListFilter className="h-5 w-5" aria-hidden="true" />
          </Link>
        </div>

        <div className="mt-3 flex items-center gap-1 text-[13px]">
          <label htmlFor="sort" className="text-night-600">{t('sortBy')}</label>
          <select
            id="sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="h-11 rounded-lg bg-transparent pr-1 font-bold text-night-900 outline-none"
          >
            {SORTS.map((s) => <option key={s} value={s}>{t(`sorts.${s}`)}</option>)}
          </select>
        </div>

        <p className="sr-only" role="status" aria-live="polite">{t('shown', { count: list.length })}</p>

        {loading ? (
          <LoadingState compact title={td('loading')} description="" />
        ) : error ? (
          <ErrorState compact description={error.message} primary={{ label: tc('retry'), onClick: () => void refresh() }} secondary={{ label: t('backToDocs'), href: '/app/coffre/documents' }} />
        ) : list.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-night-200 p-8 text-center">
            <p className="text-[14px] font-bold text-night-900">{t('emptyTitle')}</p>
            <p className="mt-1 text-[13px] text-night-500">{t('emptyText')}</p>
          </div>
        ) : (
          <ul className="space-y-2.5 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
            {list.map((d) => (
              <li key={d.id}><DocRow doc={d} showCategory categoryName={catName(d.categoryId)} onMore={openActions} /></li>
            ))}
          </ul>
        )}
      </div>
      {sheet}
      {node}
    </>
  )
}

export default function AllDocumentsPage() {
  const tc = useTranslations('vault.common')
  return (
    <Suspense fallback={<div className="p-6 text-center text-sm text-night-500" role="status">{tc('loading')}</div>}>
      <AllDocuments />
    </Suspense>
  )
}
