'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Ellipsis, FolderOpen, Plus, Trash2 } from 'lucide-react'
import { ActionSheet, ConfirmDialog } from '@/components/ui'
import { ScreenHeader, headerIconBtn } from '@/components/coffre/ScreenHeader'
import { CategoryIcon } from '@/components/coffre/CategoryIcon'
import { useCategories } from '@/components/coffre/store'
import { useAnnounce } from '@/components/coffre/useAnnounce'
import { useVaultI18n } from '@/components/coffre/i18n'
import type { VaultCategory } from '@/lib/mock-vault'
import { cn } from '@/lib/cn'

// Maquettes « 12. Catégories » + « Gérer les catégories »
export default function CategoriesPage() {
  const router = useRouter()
  const t = useTranslations('vault.categories')
  const tc = useTranslations('vault.common')
  const f = useVaultI18n()
  const { categories, remove, ready } = useCategories()
  const { announce, node } = useAnnounce()
  const [menuFor, setMenuFor] = useState<VaultCategory | null>(null)
  const [toDelete, setToDelete] = useState<VaultCategory | null>(null)

  return (
    <>
      <ScreenHeader
        title={t('title')}
        backHref="/app/coffre/documents"
        right={
          <Link href="/app/coffre/categories/nouvelle" aria-label={t('newAria')} className={cn(headerIconBtn, '-mr-2')}>
            <Plus className="h-6 w-6" strokeWidth={2.2} aria-hidden="true" />
          </Link>
        }
      />
      <div className="px-5">
        {ready && categories.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-night-200 p-8 text-center">
            <p className="text-[14px] font-bold text-night-900">{t('emptyTitle')}</p>
            <p className="mt-1 text-[13px] text-night-500">{t('emptyText')}</p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {categories.map((c) => (
              <li key={c.id} className="relative flex items-center gap-3 rounded-2xl border border-night-100 bg-white px-3.5 py-3 shadow-soft">
                <CategoryIcon icon={c.icon} tone={c.tone} />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/app/coffre/documents/tous?cats=${c.id}`}
                    className="block truncate text-[14.5px] font-bold text-night-900 after:absolute after:inset-0 after:rounded-2xl after:content-['']"
                  >
                    {f.category(c.name)}
                  </Link>
                  <p className="text-[12.5px] text-night-500">{t('docCount', { count: c.count })}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMenuFor(c)}
                  aria-label={t('optionsAria', { name: f.category(c.name) })}
                  className="relative z-10 -mr-1.5 inline-flex h-11 w-11 items-center justify-center rounded-full text-night-500 hover:bg-night-50"
                >
                  <Ellipsis className="h-5 w-5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

      </div>

      <ActionSheet
        open={menuFor !== null}
        onClose={() => setMenuFor(null)}
        title={menuFor ? f.category(menuFor.name) : undefined}
        actions={menuFor ? [
          { key: 'open', label: t('viewDocs'), icon: <FolderOpen className="h-5 w-5" />, onClick: () => router.push(`/app/coffre/documents/tous?cats=${menuFor.id}`) },
          { key: 'del', label: t('delete'), icon: <Trash2 className="h-5 w-5" />, variant: 'danger', onClick: () => setToDelete(menuFor) },
        ] : []}
      />

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return
          try {
            await remove(toDelete.id)
            announce(t('deleted', { name: f.category(toDelete.name) }))
          } catch (e) {
            announce(e instanceof Error ? e.message : t('deleteFailed'))
          }
          setToDelete(null)
        }}
        title={t('deleteTitle')}
        description={toDelete ? t('deleteText', { name: f.category(toDelete.name), count: toDelete.count, other: f.category('Autres') }) : ''}
        confirmLabel={tc('delete')}
        tone="danger"
      />
      {node}
    </>
  )
}
