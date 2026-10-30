'use client'

import Link from 'next/link'
import { use, useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useTranslations } from 'next-intl'
import { Check, CheckCircle2, ImagePlus, Loader2, Lock, Star, Users, X, AlertCircle } from 'lucide-react'
import { ScreenHeader } from '@/components/coffre/ScreenHeader'
import { StickyActions } from '@/components/coffre/StickyActions'
import { btn } from '@/components/coffre/buttons'
import { useVaultI18n } from '@/components/coffre/i18n'
import { useChildOptions } from '@/lib/data/children'
import { addAlbumPhoto } from '@/lib/data/album'
import { VAULT_MAX_BYTES } from '@/lib/data/vault'
import { StorageQuotaNotice, useStorageQuota } from '@/components/coffre/StorageQuotaNotice'
import { photoDateFromFile } from '@/lib/vault/photo-date'
import { PHOTO_ACCEPT } from '@/lib/vault/photo-process'
import { ALBUMS, MAX_PHOTOS_PER_BATCH, NOTE_MAX, type AlbumKey } from '@/lib/album/types'
import { todayKey } from '@/lib/tz'
import { cn } from '@/lib/cn'

type Item = {
  key: string
  file: File
  preview: string
  title: string
  /** Petite note facultative. */
  note: string
  date: string
  /** Date lue dans la photo (sinon à vérifier, préremplie avec aujourd'hui). */
  dateFromPhoto: boolean
  important: boolean
  status: 'idle' | 'sending' | 'done' | 'error'
  error?: string
}

const OK_TYPE = /^image\/(jpeg|png)$/
const OK_EXT = /\.(jpe?g|png)$/i
const field = 'h-11 w-full rounded-xl border border-night-200 bg-white px-3 text-[14px] text-night-900 outline-none focus:border-pink-400'

