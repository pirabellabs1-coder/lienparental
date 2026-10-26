'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Ellipsis, Eye, FilePen, FileText, FolderLock, WandSparkles } from 'lucide-react'
import { ActionSheet } from '@/components/ui'
import { saveDraft } from '@/components/coach/session'
import { cn } from '@/lib/cn'
import type { RecentlyViewedDoc } from '@/lib/mock-data'

const ACCENTS: Record<RecentlyViewedDoc['accent'], string> = {
  iris: 'bg-iris-50 text-iris-600',
  leaf: 'bg-leaf-50 text-leaf-600',
  night: 'bg-night-50 text-night-600',
}

// M03 — Mes documents récents (liste + menu ⋯).
export function RecentDocuments({ docs, emptyLabel = 'Aucun document consulté récemment.' }: { docs: RecentlyViewedDoc[]; emptyLabel?: string }) {
  const router = useRouter()
  const [menuFor, setMenuFor] = useState<RecentlyViewedDoc | null>(null)

  if (docs.length === 0) {
    return (
      <p className="rounded-xl2 border border-night-100 bg-white p-4 text-[13px] text-night-700 shadow-soft">
        {emptyLabel}
      </p>
    )
  }

  return (
    <>
      <ul className="divide-y divide-night-100 rounded-xl2 border border-night-100 bg-white shadow-soft">
        {docs.map((d) => {
          const Icon = d.icon === 'filePen' ? FilePen : FileText
          return (
            <li key={d.id} className="flex items-center gap-3.5 py-2.5 pl-3.5 pr-1.5">
              <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', ACCENTS[d.accent])} aria-hidden="true">
                <Icon className="h-5 w-5" strokeWidth={1.8} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-bold text-night-900">{d.title}</p>
                <p className="mt-0.5 text-[12px] text-night-700">{d.viewedLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => setMenuFor(d)}
                aria-label={`Actions pour ${d.title}`}
                aria-haspopup="dialog"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-night-900 hover:bg-night-50"
              >
                <Ellipsis className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
              </button>
            </li>
          )
        })}
      </ul>

      <ActionSheet
        open={menuFor !== null}
        onClose={() => setMenuFor(null)}
        title={menuFor?.title}
        actions={[
          {
            key: 'open',
            label: 'Ouvrir',
            icon: <Eye className="h-5 w-5" />,
            onClick: () => router.push(menuFor?.href ?? '/app/coffre/documents'),
          },
          {
            key: 'coach',
            label: 'Analyser avec le Coach IA',
            icon: <WandSparkles className="h-5 w-5" />,
            onClick: () => {
              if (!menuFor) return
              saveDraft({ kind: 'pdf', name: menuFor.title, createdAt: new Date().toISOString() })
              router.push('/app/coach/document')
            },
          },
          {
            key: 'vault',
            label: 'Voir le coffre-fort',
            icon: <FolderLock className="h-5 w-5" />,
            onClick: () => router.push('/app/coffre'),
          },
        ]}
      />
    </>
  )
}
