'use client'

/**
 * Feuilles des dossiers du coffre-fort (0410) :
 * - FolderNameSheet  : créer / renommer un dossier ;
 * - FolderPickerSheet : choisir un emplacement (racine ou dossier), pour ranger un document
 *   ou mettre une pièce jointe de la messagerie au coffre-fort ;
 * - ShareFolderSheet : partager un dossier avec un parent lié, ou arrêter le partage.
 * Toutes s'appuient sur la feuille <dialog> native (focus piégé, Échap, retour du focus).
 */
import { useEffect, useId, useState, type FormEvent } from 'react'
import { useTranslations } from 'next-intl'
import { Folder, FolderLock, Loader2, Users } from 'lucide-react'
import { Sheet } from '@/components/messages/Sheet'
import { btn } from './buttons'
import { cn } from '@/lib/cn'
import {
  FOLDER_NAME_MAX, flattenFolders, folderAudience, type FolderShare, type VaultFolder,
} from '@/lib/data/vault-folders'
import type { LinkedParent } from '@/lib/coparents/types'

/* ---- Nom de dossier ------------------------------------------------------- */

export function FolderNameSheet({ open, onClose, title, initial = '', submitLabel, onSubmit }: {
  open: boolean
  onClose: () => void
  title: string
  initial?: string
  submitLabel: string
  /** Lance l'écriture ; renvoie un message d'erreur à afficher, ou null si c'est fait. */
  onSubmit: (name: string) => Promise<string | null>
}) {
  const t = useTranslations('vault.folders')
  const tc = useTranslations('vault.common')
  const uid = useId()
  const [name, setName] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) { setName(initial); setError(null); setBusy(false) }
  }, [open, initial])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const v = name.trim()
    if (!v) { setError(t('nameRequired')); return }
    setBusy(true)
    const err = await onSubmit(v)
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <form onSubmit={(e) => void submit(e)} noValidate>
        <label htmlFor={`${uid}-name`} className="block text-[13px] font-semibold text-night-900">{t('nameLabel')}</label>
        <input
          id={`${uid}-name`}
          data-autofocus
          value={name}
          onChange={(e) => { setName(e.target.value); if (error) setError(null) }}
          maxLength={FOLDER_NAME_MAX}
          required
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${uid}-err` : `${uid}-hint`}
          placeholder={t('namePlaceholder')}
          className="mt-1.5 h-12 w-full rounded-xl border border-night-200 bg-white px-3.5 text-[15px] text-night-900 outline-none placeholder:text-night-400 focus:border-leaf-500 focus-visible:ring-2 focus-visible:ring-leaf-400"
        />
        {error ? (
          <p id={`${uid}-err`} role="alert" className="mt-1.5 text-[12.5px] font-semibold text-alert-600">{error}</p>
        ) : (
          <p id={`${uid}-hint`} className="mt-1.5 text-[12px] text-night-500">{t('nameMax', { max: FOLDER_NAME_MAX })}</p>
        )}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={onClose} className={btn({ variant: 'secondary' })}>{tc('cancel')}</button>
          <button type="submit" disabled={busy} className={btn({ variant: 'primary' })}>
            {busy && <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />}
            {submitLabel}
          </button>
        </div>
      </form>
    </Sheet>
  )
}

/* ---- Choix d'un emplacement -------------------------------------------------- */

export function FolderPickerSheet({ open, onClose, title, description, folders, shares = [], initial, exclude, confirmLabel, onConfirm }: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  /** Dossiers proposés (les miens uniquement). */
  folders: VaultFolder[]
  /** Partages de mes dossiers : un dossier visible par l'autre parent est signalé. */
  shares?: FolderShare[]
  initial: string | null
  /** Dossiers à ne pas proposer (ex. le dossier courant et ses descendants). */
  exclude?: Set<string>
  confirmLabel: string
  /** Renvoie un message d'erreur à afficher, ou null si c'est fait. */
  onConfirm: (folderId: string | null) => Promise<string | null>
}) {
  const t = useTranslations('vault.folders')
  const tc = useTranslations('vault.common')
  const uid = useId()
  const [value, setValue] = useState<string>(initial ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const tree = flattenFolders(folders.filter((f) => f.mine)).filter((f) => !exclude?.has(f.id))

  useEffect(() => {
    if (open) { setValue(initial ?? ''); setError(null); setBusy(false) }
  }, [open, initial])

  const confirm = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const err = await onConfirm(value || null)
    setBusy(false)
    if (err) setError(err)
  }

  const option = (id: string, label: string, depth: number, icon: 'root' | 'folder') => {
    const audience = id ? folderAudience(folders, shares, id) : []
    return (
    <label
      key={id || 'root'}
      className={cn(
        'flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl px-2 hover:bg-night-50/70',
        value === id && 'bg-leaf-50/70',
      )}
      style={{ paddingLeft: `${0.5 + depth * 1.25}rem` }}
    >
      {icon === 'root'
        ? <FolderLock className="h-5 w-5 shrink-0 text-leaf-600" aria-hidden="true" />
        : <Folder className="h-5 w-5 shrink-0 text-night-600" aria-hidden="true" />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold text-night-900">{label}</span>
        {audience.length > 0 && (
          <span className="block truncate text-[11.5px] font-semibold text-iris-700">{t('sharedWith', { names: audience.join(', ') })}</span>
        )}
      </span>
      <input
        type="radio"
        name={`${uid}-dest`}
        value={id}
        checked={value === id}
        onChange={() => setValue(id)}
        className="h-5 w-5 shrink-0 accent-leaf-500"
        {...(value === id ? { 'data-autofocus': true } : {})}
      />
    </label>
    )
  }

  return (
    <Sheet open={open} onClose={onClose} title={title} description={description}>
      <form onSubmit={(e) => void confirm(e)}>
        <fieldset>
          <legend className="sr-only">{t('locationLegend')}</legend>
          <div className="max-h-[48dvh] space-y-0.5 overflow-y-auto">
            {option('', t('rootOption'), 0, 'root')}
            {tree.map((f) => option(f.id, f.name, f.depth + 1, 'folder'))}
          </div>
        </fieldset>
        {tree.length === 0 && (
          <p className="mt-2 text-[12.5px] text-night-500">{t('noFolders')}</p>
        )}
        {error && <p role="alert" className="mt-3 text-[12.5px] font-semibold text-alert-600">{error}</p>}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={onClose} className={btn({ variant: 'secondary' })}>{tc('cancel')}</button>
          <button type="submit" disabled={busy} className={btn({ variant: 'primary' })}>
            {busy && <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />}
            {confirmLabel}
          </button>
        </div>
      </form>
    </Sheet>
  )
}

/* ---- Partage avec un parent lié -------------------------------------------------- */

export function ShareFolderSheet({ open, onClose, folder, parents, parentsError, onRetryParents, shares, onShare, onUnshare }: {
  open: boolean
  onClose: () => void
  folder: VaultFolder | null
  /** Parents liés (listLinkedParents) ; null pendant le chargement. */
  parents: LinkedParent[] | null
  /** Échec du chargement des parents liés (distinct de « aucun parent lié »). */
  parentsError?: string | null
  onRetryParents?: () => void
  /** Partages actifs de CE dossier. */
  shares: FolderShare[]
  /** Renvoient le message de confirmation affiché dans la feuille. */
  onShare: (parent: LinkedParent) => Promise<string>
  onUnshare: (share: FolderShare) => Promise<string>
}) {
  const t = useTranslations('vault.folders')
  const tc = useTranslations('vault.common')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => { if (open) { setBusyId(null); setError(null); setStatus(null) } }, [open])

  const run = async (id: string, fn: () => Promise<string>) => {
    if (busyId) return
    setBusyId(id)
    setError(null)
    setStatus(null)
    try {
      setStatus(await fn())
    } catch (e) {
      setError(e instanceof Error ? e.message : t('opFailed'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={folder ? t('shareTitle', { name: folder.name }) : t('shareTitleGeneric')}
      description={t('shareDescription')}
    >
      {parentsError ? (
        <div role="alert" className="rounded-xl border border-alert-100 bg-alert-50 p-4 text-[13px] text-alert-600">
          <p className="font-bold">{t('parentsUnavailable')}</p>
          <p className="mt-1">{parentsError}</p>
          {onRetryParents && (
            <button type="button" onClick={onRetryParents} className={cn(btn({ variant: 'secondary', size: 'sm', full: false }), 'mt-3')}>
              {tc('retry')}
            </button>
          )}
        </div>
      ) : parents === null ? (
        <p role="status" className="flex items-center gap-2 text-[13px] text-night-600">
          <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> {t('parentsLoading')}
        </p>
      ) : parents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-night-200 p-4 text-[13px] text-night-600">
          <p className="font-bold text-night-900">{t('noParentTitle')}</p>
          <p className="mt-1">{t('noParentText')}</p>
        </div>
      ) : (
        <ul className="divide-y divide-night-100" aria-label={t('parentsList')}>
          {parents.map((p) => {
            const share = shares.find((s) => s.granteeId === p.userId)
            const busy = busyId === p.userId
            return (
              <li key={p.userId} className="flex min-h-[60px] items-center gap-3 py-2">
                <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-leaf-50 text-leaf-700">
                  <Users className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold text-night-900">{[p.prenom, p.nom].filter(Boolean).join(' ')}</span>
                  <span className="block text-[12px] text-night-500">{share ? t('hasAccess') : t('noAccess')}</span>
                </span>
                {/* Un seul bouton par parent (jamais `disabled`) : le focus reste dessus quand
                    l'action change de « Partager » à « Arrêter ». */}
                <button
                  type="button"
                  aria-disabled={busy || undefined}
                  aria-busy={busy || undefined}
                  onClick={() => void run(p.userId, () => (share ? onUnshare(share) : onShare(p)))}
                  className={cn(
                    btn({ variant: share ? 'dangerOutline' : 'primary', size: 'sm', full: false }),
                    busy && 'cursor-wait opacity-70',
                  )}
                  aria-label={share ? t('stopShareAria', { name: p.prenom }) : t('shareWithAria', { name: p.prenom })}
                >
                  {busy && <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />}
                  {share ? t('stop') : tc('share')}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {error && <p role="alert" className="mt-3 text-[12.5px] font-semibold text-alert-600">{error}</p>}
      {status && <p role="status" className="mt-3 text-[12.5px] font-semibold text-leaf-700">{status}</p>}
      <button type="button" onClick={onClose} className={cn(btn({ variant: 'secondary' }), 'mt-5')}>{tc('close')}</button>
    </Sheet>
  )
}
