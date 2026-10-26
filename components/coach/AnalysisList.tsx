'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronDown, EllipsisVertical, FileText, RefreshCw, Trash2, Archive, Eye, ArchiveRestore } from 'lucide-react'
import { ActionSheet, ConfirmDialog, type ActionSheetAction } from '@/components/ui'
import { btn } from './ui'
import { KIND_LABELS, type CoachListItem, type CoachListKind } from './history-items'
import { errorMessage } from './sse-client'

type Filter = 'all' | CoachListKind

type Props = {
  initialItems: CoachListItem[]
  mode: 'historique' | 'archives'
}

const hrefFor = (it: CoachListItem) => (it.remote ? `/app/coach/reponse?id=${encodeURIComponent(it.id)}` : '/app/coach/reponse')

// Liste partagée par « Historique » et « Archives » (maquette 12.12.07 (3)).
// Les éléments réels passent par /api/coach/history ; les exemples de démo restent locaux.
export function AnalysisList({ initialItems, mode }: Props) {
  const router = useRouter()
  const [items, setItems] = useState(initialItems)
  const [filter, setFilter] = useState<Filter>('all')
  const [menuFor, setMenuFor] = useState<CoachListItem | null>(null)
  const [confirmAll, setConfirmAll] = useState(false)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const visible = useMemo(() => (filter === 'all' ? items : items.filter((i) => i.kind === filter)), [items, filter])
  const isArchive = mode === 'archives'

  const call = async (method: 'PATCH' | 'DELETE', body: unknown): Promise<boolean> => {
    setBusy(true)
    try {
      const res = await fetch('/api/coach/history', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) {
        setStatus(await errorMessage(res, 'L’opération a échoué. Réessayez.'))
        return false
      }
      return true
    } catch {
      setStatus('Connexion impossible. Réessayez.')
      return false
    } finally {
      setBusy(false)
    }
  }

  const removeLocal = (id: string, msg: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
    setStatus(msg)
  }

  const archiveToggle = async (it: CoachListItem) => {
    const msg = isArchive ? 'Analyse restaurée dans l’historique.' : 'Analyse archivée.'
    if (!it.remote || (await call('PATCH', { id: it.id, archived: !isArchive }))) removeLocal(it.id, msg)
  }

  const deleteOne = async (it: CoachListItem) => {
    if (!it.remote || (await call('DELETE', { id: it.id }))) removeLocal(it.id, 'Analyse supprimée.')
  }

  const deleteAll = async () => {
    setConfirmAll(false)
    const hasRemote = items.some((i) => i.remote)
    if (hasRemote && !(await call('DELETE', { all: true, archived: isArchive }))) return
    setItems([])
    setStatus(isArchive ? 'Archives supprimées.' : 'Historique supprimé.')
  }

  const actions: ActionSheetAction[] = menuFor
    ? [
        { key: 'open', label: 'Voir la réponse', icon: <Eye className="h-5 w-5" />, onClick: () => router.push(hrefFor(menuFor)) },
        isArchive
          ? { key: 'restore', label: "Restaurer dans l'historique", icon: <ArchiveRestore className="h-5 w-5" />, onClick: () => void archiveToggle(menuFor) }
          : { key: 'archive', label: 'Archiver', icon: <Archive className="h-5 w-5" />, onClick: () => void archiveToggle(menuFor) },
        { key: 'delete', label: 'Supprimer', variant: 'danger', icon: <Trash2 className="h-5 w-5" />, onClick: () => void deleteOne(menuFor) },
      ]
    : []

  return (
    <>
      <div className="relative">
        <label htmlFor={`filter-${mode}`} className="sr-only">
          Filtrer par type
        </label>
        <select
          id={`filter-${mode}`}
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          className="h-12 w-full appearance-none rounded-xl2 border border-night-100 bg-white pl-4 pr-11 text-[14px] font-semibold text-night-900 shadow-soft focus:border-iris-300 focus:outline-none"
        >
          <option value="all">Tous les types</option>
          <option value="capture">Captures d’écran</option>
          <option value="pdf">Documents PDF</option>
          <option value="document">Documents texte</option>
          <option value="word">Documents Word</option>
          <option value="message">Messages écrits</option>
        </select>
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-night-900" />
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>

      {visible.length === 0 ? (
        <div className="mt-4 rounded-xl2 border border-dashed border-night-200 px-6 py-10 text-center">
          <FileText className="mx-auto h-8 w-8 text-night-300" aria-hidden="true" />
          <p className="mt-3 text-[15px] font-semibold text-night-900">
            {items.length === 0 ? (isArchive ? 'Aucune analyse archivée' : 'Aucune analyse pour le moment') : 'Aucun résultat pour ce type'}
          </p>
          <p className="mt-1 text-[13px] text-night-600">{items.length === 0 ? 'Vos analyses apparaîtront ici.' : 'Essayez un autre filtre.'}</p>
        </div>
      ) : (
        <ul className="mt-3 space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0" aria-busy={busy || undefined}>
          {visible.map((it) => (
            <li key={it.id} className="flex items-center gap-3.5 rounded-xl2 border border-night-100 bg-white py-3.5 pl-4 pr-1.5 shadow-soft">
              <FileText className="h-8 w-8 shrink-0 text-night-800" strokeWidth={1.6} aria-hidden="true" />
              <Link href={hrefFor(it)} className="min-w-0 flex-1 rounded-md">
                <p className="truncate text-[15px] font-bold text-night-900">{it.title}</p>
                <p className="mt-0.5 text-[13px] text-night-600">{it.dateLabel}</p>
                {it.responseReady && <p className="mt-0.5 text-[12px] font-bold text-leaf-600">Réponse disponible</p>}
                <span className="sr-only">, {KIND_LABELS[it.kind]}</span>
              </Link>
              <button
                type="button"
                onClick={() => setMenuFor(it)}
                aria-label={`Actions pour ${it.title}, ${it.dateLabel}`}
                aria-haspopup="dialog"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-night-900 hover:bg-night-50"
              >
                <EllipsisVertical className="h-5 w-5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 space-y-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
        <button type="button" onClick={() => setConfirmAll(true)} disabled={items.length === 0 || busy} className={btn.danger}>
          <Trash2 className="h-5 w-5" aria-hidden="true" />
          {isArchive ? 'Supprimer les archives' : 'Supprimer l’historique'}
        </button>
        <Link href="/app/coach" className={btn.secondary}>
          <RefreshCw className="h-5 w-5" aria-hidden="true" />
          Faire une nouvelle analyse
        </Link>
      </div>

      <ActionSheet open={menuFor !== null} onClose={() => setMenuFor(null)} title={menuFor?.title} description={menuFor?.dateLabel} actions={actions} />

      <ConfirmDialog
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        onConfirm={() => void deleteAll()}
        title={isArchive ? 'Supprimer les archives ?' : 'Supprimer l’historique ?'}
        description="Le contenu de toutes les analyses de cette liste sera définitivement supprimé. Les analyses de ce cycle restent décomptées de votre quota."
        confirmLabel="Supprimer"
      />
    </>
  )
}
