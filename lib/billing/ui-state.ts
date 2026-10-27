// État affiché de l'écran « Mon abonnement » : libellés de statut en français
// simple, bouton unique par formule, explication des changements (prorata).
// Module PUR (testé dans tests/billing.test.ts), importable côté client.
import {
  PLAN_NAME,
  formatPrice,
  periodFor,
  planLabel,
  priceForPlan,
  type Cycle,
  type Offer,
  type PaidPlan,
  type PlanId,
} from '@/components/profil/pricing'
import type { SubscriptionStatus } from '@/lib/supabase/types'
import { planDirection, sameOffer } from './plans'
import { STATUS_LABEL, formatDateFr, type BillingView } from './types'

/**
 * Mode de facturation de l'écran :
 *  - live        : Stripe et Supabase configurés (vrai paiement) ;
 *  - demo        : comptes de démonstration, abonnement simulé (aucun paiement) ;
 *  - unavailable : comptes réels mais Stripe pas encore branché (« Paiement bientôt disponible »).
 */
export type BillingMode = 'live' | 'demo' | 'unavailable'

/** Formules vendables (Price ID configuré), par niveau et par cycle. */
export type Availability = Record<PaidPlan, Record<Cycle, boolean>>

export const ALL_AVAILABLE: Availability = {
  premium: { mensuel: true, annuel: true },
  coparentalite: { mensuel: true, annuel: true },
}
export const NONE_AVAILABLE: Availability = {
  premium: { mensuel: false, annuel: false },
  coparentalite: { mensuel: false, annuel: false },
}

// Mêmes statuts que isBlockingStatus (serveur) : un abonnement « incomplete » (paiement
// initial non abouti) expire seul chez Stripe ; l'utilisateur peut relancer un paiement.
const SUBSCRIBED: readonly SubscriptionStatus[] = ['active', 'trialing', 'past_due', 'unpaid', 'paused']
const PAYMENT_TROUBLE: readonly SubscriptionStatus[] = ['past_due', 'unpaid']

/** Un abonnement Stripe existe et se gère (changement, résiliation, paiement). */
export function hasManagedSubscription(view: Pick<BillingView, 'status'>): boolean {
  return !!view.status && SUBSCRIBED.includes(view.status)
}

export function hasPaymentTrouble(view: Pick<BillingView, 'status'>): boolean {
  return !!view.status && PAYMENT_TROUBLE.includes(view.status)
}

// --- Statut ----------------------------------------------------------------

export type StatusTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral'
/** Pastilles de statut : contrastes AA (texte foncé sur fond clair). */
export const TONE_BADGE: Record<StatusTone, string> = {
  success: 'border-leaf-200 bg-leaf-50 text-leaf-800',
  info: 'border-night-200 bg-night-50 text-night-900',
  warning: 'border-gold-200 bg-gold-50 text-gold-800',
  danger: 'border-alert-200 bg-alert-50 text-alert-700',
  neutral: 'border-night-200 bg-white text-night-900',
}

export type StatusAction = 'fix_payment' | 'pay' | 'resume' | null

export type StatusSummary = {
  /** Pastille courte : Actif, Essai, Paiement en échec, Résiliation programmée le …, Gratuit. */
  label: string
  tone: StatusTone
  /** Phrase principale, en français simple. */
  headline: string
  /** Précision (dates, montant, conséquence). */
  detail: string
  action: StatusAction
  /** Libellé de la date affichée dans le résumé (Prochaine échéance / Fin d'accès), ou null. */
  dateLabel: string | null
  date: string | null
}

const dateOr = (iso: string | null | undefined, fallback: string) => (iso ? formatDateFr(iso) : fallback)

