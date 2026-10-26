import Link from 'next/link'
import { Camera, File, FolderLock, Image as ImageIcon, Paperclip } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { ProgressBar, btn } from './kit'
import { cn } from '@/lib/cn'

export const GO = 1024 ** 3
const MO = 1024 ** 2

/** « 1,2 Go », « 350 Mo », « 12 Ko » : unité adaptée, virgule à la française. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 Go'
  const fmt = (v: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: v >= 100 ? 0 : 1 })
  if (bytes >= GO) return `${fmt(bytes / GO)} Go`
  if (bytes >= MO) return `${fmt(bytes / MO)} Mo`
  return `${Math.max(1, Math.round(bytes / 1024))} Ko`
}

// Démonstration uniquement. Comptes réels : components/profil/usage-server (documents du coffre).
export const STORAGE = { usedGo: 5, maxGo: 10 }

export const CATEGORIES = [
  { key: 'documents', label: 'Documents', size: '2,1 Go', icon: File, href: '/app/profil/stockage/documents' },
  { key: 'photos', label: 'Photos', size: '1,4 Go', icon: ImageIcon },
  { key: 'pieces', label: 'Pièces jointes', size: '900 Mo', icon: Paperclip },
  { key: 'autres', label: 'Autres', size: '600 Mo', icon: Camera },
] as const

export type StoredFile = { id: string; name: string; sizeLabel: string; sizeMo: number; date: string }

export const DOCUMENTS: StoredFile[] = [
  { id: 'f1', name: 'Jugement.pdf', sizeLabel: '1,2 Go', sizeMo: 1200, date: '12 mai 2024' },
  { id: 'f2', name: 'Convention parentale.pdf', sizeLabel: '850 Mo', sizeMo: 850, date: '5 avril 2024' },
  { id: 'f3', name: 'Courrier JAF.pdf', sizeLabel: '620 Mo', sizeMo: 620, date: '28 mars 2024' },
  { id: 'f4', name: 'Attestation employeur.pdf', sizeLabel: '410 Mo', sizeMo: 410, date: '15 mars 2024' },
  { id: 'f5', name: 'Échanges parents.pdf', sizeLabel: '350 Mo', sizeMo: 350, date: '10 mars 2024' },
]

export function formatMo(mo: number) {
  return mo >= 1000 ? `${(mo / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} Go` : `${mo} Mo`
}

/** Carte "Espace utilisé" (octets). */
export function UsageCard({ usedBytes, maxBytes, caption, compact }: { usedBytes: number; maxBytes: number; caption: string; compact?: boolean }) {
  const pct = maxBytes > 0 ? Math.round((usedBytes / maxBytes) * 100) : 0
  return (
    <section aria-label="Espace utilisé" className="rounded-xl2 border border-night-100 bg-white p-4 shadow-soft">
      <p className="text-[12px] font-semibold text-night-900">Espace utilisé</p>
      <p className={cn('mt-2 font-extrabold text-night-900', compact ? 'text-[15px]' : 'text-[19px]')}>
        <span className={usedBytes > 0 ? 'text-leaf-600' : ''}>{formatBytes(usedBytes)}</span> / {formatBytes(maxBytes)}
      </p>
      <ProgressBar className="mt-4 h-2" tone="leaf" value={usedBytes} max={maxBytes} label={`${pct} % de l’espace utilisé`} />
      <p className="mt-3 text-[11.5px] text-night-700">{caption.replace('{pct}', String(pct))}</p>
    </section>
  )
}

/** Illustration poubelle + documents (confirmation / suppression en cours). */
export function TrashIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" aria-hidden className={className}>
      <rect x="22" y="10" width="26" height="32" rx="3" fill="#fff" stroke="#b9c0ea" strokeWidth="2" transform="rotate(-12 35 26)" />
      <rect x="27" y="17" width="12" height="9" rx="1.5" fill="#f07a7e" transform="rotate(-12 35 26)" />
      <rect x="46" y="8" width="26" height="32" rx="3" fill="#fff" stroke="#b9c0ea" strokeWidth="2" transform="rotate(10 59 24)" />
      <path d="M52 22h14M52 28h10" stroke="#8f99d8" strokeWidth="2" strokeLinecap="round" transform="rotate(10 59 24)" />
      <rect x="27" y="38" width="42" height="6" rx="3" fill="#0b2d5b" />
      <path d="M31 46h34l-3 36a4 4 0 0 1-4 4H38a4 4 0 0 1-4-4l-3-36Z" fill="#dde1f5" stroke="#0b2d5b" strokeWidth="3" strokeLinejoin="round" />
      <path d="M41 54v24M48 54v24M55 54v24" stroke="#0b2d5b" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  )
}

/**
 * Comptes réels : la liste et la suppression des fichiers se font dans le coffre-fort
 * (corbeille 30 jours, verrou du coffre respecté). Remplace les écrans de démonstration
 * « Documents » et « Supprimer tous les fichiers », qui ne manipulent que des données fictives.
 */
export function ManagedInVault({ title, backHref }: { title: string; backHref: string }) {
  return (
    <>
      <TopBar title={title} showBack backHref={backHref} showBell={false} />
      <div className="px-5 pb-8 pt-6 text-center">
        <span aria-hidden className="mx-auto inline-flex h-20 w-20 items-center justify-center rounded-full bg-night-50 text-night-700">
          <FolderLock className="h-9 w-9" strokeWidth={1.6} />
        </span>
        <h2 className="mt-6 text-[15px] font-bold text-night-900">Vos fichiers se gèrent dans le coffre-fort</h2>
        <p className="mx-auto mt-3 max-w-[300px] text-[12.5px] leading-relaxed text-night-800">
          Consultez, triez et supprimez vos documents depuis le coffre-fort. Un document supprimé reste 30 jours dans la corbeille avant sa suppression définitive.
        </p>
        <Link href="/app/coffre/documents/tous" className={cn(btn.primary, 'mt-8')}>
          Ouvrir le coffre-fort
        </Link>
        <Link href="/app/profil/stockage" className={cn(btn.secondary, 'mt-3')}>
          Retour au stockage
        </Link>
      </div>
    </>
  )
}
