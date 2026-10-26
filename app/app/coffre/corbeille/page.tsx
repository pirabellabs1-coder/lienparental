'use client'

import { useEffect, useState } from 'react'
import { TopBar } from '@/components/mobile/TopBar'
import { Card } from '@/components/ui/Card'
import { Button, ConfirmDialog, EmptyState } from '@/components/ui'
import { Trash2, FileText, Info, RotateCcw } from 'lucide-react'
import { LoadingState } from '@/components/mobile/StateScreens'
import { useTrashedDocs } from '@/components/coffre/store'
import { useAnnounce } from '@/components/coffre/useAnnounce'
import { LIVE } from '@/lib/data/core'
import { TRASH_RETENTION_DAYS, purgeDocument, restoreDocument, type VaultDocumentRecord } from '@/lib/data/vault'

type TrashedDoc = {
  id: string
  name: string
  mime: string
  deletedAt: string
  daysLeft: number
  /** Supabase : document source (chemin Storage pour la purge). */
  record?: VaultDocumentRecord
}

function toTrashed(d: VaultDocumentRecord, now = Date.now()): TrashedDoc {
  const at = new Date(d.deletedAt ?? now)
  const left = Math.max(0, TRASH_RETENTION_DAYS - Math.floor((now - at.getTime()) / 86_400_000))
  return {
    id: d.id,
    name: d.name,
    mime: d.ext.toLowerCase(),
    deletedAt: at.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }),
    daysLeft: left,
    record: d,
  }
}

const INITIAL: TrashedDoc[] = [
  { id: 't1', name: 'Ancien RIB.pdf', mime: 'pdf', deletedAt: '12 oct. 2026', daysLeft: 18 },
  { id: 't2', name: 'Facture cantine 2024.pdf', mime: 'pdf', deletedAt: '03 oct. 2026', daysLeft: 9 },
  { id: 't3', name: 'Scan carte vitale (ancien).jpg', mime: 'jpg', deletedAt: '28 sept. 2026', daysLeft: 4 },
]

export default function CorbeillePage() {
  // Supabase : documents.deleted_at non nul (RLS) ; démo : liste fictive locale.
  const trash = useTrashedDocs()
  const [docs, setDocs] = useState<TrashedDoc[]>(LIVE ? [] : INITIAL)
  const [toDelete, setToDelete] = useState<TrashedDoc | null>(null)
  const { announce, node } = useAnnounce()

  useEffect(() => {
    if (LIVE && trash.data) setDocs(trash.data.map((d) => toTrashed(d)))
  }, [trash.data])

  const restore = async (id: string) => {
    if (LIVE) {
      try {
        await restoreDocument(id)
        announce('Document restauré')
      } catch (e) {
        announce(e instanceof Error ? e.message : 'Restauration impossible')
        return
      }
    }
    setDocs((xs) => xs.filter((d) => d.id !== id))
  }
  const purge = async () => {
    if (!toDelete) return
    if (LIVE) {
      try {
        await purgeDocument({ id: toDelete.id, storagePath: toDelete.record?.storagePath })
        announce('Document supprimé définitivement')
      } catch (e) {
        announce(e instanceof Error ? e.message : 'Suppression impossible')
        setToDelete(null)
        return
      }
    }
    setDocs((xs) => xs.filter((d) => d.id !== toDelete.id))
    setToDelete(null)
  }

  return (
    <>
      <TopBar title="Corbeille" showBack backHref="/app/coffre" />
      <div className="w-full px-5 pb-6 pt-4 space-y-4">
        <div
          role="note"
          className="flex items-start gap-3 rounded-xl2 border border-night-100 bg-night-50 p-3 text-sm text-night-700"
        >
          <Info className="h-4 w-4 text-night-500 mt-0.5 shrink-0" aria-hidden="true" />
          <p>
            Conservation 30 jours. Passé ce délai, les documents sont supprimés
            définitivement et ne peuvent plus être restaurés.
          </p>
        </div>

        {LIVE && trash.loading ? (
          <LoadingState compact title="Chargement de la corbeille" description="" />
        ) : LIVE && trash.error ? (
          <p role="alert" className="rounded-xl2 border border-alert-100 bg-alert-50 p-4 text-sm text-alert-600">{trash.error.message}</p>
        ) : docs.length === 0 ? (
          <EmptyState
            icon={<Trash2 className="h-6 w-6" />}
            title="Corbeille vide"
            description="Les documents supprimés apparaîtront ici pendant 30 jours."
          />
        ) : (
          <ul className="space-y-2.5">
            {docs.map((d) => (
              <li key={d.id}>
                <Card className="p-3.5 space-y-2.5">
                  <div className="flex items-start gap-3">
                    <span
                      className="h-11 w-11 rounded-xl2 bg-night-50 text-night-700 flex items-center justify-center shrink-0 text-[10px] font-bold uppercase"
                      aria-hidden="true"
                    >
                      {d.mime}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-night-900 truncate">{d.name}</p>
                      <p className="text-xs text-night-600">Supprimé le {d.deletedAt}</p>
                      <p className="text-xs text-alert-500 mt-1">
                        Expire dans {d.daysLeft} jour{d.daysLeft > 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" size="sm" onClick={() => void restore(d.id)}>
                      <RotateCcw className="h-4 w-4" aria-hidden="true" /> Restaurer
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => setToDelete(d)}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" /> Supprimer
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={purge}
        title="Supprimer définitivement ?"
        description={toDelete
          ? `« ${toDelete.name} » sera supprimé immédiatement et ne pourra plus être récupéré.`
          : ''}
        confirmLabel="Supprimer définitivement"
        tone="danger"
      />
      {node}
    </>
  )
}