/** Résumé du statut affiché en tête de « Mon abonnement ». */
export function describeStatus(view: BillingView): StatusSummary {
  const name = PLAN_NAME[view.formule]
  const amount = view.amount ?? priceForPlan(view.formule, view.cycle)
  const price = `${formatPrice(amount)} ${periodFor(view.cycle)}`
  const end = dateOr(view.periodEnd, 'la fin de la période en cours')

  if (view.status === 'incomplete') {
    // Premier paiement non abouti (3-D Secure abandonné, refus) : rien n'est ouvert.
    return {
      label: STATUS_LABEL.incomplete,
      tone: 'warning',
      headline: `Votre paiement ${name} n’est pas terminé`,
      detail: view.payUrl
        ? 'Finalisez le paiement sur la page sécurisée de Stripe pour activer votre formule. Sans paiement, la demande expire seule sous 24 heures.'
        : 'Sans paiement, la demande expire seule sous 24 heures. Vous pouvez choisir à nouveau une formule ci-dessous.',
      action: view.payUrl ? 'pay' : null,
      dateLabel: null,
      date: null,
    }
  }

  if (!hasManagedSubscription(view)) {
    const ended = view.status === 'canceled' || view.status === 'incomplete_expired'
    if (view.sharedPremium) {
      return {
        label: 'Premium offert',
        tone: 'success',
        headline: 'Vous profitez de Premium grâce à votre famille',
        detail: 'Un parent lié à vos enfants est abonné à Coparentalité+. Vous n’avez rien à payer.',
        action: null,
        dateLabel: null,
        date: null,
      }
    }
    return {
      label: 'Gratuit',
      tone: 'neutral',
      headline: ended ? 'Votre abonnement a pris fin' : 'Vous utilisez l’offre Gratuite',
      detail: ended
        ? 'Votre compte est revenu à l’offre Gratuite. Vos données restent conservées et consultables.'
        : 'Choisissez une formule ci-dessous pour débloquer plus d’espace et toutes les fonctionnalités.',
      action: null,
      dateLabel: null,
      date: null,
    }
  }

  if (hasPaymentTrouble(view)) {
    return {
      label: STATUS_LABEL[view.status!],
      tone: 'danger',
      headline: 'Le dernier paiement a échoué',
      detail:
        view.status === 'past_due'
          ? `Stripe va réessayer automatiquement. Mettez à jour votre moyen de paiement pour garder ${name} sans interruption.`
          : `Vos avantages ${name} sont suspendus. Mettez à jour votre moyen de paiement pour les retrouver.`,
      action: 'fix_payment',
      dateLabel: null,
      date: null,
    }
  }

  if (view.cancelAtPeriodEnd) {
    return {
      label: `Résiliation programmée le ${dateOr(view.periodEnd, 'la fin de la période')}`,
      tone: 'warning',
      headline: `Votre abonnement ${name} s’arrêtera le ${end}`,
      detail: `Aucun nouveau prélèvement. Vous gardez tous vos avantages jusqu’au ${end}, puis votre compte passera à l’offre Gratuite. Vous pouvez reprendre l’abonnement à tout moment avant cette date.`,
      action: 'resume',
      dateLabel: 'Fin d’accès',
      date: view.periodEnd,
    }
  }

  if (view.status === 'trialing') {
    const trialEnd = dateOr(view.trialEnd ?? view.periodEnd, 'la fin de l’essai')
    return {
      label: STATUS_LABEL.trialing,
      tone: 'info',
      headline: `Essai gratuit de ${name} en cours`,
      detail: `Premier prélèvement de ${price} le ${trialEnd}, sauf résiliation avant cette date.`,
      action: null,
      dateLabel: 'Fin de l’essai',
      date: view.trialEnd ?? view.periodEnd,
    }
  }

  if (view.status === 'paused') {
    return {
      label: 'En pause',
      tone: 'warning',
      headline: `Votre abonnement ${name} est en pause`,
      detail: 'Aucun prélèvement pendant la pause. Contactez l’assistance pour le réactiver.',
      action: null,
      dateLabel: null,
      date: null,
    }
  }

  // Changement programmé : l'échéance annoncée est celle de la NOUVELLE formule.
  const next = view.pending
    ? `Prochain prélèvement de ${formatPrice(priceForPlan(view.pending.plan, view.pending.cycle))} ${periodFor(view.pending.cycle)} le ${end}, date du passage en ${planLabel(view.pending.plan, view.pending.cycle)}.`
    : `Prochain prélèvement de ${price} le ${end}.`
  return {
    label: STATUS_LABEL.active,
    tone: 'success',
    headline: `Votre abonnement ${name} est actif`,
    detail: next,
    action: null,
    dateLabel: 'Prochaine échéance',
    date: view.periodEnd,
  }
}

