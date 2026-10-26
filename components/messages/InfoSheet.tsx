'use client'

import { Archive, ArchiveRestore, Clock3, FileDown, FolderLock, Loader2, Lock, Sparkles } from 'lucide-react'
import { cn } from '@/lib/cn'
import { btn } from '@/components/ui/kit'
import { displayName, type Participant } from '@/lib/messages'
import { Sheet } from './Sheet'
import { Avatar } from './Avatar'

type Props = {
  open: boolean
  onClose: () => void
  me: Participant
  /** Autres participants. */
  participants: Participant[]
  title: string | null
  count: number
  exporting: boolean
  onExport: () => void
  archived: boolean
  archiving: boolean
  onToggleArchive: () => void
}

export function InfoSheet({ open, onClose, me, participants, title, count, exporting, onExport, archived, archiving, onToggleArchive }: Props) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Informations sur la conversation"
      description={title ? `Sujet : ${title}` : undefined}
    >
      <ul className="space-y-2" aria-label="Participants">
        {[{ p: me, role: 'Vous' }, ...participants.map((p) => ({ p, role: 'Parent lié' }))].map(({ p, role }) => (
          <li key={p.id} className="flex items-center gap-3 rounded-xl bg-night-50/60 p-3">
            <Avatar person={p} size="sm" />
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-bold text-night-900">{displayName(p)}</span>
              <span className="block text-xs text-night-600">{role}</span>
            </span>
          </li>
        ))}
      </ul>

      <ul className="mt-4 space-y-3">
        <li className="flex gap-3">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" aria-hidden="true" />
          <p className="text-[13px] text-night-800">
            <span className="font-bold">Les messages ne peuvent être ni modifiés ni supprimés.</span>{' '}
            Cela garantit leur valeur de preuve, pour vous comme pour les autres participants.
          </p>
        </li>
        <li className="flex gap-3">
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-night-700" aria-hidden="true" />
          <p className="text-[13px] text-night-800">Chaque message est horodaté au moment de son envoi. La mention « Lu » indique qu&apos;un destinataire a ouvert la conversation.</p>
        </li>
        <li className="flex gap-3">
          <FolderLock className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" aria-hidden="true" />
          <p className="text-[13px] text-night-800">Documents, photos et notes vocales échangés ici sont ajoutés automatiquement au coffre-fort de chaque participant, sans doublon.</p>
        </li>
        <li className="flex gap-3">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-iris-600" aria-hidden="true" />
          <p className="text-[13px] text-night-800">La vérification du ton propose une reformulation avant l&apos;envoi. Elle ne bloque jamais votre message.</p>
        </li>
      </ul>

      <button type="button" onClick={onExport} disabled={exporting || count === 0} className={cn(btn.primary, 'mt-5 w-full')} data-autofocus>
        {exporting ? <Loader2 className="h-5 w-5 motion-safe:animate-spin" aria-hidden="true" /> : <FileDown className="h-5 w-5" aria-hidden="true" />}
        {exporting ? 'Préparation du PDF…' : 'Exporter la conversation en PDF'}
      </button>
      <p className="mt-2 text-center text-[11px] text-night-600">
        {count} message{count > 1 ? 's' : ''} · à joindre à votre dossier
      </p>

      <button type="button" onClick={onToggleArchive} disabled={archiving} className={cn(btn.secondary, 'mt-3 w-full')}>
        {archiving
          ? <Loader2 className="h-5 w-5 motion-safe:animate-spin" aria-hidden="true" />
          : archived ? <ArchiveRestore className="h-5 w-5" aria-hidden="true" /> : <Archive className="h-5 w-5" aria-hidden="true" />}
        {archived ? 'Ressortir des archives' : 'Archiver la conversation'}
      </button>
      <p className="mt-2 text-center text-[11px] text-night-600">
        L&apos;archivage range la conversation pour vous seul. Rien n&apos;est supprimé.
      </p>
    </Sheet>
  )
}