// Coffre-fort — Album : ajout de photos (date de prise de vue reprise automatiquement, GPS retiré).
export default function AddPhotosPage({ searchParams }: { searchParams: Promise<{ enfant?: string | string[] }> }) {
  const params = use(searchParams)
  const t = useTranslations('vault.album')
  const tu = useTranslations('vault.album.upload')
  const f = useVaultI18n()
  const uid = useId()
  const { options: children, loading: childrenLoading } = useChildOptions()
  const fileRef = useRef<HTMLInputElement>(null)

  const [childId, setChildId] = useState('')
  const [shared, setShared] = useState(false)
  const [album, setAlbum] = useState<AlbumKey | ''>('')
  const [items, setItems] = useState<Item[]>([])
  const [pickError, setPickError] = useState('')
  const [tried, setTried] = useState(false)
  const [running, setRunning] = useState(false)
  const storage = useStorageQuota()
  const [finished, setFinished] = useState(false)
  const [dragging, setDragging] = useState(false)

  // Enfant présélectionné : ?enfant=<id> s'il est à moi, ou l'unique enfant du compte.
  useEffect(() => {
    if (childrenLoading || childId) return
    const wanted = Array.isArray(params.enfant) ? params.enfant[0] : params.enfant
    if (wanted && children.some((c) => c.id === wanted)) setChildId(wanted)
    else if (children.length === 1) setChildId(children[0].id)
  }, [childrenLoading, children, childId, params.enfant])

  // Libère les aperçus en quittant l'écran.
  const itemsRef = useRef(items)
  itemsRef.current = items
  useEffect(() => () => { itemsRef.current.forEach((i) => URL.revokeObjectURL(i.preview)) }, [])

  const addFiles = async (list: FileList | File[] | null) => {
    if (!list) return
    setPickError('')
    const files = Array.from(list)
    const room = MAX_PHOTOS_PER_BATCH - items.length
    if (files.length > room) setPickError(tu('tooMany', { max: MAX_PHOTOS_PER_BATCH }))
    const today = todayKey()
    const next: Item[] = []
    for (const file of files.slice(0, Math.max(0, room))) {
      if (!OK_TYPE.test(file.type) && !OK_EXT.test(file.name)) { setPickError(tu('notImage', { name: file.name })); continue }
      if (file.size > VAULT_MAX_BYTES) { setPickError(tu('tooBig', { name: file.name })); continue }
      const taken = await photoDateFromFile(file, today)
      next.push({
        key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        preview: URL.createObjectURL(file),
        title: file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 120) || tu('photoTitle'),
        note: '',
        date: taken ?? today,
        dateFromPhoto: Boolean(taken),
        important: false,
        status: 'idle',
      })
    }
    setItems((xs) => [...xs, ...next])
  }

  const onInput = (e: ChangeEvent<HTMLInputElement>) => { void addFiles(e.target.files); e.target.value = '' }
  const onDrop = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragging(false); void addFiles(e.dataTransfer.files) }
  const patch = (key: string, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)))
  const remove = (key: string) => setItems((xs) => {
    const it = xs.find((x) => x.key === key)
    if (it) URL.revokeObjectURL(it.preview)
    return xs.filter((x) => x.key !== key)
  })

  const pending = items.filter((i) => i.status !== 'done')
  const done = items.filter((i) => i.status === 'done').length
  const failed = items.filter((i) => i.status === 'error').length
  const childError = tried && !childId ? tu('childRequired') : ''
  const invalidItem = pending.some((i) => !i.title.trim() || !i.date)
  const sendingIndex = items.findIndex((i) => i.status === 'sending')

  const submit = async () => {
    setTried(true)
    if (!childId || pending.length === 0 || invalidItem || running) return
    setRunning(true)
    for (const it of pending) {
      patch(it.key, { status: 'sending', error: undefined })
      try {
        await addAlbumPhoto(it.file, { title: it.title.trim(), note: it.note.trim() || undefined, date: it.date, childId, album: album || null, important: it.important, shared })
        patch(it.key, { status: 'done' })
      } catch (e) {
        patch(it.key, { status: 'error', error: e instanceof Error ? e.message : tu('status.error') })
      }
    }
    setRunning(false)
    setFinished(true)
  }

  const summary = useMemo(() => ({ done, failed }), [done, failed])

  if (finished && summary.failed === 0) {
    return (
      <>
        <ScreenHeader title={tu('title')} backHref="/app/coffre/album" />
        <div className="flex flex-col items-center px-6 pt-10 text-center">
          <span aria-hidden="true" className="grid h-16 w-16 place-items-center rounded-full bg-leaf-50"><CheckCircle2 className="h-9 w-9 text-leaf-500" /></span>
          <h1 tabIndex={-1} className="mt-4 text-[22px] font-extrabold text-night-900 outline-none" ref={(el) => el?.focus()}>{tu('doneTitle')}</h1>
          <p className="mt-2 max-w-[32ch] text-[14px] leading-relaxed text-night-600" role="status">{tu('doneText', { count: summary.done })}</p>
          <div className="mt-8 w-full space-y-2">
            <Link href="/app/coffre/album" className={btn({ variant: 'primary' })}>{tu('seeAlbum')}</Link>
            <button type="button" onClick={() => { items.forEach((i) => URL.revokeObjectURL(i.preview)); setItems([]); setFinished(false); setTried(false) }} className={btn({ variant: 'ghost' })}>{tu('addMore')}</button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <ScreenHeader title={tu('title')} backHref="/app/coffre/album" />
      <div className="space-y-6 px-5 pb-6">
        <StorageQuotaNotice quota={storage.quota} />
        {/* Enfant */}
        <fieldset aria-describedby={childError ? `${uid}-child-err` : undefined}>
          <legend className="text-[15px] font-bold text-night-900">{tu('child')} <span aria-hidden="true" className="text-alert-500">*</span></legend>
          {!childrenLoading && children.length === 0 ? (
            <p className="mt-2 text-[13.5px] text-night-600">
              {tu('noChild')} <Link href="/app/enfants" className="font-semibold text-pink-700 underline underline-offset-2">{tu('noChildLink')}</Link>
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {children.map((c) => {
                const on = childId === c.id
                return (
                  <label key={c.id} className="cursor-pointer">
                    <input type="radio" name={`${uid}-child`} className="peer sr-only" checked={on} onChange={() => setChildId(c.id)} />
                    <span className={cn('inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3.5 text-[14px] font-semibold ring-1 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-pink-500', on ? 'bg-pink-50 text-pink-700 ring-pink-300' : 'bg-white text-night-900 ring-night-200 hover:bg-night-50', childError && !on && 'ring-alert-300')}>
                      {on && <Check className="h-4 w-4" aria-hidden="true" strokeWidth={2.6} />} {c.prenom}
                    </span>
                  </label>
                )
              })}
            </div>
          )}
          {childError && <p id={`${uid}-child-err`} role="alert" className="mt-2 text-[13px] font-semibold text-alert-600">{childError}</p>}
        </fieldset>

        {/* Visibilité */}
        <fieldset>
          <legend className="text-[15px] font-bold text-night-900">{t('visibility')}</legend>
          <div className="mt-2 grid gap-2">
            {([false, true] as const).map((s) => {
              const on = shared === s
              const Icon = s ? Users : Lock
              return (
                <label key={String(s)} className="cursor-pointer">
                  <input type="radio" name={`${uid}-vis`} className="peer sr-only" checked={on} onChange={() => setShared(s)} />
                  <span className={cn('flex items-start gap-3 rounded-2xl p-3.5 ring-1 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-pink-500', on ? 'bg-pink-50 ring-pink-300' : 'bg-white ring-night-200 hover:bg-night-50')}>
                    <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', on ? 'text-pink-600' : 'text-night-500')} aria-hidden="true" />
                    <span>
                      <span className="block text-[14px] font-bold text-night-900">{s ? t('shared') : t('private')}</span>
                      <span className="mt-0.5 block text-[12.5px] leading-snug text-night-600">{s ? t('sharedHelp') : tu('privateHelp')}</span>
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>

        {/* Album */}
        <div>
          <label htmlFor={`${uid}-album`} className="mb-1.5 block text-[15px] font-bold text-night-900">{t('albumLabel')}</label>
          <select id={`${uid}-album`} value={album} onChange={(e) => setAlbum(e.target.value as AlbumKey | '')} className={field}>
            <option value="">{t('albumNone')}</option>
            {ALBUMS.map((a) => <option key={a} value={a}>{t(`albums.${a}`)}</option>)}
          </select>
        </div>

        {/* Photos */}
        <section aria-labelledby={`${uid}-photos`}>
          <h2 id={`${uid}-photos`} className="text-[15px] font-bold text-night-900">{tu('photos')}</h2>
          <input ref={fileRef} type="file" accept={PHOTO_ACCEPT} multiple onChange={onInput} className="sr-only" tabIndex={-1} aria-hidden="true" />
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn('mt-2 flex flex-col items-center rounded-2xl border-2 border-dashed px-5 py-6 text-center transition-colors', dragging ? 'border-pink-400 bg-pink-50' : 'border-night-200 bg-night-50/40', tried && pending.length === 0 && 'border-alert-300')}
          >
            <ImagePlus className="h-10 w-10 text-pink-500" strokeWidth={1.6} aria-hidden="true" />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={running || items.length >= MAX_PHOTOS_PER_BATCH} className={cn(btn({ variant: 'primary' }), 'mt-3 w-auto px-5')}>
              {tu('pick')}
            </button>
            <p className="mt-2 text-[12.5px] text-night-500">{tu('drop')}</p>
            <p className="mt-2 max-w-[36ch] text-[12px] leading-relaxed text-night-500">{tu('pickHelp', { max: MAX_PHOTOS_PER_BATCH })}</p>
          </div>
          {(pickError || (tried && pending.length === 0 && !finished)) && (
            <p role="alert" className="mt-2 text-[13px] font-semibold text-alert-600">{pickError || tu('noPhoto')}</p>
          )}

          {items.length > 0 && (
            <ul className="mt-4 space-y-3">
              {items.map((it) => (
                <li key={it.key} className={cn('flex gap-3 rounded-2xl bg-white p-3 ring-1', it.status === 'error' ? 'ring-alert-300' : it.status === 'done' ? 'ring-leaf-200' : 'ring-night-100')}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.preview} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="sr-only" htmlFor={`${it.key}-t`}>{tu('photoTitle')}</label>
                      <input id={`${it.key}-t`} value={it.title} disabled={running || it.status === 'done'} onChange={(e) => patch(it.key, { title: e.target.value })} maxLength={120} className={cn(field, 'h-10')} />
                      <button
                        type="button"
                        onClick={() => patch(it.key, { important: !it.important })}
                        aria-pressed={it.important}
                        aria-label={t('importantLabel')}
                        disabled={running || it.status === 'done'}
                        className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-full ring-1', it.important ? 'bg-gold-50 text-gold-500 ring-gold-200' : 'text-night-400 ring-night-200 hover:bg-night-50')}
                      >
                        <Star className={cn('h-5 w-5', it.important && 'fill-current')} aria-hidden="true" />
                      </button>
                      {it.status !== 'done' && !running && (
                        <button type="button" onClick={() => remove(it.key)} aria-label={tu('remove', { name: it.title })} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-night-500 hover:bg-night-50">
                          <X className="h-5 w-5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="sr-only" htmlFor={`${it.key}-d`}>{t('viewer.dateLabel')}</label>
                      <input id={`${it.key}-d`} type="date" max={todayKey()} value={it.date} disabled={running || it.status === 'done'} onChange={(e) => patch(it.key, { date: e.target.value, dateFromPhoto: false })} className={cn(field, 'h-10 w-auto')} />
                      <span className={cn('text-[12px] font-semibold', it.dateFromPhoto ? 'text-leaf-700' : 'text-gold-700')}>{it.dateFromPhoto ? tu('dateAuto') : tu('dateManual')}</span>
                    </div>
                    <div>
                      <label className="sr-only" htmlFor={`${it.key}-n`}>{t('noteLabel')}</label>
                      <textarea
                        id={`${it.key}-n`}
                        value={it.note}
                        disabled={running || it.status === 'done'}
                        onChange={(e) => patch(it.key, { note: e.target.value })}
                        maxLength={NOTE_MAX}
                        rows={2}
                        placeholder={t('notePlaceholder')}
                        className="w-full resize-y rounded-xl border border-night-200 bg-white px-3 py-2 text-[13.5px] leading-relaxed text-night-900 outline-none placeholder:text-night-400 focus:border-pink-400"
                      />
                    </div>
                    <p className="flex items-center gap-1.5 text-[12.5px]" aria-live="polite">
                      {it.status === 'sending' && <><Loader2 className="h-4 w-4 animate-spin text-pink-500" aria-hidden="true" /> <span className="text-night-700">{tu('status.sending')}</span></>}
                      {it.status === 'done' && <><CheckCircle2 className="h-4 w-4 text-leaf-500" aria-hidden="true" /> <span className="font-semibold text-leaf-700">{tu('status.done')}</span></>}
                      {it.status === 'error' && <><AlertCircle className="h-4 w-4 text-alert-500" aria-hidden="true" /> <span className="font-semibold text-alert-600">{it.error}</span></>}
                      {it.status === 'idle' && <span className="text-night-500">{f.date(it.date)}</span>}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {finished && summary.failed > 0 && (
            <p role="alert" className="mt-3 rounded-xl bg-alert-50 px-3.5 py-2.5 text-[13px] font-semibold text-alert-700">{tu('someFailed', { count: summary.failed })}</p>
          )}
        </section>
      </div>

      <StickyActions>
        <button type="button" onClick={() => void submit()} disabled={running || storage.full} aria-busy={running} className={btn({ variant: 'primary' })}>
          {running ? tu('sending', { n: sendingIndex + 1, total: items.length }) : tu('submit', { count: pending.length })}
        </button>
      </StickyActions>
    </>
  )
}
