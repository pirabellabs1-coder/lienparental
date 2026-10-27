'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ArrowLeft, Check, FileText, ListFilter, Search, Trash2, X } from 'lucide-react'
import { ConfirmDialog, EmptyState } from '@/components/ui'
import { btn } from '@/components/profil/kit'
import { DOCUMENTS, ManagedInVault, formatMo, type StoredFile } from '@/components/profil/storage'
import { LIVE } from '@/lib/data/core'
import { cn } from '@/lib/cn'

type Sort = 'date' | 'taille'

// NOTE Supabase: lister `vault_files` (catégorie documents) + suppression via route serveur.
export default function DocumentsPage() {
  const t = useTranslations('account.storage.documents')
  return LIVE ? <ManagedInVault title={t('title')} backHref="/app/profil/stockage/fichiers" /> : <DemoDocumentsPage />
}

/** Démonstration uniquement (fichiers et suppression simulés). */
function DemoDocumentsPage() {
  const t = useTranslations('account.storage.documents')
  const locale = useLocale()
  const [files, setFiles] = useState<StoredFile[]>(DOCUMENTS)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>('date')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [status, setStatus] = useState('')

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase()
    const list = files.filter(f => !s || f.name.toLowerCase().includes(s))
    return sort === 'taille' ? [...list].sort((a, b) => b.sizeMo - a.sizeMo) : list
  }, [files, q, sort])

  const selecting = selected.size > 0
  const selectedMo = files.filter(f => selected.has(f.id)).reduce((sum, f) => sum + f.sizeMo, 0)

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const remove = async () => {
    setDeleting(true)
    await new Promise(r => setTimeout(r, 500))
    const n = selected.size
    setFiles(f => f.filter(x => !selected.has(x.id)))
    setSelected(new Set())
    setDeleting(false)
    setConfirmOpen(false)
    setStatus(t('deleted', { count: n }))
  }

  return (
    <>
      <header className="sticky top-0 z-30 bg-white px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}>
        <div className="relative flex h-12 items-center justify-between">
          {selecting ? (
            <button type="button" onClick={() => setSelected(new Set())} aria-label={t('exitSelection')} className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-night-900 hover:bg-night-50">
              <X className="h-[22px] w-[22px]" aria-hidden />
            </button>
          ) : (
            <Link href="/app/profil/stockage/fichiers" aria-label={t('back')} className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-night-900 hover:bg-night-50">
              <ArrowLeft className="h-[22px] w-[22px]" aria-hidden />
            </Link>
          )}
          <h1 className="pointer-events-none absolute inset-x-14 truncate text-center text-[16px] font-bold text-night-900">
            {selecting ? t('selectedCount', { count: selected.size }) : t('title')}
          </h1>
          {selecting && (
            <button type="button" onClick={() => setSelected(new Set())} className="min-h-[44px] px-1 text-[13px] font-bold text-night-900">
              {t('cancel')}
            </button>
          )}
        </div>
      </header>

      <div className="px-5 pb-8 pt-3">
        {selecting ? (
          <div className="flex items-center gap-3 rounded-xl2 bg-night-50 p-4">
            <div className="flex-1">
              <p className="text-[13px] font-bold text-night-900">{t('selectedSize', { size: formatMo(selectedMo, locale) })}</p>
              <p className="mt-1 text-[11.5px] text-night-700">{t('willDelete')}</p>
            </div>
            <button type="button" onClick={() => setConfirmOpen(true)} aria-label={t('deleteSelection')} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-alert-500 hover:bg-alert-50">
              <Trash2 className="h-5 w-5" aria-hidden />
            </button>
          </div>
        ) : (
          <div className="flex gap-3">
            <div className="relative flex-1">
              <label htmlFor="doc-search" className="sr-only">{t('searchLabel')}</label>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-night-500" aria-hidden />
              <input
                id="doc-search"
                type="search"
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className="min-h-[46px] w-full rounded-xl2 bg-night-50 pl-10 pr-3 text-[13.5px] text-night-900 placeholder:text-night-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400"
              />
            </div>
            <button
              type="button"
              onClick={() => setSort(s => (s === 'date' ? 'taille' : 'date'))}
              aria-label={sort === 'date' ? t('sortSize') : t('sortDate')}
              className="inline-flex h-[46px] w-[46px] items-center justify-center rounded-xl2 border border-night-100 bg-white text-night-900 shadow-soft hover:bg-night-50"
            >
              <ListFilter className="h-5 w-5" aria-hidden />
            </button>
          </div>
        )}

        <p className="sr-only" aria-live="polite">{status}</p>

        {visible.length === 0 ? (
          <EmptyState className="mt-6" title={files.length === 0 ? t('emptyTitle') : t('noResultTitle')} description={files.length === 0 ? t('emptyText') : t('noResultText')} />
        ) : (
          <ul className="mt-4" aria-label={t('title')}>
            {visible.map(f => {
              const on = selected.has(f.id)
              return (
                <li key={f.id}>
                  <label className="flex min-h-[64px] cursor-pointer items-center gap-3.5 rounded-lg py-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-leaf-400">
                    <FileText className="h-6 w-6 shrink-0 text-alert-500" strokeWidth={1.7} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-bold text-night-900">{f.name}</span>
                      <span className="mt-1 flex justify-between gap-2 text-[11.5px] text-night-700">
                        <span>{f.sizeLabel}</span>
                        <span>{f.date}</span>
                      </span>
                    </span>
                    <input type="checkbox" checked={on} onChange={() => toggle(f.id)} className="sr-only" />
                    <span aria-hidden className={cn('ml-2 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px]', on ? 'border-leaf-500 bg-leaf-500 text-white' : 'border-night-300 bg-white')}>
                      {on && <Check className="h-3 w-3" strokeWidth={3.5} />}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}

        {selecting && (
          <button type="button" onClick={() => setConfirmOpen(true)} className={cn(btn.danger, 'mt-8')}>
            {t('deleteCount', { count: selected.size })}
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={remove}
        loading={deleting}
        title={t('confirmTitle', { count: selected.size })}
        description={t('confirmText', { size: formatMo(selectedMo, locale) })}
        confirmLabel={t('confirm')}
      />
    </>
  )
}
