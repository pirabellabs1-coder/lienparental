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
      {status?.unlocked && !blocked ? (
        <>
          {children}
          {/* Réserve sous le contenu pour le bouton flottant « Verrouiller » (VaultGate) :
              il ne masque plus les actions « ⋯ » du dernier document d'une liste. */}
          <div aria-hidden="true" className="h-16 lg:h-14" />
        </>
      ) : null}
    </VaultGate>
  )
}
