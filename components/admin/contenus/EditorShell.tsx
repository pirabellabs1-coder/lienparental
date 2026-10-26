'use client'
/**
 * Coque commune des éditeurs : barre d'actions collante (enregistrer, publier/dépublier,
 * archiver, dupliquer, supprimer, historique), onglets Édition / Aperçu, résumé d'erreurs
 * relié aux champs, alerte de modifications non enregistrées et gestion des conflits (409).
 */
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Archive, ArchiveRestore, ArrowLeft, Copy, Eye, EyeOff, History, LoaderCircle, RotateCcw, Save, Trash2 } from 'lucide-react'
import { ConfirmDialog, Modal } from '@/components/ui'
import { cn } from '@/lib/cn'
import { CONTENT_KIND_LABEL, CONTENT_SCHEMAS, zodIssues, type ContentData, type ContentKind, type ContentRecord, type ContentStatus, type ContentVersion } from '@/lib/contenus/types'
import { ADMIN_PATHS, AdminApiError, contenusApi, type Issue } from './client-api'
import { IssuesProvider, btnDanger, btnPrimary, btnSecondary } from './form'
import { StatusPill, dateTimeFr } from './StatusPill'

export type EditorApi<K extends ContentKind> = {
  data: ContentData[K]
  set: (patch: Partial<ContentData[K]>) => void
  replace: (d: ContentData[K]) => void
  publishedAt: string | null
  setPublishedAt: (v: string | null) => void
  record: ContentRecord<K> | null
}

type Props<K extends ContentKind> = {
  kind: K
  initial: ContentRecord<K> | null
  defaults: ContentData[K]
  heading: string
  children: (api: EditorApi<K>) => ReactNode
  preview?: (data: ContentData[K], publishedAt: string | null) => ReactNode
  /** Lien d'aperçu plein écran (ex. article). */
  previewHref?: (r: ContentRecord<K>) => string
  /** Lien public si publié. */
  publicHref?: (r: ContentRecord<K>) => string | null
}

const issueLabel = (path: string) => path.replace(/\.(\d+)/g, (_, n) => ` ${Number(n) + 1}`).replace(/\./g, ' › ')

