import 'server-only'
import type Stripe from 'stripe'
import type { PaymentStatus } from '@/lib/supabase/types'
import { billingDb, type PaymentUpsert } from './db'
import { idOf } from './stripe'

/**
 * Reflète une facture Stripe dans public.payments (une ligne par facture).
 * Idempotent : upsert sur stripe_invoice_id (UNIQUE). Une facture d'abord en
 * échec puis payée met simplement à jour la même ligne.
 */
export async function recordInvoice(
  invoice: Stripe.Invoice,
  userId: string,
  status: Extract<PaymentStatus, 'succeeded' | 'failed'>,
): Promise<void> {
  if (!invoice.id) return
  const db = billingDb()

  const subscriptionStripeId = idOf(invoice.subscription)
  let subscriptionId: string | null = null
  if (subscriptionStripeId) {
    const { data } = await db
      .from('subscriptions')
      .select('id')
      .eq('stripe_subscription_id', subscriptionStripeId)
      .eq('user_id', userId)
      .maybeSingle()
    subscriptionId = (data as { id: string } | null)?.id ?? null
  }

  const paidAt = invoice.status_transitions?.paid_at
  const row: PaymentUpsert = {
    user_id: userId,
    subscription_id: subscriptionId,
    stripe_payment_intent_id: idOf(invoice.payment_intent),
    stripe_invoice_id: invoice.id,
    amount_cents: Math.max(0, status === 'succeeded' ? invoice.amount_paid : invoice.amount_due),
    currency: (invoice.currency || 'eur').toUpperCase(),
    status,
    invoice_url: invoice.hosted_invoice_url ?? null,
    invoice_pdf_url: invoice.invoice_pdf ?? null,
    paid_at: status === 'succeeded' && paidAt ? new Date(paidAt * 1000).toISOString() : null,
  }

  const { error } = await db.from('payments').upsert(row, { onConflict: 'stripe_invoice_id' })
  if (error && error.code !== '23503') throw new Error(`payments upsert failed: ${error.code ?? 'unknown'}`)
}
