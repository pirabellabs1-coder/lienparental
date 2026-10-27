import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { VaultGate } from '@/components/vault-lock/VaultGate'
import { VaultLockSettings } from '@/components/vault-lock/VaultLockSettings'
import { loadVaultGateState } from '@/lib/vault-lock/gate'

export const dynamic = 'force-dynamic'
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('account.security.vaultLock')
  return { title: t('metaTitle') }
}

// Réglages du verrou : si le verrou est actif, le coffre doit d'abord être déverrouillé
// (vérifié à nouveau par chaque route /api/vault-lock/** côté serveur).
export default async function CoffreLockSettingsPage() {
  const { status, blocked } = await loadVaultGateState()
  return (
    <VaultGate initialStatus={status} blocked={blocked} context="settings" showLockButton={false}>
      <VaultLockSettings />
    </VaultGate>
  )
}
