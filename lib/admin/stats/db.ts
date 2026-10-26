import 'server-only'
// Source « réelle » du tableau de bord : fonctions d'agrégat Postgres
// (supabase/migrations/0310_admin_stats.sql), appelées avec la session de
// l'administrateur. Les fonctions vérifient elles-mêmes is_admin() + MFA.
import { z } from 'zod'
import type { TypedSupabaseClient } from '@/lib/supabase/server'
import { STRIPE_ENABLED } from '@/lib/supabase/config'
import { DEFAULT_TZ, wallTimeToIso } from '@/lib/tz'
import { ANALYSIS_QUOTA } from '@/lib/ai/quota'
import {
  buildAlerts,
  buildKpis,
  fillMonths,
  humanizeSlug,
  moduleRows,
  paidTotal,
  revenueStartMonth,
  round2,
  territoryLabel,
  type Pricing,
  type RawOverview,
} from './compute'
import { AI_MONTHLY_BUDGET_EUR, BASE_PRICING } from './config'
import { loadStripeRevenue } from './stripe'
import { resolveGuideTitles } from './guide-titles'
import type { DashboardData, GuideTop, Period, RecentPayment, RecentSignup } from './types'

// --- Schémas de réponse (on ne fait pas confiance à la forme du JSON) --------

const n = z.coerce.number().finite().catch(0)
const pair = z.tuple([n, n]).catch([0, 0])

const overviewSchema = z.object({
  users: z.object({
    total: n, total_prev: n, new: n, new_prev: n,
    active7: n, active7_prev: n, active30: n, active30_prev: n,
    premium_monthly: n, premium_yearly: n, premium_monthly_prev: n, premium_yearly_prev: n,
  }),
  activity: z.object({
    churn: n, churn_prev: n, ai: n, ai_prev: n,
    testimonies: n, testimonies_prev: n, documents: n, documents_prev: n,
  }),
  revenue: z.object({
    subs_cents: n, subs_cents_prev: n, month_cents: n, month_cents_prev: n,
    cumul_cents: n, cumul_cents_prev: n, don_cents: n, don_cents_prev: n,
  }),
  misc: z.object({ storage_mb: n, storage_added_mb: n, tickets_open: n, tickets_open_prev: n, tickets_new: n }),
})

const slugRow = z.object({ slug: z.string().max(200), territoire: z.string().max(40).catch('guyane'), n })

const seriesSchema = z.object({
  signups_daily: z.array(z.object({ d: z.string(), n })),
  revenue_monthly: z.array(z.object({ m: z.string(), subs: n, dons: n })),
  modules: z.object({ journal: pair, calendrier: pair, coffre: pair, coach: pair, guide: pair, messages: pair }),
  guide: z.object({ views: z.array(slugRow), followed: z.array(slugRow) }),
  funnel: z.object({ visits_measured: z.boolean().catch(false), visits: n, accounts: n, child: n, premium: n }),
  territories: z.array(z.object({ territoire: z.string().nullable(), n })),
})

const feedSchema = z.object({
  signups: z.array(z.object({
    id: z.string(), display_name: z.string().max(80), created_at: z.string(), plan: z.string(), has_child: z.boolean().catch(false),
  })),
  payments: z.array(z.object({
    id: z.string(), display_name: z.string().max(80), amount_cents: n, status: z.string(), kind: z.string(), plan: z.string().catch(''), created_at: z.string(),
  })),
  alerts: z.object({
    failed_payments_7d: n, past_due: n, stripe_unprocessed: n, errors_24h: n, errors_prev_7d: n,
    errors_measured: z.boolean().catch(false), ai_free_at_quota: n, ai_month: n, tickets_urgent: n,
  }),
})

const coparentaliteSchema = z.object({ monthly: n, yearly: n, monthly_prev: n, yearly_prev: n })
type CoparentaliteCounts = z.infer<typeof coparentaliteSchema>
const NO_COPARENTALITE: CoparentaliteCounts = { monthly: 0, yearly: 0, monthly_prev: 0, yearly_prev: 0 }

const eur = (cents: number) => round2(cents / 100)

/** Libellé d'un subscriptions.plan. */
export function planLabelOf(plan: string): string {
  switch (plan) {
    case 'premium_monthly': return 'Premium mensuel'
    case 'premium_yearly': return 'Premium annuel'
    case 'coparentalite_monthly': return 'Coparentalité+ mensuel'
    case 'coparentalite_yearly': return 'Coparentalité+ annuel'
    default: return 'Abonnement'
  }
}

function paymentStatus(s: string): RecentPayment['status'] {
  if (s === 'succeeded') return 'reussi'
  if (s === 'failed' || s === 'canceled') return 'echoue'
  if (s === 'refunded') return 'rembourse'
  return 'en_cours'
}

export class StatsUnavailableError extends Error {}