// --- Bouton unique par formule ---------------------------------------------

export type PlanActionKind =
  | 'current' // Plan actuel (désactivé)
  | 'subscribe' // S'abonner (depuis Gratuit) → Stripe Checkout
  | 'change' // Changement de formule (prorata expliqué)
  | 'keep' // Garder cette formule (annule un changement programmé)
  | 'scheduled' // Changement déjà programmé (désactivé)
  | 'resume' // Reprendre l'abonnement (résiliation programmée)
  | 'fix_payment' // Mettre à jour le paiement (portail Stripe)
  | 'cancel' // Revenir à Gratuit = résilier en fin de période
  | 'locked' // Indisponible tant qu'une autre action n'est pas faite (désactivé)
  | 'unavailable' // Paiement bientôt disponible (désactivé)

export type PlanAction = {
  kind: PlanActionKind
  label: string
  disabled: boolean
  /** Style principal (vert) ou secondaire (contour). */
  primary: boolean
  /** Précision affichée sous le bouton. */
  hint: string | null
}

const act = (kind: PlanActionKind, label: string, opts: Partial<Omit<PlanAction, 'kind' | 'label'>> = {}): PlanAction => ({
  kind,
  label,
  disabled: opts.disabled ?? false,
  primary: opts.primary ?? !(opts.disabled ?? false),
  hint: opts.hint ?? null,
})

/**
 * Bouton affiché sur la carte d'une formule (`target`), pour le cycle choisi
 * dans le sélecteur Mensuel / Annuel. Un seul bouton par carte, toujours.
 */
export function planAction(input: {
  mode: BillingMode
  view: BillingView
  target: PlanId
  cycle: Cycle
  available: Availability
}): PlanAction {
  const { mode, view, target, cycle, available } = input
  const managed = hasManagedSubscription(view)
  const endLabel = dateOr(view.periodEnd, 'la fin de la période')

  // --- Sans abonnement : Gratuit = actuel, formules payantes = S'abonner.
  if (!managed) {
    if (target === 'gratuit') return act('current', 'Plan actuel', { disabled: true, primary: false })
    if (mode === 'unavailable' || !available[target][cycle]) {
      return act('unavailable', 'Paiement bientôt disponible', { disabled: true, hint: 'Le paiement en ligne ouvre très prochainement.' })
    }
    return act('subscribe', 'S’abonner', {
      hint: mode === 'demo' ? 'Démonstration : aucun paiement réel.' : 'Paiement sécurisé par Stripe, résiliable à tout moment.',
    })
  }

  const current: Offer = { plan: view.formule, cycle: view.cycle }

  // --- Retour à Gratuit = résiliation en fin de période.
  if (target === 'gratuit') {
    if (view.cancelAtPeriodEnd) {
      return act('scheduled', `Prévu le ${endLabel}`, { disabled: true, primary: false, hint: 'Votre compte repassera à l’offre Gratuite à cette date.' })
    }
    return act('cancel', 'Revenir à Gratuit', { primary: false, hint: `Vos avantages restent actifs jusqu’au ${endLabel}.` })
  }

  const targetOffer: Offer = { plan: target, cycle }
  const isCurrentOffer = sameOffer(targetOffer, current)

  if (hasPaymentTrouble(view)) {
    if (target === current.plan) return act('fix_payment', 'Mettre à jour le paiement', { hint: 'Ouvre le portail sécurisé Stripe.' })
    return act('locked', planChangeLabel(current, targetOffer), { disabled: true, hint: 'Régularisez d’abord le paiement.' })
  }

  if (view.cancelAtPeriodEnd) {
    if (isCurrentOffer) return act('resume', 'Reprendre l’abonnement', { hint: `Annule la résiliation prévue le ${endLabel}.` })
    return act('locked', planChangeLabel(current, targetOffer), { disabled: true, hint: 'Reprenez d’abord l’abonnement pour changer de formule.' })
  }

  if (isCurrentOffer) {
    if (view.pending) return act('keep', 'Garder cette formule', { hint: `Annule le passage en ${planLabel(view.pending.plan, view.pending.cycle)}.` })
    return act('current', 'Plan actuel', { disabled: true, primary: false })
  }

  if (sameOffer(targetOffer, view.pending)) {
    return act('scheduled', `Prévu le ${endLabel}`, { disabled: true, primary: false, hint: 'Ce changement s’appliquera à votre prochaine échéance.' })
  }

  if (mode === 'unavailable' || !available[target][cycle]) {
    return act('unavailable', 'Bientôt disponible', { disabled: true })
  }

  const impact = changeImpact(current, view.pending, targetOffer)
  return act('change', planChangeLabel(current, targetOffer), {
    hint:
      impact === 'scheduled'
        ? `À partir du ${endLabel}, sans frais.`
        : `${impact === 'upgrade' ? 'Effet immédiat, différence au prorata' : 'Effet immédiat, crédit au prorata'}${cycle !== current.cycle ? ` ; ${cycle === 'annuel' ? 'annuel' : 'mensuel'} à partir du ${endLabel}` : ''}.`,
  })
}

