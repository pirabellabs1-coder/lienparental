import 'server-only'
/**
 * Attribution d'un compte, côté serveur : métadonnées de campagne jointes aux paiements Stripe
 * (abonnement, crédits, stockage) pour retrouver dans Stripe quel contenu a amené le client.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'

/** Métadonnées Stripe (valeurs ≤ 100 caractères) ; objet vide sans attribution ou en cas d'erreur. */
export async function attributionMetadata(userId: string): Promise<Record<string, string>> {
  if (!SUPABASE_ENABLED || !process.env.SUPABASE_SERVICE_ROLE_KEY) return {}
  try {
    const db = createServiceClient() as unknown as SupabaseClient
    const { data } = await db
      .from('signup_attributions')
      .select('last_source, last_medium, last_campaign, last_content, first_source, first_campaign')
      .eq('user_id', userId)
      .maybeSingle()
    if (!data) return {}
    const row = data as Record<string, string | null>
    const out: Record<string, string> = {}
    const put = (k: string, v: string | null) => { if (v) out[k] = v.slice(0, 100) }
    put('utm_source', row.last_source)
    put('utm_medium', row.last_medium)
    put('utm_campaign', row.last_campaign)
    put('utm_content', row.last_content)
    put('first_utm_source', row.first_source)
    put('first_utm_campaign', row.first_campaign)
    return out
  } catch {
    return {}
  }
}
