'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Check, CheckCheck, FileText, FolderInput, FolderLock, ImageOff, Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { attachmentUrl, durationLabel, vaultDocumentHref, type Message, type MessageAttachment, type VaultLink } from '@/lib/messages'
import { AudioPlayer } from './AudioPlayer'
import { fullStamp, sizeLabel, timeLabel } from './format'

type Props = {
  message: Message
  mine: boolean
  senderName: string
  /** Discussion à plusieurs : nom affiché au-dessus des bulles reçues. */
  showSender?: boolean
  /** État du rangement de la pièce jointe dans VOTRE coffre-fort. */
  vault?: VaultLink
  /** « Mettre au coffre-fort » (ouvre le choix du dossier) ; absent : action masquée. */
  onSaveToVault?: (message: Message) => void
}

/** Bulle de message : vous à droite (vert clair), l'autre parent à gauche (blanc). */
export function MessageBubble({ message, mine, senderName, showSender = false, vault, onSaveToVault }: Props) {
  const read = Boolean(message.readAt)
  const isAudio = message.kind === 'audio' && message.attachment
  return (
    <li className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[85%] lg:max-w-[70%]', mine ? 'items-end' : 'items-start', 'flex flex-col')}>
        {showSender && !mine && (
          <p aria-hidden="true" className="mb-0.5 px-1 text-[11px] font-bold text-night-700">{senderName}</p>
        )}
        <div
          className={cn(
            'rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed text-night-900',
            mine
              ? 'rounded-br-md bg-leaf-50 ring-1 ring-inset ring-leaf-100'
              : 'rounded-bl-md border border-night-100 bg-white shadow-soft',
          )}
        >
          <span className="sr-only">{mine ? 'Vous' : senderName}, {fullStamp(message.createdAt)} : </span>
          {isAudio && message.attachment ? (
            <VoiceView attachment={message.attachment} durationMs={message.audioDurationMs ?? 0} mine={mine} senderName={senderName} seed={message.id} />
          ) : (
            message.attachment && <AttachmentView attachment={message.attachment} />
          )}
          {message.body && (
            <p className={cn('whitespace-pre-wrap break-words', message.attachment && 'mt-2')}>{message.body}</p>
          )}
        </div>
        <p className="mt-1 flex items-center gap-1 px-1 text-[11px] text-night-600">
          <time dateTime={message.createdAt} title={fullStamp(message.createdAt)}>{timeLabel(message.createdAt)}</time>
          {mine && (
            <>
              <span aria-hidden="true">·</span>
              {read ? (
                <span className="inline-flex items-center gap-0.5 font-semibold text-leaf-700" title={message.readAt ? `Lu le ${fullStamp(message.readAt)}` : undefined}>
                  <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  Lu
                </span>
              ) : (
                <span className="inline-flex items-center gap-0.5">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Envoyé
                </span>
              )}
            </>
          )}
        </p>
        {message.attachment && vault && <VaultBadge link={vault} />}
        {message.attachment && onSaveToVault && (!vault || vault.status === 'failed') && (
          <button
            type="button"
            onClick={() => onSaveToVault(message)}
            aria-haspopup="dialog"
            className="mt-0.5 inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-2.5 text-[12px] font-bold text-leaf-700 hover:bg-leaf-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400"
          >
            <FolderInput className="h-4 w-4" aria-hidden="true" />
            Mettre au coffre-fort
            <span className="sr-only"> : {message.kind === 'audio' ? 'note vocale' : message.attachment.name}</span>
          </button>
        )}
      </div>
    </li>
  )
}

/** Pièce jointe rangée (ou en cours de rangement) dans VOTRE coffre-fort. */
function VaultBadge({ link }: { link: VaultLink }) {
  if (link.status === 'done' && link.documentId) {
    return (
      <Link
        href={vaultDocumentHref(link.documentId)}
        className="mt-0.5 inline-flex min-h-[32px] items-center gap-1 rounded-full px-2 text-[11px] font-semibold text-leaf-700 hover:bg-leaf-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400"
      >
        <FolderLock className="h-3.5 w-3.5" aria-hidden="true" />
        Dans le coffre-fort · {link.categoryName}
        <span className="sr-only"> (ouvrir le document)</span>
      </Link>
    )
  }
  return (
    <p className="mt-0.5 inline-flex items-center gap-1 px-2 text-[11px] text-night-600">
      {link.status === 'pending'
        ? <><Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" /> Ajout au coffre-fort…</>
        : <><FolderLock className="h-3.5 w-3.5" aria-hidden="true" /> Ajout automatique au coffre-fort non abouti</>}
    </p>
  )
}

function VoiceView({ attachment, durationMs, mine, senderName, seed }: {
  attachment: MessageAttachment; durationMs: number; mine: boolean; senderName: string; seed: string
}) {
  const [url, setUrl] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    attachmentUrl(attachment).then((u) => { if (alive) setUrl(u) }).catch(() => { if (alive) setUrl(null) })
    return () => { alive = false }
  }, [attachment])
  return (
    <AudioPlayer
      src={url}
      durationMs={durationMs}
      label={`note vocale ${mine ? 'envoyée' : `de ${senderName}`}, ${durationLabel(durationMs)}`}
      seed={seed}
      tone={mine ? 'mine' : 'theirs'}
      className="w-[min(260px,62vw)]"
    />
  )
}

function AttachmentView({ attachment }: { attachment: MessageAttachment }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined)
  const isImage = attachment.mime.startsWith('image/')

  useEffect(() => {
    let alive = true
    attachmentUrl(attachment).then((u) => { if (alive) setUrl(u) }).catch(() => { if (alive) setUrl(null) })
    return () => { alive = false }
  }, [attachment])

  if (isImage && url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block overflow-hidden rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400"
      >
        {/* Dimensions réservées : pas de décalage de mise en page au chargement. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={`Pièce jointe : ${attachment.name}`} width={224} height={160} loading="lazy" className="h-40 w-56 max-w-full bg-night-50 object-cover" />
        <span className="sr-only">(ouvre dans un nouvel onglet)</span>
      </a>
    )
  }

  const Icon = isImage ? ImageOff : FileText
  const body = (
    <>
      <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-night-700 ring-1 ring-night-100">
        <Icon className="h-5 w-5" strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-night-900">{attachment.name}</span>
        <span className="block text-[11px] text-night-600">
          {attachment.mime === 'application/pdf' ? 'PDF' : 'Image'}
          {attachment.size > 0 ? ` · ${sizeLabel(attachment.size)}` : ''}
          {url === null ? ' · aperçu indisponible en démonstration' : ''}
        </span>
      </span>
    </>
  )

  return url ? (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex min-h-[44px] items-center gap-3 rounded-xl bg-night-50/70 p-2 pr-3 hover:bg-night-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400"
    >
      {body}
      <span className="sr-only">(ouvre dans un nouvel onglet)</span>
    </a>
  ) : (
    <div className="flex items-center gap-3 rounded-xl bg-night-50/70 p-2 pr-3">{body}</div>
  )
}
