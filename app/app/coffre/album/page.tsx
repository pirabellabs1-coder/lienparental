'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  ChevronLeft, ChevronRight, Download, ImagePlus, Images, Lock, Pencil, Plus, Star, Trash2, Users, X,
} from 'lucide-react'
import { ScreenHeader, headerIconBtn } from '@/components/coffre/ScreenHeader'
import { btn } from '@/components/coffre/buttons'
import { useAnnounce } from '@/components/coffre/useAnnounce'
import { useVaultI18n } from '@/components/coffre/i18n'
import { ErrorState, LoadingState } from '@/components/mobile/StateScreens'
import { useAlbum } from '@/components/album/useAlbum'
import { useChildOptions } from '@/lib/data/children'
import { albumPhotoSrc, trashAlbumPhoto, updateAlbumPhoto } from '@/lib/data/album'
import { downloadDocument } from '@/lib/data/vault'
import { LIVE } from '@/lib/data/core'
import { ALBUMS, NOTE_MAX, filterPhotos, timeline, type AlbumFilter, type AlbumKey, type AlbumPhoto } from '@/lib/album/types'
import { intlLocale } from '@/lib/i18n/config'
import { todayKey } from '@/lib/tz'
import { cn } from '@/lib/cn'

type View = NonNullable<AlbumFilter['view']>
const VIEWS: View[] = ['all', 'important', 'shared', 'private', 'theirs']

const chip = (on: boolean) => cn(
  'inline-flex min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13.5px] font-semibold ring-1 transition-colors',
  on ? 'bg-pink-50 text-pink-700 ring-pink-300' : 'bg-white text-night-800 ring-[#E5E7EB] hover:bg-night-50',
)

