import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { ChevronRight, File, Image as ImageIcon, LayoutGrid, Shapes } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { CATEGORIES, GO, STORAGE, UsageCard, formatBytes } from '@/components/profil/storage'
import { loadProfileUsage } from '@/components/profil/usage-server'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { StorageNotice, StoragePacks, storagePurchaseNotice } from '@/components/profil/StoragePacks'

export const dynamic = 'force-dynamic'

type Row = { key: string; size: string; icon: typeof File }

// Stockage - Utilisation. Compte réel : documents du coffre (usage-server) ; démonstration : valeurs fictives.
export default async function StockagePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  // Retour de paiement d'un pack d'espace : traité AVANT la lecture de l'usage.
  const notice = await storagePurchaseNotice(sp)
  const t = await getTranslations('account.storage')
  const locale = await getLocale()
  let usage: { usedBytes: number; maxBytes: number } | null
  let rows: Row[]
  if (!SUPABASE_ENABLED) {
    usage = { usedBytes: STORAGE.usedGo * GO, maxBytes: STORAGE.maxGo * GO }
    rows = CATEGORIES.map(({ key, size, icon }) => ({ key, size, icon }))
  } else {
    const s = (await loadProfileUsage({ coach: false, subscription: false }))?.storage ?? null
    usage = s
    rows = s
      ? [
          { key: 'documentsPdf', size: formatBytes(s.breakdown.documents, locale), icon: File },
          { key: 'photos', size: formatBytes(s.breakdown.photos, locale), icon: ImageIcon },
          { key: 'autres', size: formatBytes(s.breakdown.autres, locale), icon: Shapes },
        ]
      : []
  }

  return (
    <>
      <TopBar title={t('usageTitle')} showBack backHref="/app/profil" showBell={false} />
      <div className="px-5 pb-8 pt-3">
        {notice && <StorageNotice notice={notice} />}
        {usage ? (
          <>
            <UsageCard usedBytes={usage.usedBytes} maxBytes={usage.maxBytes} caption={t('usedPct', { pct: '{pct}' })} />

            <h2 className="mt-8 text-[13px] font-bold text-night-900">{t('breakdown')}</h2>
            <dl className="mt-2">
              {rows.map(({ key, size, icon: Icon }) => (
                <div key={key} className="flex min-h-[52px] items-center gap-3.5">
                  <Icon className="h-5 w-5 shrink-0 text-night-900" strokeWidth={1.8} aria-hidden />
                  <dt className="flex-1 text-[13px] font-semibold text-night-900">{t(`categories.${key}`)}</dt>
                  <dd className="text-[12.5px] text-night-800">{size}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <p role="alert" className="rounded-xl2 border border-alert-100 bg-alert-50/60 p-4 text-[13px] text-night-900">
            {t('unavailable')}
          </p>
        )}

        <StoragePacks selected={Array.isArray(sp.pack) ? sp.pack[0] : sp.pack} />

        <Link
          href="/app/profil/stockage/fichiers"
          className="mt-10 flex min-h-[52px] items-center gap-3.5 rounded-xl2 border border-night-100 bg-white px-4 shadow-soft transition hover:border-night-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400"
        >
          <LayoutGrid className="h-5 w-5 text-night-900" strokeWidth={1.8} aria-hidden />
          <span className="flex-1 text-[13px] font-bold text-night-900">{t('manageFiles')}</span>
          <ChevronRight className="h-5 w-5 text-night-900" aria-hidden />
        </Link>
      </div>
    </>
  )
}
