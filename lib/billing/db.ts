import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import type { PaymentStatus } from '@/lib/supabase/types'

/**
 * Client service_role pour la facturation (bypass RLS : webhooks, routes
 * /api/stripe/*). Volontairement non typé par `Database` : les types écrits à
 * la main de lib/supabase/types.ts ne déclarent pas encore billing_customers /
 * stripe_events (0220) et le type agrégé se résout en `never` avec
 * supabase-js 2.46. Les lignes sont typées localement ci-dessous.
 * À n'utiliser QUE côté serveur, et toujours filtré par un user_id authentifié.
 */
export function billingDb(): SupabaseClient {
  return createServiceClient() as unknown as SupabaseClient
}

export type { SubscriptionRecord } from './sync-core'

export const SUBSCRIPTION_COLUMNS =
  'id, user_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_start, current_period_end, cancel_at_period_end, canceled_at, trial_end'

export type PaymentUpsert = {
  user_id: string
  subscription_id: string | null
  stripe_payment_intent_id: string | null
  stripe_invoice_id: string
  amount_cents: number
  currency: string
  status: PaymentStatus
  invoice_url: string | null
  invoice_pdf_url: string | null
  paid_at: string | null
}
