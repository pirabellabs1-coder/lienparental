'use client'
/**
 * Liste administrable générique (fiches, parcours, offres, modèles, articles) :
 * filtre par statut, recherche, et actions par ligne (modifier, publier/dépublier,
 * dupliquer, archiver, aperçu, supprimer). Mise en page en cartes sur mobile.
 */
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Archive, ArchiveRestore, Copy, Eye, EyeOff, MoreHorizontal, Pencil, Search, Trash2, ExternalLink } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui'
import { cn } from '@/lib/cn'
import { CONTENT_KIND_LABEL, type ContentKind, type ContentRecord, type ContentStatus } from '@/lib/contenus/types'
import { ADMIN_PATHS, AdminApiError, contenusApi } from './client-api'
import { StatusPill, dateTimeFr } from './StatusPill'
import { inputCls } from './form'

type Filter = 'tous' | ContentStatus

export type ListExtra<K extends ContentKind> = { header: string; cell: (r: ContentRecord<K>) => ReactNode }

export function ContentList<K extends ContentKind>({
  kind, records, extra, emptyLabel, publicHref, previewHref,
}: {
  kind: K
  records: ContentRecord<K>[]
  extra?: ListExtra<K>
  emptyLabel?: ReactNode
  /** Lien public d'un élément publié (ex. /blog/slug). */
  publicHref?: (r: ContentRecord<K>) => string | null
  /** Aperçu d'un brouillon (ex. /admin/blog/id/apercu). */
  previewHref?: (r: ContentRecord<K>) => string | null
}) {
  const router = useRouter()
  const [rows, setRows] = useState(records)
  const [filter, setFilter] = useState<Filter>('tous')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [toDelete, setToDelete] = useState<ContentRecord<K> | null>(null)
  const labels = CONTENT_KIND_LABEL[kind]

  useEffect(() => setRows(records), [records])

  const counts = useMemo(() => {
    const c = { tous: rows.length, brouillon: 0, publie: 0, archive: 0 }
    for (const r of rows) c[r.statut]++
    return c
  }, [rows])

  const visible = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('fr').normalize('NFD').replace(/[̀-ͯ]/g, '')
    return rows.filter((r) => (filter === 'tous' || r.statut === filter) &&
      (!needle || `${r.titre} ${r.slug}`.toLocaleLowerCase('fr').normalize('NFD').replace(/[̀-ͯ]/g, '').includes(needle)))
  }, [rows, filter, q])

  const run = async (r: ContentRecord<K>, label: string, fn: () => Promise<ContentRecord<K> | void>) => {
    setBusy(r.id)
    setMessage(null)
    try {
      const out = await fn()
      if (out) setRows((all) => (out.id === r.id ? all.map((x) => (x.id === r.id ? out : x)) : [out, ...all]))
      else setRows((all) => all.filter((x) => x.id !== r.id))
      setMessage({ tone: 'ok', text: `${label} : « ${out?.titre ?? r.titre} ».` })
      router.refresh()
    } catch (e) {
      setMessage({ tone: 'err', text: e instanceof AdminApiError ? e.message : 'Action impossible.' })
    } finally {
      setBusy(null)
    }
  }

  const setStatus = (r: ContentRecord<K>, statut: ContentStatus, label: string) =>
    run(r, label, () => contenusApi.update(kind, r.id, r.version, { statut }))

  const filters: { key: Filter; label: string }[] = [
    { key: 'tous', label: 'Tous' },
    { key: 'publie', label: 'Publiés' },
    { key: 'brouillon', label: 'Brouillons' },
    ...(kind === 'partenaire' ? [] : [{ key: 'archive' as const, label: 'Archivés' }]),
  ]

  return (
    <div>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div role="group" aria-label="Filtrer par statut" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {filters.map((f) => (
            <button
              key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}
              className={cn(
                'inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500',
                filter === f.key ? 'bg-night-900 text-white' : 'bg-white text-night-700 ring-1 ring-inset ring-[#E5E7EB] hover:bg-night-50',
              )}
            >
              {f.label}<span className={cn('tabular-nums', filter === f.key ? 'text-night-200' : 'text-night-500')}>{counts[f.key]}</span>
            </button>
          ))}
        </div>
        <div className="relative md:w-72">
          <label htmlFor={`q-${kind}`} className="sr-only">Rechercher</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-night-400" aria-hidden="true" />
          <input id={`q-${kind}`} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un titre ou un slug" className={cn(inputCls, 'pl-9')} />
        </div>
      </div>

      <p role="status" aria-live="polite" className={cn('mt-3 min-h-[1.25rem] text-[13.5px] font-semibold', message?.tone === 'err' ? 'text-alert-600' : 'text-leaf-700')}>
        {message?.text}
      </p>

      {visible.length === 0 ? (
        <div className="mt-2 rounded-2xl border border-dashed border-night-200 bg-white p-10 text-center text-[14px] text-night-600">
          {rows.length === 0 ? emptyLabel ?? `Aucun élément pour le moment.` : 'Aucun résultat pour ce filtre.'}
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-[#E5E7EB] overflow-visible rounded-2xl border border-[#E5E7EB] bg-white shadow-soft" aria-label={`Liste des ${labels.many}`}>
          {visible.map((r) => {
            const pub = r.statut === 'publie' ? publicHref?.(r) ?? null : null
            const prev = previewHref?.(r) ?? null
            return (
              <li key={r.id} className={cn('flex flex-col gap-3 p-4 md:flex-row md:items-center', busy === r.id && 'opacity-60')}>
                <div className="min-w-0 flex-1">
                  <Link href={ADMIN_PATHS[kind].edit(r.id)} className="block rounded text-[15px] font-bold leading-snug text-night-900 hover:text-leaf-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500">
                    {r.titre}
                  </Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-night-600">
                    {kind !== 'partenaire' && <span className="font-mono text-[12px]">{r.slug}</span>}
                    {extra && <span>{extra.cell(r)}</span>}
                    <span>Modifié le {dateTimeFr(r.updatedAt)}</span>
                    <span>v{r.version}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2 md:justify-end">
                  <StatusPill statut={r.statut} publishedAt={r.publishedAt} />
                  <Link href={ADMIN_PATHS[kind].edit(r.id)} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-night-200 bg-white px-3 text-[13.5px] font-semibold text-night-900 hover:bg-night-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500">
                    <Pencil className="h-4 w-4" aria-hidden="true" /> Modifier<span className="sr-only"> « {r.titre} »</span>
                  </Link>
                  <RowMenu label={r.titre} disabled={busy !== null}>
                    {(close) => (
                      <>
                        {r.statut === 'publie' ? (
                          <MenuItem icon={EyeOff} onClick={() => { close(); void setStatus(r, 'brouillon', 'Dépublié') }}>Dépublier</MenuItem>
                        ) : (
                          <MenuItem icon={Eye} onClick={() => { close(); void setStatus(r, 'publie', 'Publié') }}>Publier</MenuItem>
                        )}
                        <MenuItem icon={Copy} onClick={() => { close(); void run(r, 'Copie créée (brouillon)', () => contenusApi.duplicate(kind, r.id)) }}>Dupliquer</MenuItem>
                        {kind !== 'partenaire' && (r.statut === 'archive' ? (
                          <MenuItem icon={ArchiveRestore} onClick={() => { close(); void setStatus(r, 'brouillon', 'Désarchivé (brouillon)') }}>Désarchiver</MenuItem>
                        ) : (
                          <MenuItem icon={Archive} onClick={() => { close(); void setStatus(r, 'archive', 'Archivé') }}>Archiver</MenuItem>
                        ))}
                        {prev && <MenuLink icon={Eye} href={prev}>Aperçu</MenuLink>}
                        {pub && <MenuLink icon={ExternalLink} href={pub} external>Voir en ligne</MenuLink>}
                        <MenuItem icon={Trash2} danger onClick={() => { close(); setToDelete(r) }}>Supprimer…</MenuItem>
                      </>
                    )}
                  </RowMenu>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        title={`Supprimer ${labels.feminine ? 'cette' : 'ce'} ${labels.one} ?`}
        description={toDelete ? `« ${toDelete.titre} » sera supprimé${labels.feminine ? 'e' : ''} définitivement. L’historique conserve une copie, mais l’élément disparaît immédiatement des pages publiques. Pour le retirer temporairement, préférez Dépublier ou Archiver.` : ''}
        confirmLabel="Supprimer définitivement"
        loading={busy !== null}
        onConfirm={async () => {
          const r = toDelete
          if (!r) return
          setToDelete(null)
          await run(r, 'Supprimé', () => contenusApi.remove(kind, r.id))
        }}
      />
    </div>
  )
}

function RowMenu({ label, disabled, children }: { label: string; disabled?: boolean; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus() } }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus())
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])
  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const i = items.indexOf(document.activeElement as HTMLElement)
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
  }
  return (
    <div ref={ref} className="relative">
      <button
        ref={btn} type="button" disabled={disabled} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-night-200 bg-white text-night-800 hover:bg-night-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 disabled:opacity-50"
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden="true" /><span className="sr-only">Autres actions pour « {label} »</span>
      </button>
      {open && (
        <div role="menu" aria-label={`Actions pour « ${label} »`} onKeyDown={onMenuKey}
          className="absolute right-0 top-12 z-20 w-56 rounded-xl border border-[#E5E7EB] bg-white p-1.5 shadow-card">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

type IconT = React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
const itemCls = 'flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-3 text-left text-[14px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500'

function MenuItem({ icon: Icon, children, onClick, danger }: { icon: IconT; children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={cn(itemCls, danger ? 'text-alert-600 hover:bg-alert-50' : 'text-night-800 hover:bg-night-50')}>
      <Icon className="h-4 w-4" aria-hidden={true} />{children}
    </button>
  )
}

function MenuLink({ icon: Icon, children, href, external }: { icon: IconT; children: ReactNode; href: string; external?: boolean }) {
  return (
    <a role="menuitem" href={href} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined} className={cn(itemCls, 'text-night-800 hover:bg-night-50')}>
      <Icon className="h-4 w-4" aria-hidden={true} />{children}{external && <span className="sr-only"> (nouvel onglet)</span>}
    </a>
  )
}
