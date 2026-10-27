// Libellés traduits des écrans abonnement (affichage uniquement).
// lib/billing/ui-state.ts reste la référence française partagée (profil, tests, e-mails) :
// ce module reprend EXACTEMENT ses branches pour produire les mêmes textes via le
// catalogue messages/{locale}/billing.json. Seuls label / hint / headline / detail sont
// recalculés ; kind, disabled, primary, tone, action, date viennent toujours de ui-state.
import {
  PRICING,
  formatPriceIn,
  planPromo,
  priceForPlan,
  type Cycle,
  type Offer,
  type PaidPlan,
  type PlanId,
} from '@/components/profil/pricing'
import { intlLocale } from '@/lib/i18n/config'
import { planDirection, sameOffer } from '@/lib/billing/plans'
import type { BillingView } from '@/lib/billing/types'
import {
  changeImpact,
  hasManagedSubscription,
  hasPaymentTrouble,
  type Availability,
  type BillingMode,
  type ChangeImpact,
  type PlanAction,
  type StatusSummary,
} from '@/lib/billing/ui-state'

/** Traducteur next-intl de l'espace de noms racine `billing`. */
export type BillingT = (key: string, values?: Record<string, string | number>) => string

/** Outils de formatage liés à une locale (prix EUR, dates, noms de formules). */
export function billingFormat(t: BillingT, locale: string) {
  const loc = intlLocale(locale)
  const dateFmt = new Intl.DateTimeFormat(loc, { dateStyle: 'long', timeZone: 'America/Cayenne' })
  const price = (v: number) => formatPriceIn(v, loc)
  const plan = (p: PlanId) => t(`common.plan.${p}`)
  const offer = (p: PaidPlan, c: Cycle) => t(`common.offer.${c}`, { plan: plan(p) })
  const period = (c: Cycle) => t(`common.period.${c}`)
  const pricePeriod = (v: number, c: Cycle) => t('common.pricePeriod', { price: price(v), period: period(c) })
  /** Même règle que formatDateFr : « date inconnue » si absente ou invalide. */
  const date = (iso: string | null | undefined) => {
    if (!iso) return t('common.unknownDate')
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? t('common.unknownDate') : dateFmt.format(d)
  }
  /** Équivalent de PRICING[plan].freeMonthsLabel. */
  const freeMonths = (p: PaidPlan) => {
    const { freeMonths: n, discountPct } = planPromo(p)
    return n >= 1 ? t('common.freeMonths', { count: n }) : t('common.discount', { pct: discountPct })
  }
  /** Équivalent de PRICING[plan].discountLabel. */
  const discount = (p: PaidPlan) => t('common.discount', { pct: planPromo(p).discountPct })
  /** Équivalent de PRICING[plan].discountShortLabel. */
  const saveDiscount = (p: PaidPlan) => t('common.saveDiscount', { pct: planPromo(p).discountPct })
  return { t, loc, price, plan, offer, period, pricePeriod, date, freeMonths, discount, saveDiscount, pricing: PRICING }
}

export type BillingFmt = ReturnType<typeof billingFormat>

/** Message d'erreur d'un code /api/stripe/* (mêmes codes que lib/billing/client). */
export function billingError(t: BillingT, code: string | null | undefined, known: Record<string, string>): string {
  return code && Object.hasOwn(known, code) ? t(`errors.codes.${code}`) : t('errors.generic')
}

// --- Statut (miroir de describeStatus) ---------------------------------------

