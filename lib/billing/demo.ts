import 'server-only'
import { cookies } from 'next/headers'
import { DEMO_COOKIE, DEMO_MODE, isDemoAccountId } from '@/lib/demo-auth'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { DEMO_BILLING_COOKIE, demoDefault, parseDemoBilling, type DemoBilling } from './demo-core'

/** Mode démonstration actif (aucune clé Supabase) : abonnement simulé. */
export const DEMO_BILLING = DEMO_MODE && !SUPABASE_ENABLED

/**
 * Abonnement simulé de la session de démonstration courante, ou null hors démo.
 * Cookie lp_demo_billing s'il existe, sinon l'état par défaut du compte de démo.
 */
export async function getDemoBilling(): Promise<DemoBilling | null> {
  if (!DEMO_BILLING) return null
  const store = await cookies()
  const account = store.get(DEMO_COOKIE)?.value
  if (!isDemoAccountId(account) || account === 'admin') return null
  // L'état simulé est lié au compte de démo qui l'a créé (changer de compte repart de zéro).
  const raw = store.get(DEMO_BILLING_COOKIE)?.value ?? ''
  const [owner, value] = raw.split('~')
  return (owner === account ? parseDemoBilling(value) : null) ?? demoDefault(account)
}

/** Valeur du cookie lp_demo_billing pour le compte de démo courant. */
export async function demoBillingCookieValue(serialized: string): Promise<string | null> {
  const account = (await cookies()).get(DEMO_COOKIE)?.value
  return isDemoAccountId(account) ? `${account}~${serialized}` : null
}
