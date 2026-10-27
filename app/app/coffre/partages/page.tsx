'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { TopBar } from '@/components/mobile/TopBar'
import { Card } from '@/components/ui/Card'
import { Button, ConfirmDialog, EmptyState } from '@/components/ui'
import { Share2, FileText, Clock, Trash2 } from 'lucide-react'
import { LoadingState } from '@/components/mobile/StateScreens'
import { useAnnounce } from '@/components/coffre/useAnnounce'
import { LIVE, useAsyncData } from '@/lib/data/core'
import { listActiveShares, revokeShare, type ShareItem } from '@/lib/data/vault'

/** Échéance d'un lien (même calcul que expiresInLabel de lib/data/vault), traduite au rendu. */
type Expiry = { unit: 'expired' | 'min' | 'h' | 'days'; n: number }

function expiryOf(iso: string, now = Date.now()): Expiry {
  const ms = new Date(iso).getTime() - now
  if (ms <= 0) return { unit: 'expired', n: 0 }
  const min = Math.round(ms / 60_000)
  if (min < 60) return { unit: 'min', n: min }
  const h = Math.round(min / 60)
  if (h < 48) return { unit: 'h', n: h }
  return { unit: 'days', n: Math.round(h / 24) }
}

type Share = {
  id: string
  docName: string
  /** null : lien sans libellé (« Lien sécurisé »). */
  recipient: string | null
  expiresIn: Expiry
}

const INITIAL: Share[] = [
  { id: 's1', docName: 'Jugement JAF 2024-03.pdf', recipient: 'Me Dupont (avocat)', expiresIn: { unit: 'days', n: 2 } },
  { id: 's2', docName: 'Bulletin scolaire T1.pdf', recipient: 'school@ecoledulac.fr', expiresIn: { unit: 'days', n: 7 } },
  { id: 's3', docName: 'Attestation hébergement.docx', recipient: 'camille.m@gmail.com', expiresIn: { unit: 'min', n: 15 } },
]

export default function PartagesPage() {
  // Supabase : shares actifs (non révoqués, non expirés ; RLS) ; démo : liste fictive locale.
  const t = useTranslations('vault.shares')
  const live = useAsyncData<ShareItem[]>(LIVE ? listActiveShares : () => Promise.resolve([]), `shares:${LIVE}`)
  const [shares, setShares] = useState<Share[]>(LIVE ? [] : INITIAL)
  const [toRevoke, setToRevoke] = useState<Share | null>(null)
  const { announce, node } = useAnnounce()

  useEffect(() => {
    if (!LIVE || !live.data) return
    setShares(live.data.map((s) => ({ id: s.id, docName: s.docName, recipient: s.label ?? null, expiresIn: expiryOf(s.expiresAt) })))
  }, [live.data])

  const revoke = async () => {
    if (!toRevoke) return
    if (LIVE) {
      try {
        await revokeShare(toRevoke.id)
        announce(t('revoked'))
      } catch (e) {
        announce(e instanceof Error ? e.message : t('revokeFailed'))
        setToRevoke(null)
        return
      }
    }
    setShares((xs) => xs.filter((s) => s.id !== toRevoke.id))
    setToRevoke(null)
  }

  return (
    <>
      <TopBar title={t('title')} showBack backHref="/app/coffre" />
      <div className="w-full px-5 pb-6 pt-4 space-y-4">
        {LIVE && live.loading ? (
          <LoadingState compact title={t('loading')} description="" />
        ) : LIVE && live.error ? (
          <p role="alert" className="rounded-xl2 border border-alert-100 bg-alert-50 p-4 text-sm text-alert-600">{live.error.message}</p>
        ) : shares.length === 0 ? (
          <EmptyState
            icon={<Share2 className="h-6 w-6" />}
            title={t('emptyTitle')}
            description={t('emptyText')}
          />
        ) : (
          <>
            <p className="text-sm text-night-600">
              {t('activeCount', { count: shares.length })} {t('activeText')}
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
                        <p className="text-xs text-night-600 truncate">{t('for', { name: s.recipient ?? t('secureLink') })}</p>
                        <p className="text-xs text-night-500 mt-1 inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" aria-hidden="true" /> {s.expiresIn.unit === 'expired' ? t('expired') : t(s.expiresIn.unit === 'min' ? 'expiresMin' : s.expiresIn.unit === 'h' ? 'expiresH' : 'expiresDays', { n: s.expiresIn.n })}
                        </p>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button variant="secondary" size="sm" onClick={() => setToRevoke(s)}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" /> {t('revoke')}
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
        title={t('revokeTitle')}
        description={toRevoke
          ? t('revokeText', { name: toRevoke.docName })
          : ''}
        confirmLabel={t('revoke')}
        tone="danger"
      />
      {node}
    </>
  )
}
