'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ChevronRight, Ellipsis, Folder, FolderOpen, Plus, Search } from 'lucide-react'
import { ScreenHeader } from '@/components/coffre/ScreenHeader'
import { CategoryIcon } from '@/components/coffre/CategoryIcon'
import { DocRow } from '@/components/coffre/DocRow'
import { useCategories, useFolders, useVaultDocs } from '@/components/coffre/store'
import { sharedRoots } from '@/lib/data/vault-folders'
import { useAnnounce } from '@/components/coffre/useAnnounce'
import { useDocActions } from '@/components/coffre/useDocActions'
import { ErrorState, LoadingState } from '@/components/mobile/StateScreens'
import { useVaultI18n } from '@/components/coffre/i18n'

// Maquettes « Coffre-fort (documents) » + « 3. Coffre-fort – Documents »
export default function DocumentsHub() {
  const t = useTranslations('vault.docs')
  const tc = useTranslations('vault.common')
  const f = useVaultI18n()
  const { categories } = useCategories()
  const { docs, loading, error, refresh } = useVaultDocs()
  const { folders, sharedWithMe: sharedAll } = useFolders()
  const sharedWithMe = sharedRoots(sharedAll, folders)
  const myFolders = folders.filter((f) => f.mine).length
  const { announce, node } = useAnnounce()
  const { openActions, sheet } = useDocActions(announce)
  const total = categories.reduce((s, c) => s + c.count, 0)
  const recent = [...docs].sort((a, b) => b.addedAt.localeCompare(a.addedAt)).slice(0, 4)

  return (
    <>
      <ScreenHeader
        large
        title={tc('documents')}
        backHref="/app/coffre"
        right={
          <Link
            href="/app/coffre/ajouter"
            aria-label={t('addAria')}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full"
          >
            <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-leaf-500 text-white shadow-[0_6px_14px_-6px_rgba(46,125,50,0.8)]">
              <Plus className="h-5 w-5" strokeWidth={2.6} />
            </span>
          </Link>
        }
      />

      <div className="px-5">
        <p className="text-[14px] leading-relaxed text-night-600">{t('lead')}</p>

        <form action="/app/coffre/documents/tous" role="search" className="mt-4">
          <label htmlFor="doc-search" className="sr-only">{t('search')}</label>
          <div className="flex h-12 items-center gap-2 rounded-xl border border-night-100 bg-white px-3.5 shadow-soft focus-within:border-leaf-500">
            <input
              id="doc-search"
              name="q"
              type="search"
              placeholder={t('search')}
              className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-night-900 outline-none placeholder:text-night-400"
            />
            <button type="submit" aria-label={t('searchSubmit')} className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-night-700 hover:bg-night-50">
              <Search className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </form>

        <Link
          href="/app/coffre/documents/tous"
          className="group mt-4 flex items-center gap-3.5 rounded-2xl border border-night-100 bg-white p-4 shadow-soft transition-[box-shadow,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:shadow-card active:scale-[0.99]"
        >
          <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-xl bg-night-50 text-night-700">
            <FolderOpen className="h-[22px] w-[22px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold text-night-900">{t('all')}</span>
            <span className="block text-[12.5px] text-night-500">{t('count', { count: total })}</span>
          </span>
          <ChevronRight className="h-5 w-5 text-night-500 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>

        <Link
          href="/app/coffre/dossiers"
          className="group mt-3 flex items-center gap-3.5 rounded-2xl border border-night-100 bg-white p-4 shadow-soft transition-[box-shadow,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:shadow-card active:scale-[0.99]"
        >
          <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-xl bg-leaf-50 text-leaf-700">
            <Folder className="h-[22px] w-[22px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold text-night-900">{t('folders')}</span>
            <span className="block text-[12.5px] text-night-500">
              {t('folderCount', { count: myFolders })}
              {sharedWithMe.length > 0 ? t('sharedWithMeCount', { count: sharedWithMe.length }) : ''}
            </span>
          </span>
          <ChevronRight className="h-5 w-5 text-night-500 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>

        <section aria-labelledby="cats-title" className="mt-6">
          <div className="flex items-center justify-between">
            <h2 id="cats-title" className="text-[15px] font-extrabold text-night-900">{t('categories')}</h2>
            <Link href="/app/coffre/categories" className="-mr-2 inline-flex h-11 items-center px-2 text-[13px] font-bold text-leaf-600">
              {t('seeAll')}
            </Link>
          </div>
          <ul className="-mx-5 mt-1 flex gap-2 overflow-x-auto px-5 pb-2 [scrollbar-width:none]">
            {categories.map((c) => (
              <li key={c.id} className="shrink-0">
                <Link
                  href={`/app/coffre/documents/tous?cats=${c.id}`}
                  className="flex w-[76px] flex-col items-center gap-1.5 rounded-2xl px-1 py-2 text-center hover:bg-night-50"
                >
                  <CategoryIcon icon={c.icon} tone={c.tone} size="lg" />
                  <span className="w-full truncate text-[11.5px] font-semibold text-night-900">{f.category(c.name)}</span>
                  <span className="text-[11px] text-night-500">{c.count}<span className="sr-only">{t('documentsSr')}</span></span>
                </Link>
              </li>
            ))}
            <li className="shrink-0">
              <Link
                href="/app/coffre/categories"
                aria-label={t('manageCategories')}
                className="flex w-[64px] flex-col items-center gap-1.5 rounded-2xl px-1 py-2 hover:bg-night-50"
              >
                <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-xl bg-night-50 text-night-600">
                  <Ellipsis className="h-6 w-6" />
                </span>
              </Link>
            </li>
          </ul>
        </section>

        <section aria-labelledby="recents-title" className="mt-4">
          <div className="flex items-center justify-between">
            <h2 id="recents-title" className="text-[15px] font-extrabold text-night-900">{t('recent')}</h2>
            <Link href="/app/coffre/documents/tous" className="-mr-2 inline-flex h-11 items-center px-2 text-[13px] font-bold text-leaf-600">
              {t('seeAll')}
            </Link>
          </div>
          {loading ? (
            <LoadingState compact title={t('loading')} description="" />
          ) : error ? (
            <ErrorState compact description={error.message} primary={{ label: tc('retry'), onClick: () => void refresh() }} secondary={{ label: t('backToVault'), href: '/app/coffre' }} />
          ) : recent.length === 0 ? (
            <p className="mt-2 rounded-2xl border border-dashed border-night-200 p-6 text-center text-[13px] text-night-500">
              {t('empty')}
            </p>
          ) : (
            <ul className="mt-1 space-y-2.5 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
              {recent.map((d) => (
                <li key={d.id}><DocRow doc={d} onMore={openActions} /></li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {sheet}
      {node}
    </>
  )
}