export function localizeStatus(view: BillingView, f: BillingFmt): Pick<StatusSummary, 'label' | 'headline' | 'detail' | 'dateLabel'> {
  const { t } = f
  const name = f.plan(view.formule)
  const amount = view.amount ?? priceForPlan(view.formule, view.cycle)
  const price = f.pricePeriod(amount, view.cycle)
  const dateOr = (iso: string | null | undefined, fallbackKey: string) => (iso ? f.date(iso) : t(fallbackKey))
  const end = dateOr(view.periodEnd, 'status.periodEndFallback')

  if (view.status === 'incomplete') {
    return {
      label: t('status.label.incomplete'),
      headline: t('status.incomplete.headline', { name }),
      detail: view.payUrl ? t('status.incomplete.detailPay') : t('status.incomplete.detailNoPay'),
      dateLabel: null,
    }
  }

  if (!hasManagedSubscription(view)) {
    const ended = view.status === 'canceled' || view.status === 'incomplete_expired'
    if (view.sharedPremium) {
      return { label: t('status.label.premiumOffered'), headline: t('status.shared.headline'), detail: t('status.shared.detail'), dateLabel: null }
    }
    return {
      label: t('status.label.free'),
      headline: ended ? t('status.free.headlineEnded') : t('status.free.headline'),
      detail: ended ? t('status.free.detailEnded') : t('status.free.detail'),
      dateLabel: null,
    }
  }

  if (hasPaymentTrouble(view)) {
    return {
      label: t(`status.label.${view.status}`),
      headline: t('status.trouble.headline'),
      detail: view.status === 'past_due' ? t('status.trouble.detailPastDue', { name }) : t('status.trouble.detailUnpaid', { name }),
      dateLabel: null,
    }
  }

  if (view.cancelAtPeriodEnd) {
    return {
      label: t('status.label.cancelScheduled', { date: dateOr(view.periodEnd, 'status.periodEndShortFallback') }),
      headline: t('status.canceling.headline', { name, date: end }),
      detail: t('status.canceling.detail', { date: end }),
      dateLabel: t('status.canceling.dateLabel'),
    }
  }

  if (view.status === 'trialing') {
    const trialEnd = dateOr(view.trialEnd ?? view.periodEnd, 'status.trialEndFallback')
    return {
      label: t('status.label.trialing'),
      headline: t('status.trial.headline', { name }),
      detail: t('status.trial.detail', { price, date: trialEnd }),
      dateLabel: t('status.trial.dateLabel'),
    }
  }

  if (view.status === 'paused') {
    return { label: t('status.label.paused'), headline: t('status.paused.headline', { name }), detail: t('status.paused.detail'), dateLabel: null }
  }

  const detail = view.pending
    ? t('status.active.detailPending', {
        price: f.pricePeriod(priceForPlan(view.pending.plan, view.pending.cycle), view.pending.cycle),
        date: end,
        offer: f.offer(view.pending.plan, view.pending.cycle),
      })
    : t('status.active.detail', { price, date: end })
  return { label: t('status.label.active'), headline: t('status.active.headline', { name }), detail, dateLabel: t('status.active.dateLabel') }
}

// --- Bouton par formule (miroir de planAction) -------------------------------

export function localizePlanChangeLabel(current: Offer, target: Offer, f: BillingFmt): string {
  const d = planDirection(current.plan, target.plan)
  if (d === 'upgrade') return f.t('actions.upgradeTo', { plan: f.plan(target.plan) })
  if (d === 'downgrade') return f.t('actions.downgradeTo', { plan: f.plan(target.plan) })
  return target.cycle === 'annuel' ? f.t('actions.toYearly') : f.t('actions.toMonthly')
}

