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
import { attachSparklines, mrrSeries } from './trends'
import type { Cohorts, DashboardData, GuideTop, Period, RecentPayment, RecentSignup, TodayStats, Trends } from './types'

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

// 0450 : séries temporelles, cohortes, bandeau « Aujourd'hui ».
const devSchema = z.object({ mobile: n, ordinateur: n, tablette: n, inconnu: n })
const trendsSchema = z.object({
  active_daily: z.array(z.object({ d: z.string(), dau: n, wau: n })),
  active_prev_daily: z.array(z.object({ d: z.string(), dau: n })),
  accounts_daily: z.array(z.object({ d: z.string(), n })),
  subs_daily: z.array(z.object({ d: z.string(), pm: n, py: n, cm: n, cy: n })),
  subs_flow_daily: z.array(z.object({ d: z.string(), new: n, canceled: n })),
  activity_daily: z.array(z.object({ d: z.string(), messages: n, ai: n, documents: n })),
  devices: z.object({ current: devSchema, previous: devSchema, pwa_measured: z.boolean().catch(false) }),
})
const cohortsSchema = z.object({
  current_week: z.string(),
  last_day: z.string().optional(),
  cohorts: z.array(z.object({ w: z.string(), size: n, active: z.array(n).max(60) })).max(60),
})
const todaySchema = z.object({
  day: z.string(), signups: n, signups_prev: n, active: n, active_prev: n,
  messages: n, messages_prev: n, tickets_open: n, tickets_new: n,
})

const eur = (cents: number) => round2(cents / 100)

/** Échec d'une RPC facultative : absente (migration non appliquée) ou en erreur (dont délai dépassé). */
type OptionalFailure = { failed: 'missing' | 'error' }
const isFailure = (v: unknown): v is OptionalFailure => typeof v === 'object' && v !== null && 'failed' in v

/** RPC facultative (migration récente) : un refus d'accès reste une erreur, le reste devient un échec signalé. */
function optional(p: Promise<unknown>): Promise<unknown> {
  return p.catch((e: unknown): unknown => {
    if (e instanceof StatsUnavailableError && e.message === 'forbidden') throw e
    return { failed: e instanceof StatsUnavailableError && e.message === 'missing_function' ? 'missing' : 'error' } satisfies OptionalFailure
  })
}

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

  const [overviewRaw, seriesRaw, feedRaw, stripe, copaRaw, trendsRaw, cohortsRaw, todayRaw] = await Promise.all([
    rpc(supabase, 'admin_stats_overview', args),
    rpc(supabase, 'admin_stats_series', args),
    rpc(supabase, 'admin_stats_feed', { p_limit: 8, p_free_quota: ANALYSIS_QUOTA.gratuit }),
    STRIPE_ENABLED ? loadStripeRevenue(stripeFrom, period.to, tz) : Promise.resolve(null),
    // 0380 : abonnés Coparentalité+. Migration absente → zéro et une note (pas d'échec du tableau).
    rpc(supabase, 'admin_stats_coparentalite', { p_from: period.from, p_to: period.to }).catch((e: unknown) =>
      e instanceof StatsUnavailableError && e.message === 'forbidden' ? Promise.reject(e) : null),
    // 0450 : absentes → graphiques correspondants remplacés par un message, pas d'échec du tableau.
    optional(rpc(supabase, 'admin_stats_trends', args)),
    optional(rpc(supabase, 'admin_stats_cohorts', { p_to: period.to, p_tz: tz, p_weeks: 12 })),
    optional(rpc(supabase, 'admin_stats_today', { p_tz: tz })),
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

  // Séries 0450 (forme vérifiée ; toute réponse inattendue = série absente).
  const tr = trendsSchema.safeParse(trendsRaw)
  const trends: Trends | null = !isFailure(trendsRaw) && tr.success
    ? (() => {
        const subsDaily = tr.data.subs_daily.map((r) => ({ day: r.d, premiumMonthly: r.pm, premiumYearly: r.py, coparentaliteMonthly: r.cm, coparentaliteYearly: r.cy }))
        return {
          activeDaily: tr.data.active_daily.map((r) => ({ day: r.d, dau: r.dau, wau: r.wau })),
          activePrevDaily: tr.data.active_prev_daily.map((r) => ({ day: r.d, value: r.dau })),
          accountsDaily: tr.data.accounts_daily.map((r) => ({ day: r.d, value: r.n })),
          subsDaily,
          mrrDaily: mrrSeries(subsDaily, pricing),
          subsFlowDaily: tr.data.subs_flow_daily.map((r) => ({ day: r.d, started: r.new, canceled: r.canceled })),
          activityDaily: tr.data.activity_daily.map((r) => ({ day: r.d, messages: r.messages, ai: r.ai, documents: r.documents })),
          devices: { current: tr.data.devices.current, previous: tr.data.devices.previous, pwaMeasured: tr.data.devices.pwa_measured },
        }
      })()
    : null
  const co = cohortsSchema.safeParse(cohortsRaw)
  const cohorts: Cohorts | null = !isFailure(cohortsRaw) && co.success
    ? { currentWeek: co.data.current_week, lastDay: co.data.last_day, cohorts: co.data.cohorts.map((c) => ({ week: c.w, size: c.size, active: c.active })) }
    : null
  const td = todaySchema.safeParse(todayRaw)
  const today: TodayStats | null = !isFailure(todayRaw) && td.success
    ? {
        day: td.data.day, signups: td.data.signups, signupsPrev: td.data.signups_prev, active: td.data.active, activePrev: td.data.active_prev,
        messages: td.data.messages, messagesPrev: td.data.messages_prev, ticketsOpen: td.data.tickets_open, ticketsNew: td.data.tickets_new,
      }
    : null
  const optionalRaw = [trendsRaw, cohortsRaw, todayRaw]
  if (optionalRaw.some((r) => isFailure(r) && r.failed === 'missing')) {
    notes.push('Courbes d’évolution, rétention par cohorte ou chiffres du jour indisponibles : appliquer la migration 0450_admin_stats_trends.sql.')
  } else if (!trends || !cohorts || !today) {
    notes.push('Courbes d’évolution, rétention par cohorte ou chiffres du jour non calculés (erreur ou délai dépassé côté base) : réessayez ou choisissez une période plus courte.')
  }

  const signupsDaily = s.signups_daily.filter((p) => p.d >= period.fromDay && p.d <= period.toDay).map((p) => ({ day: p.d, value: p.n }))
  const revenueMonthly = fillMonths(monthly, revFromMonth, monthKey)
  const paid = paidTotal(raw)
  return {
    source: stripe ? 'base+stripe' : 'base',
    generatedAt: now.toISOString(),
    period,
    kpis: attachSparklines(buildKpis(raw, pricing, period), { trends, signupsDaily, revenueMonthly, grain: period.grain, fromDay: period.fromDay, toDay: period.toDay }),
    signupsDaily,
    revenueMonthly,
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
    trends,
    cohorts,
    today,
    notes,
  }
}