/** RPC non typée (fonctions absentes du type Database généré). */
async function rpc(supabase: TypedSupabaseClient, fn: string, args: Record<string, unknown>): Promise<unknown> {
  const call = supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string } | null }>
  const { data, error } = await call.call(supabase, fn, args)
  if (error) throw new StatsUnavailableError(error.code === '42501' ? 'forbidden' : error.code === 'PGRST202' ? 'missing_function' : 'rpc_failed')
  return data
}

export async function liveDashboard(supabase: TypedSupabaseClient, period: Period, now: Date = new Date()): Promise<DashboardData> {
  const tz = DEFAULT_TZ
  const args = { p_from: period.from, p_to: period.to, p_prev_from: period.prevFrom, p_tz: tz }
  const revFromMonth = revenueStartMonth(period)
  const revFromIso = wallTimeToIso(`${revFromMonth}-01`, '00:00', tz)
  const stripeFrom = revFromIso < period.prevFrom ? revFromIso : period.prevFrom

  const [overviewRaw, seriesRaw, feedRaw, stripe, copaRaw] = await Promise.all([
    rpc(supabase, 'admin_stats_overview', args),
    rpc(supabase, 'admin_stats_series', args),
    rpc(supabase, 'admin_stats_feed', { p_limit: 8, p_free_quota: ANALYSIS_QUOTA.gratuit }),
    STRIPE_ENABLED ? loadStripeRevenue(stripeFrom, period.to, tz) : Promise.resolve(null),
    // 0380 : abonnés Coparentalité+. Migration absente → zéro et une note (pas d'échec du tableau).
    rpc(supabase, 'admin_stats_coparentalite', { p_from: period.from, p_to: period.to }).catch((e: unknown) =>
      e instanceof StatsUnavailableError && e.message === 'forbidden' ? Promise.reject(e) : null),
  ])

  const o = overviewSchema.parse(overviewRaw)
  const s = seriesSchema.parse(seriesRaw)
  const f = feedSchema.parse(feedRaw)
  const copa: CoparentaliteCounts = copaRaw === null ? NO_COPARENTALITE : coparentaliteSchema.catch(NO_COPARENTALITE).parse(copaRaw)
  const notes: string[] = []
  if (copaRaw === null) notes.push('Abonnés Coparentalité+ non comptés : appliquer la migration 0380_plan_coparentalite.sql.')

  const pricing: Pricing = {
    ...BASE_PRICING,
    monthlyEur: stripe?.monthlyPriceEur ?? BASE_PRICING.monthlyEur,
    yearlyEur: stripe?.yearlyPriceEur ?? BASE_PRICING.yearlyEur,
    coparentaliteMonthlyEur: stripe?.coparentaliteMonthlyPriceEur ?? BASE_PRICING.coparentaliteMonthlyEur,
    coparentaliteYearlyEur: stripe?.coparentaliteYearlyPriceEur ?? BASE_PRICING.coparentaliteYearlyEur,
  }
  if (STRIPE_ENABLED && !stripe) notes.push('Stripe est configuré mais n’a pas répondu (ou le volume dépasse la limite de lecture) : revenus calculés depuis la base.')

  // Revenus : Stripe prioritaire pour la période et les mois, la base pour le cumul.
  const monthKey = period.toDay.slice(0, 7)
  let donationsEur = eur(o.revenue.don_cents)
  let donationsPrevEur = eur(o.revenue.don_cents_prev)
  let revenueMonthEur = eur(o.revenue.month_cents)
  let revenueMonthPrevEur = eur(o.revenue.month_cents_prev)
  let monthly = s.revenue_monthly.map((r) => ({ month: r.m, subscriptionsEur: eur(r.subs), donationsEur: eur(r.dons) }))
  if (stripe) {
    const cur = stripe.sumBetween(period.from, period.to)
    const prev = stripe.sumBetween(period.prevFrom, period.from)
    donationsEur = cur.dons
    donationsPrevEur = prev.dons
    const [y, m] = monthKey.split('-').map(Number)
    const prevMonthKey = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7)
    const mm = stripe.months.get(monthKey)
    const pm = stripe.months.get(prevMonthKey)
    revenueMonthEur = round2((mm?.subs ?? 0) + (mm?.dons ?? 0))
    revenueMonthPrevEur = round2((pm?.subs ?? 0) + (pm?.dons ?? 0))
    monthly = [...stripe.months.entries()].map(([month, v]) => ({ month, subscriptionsEur: v.subs, donationsEur: v.dons }))
  }

  const raw: RawOverview = {
    usersTotal: o.users.total,
    usersTotalPrev: o.users.total_prev,
    usersNew: o.users.new,
    usersNewPrev: o.users.new_prev,
    active7: o.users.active7,
    active7Prev: o.users.active7_prev,
    active30: o.users.active30,
    active30Prev: o.users.active30_prev,
    premiumMonthly: o.users.premium_monthly,
    premiumYearly: o.users.premium_yearly,
    premiumMonthlyPrev: o.users.premium_monthly_prev,
    premiumYearlyPrev: o.users.premium_yearly_prev,
    coparentaliteMonthly: copa.monthly,
    coparentaliteYearly: copa.yearly,
    coparentaliteMonthlyPrev: copa.monthly_prev,
    coparentaliteYearlyPrev: copa.yearly_prev,
    churn: o.activity.churn,
    churnPrev: o.activity.churn_prev,
    ai: o.activity.ai,
    aiPrev: o.activity.ai_prev,
    testimonies: o.activity.testimonies,
    testimoniesPrev: o.activity.testimonies_prev,
    documents: o.activity.documents,
    documentsPrev: o.activity.documents_prev,
    revenueMonthEur,
    revenueMonthPrevEur,
    revenueCumulEur: eur(o.revenue.cumul_cents),
    revenueCumulPrevEur: eur(o.revenue.cumul_cents_prev),
    donationsEur,
    donationsPrevEur,
    storageMb: Math.round(o.misc.storage_mb),
    storagePrevMb: Math.max(0, Math.round(o.misc.storage_mb - o.misc.storage_added_mb)),
    ticketsOpen: o.misc.tickets_open,
    ticketsOpenPrev: o.misc.tickets_open_prev,
  }

  // Guide : consultations si mesurées, sinon fiches suivies.
  const basis = s.guide.views.length > 0 ? 'consultations' : 'suivis'
  const guideRows = basis === 'consultations' ? s.guide.views : s.guide.followed
  const titles = await resolveGuideTitles(guideRows.map((r) => ({ slug: r.slug, territoire: r.territoire })))
  const guideItems: GuideTop[] = guideRows.map((r) => ({
    slug: r.slug,
    territoire: r.territoire,
    title: titles.get(`${r.territoire}/${r.slug}`) ?? humanizeSlug(r.slug),
    count: r.n,
  }))
  if (basis === 'suivis') notes.push('Consultations du Guide non mesurées : classement établi sur les fiches suivies (progression).')
  if (!s.funnel.visits_measured) notes.push('Visites non mesurées : l’entonnoir démarre à la création de compte tant que le suivi d’audience n’est pas branché.')
  if (!f.alerts.errors_measured) notes.push('Erreurs serveur non mesurées : l’alerte « pic d’erreurs » s’activera dès que les erreurs seront enregistrées.')

  const recentSignups: RecentSignup[] = f.signups.map((u) => ({
    id: u.id,
    displayName: u.display_name,
    createdAt: u.created_at,
    plan: u.plan === 'premium' || u.plan === 'coparentalite' ? u.plan : 'gratuit',
    hasChild: u.has_child,
  }))
  const recentPayments: RecentPayment[] = f.payments.map((p) => ({
    id: p.id,
    displayName: p.display_name,
    amountEur: eur(p.amount_cents),
    kind: p.kind === 'don' ? 'don' : 'abonnement',
    label: p.kind === 'don' ? 'Don' : planLabelOf(p.plan),
    status: paymentStatus(p.status),
    createdAt: p.created_at,
  }))

  const alerts = buildAlerts(
    {
      failedPayments7d: f.alerts.failed_payments_7d,
      pastDue: f.alerts.past_due,
      stripeUnprocessed: f.alerts.stripe_unprocessed,
      errorsMeasured: f.alerts.errors_measured,
      errors24h: f.alerts.errors_24h,
      errorsPrev7d: f.alerts.errors_prev_7d,
      aiFreeAtQuota: f.alerts.ai_free_at_quota,
      aiMonthCount: f.alerts.ai_month,
      ticketsUrgent: f.alerts.tickets_urgent,
      stripeFailedCharges7d: stripe?.failed7d ?? null,
    },
    pricing,
    AI_MONTHLY_BUDGET_EUR,
  )

  const paid = paidTotal(raw)
  return {
    source: stripe ? 'base+stripe' : 'base',
    generatedAt: now.toISOString(),
    period,
    kpis: buildKpis(raw, pricing, period),
    signupsDaily: s.signups_daily.filter((p) => p.d >= period.fromDay && p.d <= period.toDay).map((p) => ({ day: p.d, value: p.n })),
    revenueMonthly: fillMonths(monthly, revFromMonth, monthKey),
    plans: {
      free: Math.max(0, raw.usersTotal - paid),
      monthly: raw.premiumMonthly,
      yearly: raw.premiumYearly,
      coparentaliteMonthly: raw.coparentaliteMonthly,
      coparentaliteYearly: raw.coparentaliteYearly,
    },
    modules: moduleRows(s.modules),
    guide: { basis, items: guideItems },
    funnel: [
      { id: 'visite', label: 'Visites', count: s.funnel.visits_measured ? s.funnel.visits : null },
      { id: 'compte', label: 'Comptes créés', count: s.funnel.accounts },
      { id: 'enfant', label: 'Enfant ajouté', count: s.funnel.child },
      { id: 'premium', label: 'Passage à une offre payante', count: s.funnel.premium },
    ],
    territories: s.territories.map((t) => ({ code: t.territoire, label: territoryLabel(t.territoire), users: t.n })),
    recentSignups,
    recentPayments,
    alerts,
    notes,
  }
}
