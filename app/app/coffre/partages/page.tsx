'use client'

import { useEffect, useState } from 'react'
import { TopBar } from '@/components/mobile/TopBar'
import { Card } from '@/components/ui/Card'
import { Button, ConfirmDialog, EmptyState } from '@/components/ui'
import { Share2, FileText, Clock, Trash2 } from 'lucide-react'
import { LoadingState } from '@/components/mobile/StateScreens'
import { useAnnounce } from '@/components/coffre/useAnnounce'
import { LIVE, useAsyncData } from '@/lib/data/core'
import { expiresInLabel, listActiveShares, revokeShare, type ShareItem } from '@/lib/data/vault'

type Share = {
  id: string
  docName: string
  recipient: string
  expiresIn: string
}

const INITIAL: Share[] = [
  { id: 's1', docName: 'Jugement JAF 2024-03.pdf', recipient: 'Me Dupont (avocat)', expiresIn: 'Expire dans 2 jours' },
  { id: 's2', docName: 'Bulletin scolaire T1.pdf', recipient: 'school@ecoledulac.fr', expiresIn: 'Expire dans 7 jours' },
  { id: 's3', docName: 'Attestation hébergement.docx', recipient: 'camille.m@gmail.com', expiresIn: 'Expire dans 15 min' },
]

export default function PartagesPage() {
  // Supabase : shares actifs (non révoqués, non expirés ; RLS) ; démo : liste fictive locale.
  const live = useAsyncData<ShareItem[]>(LIVE ? listActiveShares : () => Promise.resolve([]), `shares:${LIVE}`)
  const [shares, setShares] = useState<Share[]>(LIVE ? [] : INITIAL)
  const [toRevoke, setToRevoke] = useState<Share | null>(null)
  const { announce, node } = useAnnounce()

  useEffect(() => {
    if (!LIVE || !live.data) return
    setShares(live.data.map((s) => ({ id: s.id, docName: s.docName, recipient: s.label ?? 'Lien sécurisé', expiresIn: expiresInLabel(s.expiresAt) })))
  }, [live.data])

  const revoke = async () => {
    if (!toRevoke) return
    if (LIVE) {
      try {
        await revokeShare(toRevoke.id)
        announce('Lien révoqué')
      } catch (e) {
        announce(e instanceof Error ? e.message : 'Révocation impossible')
        setToRevoke(null)
        return
      }
    }
    setShares((xs) => xs.filter((s) => s.id !== toRevoke.id))
    setToRevoke(null)
  }

  return (
    <>
      <TopBar title="Partages actifs" showBack backHref="/app/coffre" />
      <div className="w-full px-5 pb-6 pt-4 space-y-4">
        {LIVE && live.loading ? (
          <LoadingState compact title="Chargement des partages" description="" />
        ) : LIVE && live.error ? (
          <p role="alert" className="rounded-xl2 border border-alert-100 bg-alert-50 p-4 text-sm text-alert-600">{live.error.message}</p>
        ) : shares.length === 0 ? (
          <EmptyState
            icon={<Share2 className="h-6 w-6" />}
            title="Aucun partage actif"
            description="Les liens signés que vous générez apparaîtront ici."
          />
        ) : (
          <>
            <p className="text-sm text-night-600">
              {shares.length} lien{shares.length > 1 ? 's' : ''} actif{shares.length > 1 ? 's' : ''}.
              Les destinataires accèdent au document jusqu&rsquo;à expiration.
            </p>
            <ul className="space-y-2.5">
              {shares.map((s) => (
                <li key={s.id}>
                  <Card className="p-3.5 space-y-2.5">
                    <div className="flex items-start gap-3">
                      <span
                        className="h-11 w-11 rounded-xl2 bg-iris-50 text-iris-600 flex items-center justify-center shrink-0"
                        aria-hidden="true"
                      >
                        <FileText className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-night-900 truncate">{s.docName}</p>
                        <p className="text-xs text-night-600 truncate">Pour : {s.recipient}</p>
                        <p className="text-xs text-night-500 mt-1 inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" aria-hidden="true" /> {s.expiresIn}
                        </p>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button variant="secondary" size="sm" onClick={() => setToRevoke(s)}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" /> Révoquer
                      </Button>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <ConfirmDialog
        open={toRevoke !== null}
        onClose={() => setToRevoke(null)}
        onConfirm={revoke}
        title="Révoquer ce lien ?"
        description={toRevoke
          ? `Le lien vers « ${toRevoke.docName} » cessera immédiatement de fonctionner.`
          : ''}
        confirmLabel="Révoquer"
        tone="danger"
      />
      {node}
    </>
  )
}
