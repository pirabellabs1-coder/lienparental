import type { ReactNode } from 'react'
import { VaultGate } from '@/components/vault-lock/VaultGate'
import { loadVaultGateState } from '@/lib/vault-lock/gate'

// Lecture du cookie de session coffre à chaque requête.
export const dynamic = 'force-dynamic'

/**
 * « Mon dossier » (export JAF, partage avocat) agrège les pièces et témoignages du
 * coffre-fort : même garde que app/app/coffre/layout.tsx. Tant que le coffre est
 * verrouillé, les écrans du dossier ne sont ni rendus ni envoyés au navigateur.
 */
export default async function DossierLayout({ children }: { children: ReactNode }) {
  const { status, blocked } = await loadVaultGateState()
  return (
    <VaultGate initialStatus={status} blocked={blocked}>
      {status?.unlocked && !blocked ? children : null}
    </VaultGate>
  )
}
