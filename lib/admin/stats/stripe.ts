import 'server-only'
// Revenus depuis Stripe (si STRIPE_SECRET_KEY est configurée).
// Lecture seule : prix des formules (MRR), paiements encaissés (abonnements
// = charge liée à une facture, dons = charge sans facture) et échecs récents.
// Résultat mis en cache 5 minutes par fenêtre pour limiter les appels API.
import type Stripe from 'stripe'
import { getStripe } from '@/lib/billing/stripe'
import { monthKeyInTz } from '@/lib/tz'
import { round2 } from './compute'

export type StripeRevenue = {
  monthlyPriceEur: number | null
  yearlyPriceEur: number | null
  coparentaliteMonthlyPriceEur: number | null
  coparentaliteYearlyPriceEur: number | null
  /** Montants nets (remboursements déduits) par mois "yyyy-mm". */
  months: Map<string, { subs: number; dons: number }>
  /** Somme nette sur [from, to[ des charges réussies. */
  sumBetween: (fromIso: string, toIso: string) => { subs: number; dons: number }
  failed7d: number
}

const MAX_CHARGES = 3000
const TTL_MS = 5 * 60_000
const memo = new Map<string, { at: number; value: StripeRevenue | null }>()

type Row = { t: number; subs: number; dons: number }

async function priceEur(stripe: Stripe, id: string | undefined): Promise<number | null> {
  if (!id || !id.startsWith('price_')) return null
  const p = await stripe.prices.retrieve(id)
  if (p.unit_amount == null) return null
  return round2(p.unit_amount / 100)
}

/** null si Stripe est indisponible ou si le volume dépasse la limite de lecture (repli sur la base). */
export async function loadStripeRevenue(fromIso: string, toIso: string, tz: string): Promise<StripeRevenue | null> {
  const key = `${fromIso}|${toIso}|${tz}`
  const hit = memo.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value

  let value: StripeRevenue | null = null
  try {
    const stripe = getStripe()
    const gte = Math.floor(new Date(fromIso).getTime() / 1000)
    const lt = Math.floor(new Date(toIso).getTime() / 1000)
    const rows: Row[] = []
    let truncated = false
    for await (const c of stripe.charges.list({ created: { gte, lt }, limit: 100 })) {
      if (rows.length >= MAX_CHARGES) { truncated = true; break }
      if (c.status !== 'succeeded' || c.currency !== 'eur') continue
      const net = (c.amount - c.amount_refunded) / 100
      const isSub = Boolean(c.invoice) && c.metadata?.kind !== 'don'
      rows.push({ t: c.created * 1000, subs: isSub ? net : 0, dons: isSub ? 0 : net })
    }
    if (!truncated) {
      const weekAgo = Math.floor(Date.now() / 1000) - 7 * 86_400
      let failed7d = 0
      for await (const c of stripe.charges.list({ created: { gte: weekAgo }, limit: 100 })) {
        if (c.status === 'failed') failed7d++
        if (failed7d >= 999) break
      }
      const [monthlyPriceEur, yearlyPriceEur, coparentaliteMonthlyPriceEur, coparentaliteYearlyPriceEur] = await Promise.all([
        priceEur(stripe, process.env.STRIPE_PRICE_MONTHLY),
        priceEur(stripe, process.env.STRIPE_PRICE_YEARLY),
        priceEur(stripe, process.env.STRIPE_PRICE_COPARENTALITE_MONTHLY),
        priceEur(stripe, process.env.STRIPE_PRICE_COPARENTALITE_YEARLY),
      ])
      const months = new Map<string, { subs: number; dons: number }>()
      for (const r of rows) {
        const k = monthKeyInTz(r.t, tz)
        const m = months.get(k) ?? { subs: 0, dons: 0 }
        m.subs = round2(m.subs + r.subs)
        m.dons = round2(m.dons + r.dons)
        months.set(k, m)
      }
      value = {
        monthlyPriceEur,
        yearlyPriceEur,
        coparentaliteMonthlyPriceEur,
        coparentaliteYearlyPriceEur,
        months,
        failed7d,
        sumBetween(a, b) {
          const ta = new Date(a).getTime()
          const tb = new Date(b).getTime()
          let subs = 0
          let dons = 0
          for (const r of rows) if (r.t >= ta && r.t < tb) { subs += r.subs; dons += r.dons }
          return { subs: round2(subs), dons: round2(dons) }
        },
      }
    }
  } catch (e) {
    // Clé invalide, réseau, quota : repli sur la base (une note est affichée).
    console.warn('[admin-stats] Stripe indisponible :', e instanceof Error ? e.message.slice(0, 120) : 'erreur inconnue')
    value = null
  }
  memo.set(key, { at: Date.now(), value })
  if (memo.size > 20) memo.delete(memo.keys().next().value as string)
  return value
}
