import type { ReactNode } from 'react'
import { VaultGate } from '@/components/vault-lock/VaultGate'
import { loadVaultGateState } from '@/lib/vault-lock/gate'

// Lecture du cookie de session coffre à chaque requête.
export const dynamic = 'force-dynamic'

/**
 * Garde du coffre-fort (documents, témoignages, partages…).
 * Le serveur vérifie le cookie signé : tant que le coffre est verrouillé, les écrans
 * du coffre ne sont PAS rendus ni envoyés au navigateur, seul l'écran de déverrouillage l'est.
 */
export default async function CoffreLayout({ children }: { children: ReactNode }) {
  const { status, blocked } = await loadVaultGateState()
  return (
    <VaultGate initialStatus={status} blocked={blocked}>
      {status?.unlocked && !blocked ? children : null}
    </VaultGate>
  )
}