// Coffre-fort — Album de l'enfant : chronologie des photos (privées ou partagées avec l'autre parent).
export default function AlbumPage() {
  const t = useTranslations('vault.album')
  const f = useVaultI18n()
  const locale = useLocale()
  const { photos, loading, error, thumbs, refresh, refreshThumbs, patchLocal, removeLocal } = useAlbum()
  const { options: children } = useChildOptions()
  const { announce, node } = useAnnounce()

  const [childId, setChildId] = useState<string | undefined>(undefined)
  const [view, setView] = useState<View>('all')
  const [album, setAlbum] = useState<AlbumKey | 'all'>('all')
  const [openId, setOpenId] = useState<string | null>(null)

  const list = useMemo(() => filterPhotos(photos ?? [], { childId, view, album }), [photos, childId, view, album])
  const years = useMemo(() => timeline(list), [list])
  const ordered = useMemo(() => years.flatMap((y) => y.months.flatMap((m) => m.photos)), [years])
  const monthName = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(intlLocale(locale), { month: 'long', timeZone: 'UTC' })
    return (m: number) => { const s = fmt.format(new Date(Date.UTC(2000, m - 1, 1))); return s.charAt(0).toUpperCase() + s.slice(1) }
  }, [locale])
  const childName = (id: string) => children.find((c) => c.id === id)?.prenom

  const filtered = childId !== undefined || view !== 'all' || album !== 'all'
  const reset = () => { setChildId(undefined); setView('all'); setAlbum('all') }

  return (
    <>
      <ScreenHeader
        title={t('title')}
        backHref="/app/coffre"
        right={
          <Link href="/app/coffre/album/ajouter" aria-label={t('add')} className={cn(headerIconBtn, '-mr-2')}>
            <Plus className="h-6 w-6" aria-hidden="true" />
          </Link>
        }
      />
      <div className="px-5">
        <p className="text-[14px] leading-relaxed text-night-600">{t('lead')}</p>

        <div role="group" aria-label={t('filtersLabel')} className="mt-4 space-y-2.5">
          {children.length > 1 && (
            <div role="radiogroup" aria-label={t('childLabel')} className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
              <button type="button" role="radio" aria-checked={childId === undefined} onClick={() => setChildId(undefined)} className={chip(childId === undefined)}>{t('allChildren')}</button>
              {children.map((c) => (
                <button key={c.id} type="button" role="radio" aria-checked={childId === c.id} onClick={() => setChildId(c.id)} className={chip(childId === c.id)}>{c.prenom}</button>
              ))}
            </div>
          )}
          <div role="radiogroup" aria-label={t('viewLabel')} className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
            {VIEWS.map((v) => (
              <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => setView(v)} className={chip(view === v)}>
                {v === 'important' && <Star className="h-4 w-4" aria-hidden="true" />}
                {t(`views.${v}`)}
              </button>
            ))}
          </div>
          <div>
            <label htmlFor="album-filter" className="sr-only">{t('albumLabel')}</label>
            <select
              id="album-filter"
              value={album}
              onChange={(e) => setAlbum(e.target.value as AlbumKey | 'all')}
              className="h-11 w-full rounded-xl border border-night-200 bg-white px-3.5 text-[14px] font-semibold text-night-900 outline-none focus:border-pink-400"
            >
              <option value="all">{t('allAlbums')}</option>
              {ALBUMS.map((a) => <option key={a} value={a}>{t(`albums.${a}`)}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <LoadingState compact title={t('loading')} description="" />
        ) : error ? (
          <ErrorState compact description={error} primary={{ label: t('retry'), onClick: () => void refresh() }} />
        ) : (photos?.length ?? 0) === 0 ? (
          <div className="mt-10 flex flex-col items-center rounded-3xl bg-gradient-to-b from-pink-50 to-white px-6 py-10 text-center ring-1 ring-pink-100">
            <span aria-hidden="true" className="grid h-16 w-16 place-items-center rounded-full bg-white text-pink-500 shadow-[0_8px_24px_-12px_rgba(236,72,153,0.6)]">
              <Images className="h-8 w-8" />
            </span>
            <h2 className="mt-4 text-[18px] font-extrabold text-night-900">{t('emptyTitle')}</h2>
            <p className="mt-2 max-w-[34ch] text-[14px] leading-relaxed text-night-600">{t('emptyText')}</p>
            <Link href="/app/coffre/album/ajouter" className={cn(btn({ variant: 'primary' }), 'mt-6 w-auto gap-2 px-6')}>
              <ImagePlus className="h-5 w-5" aria-hidden="true" /> {t('add')}
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-5 text-[13px] font-semibold text-night-600" aria-live="polite">{t('count', { count: list.length })}</p>
            {list.length === 0 ? (
              <div className="mt-6 text-center">
                <p className="text-[14px] text-night-600">{t('noMatch')}</p>
                {filtered && <button type="button" onClick={reset} className="mt-3 inline-flex min-h-[44px] items-center rounded-lg px-3 text-[14px] font-bold text-pink-700 hover:bg-pink-50">{t('resetFilters')}</button>}
              </div>
            ) : (
              <div className="mt-3 space-y-7">
                {years.map((y) => (
                  <section key={y.year} aria-labelledby={`y-${y.year}`}>
                    <h2 id={`y-${y.year}`} className="sticky top-0 z-10 -mx-5 bg-white/90 px-5 py-2 text-[20px] font-extrabold tracking-[-0.01em] text-night-900 backdrop-blur">
                      {y.year} <span className="text-[13px] font-semibold text-night-500">· {t('count', { count: y.count })}</span>
                    </h2>
                    {y.months.map((m) => (
                      <div key={m.key} className="mt-3">
                        <h3 className="text-[14px] font-bold text-night-700">{monthName(m.month)}</h3>
                        <ul className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                          {m.photos.map((p) => (
                            <li key={p.id}>
                              <button
                                type="button"
                                onClick={() => setOpenId(p.id)}
                                aria-label={t('open', { title: p.title, date: f.date(p.date) })}
                                className="group relative block aspect-square w-full overflow-hidden rounded-xl bg-night-50 ring-1 ring-night-100 focus-visible:ring-2 focus-visible:ring-pink-500"
                              >
                                {thumbs[p.id] ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={thumbs[p.id]} alt="" loading="lazy" decoding="async" onError={refreshThumbs} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                                ) : (
                                  <span aria-hidden="true" className="absolute inset-0 animate-pulse bg-night-100" />
                                )}
                                <span aria-hidden="true" className="absolute inset-x-1 top-1 flex justify-between">
                                  {p.important ? <span className="grid h-6 w-6 place-items-center rounded-full bg-white/95 text-gold-500 shadow"><Star className="h-3.5 w-3.5 fill-current" /></span> : <span />}
                                  <span className={cn('grid h-6 w-6 place-items-center rounded-full bg-white/95 shadow', p.sharedBy ? 'text-iris-600' : p.shared ? 'text-leaf-600' : 'text-night-600')}>
                                    {p.shared || p.sharedBy ? <Users className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                                  </span>
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <PhotoViewer
        photos={ordered}
        openId={openId}
        onClose={() => setOpenId(null)}
        onMove={setOpenId}
        childName={childName}
        onSaved={(id, patch) => { patchLocal(id, patch); announce(t('viewer.saved')) }}
        onTrashed={(id) => { removeLocal(id); setOpenId(null); announce(t('viewer.trashed')) }}
        announce={announce}
        live={node}
      />
      {/* Visionneuse ouverte (modale) : le reste de la page est inerte, l'annonce passe dans la visionneuse. */}
      {!openId && node}
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Visionneuse plein écran (<dialog> natif : focus piégé, Échap)       */
/* ------------------------------------------------------------------ */

function PhotoViewer({ photos, openId, onClose, onMove, childName, onSaved, onTrashed, announce, live }: {
  photos: AlbumPhoto[]
  openId: string | null
  onClose: () => void
  onMove: (id: string) => void
  childName: (id: string) => string | undefined
  onSaved: (id: string, patch: Partial<AlbumPhoto>) => void
  onTrashed: (id: string) => void
  announce: (m: string) => void
  /** Zone d'annonce (useAnnounce), rendue dans la visionneuse pendant qu'elle est ouverte. */
  live: React.ReactNode
}) {
  const t = useTranslations('vault.album')
  const f = useVaultI18n()
  const ref = useRef<HTMLDialogElement>(null)
  const index = photos.findIndex((p) => p.id === openId)
  const photo = index >= 0 ? photos[index] : null
  const [editing, setEditing] = useState(false)
  const [confirmTrash, setConfirmTrash] = useState(false)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<{ title: string; note: string; date: string; album: AlbumKey | ''; important: boolean; shared: boolean }>({ title: '', note: '', date: '', album: '', important: false, shared: false })

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (photo && !d.open) d.showModal()
    if (!photo && d.open) d.close()
  }, [photo])
  useEffect(() => { setEditing(false); setConfirmTrash(false) }, [openId])

  const go = useCallback((dir: -1 | 1) => {
    if (index < 0 || photos.length < 2) return
    onMove(photos[(index + dir + photos.length) % photos.length].id)
  }, [index, photos, onMove])

  useEffect(() => {
    if (!photo || editing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1) }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [photo, editing, go])

  const startEdit = () => {
    if (!photo) return
    setDraft({ title: photo.title, note: photo.note ?? '', date: photo.date, album: photo.album ?? '', important: photo.important, shared: photo.shared })
    setEditing(true)
  }

  const save = async () => {
    if (!photo || busy || !draft.title.trim() || !draft.date) return
    setBusy(true)
    const patch = { title: draft.title.trim(), note: draft.note.trim(), date: draft.date, album: draft.album || null, important: draft.important, shared: draft.shared }
    try {
      await updateAlbumPhoto(photo.id, { ...patch, note: patch.note || null })
      onSaved(photo.id, { ...patch, note: patch.note || undefined })
      setEditing(false)
    } catch (e) {
      announce(e instanceof Error ? e.message : t('viewer.saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  const trash = async () => {
    if (!photo || busy) return
    setBusy(true)
    try {
      await trashAlbumPhoto(photo.id)
      onTrashed(photo.id)
    } catch (e) {
      announce(e instanceof Error ? e.message : t('viewer.saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  const download = async () => {
    if (!photo) return
    if (!LIVE) { announce(t('viewer.downloadDemo')); return }
    try {
      await downloadDocument({ id: photo.id })
    } catch (e) {
      announce(e instanceof Error ? e.message : t('viewer.downloadFailed'))
    }
  }

  const mine = photo ? !photo.sharedBy : false
  const field = 'h-11 w-full rounded-xl border border-white/20 bg-white/10 px-3 text-[14px] text-white outline-none placeholder:text-white/50 focus:border-pink-300'

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={photo?.title}
      className="m-0 h-[100dvh] max-h-none w-screen max-w-none overflow-hidden bg-night-950 p-0 text-white backdrop:bg-night-950/90"
    >
      {photo && (
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-2 px-3 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)]">
            <p className="text-[13px] font-semibold text-white/80" aria-live="polite">{t('viewer.position', { n: index + 1, total: photos.length })}</p>
            <button type="button" onClick={onClose} aria-label={t('viewer.close')} className="grid h-11 w-11 place-items-center rounded-full hover:bg-white/10">
              <X className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img key={photo.id} src={albumPhotoSrc(photo)} alt={photo.title} className="max-h-full max-w-full rounded-lg object-contain" />
            {photos.length > 1 && (
              <>
                <button type="button" onClick={() => go(-1)} aria-label={t('viewer.prev')} className="absolute left-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/40 hover:bg-black/60">
                  <ChevronLeft className="h-6 w-6" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => go(1)} aria-label={t('viewer.next')} className="absolute right-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/40 hover:bg-black/60">
                  <ChevronRight className="h-6 w-6" aria-hidden="true" />
                </button>
              </>
            )}
          </div>

          <div className="max-h-[48dvh] overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-3">
            {!editing ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-[17px] font-extrabold">
                      {photo.important && <Star className="mr-1.5 inline h-4 w-4 -translate-y-0.5 fill-gold-400 text-gold-400" aria-label={t('badgeImportant')} />}
                      {photo.title}
                    </h2>
                    <p className="mt-0.5 text-[13px] text-white/75">
                      {f.date(photo.date)}
                      {photo.album && <> <span aria-hidden="true">·</span> {t(`albums.${photo.album}`)}</>}
                      {photo.childIds.map(childName).filter(Boolean).length > 0 && <> <span aria-hidden="true">·</span> {photo.childIds.map(childName).filter(Boolean).join(', ')}</>}
                    </p>
                    <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[12px] font-semibold">
                      {photo.sharedBy
                        ? <><Users className="h-3.5 w-3.5" aria-hidden="true" /> {t('sharedBy', { name: photo.sharedBy.prenom })}</>
                        : photo.shared
                          ? <><Users className="h-3.5 w-3.5" aria-hidden="true" /> {t('badgeShared')}</>
                          : <><Lock className="h-3.5 w-3.5" aria-hidden="true" /> {t('badgePrivate')}</>}
                    </p>
                  </div>
                </div>
                {photo.note && <p className="mt-3 whitespace-pre-line text-[14px] leading-relaxed text-white/90">{photo.note}</p>}
                <p className="mt-2 text-[12px] text-white/55">{t('viewer.added', { date: f.date(photo.addedAt) })}</p>
                {photo.sharedBy && <p className="mt-3 text-[12.5px] leading-relaxed text-white/70">{t('viewer.readOnly', { name: photo.sharedBy.prenom })}</p>}

                {confirmTrash ? (
                  <div role="alertdialog" aria-label={t('viewer.trash')} className="mt-4 rounded-2xl bg-white/10 p-4">
                    <p className="text-[14px]">{t('viewer.trashConfirm')}</p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setConfirmTrash(false)} className="h-11 rounded-full bg-white/15 font-semibold hover:bg-white/25">{t('viewer.cancel')}</button>
                      <button type="button" onClick={() => void trash()} disabled={busy} className="h-11 rounded-full bg-alert-500 font-semibold hover:bg-alert-600">{t('viewer.trash')}</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void download()} className="inline-flex h-11 items-center gap-2 rounded-full bg-white/15 px-4 text-[14px] font-semibold hover:bg-white/25">
                      <Download className="h-4 w-4" aria-hidden="true" /> {t('viewer.download')}
                    </button>
                    {mine && (
                      <>
                        <button type="button" onClick={startEdit} className="inline-flex h-11 items-center gap-2 rounded-full bg-white/15 px-4 text-[14px] font-semibold hover:bg-white/25">
                          <Pencil className="h-4 w-4" aria-hidden="true" /> {t('viewer.edit')}
                        </button>
                        <button type="button" onClick={() => setConfirmTrash(true)} className="inline-flex h-11 items-center gap-2 rounded-full bg-white/15 px-4 text-[14px] font-semibold text-alert-200 hover:bg-white/25">
                          <Trash2 className="h-4 w-4" aria-hidden="true" /> {t('viewer.trash')}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); void save() }} className="space-y-3">
                <div>
                  <label htmlFor="pv-title" className="mb-1 block text-[12.5px] font-semibold text-white/80">{t('viewer.titleLabel')}</label>
                  <input id="pv-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={120} required className={field} />
                </div>
                <div>
                  <label htmlFor="pv-note" className="mb-1 block text-[12.5px] font-semibold text-white/80">{t('noteLabel')}</label>
                  <textarea
                    id="pv-note"
                    value={draft.note}
                    onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                    maxLength={NOTE_MAX}
                    rows={3}
                    placeholder={t('notePlaceholder')}
                    aria-describedby="pv-note-count"
                    className="w-full resize-y rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-[14px] leading-relaxed text-white outline-none placeholder:text-white/50 focus:border-pink-300"
                  />
                  <p id="pv-note-count" className="mt-1 text-right text-[11.5px] text-white/55">{t('noteCount', { n: draft.note.length, max: NOTE_MAX })}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="pv-date" className="mb-1 block text-[12.5px] font-semibold text-white/80">{t('viewer.dateLabel')}</label>
                    <input id="pv-date" type="date" max={todayKey()} value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} required className={cn(field, '[color-scheme:dark]')} />
                  </div>
                  <div>
                    <label htmlFor="pv-album" className="mb-1 block text-[12.5px] font-semibold text-white/80">{t('albumLabel')}</label>
                    <select id="pv-album" value={draft.album} onChange={(e) => setDraft({ ...draft, album: e.target.value as AlbumKey | '' })} className={cn(field, '[color-scheme:dark]')}>
                      <option value="">{t('albumNone')}</option>
                      {ALBUMS.map((a) => <option key={a} value={a}>{t(`albums.${a}`)}</option>)}
                    </select>
                  </div>
                </div>
                <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
                  <input type="checkbox" checked={draft.important} onChange={(e) => setDraft({ ...draft, important: e.target.checked })} className="h-5 w-5 accent-pink-500" />
                  <span className="text-[14px]">{t('importantLabel')}</span>
                </label>
                <fieldset>
                  <legend className="text-[12.5px] font-semibold text-white/80">{t('visibility')}</legend>
                  <div className="mt-1 grid gap-1.5">
                    {([false, true] as const).map((s) => (
                      <label key={String(s)} className="flex min-h-[44px] cursor-pointer items-center gap-3">
                        <input type="radio" name="pv-shared" checked={draft.shared === s} onChange={() => setDraft({ ...draft, shared: s })} className="h-5 w-5 accent-pink-500" />
                        <span className="text-[14px]">{s ? t('shared') : t('private')}</span>
                      </label>
                    ))}
                  </div>
                  {draft.shared && <p className="mt-1 text-[12px] text-white/70">{t('sharedHelp')}</p>}
                </fieldset>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button type="button" onClick={() => setEditing(false)} className="h-11 rounded-full bg-white/15 font-semibold hover:bg-white/25">{t('viewer.cancel')}</button>
                  <button type="submit" disabled={busy || !draft.title.trim() || !draft.date} aria-busy={busy} className="h-11 rounded-full bg-pink-500 font-semibold hover:bg-pink-600 disabled:opacity-60">{t('viewer.save')}</button>
                </div>
              </form>
            )}
          </div>
          {live}
        </div>
      )}
    </dialog>
  )
}
