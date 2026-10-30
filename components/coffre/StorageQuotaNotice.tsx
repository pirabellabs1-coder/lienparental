'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { AlertTriangle, HardDrive } from 'lucide-react'
import { formatBytes } from '@/components/profil/storage'
import { getStorageQuota, type StorageQuota } from '@/lib/data/vault'

/** Seuil d'alerte (part du quota utilisée). Au-delà de 100 %, la base refuse l'ajout (0560). */
export const STORAGE_WARN_RATIO = 0.8

/** Espace utilisé / quota de l'offre ; `full` = plus aucun ajout possible. */
export function useStorageQuota() {
  const [quota, setQuota] = useState<StorageQuota | null>(null)
  useEffect(() => {
    let alive = true
    getStorageQuota().then((q) => { if (alive) setQuota(q) }).catch(() => {})
    return () => { alive = false }
  }, [])
  const ratio = quota && quota.quotaBytes > 0 ? quota.usedBytes / quota.quotaBytes : 0
  return { quota, ratio, full: ratio >= 1, warn: ratio >= STORAGE_WARN_RATIO }
}

/** Bandeau d'alerte (≥ 80 %) ou de blocage (≥ 100 %) avec lien vers les offres et la corbeille. */
export function StorageQuotaNotice({ quota, className }: { quota: StorageQuota | null; className?: string }) {
  const t = useTranslations('vault.quota')
  const locale = useLocale()
  if (!quota || quota.quotaBytes <= 0) return null
  const ratio = quota.usedBytes / quota.quotaBytes
  if (ratio < STORAGE_WARN_RATIO) return null
  const full = ratio >= 1
  const values = {
    used: formatBytes(quota.usedBytes, locale),
    max: formatBytes(quota.quotaBytes, locale),
    pct: String(Math.min(100, Math.round(ratio * 100))),
  }
  const Icon = full ? HardDrive : AlertTriangle
  return (
    <div
      role={full ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-xl px-3.5 py-3 text-[13px] leading-relaxed ${full ? 'bg-alert-50 text-alert-800' : 'bg-gold-50 text-gold-900'} ${className ?? ''}`}
    >
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
      <div>
        <p className="font-bold">{full ? t('fullTitle') : t('warnTitle')}</p>
        <p className="mt-0.5">{full ? t('fullText', values) : t('warnText', values)}</p>
        <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-semibold">
          <Link href="/app/profil/stockage#plus-d-espace" className="underline underline-offset-2">{t('buy')}</Link>
          <Link href="/app/abonnement" className="underline underline-offset-2">{t('upgrade')}</Link>
          <Link href="/app/coffre/corbeille" className="underline underline-offset-2">{t('trash')}</Link>
        </p>
      </div>
    </div>
  )
}