export function EditorShell<K extends ContentKind>({ kind, initial, defaults, heading, children, preview, previewHref, publicHref }: Props<K>) {
  const router = useRouter()
  const [record, setRecord] = useState<ContentRecord<K> | null>(initial)
  const [data, setData] = useState<ContentData[K]>(initial?.data ?? defaults)
  const [publishedAt, setPublishedAt] = useState<string | null>(initial?.publishedAt ?? null)
  const [saved, setSaved] = useState(() => JSON.stringify([initial?.data ?? defaults, initial?.publishedAt ?? null]))
  const [issues, setIssues] = useState<Issue[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string; conflict?: boolean } | null>(null)
  const [tab, setTab] = useState<'edit' | 'preview'>('edit')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const summaryRef = useRef<HTMLDivElement>(null)
  const labels = CONTENT_KIND_LABEL[kind]

  const dirty = useMemo(() => JSON.stringify([data, publishedAt]) !== saved, [data, publishedAt, saved])

  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  const accept = useCallback((r: ContentRecord<K>, text: string) => {
    setRecord(r)
    setData(r.data)
    setPublishedAt(r.publishedAt)
    setSaved(JSON.stringify([r.data, r.publishedAt]))
    setIssues([])
    setMsg({ tone: 'ok', text })
  }, [])

  const fail = (e: unknown) => {
    if (e instanceof AdminApiError) {
      setIssues(e.issues)
      setMsg({ tone: 'err', text: e.message, conflict: e.code === 'conflict' })
      if (e.issues.length) requestAnimationFrame(() => summaryRef.current?.focus())
    } else setMsg({ tone: 'err', text: 'Action impossible. Réessayez.' })
  }

  /** Enregistre (création ou mise à jour), avec changement de statut éventuel. */
  const save = async (statut?: ContentStatus, label = 'Modifications enregistrées') => {
    // Validation locale immédiate (même schéma que le serveur), sauf pour dépublier/archiver.
    if (statut !== 'brouillon' && statut !== 'archive') {
      const r = CONTENT_SCHEMAS[kind].safeParse(kind === 'partenaire' ? { ...(data as object), id: record?.id ?? 'nouvelle-offre' } : data)
      if (!r.success) {
        setIssues(zodIssues(r.error))
        setMsg({ tone: 'err', text: 'Le contenu contient des erreurs : corrigez les champs signalés.' })
        setTab('edit')
        requestAnimationFrame(() => summaryRef.current?.focus())
        return
      }
    }
    setBusy(statut ?? 'save')
    setMsg(null)
    try {
      if (!record) {
        const r = await contenusApi.create(kind, data, statut ?? 'brouillon', kind === 'article' ? publishedAt : undefined)
        accept(r, statut === 'publie' ? 'Créé et publié.' : 'Brouillon créé.')
        router.replace(ADMIN_PATHS[kind].edit(r.id))
      } else {
        const r = await contenusApi.update(kind, record.id, record.version, {
          data, statut, ...(kind === 'article' ? { publishedAt } : {}),
        })
        accept(r, label)
      }
      router.refresh()
    } catch (e) {
      fail(e)
    } finally {
      setBusy(null)
    }
  }

  const duplicate = async () => {
    if (!record) return
    setBusy('dup')
    try {
      const r = await contenusApi.duplicate(kind, record.id)
      router.push(ADMIN_PATHS[kind].edit(r.id))
    } catch (e) { fail(e) } finally { setBusy(null) }
  }

  const remove = async () => {
    if (!record) return
    setConfirmDelete(false)
    setBusy('del')
    try {
      await contenusApi.remove(kind, record.id)
      setSaved(JSON.stringify([data, publishedAt]))
      router.push(ADMIN_PATHS[kind].list)
      router.refresh()
    } catch (e) { fail(e); setBusy(null) }
  }

  const goToIssue = (path: string) => {
    setTab('edit')
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-field-path="${CSS.escape(path)}"]`)
        ?? document.querySelector<HTMLElement>(`[data-field-path^="${CSS.escape(path.split('.')[0])}"]`)
      const focusable = el?.querySelector<HTMLElement>('input, textarea, select, button')
      el?.scrollIntoView({ block: 'center' })
      focusable?.focus()
    })
  }

  const api: EditorApi<K> = {
    data,
    set: (patch) => setData((d) => ({ ...d, ...patch })),
    replace: setData,
    publishedAt,
    setPublishedAt,
    record,
  }

  const statut = record?.statut ?? 'brouillon'
  const pub = record && record.statut === 'publie' ? publicHref?.(record) ?? null : null

  return (
    <div className="pb-24">
      <Link href={ADMIN_PATHS[kind].list} className="inline-flex min-h-[44px] items-center gap-2 rounded-lg text-[14px] font-semibold text-night-700 hover:text-leaf-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Retour à la liste
      </Link>

      <header className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[12.5px] font-bold uppercase tracking-wider text-leaf-700">{heading}</p>
          <h1 className="mt-1 break-words text-[24px] font-extrabold leading-tight text-night-900 sm:text-[28px]">
            {record ? record.titre : `Nouve${labels.feminine ? 'lle' : 'au'} ${labels.one}`}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-night-600">
            <StatusPill statut={statut} publishedAt={record?.publishedAt ?? null} />
            {record && <span>Version {record.version} · modifiée le {dateTimeFr(record.updatedAt)}</span>}
            {dirty && <span className="font-semibold text-gold-700">Modifications non enregistrées</span>}
          </p>
        </div>
      </header>

      {/* Barre d'actions collante */}
      <div className="sticky top-14 z-20 -mx-4 mt-4 border-y border-[#E5E7EB] bg-white/95 px-4 py-2.5 backdrop-blur lg:top-0 lg:mx-0 lg:rounded-2xl lg:border">
        {/* Mobile : une seule ligne défilante (la barre reste compacte) ; à partir de sm : retour à la ligne. */}
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&>*]:shrink-0">
          <button type="button" className={btnPrimary} onClick={() => void save(undefined)} disabled={busy !== null || (!dirty && record !== null)}>
            {busy === 'save' ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
            Enregistrer
          </button>
          {statut === 'publie' ? (
            <button type="button" className={btnSecondary} onClick={() => void save('brouillon', 'Dépublié : repassé en brouillon.')} disabled={busy !== null || !record}>
              <EyeOff className="h-4 w-4" aria-hidden="true" /> Dépublier
            </button>
          ) : (
            <button type="button" className={btnSecondary} onClick={() => void save('publie', kind === 'article' && publishedAt && new Date(publishedAt).getTime() > Date.now() ? 'Publication programmée.' : 'Publié.')} disabled={busy !== null}>
              {busy === 'publie' ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              {dirty || !record ? 'Enregistrer et publier' : 'Publier'}
            </button>
          )}
          {record && kind !== 'partenaire' && (statut === 'archive' ? (
            <button type="button" className={btnSecondary} onClick={() => void save('brouillon', 'Désarchivé : brouillon.')} disabled={busy !== null}>
              <ArchiveRestore className="h-4 w-4" aria-hidden="true" /> Désarchiver
            </button>
          ) : (
            <button type="button" className={btnSecondary} onClick={() => void save('archive', 'Archivé : retiré des pages publiques.')} disabled={busy !== null}>
              <Archive className="h-4 w-4" aria-hidden="true" /> Archiver
            </button>
          ))}
          {record && (
            <>
              <button type="button" className={btnSecondary} onClick={() => void duplicate()} disabled={busy !== null || dirty} title={dirty ? 'Enregistrez d’abord vos modifications' : undefined}>
                <Copy className="h-4 w-4" aria-hidden="true" /> Dupliquer
              </button>
              <button type="button" className={btnSecondary} onClick={() => setHistoryOpen(true)} disabled={busy !== null}>
                <History className="h-4 w-4" aria-hidden="true" /> Historique
              </button>
              {previewHref && (
                <a href={previewHref(record)} target="_blank" rel="noopener noreferrer" className={btnSecondary}>
                  <Eye className="h-4 w-4" aria-hidden="true" /> Aperçu pleine page<span className="sr-only"> (nouvel onglet, version enregistrée)</span>
                </a>
              )}
              {pub && <a href={pub} target="_blank" rel="noopener noreferrer" className={btnSecondary}>Voir en ligne<span className="sr-only"> (nouvel onglet)</span></a>}
              <button type="button" className={cn(btnDanger, 'sm:ml-auto')} onClick={() => setConfirmDelete(true)} disabled={busy !== null}>
                <Trash2 className="h-4 w-4" aria-hidden="true" /> Supprimer
              </button>
            </>
          )}
        </div>
        <div role="status" aria-live="polite" className="min-h-0">
          {msg && (
            <p className={cn('mt-2 flex flex-wrap items-center gap-2 text-[13.5px] font-semibold', msg.tone === 'err' ? 'text-alert-600' : 'text-leaf-700')}>
              {msg.text}
              {msg.conflict && (
                <button type="button" className="underline" onClick={() => window.location.reload()}>Recharger la dernière version</button>
              )}
            </p>
          )}
        </div>
      </div>

      {issues.length > 0 && (
        <div ref={summaryRef} tabIndex={-1} role="alert" className="mt-4 rounded-2xl border border-alert-200 bg-alert-50 p-4 text-[13.5px] text-alert-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-alert-400">
          <p className="font-bold">{issues.length} point{issues.length > 1 ? 's' : ''} à corriger :</p>
          <ul className="mt-1.5 space-y-1">
            {issues.slice(0, 12).map((i) => (
              <li key={`${i.path}-${i.message}`}>
                <button type="button" onClick={() => goToIssue(i.path)} className="text-left underline decoration-alert-300 underline-offset-2 hover:decoration-alert-600">
                  {i.path ? <strong>{issueLabel(i.path)}</strong> : null}{i.path ? ' : ' : ''}{i.message}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {preview && (
        <div role="tablist" aria-label="Mode d’affichage" className="mt-5 inline-flex rounded-xl bg-night-50 p-1">
          {(['edit', 'preview'] as const).map((t) => (
            <button
              key={t} role="tab" type="button" aria-selected={tab === t} aria-controls={`panel-${t}`} id={`tab-${t}`} onClick={() => setTab(t)}
              className={cn('min-h-[40px] rounded-lg px-4 text-[13.5px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500', tab === t ? 'bg-white text-night-900 shadow-soft' : 'text-night-600 hover:text-night-900')}
            >
              {t === 'edit' ? 'Édition' : 'Aperçu'}
            </button>
          ))}
        </div>
      )}

      <IssuesProvider value={issues}>
        <div id="panel-edit" role={preview ? 'tabpanel' : undefined} aria-labelledby={preview ? 'tab-edit' : undefined} hidden={tab !== 'edit'} className="mt-5 space-y-5">
          {children(api)}
        </div>
      </IssuesProvider>
      {preview && (
        <div id="panel-preview" role="tabpanel" aria-labelledby="tab-preview" hidden={tab !== 'preview'} className="mt-5">
          {tab === 'preview' && preview(data, publishedAt)}
        </div>
      )}

      {record && (
        <HistoryModal
          open={historyOpen} onClose={() => setHistoryOpen(false)} kind={kind} record={record}
          onRestored={(r) => { accept(r, `Version restaurée (nouvelle version ${r.version}).`); setHistoryOpen(false); router.refresh() }}
          dirty={dirty}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title={`Supprimer ${labels.feminine ? 'cette' : 'ce'} ${labels.one} ?`}
        description="La suppression est définitive et immédiate sur les pages publiques. Pour retirer temporairement, préférez Dépublier ou Archiver."
        confirmLabel="Supprimer définitivement"
        loading={busy === 'del'}
      />
    </div>
  )
}

const ACTION_LABEL: Record<ContentVersion['action'], string> = { creation: 'Création', modification: 'Modification', suppression: 'Suppression' }

function HistoryModal<K extends ContentKind>({ open, onClose, kind, record, onRestored, dirty }: {
  open: boolean; onClose: () => void; kind: K; record: ContentRecord<K>; onRestored: (r: ContentRecord<K>) => void; dirty: boolean
}) {
  const [versions, setVersions] = useState<ContentVersion[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setVersions(null)
    setError(null)
    contenusApi.versions(kind, record.id).then(setVersions).catch((e) => setError(e instanceof AdminApiError ? e.message : 'Historique indisponible.'))
  }, [open, kind, record.id, record.version])

  const restore = async (v: ContentVersion) => {
    setBusy(v.id)
    setError(null)
    try {
      onRestored(await contenusApi.restore(kind, record.id, v.id, record.version))
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : 'Restauration impossible.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Historique des modifications" description="Chaque enregistrement crée une version. Restaurer remplace le contenu actuel (le statut reste inchangé) et crée une nouvelle version." size="lg">
      {dirty && <p className="mb-3 rounded-xl bg-gold-50 p-3 text-[13px] font-semibold text-gold-800">Attention : vos modifications non enregistrées seront perdues si vous restaurez une version.</p>}
      {error && <p role="alert" className="mb-3 text-[13.5px] font-semibold text-alert-600">{error}</p>}
      {!versions && !error && <p className="text-[14px] text-night-600">Chargement…</p>}
      {versions && versions.length === 0 && <p className="text-[14px] text-night-600">Aucune version enregistrée.</p>}
      {versions && versions.length > 0 && (
        <ol className="max-h-[60vh] divide-y divide-[#E5E7EB] overflow-y-auto">
          {versions.map((v) => {
            const current = v.version === record.version && v.action !== 'suppression'
            return (
              <li key={v.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-bold text-night-900">
                    v{v.version} · {ACTION_LABEL[v.action]}
                    {current && <span className="ml-2 rounded-full bg-leaf-50 px-2 py-0.5 text-[11.5px] text-leaf-800">Version actuelle</span>}
                  </p>
                  <p className="text-[12.5px] text-night-600">
                    {dateTimeFr(v.createdAt)}{v.actor ? ` · ${v.actor}` : ''}{v.statut ? ` · ${v.statut === 'publie' ? 'publié' : v.statut === 'archive' ? 'archivé' : 'brouillon'}` : ''}
                  </p>
                  <p className="truncate text-[12.5px] text-night-700">{v.titre}</p>
                </div>
                {!current && v.action !== 'suppression' && (
                  <button type="button" className={btnSecondary} onClick={() => void restore(v)} disabled={busy !== null}>
                    {busy === v.id ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <RotateCcw className="h-4 w-4" aria-hidden="true" />}
                    Restaurer<span className="sr-only"> la version {v.version}</span>
                  </button>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </Modal>
  )
}
