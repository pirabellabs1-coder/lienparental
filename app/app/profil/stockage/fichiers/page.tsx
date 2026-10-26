import Link from 'next/link'
import { File, FolderLock, Image as ImageIcon, Shapes } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { btn } from '@/components/profil/kit'
import { CATEGORIES, GO, STORAGE, UsageCard, formatBytes } from '@/components/profil/storage'
import { loadProfileUsage } from '@/components/profil/usage-server'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { cn } from '@/lib/cn'

export const dynamic = 'force-dynamic'

type Row = { key: string; label: string; size: string; icon: typeof File; href?: string }

// Gérer mes fichiers. Compte réel : les fichiers se gèrent dans le coffre-fort (suppression
// en corbeille, purge à 30 jours) ; aucune suppression groupée simulée.
export default async function GererFichiersPage() {
  let usage: { usedBytes: number; maxBytes: number } | null
  let rows: Row[]
  if (!SUPABASE_ENABLED) {
    usage = { usedBytes: STORAGE.usedGo * GO, maxBytes: STORAGE.maxGo * GO }
    rows = CATEGORIES.map((c) => ({ key: c.key, label: c.label, size: c.size, icon: c.icon, href: 'href' in c ? c.href : undefined }))
  } else {
    const s = (await loadProfileUsage({ coach: false, subscription: false }))?.storage ?? null
    usage = s
    const href = '/app/coffre/documents/tous'
    rows = s
      ? [
          { key: 'documents', label: 'Documents (PDF, Word)', size: formatBytes(s.breakdown.documents), icon: File, href },
          { key: 'photos', label: 'Photos', size: formatBytes(s.breakdown.photos), icon: ImageIcon, href },
          { key: 'autres', label: 'Autres', size: formatBytes(s.breakdown.autres), icon: Shapes, href },
        ]
      : []
  }

  return (
    <>
      <TopBar title="Gérer mes fichiers" showBack backHref="/app/profil/stockage" showBell={false} />
      <div className="px-5 pb-8 pt-3">
        {usage ? (
          <UsageCard usedBytes={usage.usedBytes} maxBytes={usage.maxBytes} caption={`{pct} % utilisés sur ${formatBytes(usage.maxBytes)}`} />
        ) : (
          <p role="alert" className="rounded-xl2 border border-alert-100 bg-alert-50/60 p-4 text-[13px] text-night-900">
            La consommation de stockage est indisponible pour le moment. Réessayez dans quelques instants.
          </p>
        )}

        {rows.length > 0 && (
          <>
            <h2 className="mt-8 text-[13px] font-bold text-night-900">Catégories</h2>
            <ul className="mt-2">
              {rows.map((c) => {
                const Icon = c.icon
                const inner = (
                  <>
                    <Icon className="h-5 w-5 shrink-0 text-night-900" strokeWidth={1.8} aria-hidden />
                    <span className="flex-1 text-[13px] font-semibold text-night-900">{c.label}</span>
                    <span className="text-[12.5px] text-night-800">{c.size}</span>
                  </>
                )
                const cls = 'flex min-h-[52px] items-center gap-3.5 rounded-lg'
                return (
                  <li key={c.key}>
                    {c.href ? (
                      <Link href={c.href} className={cn(cls, 'hover:bg-night-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400')}>{inner}</Link>
                    ) : (
                      <div className={cls}>{inner}</div>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}

        {SUPABASE_ENABLED ? (
          <>
            <p className="mt-10 text-[12.5px] leading-relaxed text-night-700">
              Pour libérer de l’espace, supprimez des documents depuis le coffre-fort. Ils restent 30 jours dans la corbeille avant leur suppression définitive.
            </p>
            <Link href="/app/coffre/documents/tous" className={cn(btn.secondary, 'mt-4 text-[13.5px]')}>
              <FolderLock className="h-5 w-5" aria-hidden />
              Ouvrir le coffre-fort
            </Link>
          </>
        ) : (
          <Link href="/app/profil/stockage/suppression" className={cn(btn.danger, 'mt-14 text-[13.5px]')}>
            Supprimer tous les fichiers
          </Link>
        )}
      </div>
    </>
  )
}
