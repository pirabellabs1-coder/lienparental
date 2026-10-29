import 'server-only'
/**
 * Configuration ACTIVE des crédits IA (public.credit_config, 0520), côté serveur.
 *
 * - Supabase : credit_config_current() (service_role), mémorisée 30 s par instance : une nouvelle
 *   version publiée depuis l'administration s'applique sans déploiement (les fonctions SQL de
 *   réservation la lisent, elles, à chaque appel : le débit est toujours celui de la version active).
 * - Sans base, migration absente ou version illisible : DEFAULT_CREDIT_CONFIG (lib/ai/credit-config.ts),
 *   identique à la version 1 insérée par la migration. Jamais de valeur inventée.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { createServiceClient } from '@/lib/supabase/server'
import { DEFAULT_CREDIT_CONFIG, parseCreditConfig, type CreditConfig } from './credit-config'

export type ActiveCreditConfig = { version: number; config: CreditConfig; live: boolean }

const TTL_MS = 30_000
const g = globalThis as unknown as { __lpCreditCfg?: { at: number; value: ActiveCreditConfig } }

const FALLBACK: ActiveCreditConfig = { version: 1, config: DEFAULT_CREDIT_CONFIG, live: false }

export async function getCreditConfig(): Promise<ActiveCreditConfig> {
  if (!SUPABASE_ENABLED || !process.env.SUPABASE_SERVICE_ROLE_KEY) return FALLBACK
  const hit = g.__lpCreditCfg
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value
  try {
    const db = createServiceClient() as unknown as SupabaseClient
    const { data, error } = await db.rpc('credit_config_current')
    if (error) throw new Error(error.code ?? 'credit_config_failed')
    const row = data as { version?: number; config?: unknown } | null
    const config = parseCreditConfig(row?.config)
    if (!config || typeof row?.version !== 'number') {
      console.error('[credits] configuration en base illisible : valeurs par défaut appliquées à l’affichage', { version: row?.version ?? null })
      return FALLBACK
    }
    const value = { version: row.version, config, live: true }
    g.__lpCreditCfg = { at: Date.now(), value }
    return value
  } catch (err) {
    console.warn('[credits] configuration indisponible', err instanceof Error ? err.message : 'unknown')
    return FALLBACK
  }
}

/** Vide le cache (après une publication depuis l'administration). */
export function invalidateCreditConfig(): void {
  g.__lpCreditCfg = undefined
}
