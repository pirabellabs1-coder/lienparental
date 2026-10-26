'use client'

import Link from 'next/link'
import { Archive, ArchiveRestore, Loader2, Mic, Paperclip } from 'lucide-react'
import { cn } from '@/lib/cn'
import { conversationLabel, participantsLabel, previewText, type ConversationSummary } from '@/lib/messages'
import { AvatarStack } from './Avatar'
import { shortStamp } from './format'

type Props = {
  conversation: ConversationSummary
  meId: string
  busy: boolean
  onToggleArchive: () => void
}

/** Ligne de la liste : lien vers la conversation + bouton d'archivage (jamais imbriqués). */
export function ConversationRow({ conversation: c, meId, busy, onToggleArchive }: Props) {
  const label = conversationLabel(c)
  const last = c.lastMessage
  const unread = c.unread > 0
  const preview = last ? previewText(last) : 'Aucun message pour le moment'
  const KindIcon = last?.kind === 'audio' ? Mic : last?.kind === 'attachment' ? Paperclip : null

  return (
    <li className="flex items-center gap-1 pr-1.5">
      <Link
        href={`/app/messages/${encodeURIComponent(c.id)}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-3 transition-colors hover:bg-night-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-leaf-400"
      >
        <AvatarStack people={c.participants} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={cn('truncate text-[14px] text-night-900', unread ? 'font-extrabold' : 'font-bold')}>{label}</span>
            {last && (
              <time dateTime={last.createdAt} className={cn('shrink-0 text-[11px]', unread ? 'font-bold text-leaf-700' : 'text-night-600')}>
                {shortStamp(last.createdAt)}
              </time>
            )}
          </span>
          {c.title && (
            <span className="block truncate text-[12px] text-night-600">Avec {participantsLabel(c.participants)}</span>
          )}
          <span className="mt-0.5 flex items-center gap-2">
            <span className={cn('flex min-w-0 flex-1 items-center gap-1 text-[13px]', unread ? 'font-semibold text-night-900' : 'text-night-600')}>
              {KindIcon && <KindIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
              <span className="truncate">{last && last.senderId === meId ? 'Vous : ' : ''}{preview}</span>
            </span>
            {unread && (
              <span className="inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-leaf-500 px-1.5 text-[11px] font-bold text-white">
                {c.unread}
                <span className="sr-only"> message{c.unread > 1 ? 's' : ''} non lu{c.unread > 1 ? 's' : ''}</span>
              </span>
            )}
          </span>
        </span>
      </Link>
      <button
        type="button"
        onClick={onToggleArchive}
        disabled={busy}
        aria-label={c.archived ? `Ressortir des archives : ${label}` : `Archiver : ${label}`}
        title={c.archived ? 'Ressortir des archives' : 'Archiver'}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-night-600 hover:bg-night-50 hover:text-night-900 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400"
      >
        {busy
          ? <Loader2 className="h-[18px] w-[18px] motion-safe:animate-spin" aria-hidden="true" />
          : c.archived ? <ArchiveRestore className="h-[18px] w-[18px]" aria-hidden="true" /> : <Archive className="h-[18px] w-[18px]" aria-hidden="true" />}
      </button>
    </li>
  )
}