/** « Passer à Coparentalité+ », « Revenir à Premium », « Passer à l'annuel »… */
export function planChangeLabel(current: Offer, target: Offer): string {
  const d = planDirection(current.plan, target.plan)
  if (d === 'upgrade') return `Passer à ${PLAN_NAME[target.plan]}`
  if (d === 'downgrade') return `Revenir à ${PLAN_NAME[target.plan]}`
  return target.cycle === 'annuel' ? 'Passer à l’annuel' : 'Passer au mensuel'
}

// --- Changement de formule : effet et prorata --------------------------------

export type ChangeImpact = 'none' | 'cancel_pending' | 'scheduled' | 'upgrade' | 'downgrade'

/** Mêmes règles que lib/billing/manage.ts#changePlan (serveur). */
export function changeImpact(current: Offer, pending: Offer | null, target: Offer): ChangeImpact {
  if (sameOffer(target, pending ?? current)) return 'none'
  if (sameOffer(target, current)) return 'cancel_pending'
  const d = planDirection(current.plan, target.plan)
  return d === 'same' ? 'scheduled' : d
}

/**
 * Explication en français simple de l'effet d'un changement (fenêtre de confirmation).
 * Mêmes règles que lib/billing/change-core.ts : le changement de NIVEAU est immédiat sur
 * le cycle en cours ; un changement de CYCLE s'applique toujours à la prochaine échéance.
 * Pendant un essai, rien n'est prélevé le jour du changement.
 */
