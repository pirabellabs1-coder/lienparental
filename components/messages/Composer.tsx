'use client'

import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'
import { FileText, FolderLock, Loader2, Mic, Paperclip, SendHorizontal, Sparkles, Square, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { ALLOWED_ATTACHMENT_MIME, MAX_BODY_CHARS, durationLabel } from '@/lib/messages'
import { AudioPlayer } from './AudioPlayer'
import { sizeLabel } from './format'
import { useVoiceRecorder, voiceSupported, type VoiceClip } from './useVoiceRecorder'

type Props = {
  value: string
  onChange: (v: string) => void
  file: File | null
  onPickFile: (f: File | null) => void
  toneCheck: boolean
  onToneCheckChange: (v: boolean) => void
  onSubmit: () => void
  /** Envoi d'une note vocale ; renvoie true si elle est partie. */
  onSendVoice: (clip: VoiceClip) => Promise<boolean>
  busy: 'idle' | 'checking' | 'sending'
  error: string | null
  textareaRef: RefObject<HTMLTextAreaElement | null>
  /** Catégories du coffre-fort proposées pour ranger la pièce jointe (vide : rangement automatique désactivé, 0420). */
  vaultCategories: string[]
  vaultCategory: string
  onVaultCategoryChange: (v: string) => void
  /** Destinataires (« Thomas »), pour les textes d'aide. */
  recipients: string
  announce: (msg: string) => void
}

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400 focus-visible:ring-offset-2'
const iconBtn = cn('inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-night-700 hover:bg-night-50 disabled:opacity-50', focusRing)
/** Au-delà de cette durée d'appui, relâcher le bouton arrête l'enregistrement (mode « maintien »). */
const HOLD_MS = 600

/** Zone de saisie : texte, pièce jointe, note vocale, « Vérification du ton », envoi. */
export function Composer({
  value, onChange, file, onPickFile, toneCheck, onToneCheckChange, onSubmit, onSendVoice, busy, error, textareaRef,
  vaultCategories, vaultCategory, onVaultCategoryChange, recipients, announce,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const voiceRef = useRef<HTMLDivElement>(null)
  const micRef = useRef<HTMLButtonElement>(null)
  const uid = useId()
  const errorId = `${uid}-err`
  const hintId = `${uid}-hint`
  const toneId = `${uid}-tone`
  const disabled = busy !== 'idle'
  const canSend = !disabled && (value.trim().length > 0 || file !== null)
  const [holding, setHolding] = useState(false)
  const [canRecord, setCanRecord] = useState(true)

  const voice = useVoiceRecorder({
    onAutoStop: () => announce('Durée maximale de 3 minutes atteinte : enregistrement arrêté.'),
  })
  const voiceMode = voice.phase !== 'idle'

  useEffect(() => { setCanRecord(voiceSupported()) }, [])

  // Hauteur automatique (bornée) du champ.
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`
  }, [value, textareaRef, voiceMode])

  // Focus et annonces aux changements d'étape de l'enregistrement.
  const prevPhase = useRef(voice.phase)
  useEffect(() => {
    const prev = prevPhase.current
    prevPhase.current = voice.phase
    if (prev === voice.phase) return
    if (voice.phase === 'recording') {
      announce('Enregistrement en cours. 3 minutes maximum.')
      requestAnimationFrame(() => voiceRef.current?.querySelector<HTMLElement>('[data-voice-focus]')?.focus())
    } else if (voice.phase === 'preview' && voice.clip) {
      announce(`Note vocale de ${durationLabel(voice.clip.durationMs)} prête. Réécoutez-la avant de l'envoyer.`)
      requestAnimationFrame(() => voiceRef.current?.querySelector<HTMLElement>('[data-voice-focus-wrap] button')?.focus())
    } else if (voice.phase === 'idle' && (prev === 'preview' || prev === 'recording')) {
      requestAnimationFrame(() => micRef.current?.focus())
    }
  }, [voice.phase, voice.clip, announce])

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (voiceMode) return
    if (canSend) onSubmit()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit() }
  }

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    onPickFile(e.target.files?.[0] ?? null)
    e.target.value = ''
  }

  // Micro : appui bref = démarrer (puis « Arrêter ») ; maintien = enregistrer tant que le doigt reste posé.
  const onMicPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || disabled) return
    e.preventDefault()
    setHolding(true)
    const up = () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      setHolding(false)
      const started = voice.startedAt()
      if (started > 0 && performance.now() - started >= HOLD_MS) voice.stop()
    }
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    void voice.start()
  }

  const sendVoice = async () => {
    if (!voice.clip) return
    const ok = await onSendVoice(voice.clip)
    if (ok) voice.reset()
  }

  const shownError = error ?? voice.error
  const showVault = (file !== null || voice.phase === 'preview') && vaultCategories.length > 0

  return (
    <form onSubmit={submit} className="rounded-2xl border border-night-100 bg-white p-2.5 shadow-[0_-8px_24px_-18px_rgba(11,45,91,0.25)]" aria-label="Écrire un message">
      {file && !voiceMode && <FileChip file={file} onRemove={() => onPickFile(null)} />}

      {voiceMode ? (
        <div ref={voiceRef} className="flex items-center gap-2" role="group" aria-label="Note vocale">
          <button
            type="button"
            onClick={voice.cancel}
            disabled={disabled}
            aria-label={voice.phase === 'preview' ? 'Supprimer la note vocale' : "Annuler l'enregistrement"}
            className={cn(iconBtn, 'text-alert-600 hover:bg-alert-50')}
          >
            <Trash2 className="h-5 w-5" aria-hidden="true" />
          </button>

          {voice.phase === 'preview' && voice.clip ? (
            <>
              <div className="min-w-0 flex-1 rounded-xl bg-night-50/70 px-2 py-1.5" data-voice-focus-wrap>
                <AudioPlayer
                  src={voice.clip.url}
                  durationMs={voice.clip.durationMs}
                  label={`votre note vocale, ${durationLabel(voice.clip.durationMs)}`}
                  seed={voice.clip.url}
                  tone="mine"
                  className="min-w-0"
                />
              </div>
              <button
                type="button"
                onClick={() => void sendVoice()}
                disabled={disabled}
                aria-label={busy === 'sending' ? 'Envoi en cours' : 'Envoyer la note vocale'}
                className={cn('inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-leaf-500 text-white transition hover:bg-leaf-600 disabled:opacity-50 lg:w-auto lg:px-5', focusRing)}
              >
                {busy === 'sending' ? <Loader2 className="h-5 w-5 motion-safe:animate-spin" aria-hidden="true" /> : <SendHorizontal className="h-5 w-5" aria-hidden="true" />}
                <span className="hidden text-[14px] font-semibold lg:ml-2 lg:inline" aria-hidden="true">Envoyer</span>
              </button>
            </>
          ) : (
            <>
              <RecordingMeter levels={voice.levels} elapsedMs={voice.elapsedMs} requesting={voice.phase === 'requesting'} />
              <button
                type="button"
                onClick={voice.stop}
                disabled={voice.phase !== 'recording'}
                data-voice-focus
                aria-label="Arrêter l'enregistrement et réécouter"
                className={cn('inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-alert-500 text-white transition hover:bg-alert-600 disabled:opacity-60', focusRing)}
              >
                <Square className="h-4 w-4" fill="currentColor" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="flex items-end gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={disabled}
            aria-label="Joindre une image ou un PDF (10 Mo maximum)"
            className={cn(iconBtn, 'mb-0.5')}
          >
            <Paperclip className="h-5 w-5" aria-hidden="true" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={ALLOWED_ATTACHMENT_MIME.join(',')}
            onChange={onFile}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
          />
          {canRecord && (
            <button
              ref={micRef}
              type="button"
              onPointerDown={onMicPointerDown}
              onClick={(e) => { if (e.detail === 0) void voice.start() }}
              onContextMenu={(e) => e.preventDefault()}
              disabled={disabled || file !== null}
              aria-label="Enregistrer une note vocale (3 minutes maximum)"
              aria-describedby={`${uid}-mic-hint`}
              className={cn(iconBtn, 'mb-0.5 touch-none select-none', holding && 'bg-alert-50 text-alert-600')}
            >
              <Mic className="h-5 w-5" aria-hidden="true" />
            </button>
          )}

          <label htmlFor={`${uid}-ta`} className="sr-only">Votre message</label>
          <textarea
            id={`${uid}-ta`}
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            maxLength={MAX_BODY_CHARS}
            placeholder="Écrire un message…"
            aria-describedby={shownError ? `${hintId} ${errorId}` : hintId}
            aria-invalid={error ? true : undefined}
            className="min-h-[48px] min-w-0 flex-1 resize-none rounded-xl border border-night-200 bg-white px-3.5 py-3 text-[15px] leading-snug text-night-900 placeholder:text-night-500 focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-200"
          />

          <button
            type="submit"
            disabled={!canSend}
            aria-label={busy === 'checking' ? 'Vérification du ton en cours' : busy === 'sending' ? 'Envoi en cours' : 'Envoyer'}
            className={cn(
              'inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-leaf-500 text-white transition hover:bg-leaf-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 lg:w-auto lg:px-5',
              focusRing,
            )}
          >
            {busy === 'idle' ? (
              <SendHorizontal className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Loader2 className="h-5 w-5 motion-safe:animate-spin" aria-hidden="true" />
            )}
            <span className="hidden lg:ml-2 lg:inline text-[14px] font-semibold" aria-hidden="true">Envoyer</span>
          </button>
        </div>
      )}

      {showVault && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-leaf-50/60 px-2.5 py-1.5">
          <FolderLock className="h-4 w-4 shrink-0 text-leaf-700" aria-hidden="true" />
          <label htmlFor={`${uid}-cat`} className="text-[12px] font-semibold text-night-800">Ranger dans mon coffre-fort :</label>
          <select
            id={`${uid}-cat`}
            value={vaultCategory}
            onChange={(e) => onVaultCategoryChange(e.target.value)}
            aria-describedby={`${uid}-cat-hint`}
            className="min-h-[44px] rounded-lg border border-night-200 bg-white px-2.5 text-[13px] font-semibold text-night-900 focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-200"
          >
            {vaultCategories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <p id={`${uid}-cat-hint`} className="w-full text-[11px] text-night-600">
            Rangement automatique activé dans vos réglages du coffre-fort. {recipients} ne le reçoit dans son coffre que s’il a activé ce réglage.
          </p>
        </div>
      )}

      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pl-1">
        <label htmlFor={toneId} className="inline-flex min-h-[44px] cursor-pointer items-center gap-2.5 text-[12px] font-semibold text-night-800">
          <span className="relative inline-flex shrink-0">
            <input
              id={toneId}
              type="checkbox"
              role="switch"
              checked={toneCheck}
              onChange={(e) => onToneCheckChange(e.target.checked)}
              className="peer sr-only"
            />
            <span aria-hidden="true" className="h-6 w-10 rounded-full bg-night-200 transition-colors peer-checked:bg-iris-500 peer-focus-visible:ring-2 peer-focus-visible:ring-iris-300 peer-focus-visible:ring-offset-2" />
            <span aria-hidden="true" className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-soft transition-transform duration-200 peer-checked:translate-x-4" />
          </span>
          <Sparkles className="h-3.5 w-3.5 text-iris-600" aria-hidden="true" />
          Vérification du ton
        </label>
        <p id={hintId} className="text-[11px] text-night-600">
          {busy === 'checking'
            ? 'Le Coach IA relit votre message…'
            : voice.phase === 'recording'
              ? holding ? 'Relâchez pour arrêter et réécouter' : 'Appuyez sur le carré rouge pour arrêter'
              : 'Message horodaté, non modifiable après envoi'}
        </p>
        <p id={`${uid}-mic-hint`} className="sr-only">
          Appuyez une fois pour démarrer, puis sur Arrêter. Vous pourrez réécouter la note avant de l&apos;envoyer.
        </p>
      </div>

      <p id={errorId} role="alert" className={cn('px-1 text-[12px] font-semibold text-alert-600', !shownError && 'sr-only')}>
        {shownError ?? ''}
      </p>
    </form>
  )
}

/** Visualisation du niveau sonore + durée (décorative, la durée est annoncée en texte). */
function RecordingMeter({ levels, elapsedMs, requesting }: { levels: number[]; elapsedMs: number; requesting: boolean }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl bg-alert-50/60 px-3 py-2">
      <span aria-hidden="true" className={cn('h-2.5 w-2.5 shrink-0 rounded-full bg-alert-500', !requesting && 'motion-safe:animate-pulse')} />
      <span className="shrink-0 text-[13px] font-bold tabular-nums text-night-900">
        {requesting ? 'Micro…' : durationLabel(elapsedMs)}
        <span className="sr-only"> écoulées sur 3 minutes</span>
      </span>
      <div aria-hidden="true" className="flex h-7 min-w-0 flex-1 items-center gap-[2px] overflow-hidden">
        {levels.map((l, i) => (
          <span
            key={i}
            className="block h-full flex-1 origin-center rounded-full bg-alert-400"
            style={{ transform: `scaleY(${Math.max(0.12, l)})` }}
          />
        ))}
      </div>
      <span aria-hidden="true" className="hidden shrink-0 text-[11px] tabular-nums text-night-600 sm:inline">/ 3:00</span>
    </div>
  )
}

function FileChip({ file, onRemove }: { file: File; onRemove: () => void }) {
  const isImage = file.type.startsWith('image/')
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!isImage) return
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file, isImage])

  return (
    <div className="mb-2 flex items-center gap-3 rounded-xl bg-night-50/70 p-2">
      {isImage && url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-lg object-cover" />
      ) : (
        <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-white text-night-700 ring-1 ring-night-100">
          <FileText className="h-5 w-5" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-night-900">{file.name}</span>
        <span className="block text-[11px] text-night-600">{isImage ? 'Image' : 'PDF'} · {sizeLabel(file.size)}</span>
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Retirer la pièce jointe ${file.name}`}
        className={cn('inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-night-700 hover:bg-white', focusRing)}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}
