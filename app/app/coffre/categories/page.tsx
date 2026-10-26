'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Ellipsis, FolderOpen, Plus, Trash2 } from 'lucide-react'
import { ActionSheet, ConfirmDialog } from '@/components/ui'
import { ScreenHeader, headerIconBtn } from '@/components/coffre/ScreenHeader'
import { CategoryIcon } from '@/components/coffre/CategoryIcon'
import { useCategories } from '@/components/coffre/store'
import { useAnnounce } from '@/components/coffre/useAnnounce'
import type { VaultCategory } from '@/lib/mock-vault'
import { cn } from '@/lib/cn'

// Maquettes « 12. Catégories » + « Gérer les catégories »
export default function CategoriesPage() {
  const router = useRouter()
  const { categories, remove, ready } = useCategories()
  const { announce, node } = useAnnounce()
  const [menuFor, setMenuFor] = useState<VaultCategory | null>(null)
  const [toDelete, setToDelete] = useState<VaultCategory | null>(null)

  return (
    <>
      <ScreenHeader
        title="Gérer les catégories"
        backHref="/app/coffre/documents"
        right={
          <Link href="/app/coffre/categories/nouvelle" aria-label="Nouvelle catégorie" className={cn(headerIconBtn, '-mr-2')}>
            <Plus className="h-6 w-6" strokeWidth={2.2} aria-hidden="true" />
          </Link>
        }
      />
      <div className="px-5">
        {ready && categories.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-night-200 p-8 text-center">
            <p className="text-[14px] font-bold text-night-900">Aucune catégorie</p>
            <p className="mt-1 text-[13px] text-night-500">Créez votre première catégorie pour classer vos documents.</p>
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
                    {c.name}
                  </Link>
                  <p className="text-[12.5px] text-night-500">{c.count} document{c.count > 1 ? 's' : ''}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMenuFor(c)}
                  aria-label={`Options de la catégorie ${c.name}`}
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
        title={menuFor?.name}
        actions={menuFor ? [
          { key: 'open', label: 'Voir les documents', icon: <FolderOpen className="h-5 w-5" />, onClick: () => router.push(`/app/coffre/documents/tous?cats=${menuFor.id}`) },
          { key: 'del', label: 'Supprimer la catégorie', icon: <Trash2 className="h-5 w-5" />, variant: 'danger', onClick: () => setToDelete(menuFor) },
        ] : []}
      />

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return
          try {
            await remove(toDelete.id)
            announce(`Catégorie « ${toDelete.name} » supprimée`)
          } catch (e) {
            announce(e instanceof Error ? e.message : 'Suppression impossible')
          }
          setToDelete(null)
        }}
        title="Supprimer la catégorie ?"
        description={toDelete ? `« ${toDelete.name} » sera supprimée. Ses ${toDelete.count} document(s) seront déplacés dans « Autres ». Cette action est irréversible.` : ''}
        confirmLabel="Supprimer"
        tone="danger"
      />
      {node}
    </>
  )
}