export function changeImpactText(
  impact: ChangeImpact,
  current: Offer,
  target: Offer,
  periodEnd: string | null,
  opts: { trialing?: boolean } = {},
): string {
  const priceOf = (o: Offer) => `${formatPrice(priceForPlan(o.plan, o.cycle))} ${periodFor(o.cycle)}`
  const end = dateOr(periodEnd, 'votre prochaine échéance')
  // Niveau changé tout de suite, mais sur le cycle actuel.
  const now: Offer = { plan: target.plan, cycle: current.cycle }
  const cyclePart = target.cycle !== current.cycle
    ? ` Le passage en ${target.cycle === 'annuel' ? 'annuel' : 'mensuel'} (${priceOf(target)}) s’appliquera ensuite le ${end}.`
    : ''
  // Prix appliqué après la période en cours : le nouveau cycle s'il change, sinon le prix immédiat.
  const thenPrice = cyclePart ? '' : `, puis ${priceOf(now)}`
  const trialThen = cyclePart ? '' : ` ; à la fin de l’essai, ${priceOf(now)}`
  const family = target.plan === 'coparentalite'
    ? ' Les parents liés à vos enfants profitent aussitôt des avantages Premium.'
    : ' Les parents liés à vos enfants perdent l’accès partagé.'
  switch (impact) {
    case 'none':
      return 'C’est déjà la formule de votre prochaine échéance.'
    case 'cancel_pending':
      return `Le changement programmé est annulé : vous restez en ${planLabel(current.plan, current.cycle)}.`
    case 'scheduled':
      return `Le passage en ${planLabel(target.plan, target.cycle)} (${priceOf(target)}) s’appliquera le ${end}, sans frais ni prorata. Rien ne change d’ici là.`
    case 'upgrade':
      return opts.trialing
        ? `Effet immédiat : vous passez en ${planLabel(now.plan, now.cycle)}. Rien n’est prélevé aujourd’hui pendant l’essai${trialThen}.${cyclePart}${family}`
        : `Effet immédiat : vous passez en ${planLabel(now.plan, now.cycle)}. Vous payez aujourd’hui uniquement la différence au prorata des jours restants jusqu’au ${end}${thenPrice}.${cyclePart}${family}`
    case 'downgrade':
      return opts.trialing
        ? `Effet immédiat : vous passez en ${planLabel(now.plan, now.cycle)}. Rien n’est prélevé pendant l’essai${trialThen}.${cyclePart}${family}`
        : `Effet immédiat : vous passez en ${planLabel(now.plan, now.cycle)}. Le temps non utilisé de votre formule actuelle est crédité au prorata et déduit de vos prochaines factures${thenPrice}.${cyclePart}${family}`
  }
}

// --- Messages après une action ---------------------------------------------

/** Codes `?info=` de retour sur « Mon abonnement » (jamais la valeur brute de l'URL à l'écran). */
export const BILLING_INFO: Record<string, string> = {
  scheduled: 'Changement de formule enregistré : il s’appliquera à votre prochaine échéance.',
  pending_change_canceled: 'Le changement de formule programmé a été annulé.',
  unchanged: 'Votre formule reste inchangée.',
  upgraded: 'Votre nouvelle formule est active. La différence au prorata éventuelle est facturée aujourd’hui.',
  downgraded: 'Votre nouvelle formule est active. Le temps non utilisé est crédité sur vos prochaines factures.',
  canceled: 'Résiliation enregistrée. Vos avantages restent actifs jusqu’à la fin de la période payée.',
  resumed: 'Votre abonnement continue : la résiliation est annulée.',
  portal: 'Vos modifications sur Stripe ont été prises en compte.',
  checkout_canceled: 'Paiement annulé : aucun montant n’a été débité. Vous pouvez reprendre quand vous voulez.',
  demo_reset: 'Démonstration : abonnement simulé remis à zéro.',
}

// --- Raisons d'un paywall ------------------------------------------------------

/** `?raison=` : pourquoi l'utilisateur arrive sur l'abonnement depuis une fonctionnalité. */
export const PAYWALL_REASONS: Record<string, { title: string; text: string; formule: PaidPlan }> = {
  coach: {
    title: 'Vous avez utilisé vos analyses gratuites',
    text: 'L’offre Gratuite inclut 3 analyses du Coach IA par mois. Premium en offre 10.',
    formule: 'premium',
  },
  stockage: {
    title: 'Votre coffre-fort est presque plein',
    text: 'Premium passe votre espace de 2 Go à 10 Go.',
    formule: 'premium',
  },
  modeles: {
    title: 'Ce modèle fait partie de Premium',
    text: 'Premium débloque tous les modèles de courriers et dossiers.',
    formule: 'premium',
  },
  export: {
    title: 'Cet export fait partie de Premium',
    text: 'Premium ajoute l’export Word et Canva ; Coparentalité+ ajoute l’export avancé pour avocat ou médiateur.',
    formule: 'premium',
  },
  partage: {
    title: 'L’accès partagé fait partie de Coparentalité+',
    text: 'Avec Coparentalité+, chaque parent lié à vos enfants profite des avantages Premium.',
    formule: 'coparentalite',
  },
}

export function paywallReason(value: unknown) {
  const v = Array.isArray(value) ? value[0] : value
  return typeof v === 'string' && Object.hasOwn(PAYWALL_REASONS, v) ? PAYWALL_REASONS[v]! : null
}
