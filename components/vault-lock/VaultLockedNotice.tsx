'use client'
/**
 * Carte « Coffre-fort verrouillé » pour les écrans hors du coffre qui en montrent des
 * données (accueil, espace Santé, partage familial…). Remplace une liste vide trompeuse.
 */
import Link from 'next/link'
import { Loader2, Lock } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { VaultLockState } from './useVaultLockState'

type Props = {
  state: Exclude<VaultLockState, 'open'>
  /** Ce qui est masqué, ex. « vos documents récents ». */
  what?: string
  className?: string
  compact?: boolean
}

export function VaultLockedNotice({ state, what = 'vos documents', className, compact }: Props) {
  if (state === 'loading') {
    return (
      <p role="status" className={cn('flex items-center gap-2 rounded-xl2 border border-night-100 bg-white p-4 text-[13px] text-night-700 shadow-soft', className)}>
        <Loader2 className="h-4 w-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" />
        Vérification du coffre-fort…
      </p>
    )
  }
  return (
    <div className={cn('flex items-start gap-3.5 rounded-xl2 border border-night-100 bg-white shadow-soft', compact ? 'p-3.5' : 'p-4', className)}>
      <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-night-900 text-white">
        <Lock className="h-5 w-5" strokeWidth={1.9} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-bold text-night-900">Coffre-fort verrouillé</p>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-night-700">
          {state === 'unknown'
            ? 'Impossible de vérifier le verrou pour le moment : les données du coffre restent masquées.'
            : `Déverrouillez le coffre avec votre code ou votre empreinte pour afficher ${what}.`}
        </p>
        <Link
          href="/app/coffre"
          className="mt-3 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-leaf-500 px-4 text-[13.5px] font-bold text-white transition hover:bg-leaf-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2 active:scale-[.98] motion-reduce:active:scale-100"
        >
          <Lock className="h-4 w-4" aria-hidden="true" /> Déverrouiller
        </Link>
      </div>
    </div>
  )
}
