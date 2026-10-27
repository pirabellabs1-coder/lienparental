'use client'
/**
 * Liste administrable générique (fiches, parcours, offres, modèles, articles) :
 * filtre par statut, recherche, et actions par ligne (modifier, publier/dépublier,
 * dupliquer, archiver, aperçu, supprimer). Mise en page en cartes sur mobile.
 */
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Archive, ArchiveRestore, Clock, Copy, Eye, EyeOff, Inbox, MoreHorizontal, Pencil, Search, Trash2, ExternalLink } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui'
import { cn } from '@/lib/cn'
import { CONTENT_KIND_LABEL, type ContentKind, type ContentRecord, type ContentStatus } from '@/lib/contenus/types'
import { TRANSLATION_LOCALES, TRANSLATION_LOCALE_LABEL, translationStatus, type TranslationStatus } from '@/lib/contenus/i18n'
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

  // État des traductions par ligne (validation zod) : calculé une fois par liste, pas à chaque frappe.
  const trStates = useMemo(() => new Map(rows.map((r) => [
    r.id, TRANSLATION_LOCALES.map((l) => [l, translationStatus(kind, r.data, r.translations?.[l])] as const),
  ])), [rows, kind])

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
        <div role="group" aria-label="Filtrer par statut" className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-full border border-night-100 bg-night-50/80 p-1 [scrollbar-width:none]">
          {filters.map((f) => (
            <button
              key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}
              className={cn(
                'inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500',
                filter === f.key ? 'bg-white text-night-900 shadow-soft' : 'text-night-500 hover:text-night-800',
              )}
            >
              {f.label}
              <span className={cn('inline-flex min-w-[18px] justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums', filter === f.key ? 'bg-leaf-100 text-leaf-700' : 'bg-night-100 text-night-500')}>{counts[f.key]}</span>
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
        <div className="mt-3 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-night-200 bg-white p-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-night-50 text-night-400">
            <Inbox className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="text-[14px] text-night-600">
            {rows.length === 0 ? emptyLabel ?? `Aucun élément pour le moment.` : 'Aucun résultat pour ce filtre.'}
          </p>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-night-100 overflow-hidden rounded-2xl border border-night-100 bg-white shadow-soft" aria-label={`Liste des ${labels.many}`}>
          {visible.map((r) => {
            const pub = r.statut === 'publie' ? publicHref?.(r) ?? null : null
            const prev = previewHref?.(r) ?? null
            const hasSlug = kind !== 'partenaire'
            const metas: ReactNode[] = []
            if (extra) metas.push(<span key="x">{extra.cell(r)}</span>)
            metas.push(<span key="d" className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-night-400" aria-hidden="true" />{dateTimeFr(r.updatedAt)}</span>)
            metas.push(<span key="v" className="tabular-nums">v{r.version}</span>)
            metas.push(<TranslationBadges key="tr" states={trStates.get(r.id) ?? []} />)
            return (
              <li key={r.id} className={cn('group flex flex-col gap-3 px-4 py-3.5 transition-colors hover:bg-night-50/60 md:flex-row md:items-center md:px-5', busy === r.id && 'opacity-60')}>
                <div className="min-w-0 flex-1">
                  <Link href={ADMIN_PATHS[kind].edit(r.id)} className="block rounded text-[15px] font-bold leading-snug text-night-900 transition-colors group-hover:text-leaf-700 hover:text-leaf-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500">
                    {r.titre}
                  </Link>
                  <p className="mt-1 flex flex-wrap items-center gap-y-1 text-[12.5px] text-night-500">
                    {hasSlug && <span className="rounded-md bg-night-50 px-1.5 py-0.5 font-mono text-[11.5px] text-night-500 ring-1 ring-inset ring-night-100">{r.slug}</span>}
                    {metas.map((node, i) => (
                      <span key={i} className="inline-flex items-center">
                        {(hasSlug || i > 0) && <span className="mx-2 text-night-300" aria-hidden="true">·</span>}
                        {node}
                      </span>
                    ))}
                  </p>
                </div>
                <div className="flex items-center gap-2 md:justify-end">
                  <StatusPill statut={r.statut} publishedAt={r.publishedAt} />
                  <Link href={ADMIN_PATHS[kind].edit(r.id)} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-night-200 bg-white px-3 text-[13.5px] font-semibold text-night-800 transition-colors hover:border-leaf-300 hover:bg-leaf-50 hover:text-leaf-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500">
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

const TR_STATE: Record<TranslationStatus, { mark: string; label: string; cls: string }> = {
  traduit: { mark: '✓', label: 'traduit', cls: 'bg-leaf-50 text-leaf-800 ring-leaf-200' },
  manquant: { mark: '–', label: 'traduction manquante', cls: 'bg-night-50 text-night-500 ring-night-100' },
  'a-revoir': { mark: '!', label: 'traduction à revoir (affichée en français)', cls: 'bg-gold-50 text-gold-800 ring-gold-200' },
}

/** Indicateur EN / PT d'une ligne : traduit, manquant ou à revoir (structure différente du français). */
function TranslationBadges({ states }: { states: readonly (readonly [keyof typeof TRANSLATION_LOCALE_LABEL, TranslationStatus])[] }) {
  return (
    <span className="inline-flex items-center gap-1">
      {states.map(([l, st]) => (
        <span key={l} title={`${TRANSLATION_LOCALE_LABEL[l]} : ${TR_STATE[st].label}`}
          className={cn('inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-bold uppercase ring-1 ring-inset', TR_STATE[st].cls)}>
          {l}<span aria-hidden="true">{TR_STATE[st].mark}</span>
          <span className="sr-only">{` : ${TR_STATE[st].label}`}</span>
        </span>
      ))}
    </span>
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
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-night-200 bg-white text-night-600 transition-colors hover:bg-night-50 hover:text-night-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 disabled:opacity-50"
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
