'use client'
import { useMemo, useState, type ReactNode } from 'react'
import { ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

export type Column<T> = {
  key: string
  header: string
  sortable?: boolean
  accessor?: (row: T) => string | number | null | undefined
  cell?: (row: T) => ReactNode
  className?: string
}

type Props<T> = {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  pageSize?: number
  emptyLabel?: string
  caption?: string
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  pageSize = 10,
  emptyLabel = 'Aucune donnée.',
  caption,
}: Props<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)

  const sorted = useMemo(() => {
    if (!sortKey) return rows
    const col = columns.find((c) => c.key === sortKey)
    if (!col?.accessor) return rows
    const copy = [...rows]
    copy.sort((a, b) => {
      const av = col.accessor!(a)
      const bv = col.accessor!(b)
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return copy
  }, [rows, columns, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const current = Math.min(page, totalPages)
  const slice = sorted.slice((current - 1) * pageSize, current * pageSize)

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  return (
    <div className="rounded-xl2 border border-night-100 bg-white shadow-soft overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="sticky top-0 z-10 bg-night-50 text-night-700">
            <tr>
              {columns.map((col) => {
                const isSorted = sortKey === col.key
                const ariaSort = isSorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={col.sortable ? (ariaSort as 'ascending' | 'descending' | 'none') : undefined}
                    className={cn('text-left font-medium px-4 py-3 border-b border-night-100', col.className)}
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className="inline-flex items-center gap-1.5 hover:text-night-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 rounded"
                      >
                        <span>{col.header}</span>
                        <ArrowUpDown
                          className={cn('h-3.5 w-3.5', isSorted ? 'text-night-900' : 'text-night-400')}
                          aria-hidden="true"
                        />
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {slice.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-night-500">
                  {emptyLabel}
                </td>
              </tr>
            )}
            {slice.map((row, i) => (
              <tr
                key={rowKey(row)}
                className={cn(
                  'border-b border-night-100 last:border-0 hover:bg-leaf-50/40 transition-colors',
                  i % 2 === 1 && 'bg-night-50/40',
                )}
              >
                {columns.map((col) => (
                  <td key={col.key} className={cn('px-4 py-3 text-night-800 align-middle', col.className)}>
                    {col.cell ? col.cell(row) : (col.accessor ? String(col.accessor(row) ?? '') : null)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-4 py-3 border-t border-night-100 bg-white text-xs text-night-600">
        <span>
          Page <strong className="text-night-900">{current}</strong> / {totalPages} · {sorted.length} entrées
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={current === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-night-200 bg-white hover:bg-night-50 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500"
            aria-label="Page précédente"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={current === totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-night-200 bg-white hover:bg-night-50 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500"
            aria-label="Page suivante"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