/** Libellé et précision traduits du bouton ; `action` (calculée par planAction) reste la source du comportement. */
export function localizePlanAction(
  input: { mode: BillingMode; view: BillingView; target: PlanId; cycle: Cycle; available: Availability },
  action: PlanAction,
  f: BillingFmt,
): PlanAction {
  const { t } = f
  const { mode, view, target, cycle, available } = input
  const managed = hasManagedSubscription(view)
  const endLabel = view.periodEnd ? f.date(view.periodEnd) : t('status.periodEndShortFallback')
  const out = (label: string, hint: string | null = null): PlanAction => ({ ...action, label, hint })

  if (!managed) {
    if (target === 'gratuit') return out(t('actions.current'))
    if (mode === 'unavailable' || !available[target][cycle]) return out(t('actions.paymentSoon'), t('actions.paymentSoonHint'))
    return out(t('actions.subscribe'), mode === 'demo' ? t('actions.demoHint') : t('actions.secureHint'))
  }

  const current: Offer = { plan: view.formule, cycle: view.cycle }

  if (target === 'gratuit') {
    if (view.cancelAtPeriodEnd) return out(t('actions.scheduledOn', { date: endLabel }), t('actions.backToFreeScheduledHint'))
    return out(t('actions.backToFree'), t('actions.benefitsUntil', { date: endLabel }))
  }

  const targetOffer: Offer = { plan: target, cycle }
  const isCurrentOffer = sameOffer(targetOffer, current)

  if (hasPaymentTrouble(view)) {
    if (target === current.plan) return out(t('actions.updatePayment'), t('actions.portalHint'))
    return out(localizePlanChangeLabel(current, targetOffer, f), t('actions.fixFirst'))
  }

  if (view.cancelAtPeriodEnd) {
    if (isCurrentOffer) return out(t('actions.resume'), t('actions.resumeHint', { date: endLabel }))
    return out(localizePlanChangeLabel(current, targetOffer, f), t('actions.resumeFirst'))
  }

  if (isCurrentOffer) {
    if (view.pending) return out(t('actions.keep'), t('actions.keepHint', { offer: f.offer(view.pending.plan, view.pending.cycle) }))
    return out(t('actions.current'))
  }

  if (sameOffer(targetOffer, view.pending)) return out(t('actions.scheduledOn', { date: endLabel }), t('actions.scheduledHint'))

  if (mode === 'unavailable' || !available[target][cycle]) return out(t('actions.soon'))

  const impact = changeImpact(current, view.pending, targetOffer)
  const hint =
    impact === 'scheduled'
      ? t('actions.fromDate', { date: endLabel })
      : `${impact === 'upgrade' ? t('actions.immediateUpgrade') : t('actions.immediateDowngrade')}${
          cycle !== current.cycle ? t('actions.cycleFrom', { cycle: t(`common.cycleLower.${cycle}`), date: endLabel }) : ''
        }.`
  return out(localizePlanChangeLabel(current, targetOffer, f), hint)
}

// --- Effet d'un changement (miroir de changeImpactText) -----------------------

export function localizeChangeImpact(
  impact: ChangeImpact,
  current: Offer,
  target: Offer,
  periodEnd: string | null,
  f: BillingFmt,
  opts: { trialing?: boolean } = {},
): string {
  const { t } = f
  const priceOf = (o: Offer) => f.pricePeriod(priceForPlan(o.plan, o.cycle), o.cycle)
  const end = periodEnd ? f.date(periodEnd) : t('impact.nextDueFallback')
  const now: Offer = { plan: target.plan, cycle: current.cycle }
  const cyclePart = target.cycle !== current.cycle
    ? t('impact.cyclePart', { cycle: t(`common.cycleLower.${target.cycle}`), price: priceOf(target), date: end })
    : ''
  const thenPrice = cyclePart ? '' : t('impact.thenPrice', { price: priceOf(now) })
  const trialThen = cyclePart ? '' : t('impact.trialThen', { price: priceOf(now) })
  const family = target.plan === 'coparentalite' ? t('impact.familyGain') : t('impact.familyLoss')
  const offerNow = f.offer(now.plan, now.cycle)
  switch (impact) {
    case 'none':
      return t('impact.none')
    case 'cancel_pending':
      return t('impact.cancelPending', { offer: f.offer(current.plan, current.cycle) })
    case 'scheduled':
      return t('impact.scheduled', { offer: f.offer(target.plan, target.cycle), price: priceOf(target), date: end })
    case 'upgrade':
      return opts.trialing
        ? t('impact.upgradeTrial', { offer: offerNow, trialThen, cyclePart, family })
        : t('impact.upgrade', { offer: offerNow, date: end, thenPrice, cyclePart, family })
    case 'downgrade':
      return opts.trialing
        ? t('impact.downgradeTrial', { offer: offerNow, trialThen, cyclePart, family })
        : t('impact.downgrade', { offer: offerNow, thenPrice, cyclePart, family })
  }
}
