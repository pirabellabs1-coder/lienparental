'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown, CreditCard, FlaskConical, Info, Receipt, RotateCcw, Sparkles, XCircle } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { ConfirmDialog } from '@/components/ui'
import { Banner, ListGroup, ListRow, StripeNote, btn } from '@/components/profil/kit'
import { PlanComparison } from '@/components/profil/PlanComparison'
import { PRICING, type Cycle, type Offer, type PaidPlan, type PlanId } from '@/components/profil/pricing'
import { BILLING_ERROR_MESSAGES, notifyBillingChanged, openBillingPortal, postBilling, startCheckout } from '@/lib/billing/client'
import type { BillingView } from '@/lib/billing/types'
import {
  BILLING_INFO,
  changeImpact,
  describeStatus,
  hasManagedSubscription,
  planAction,
  type Availability,
  type BillingMode,
  type PlanAction,
} from '@/lib/billing/ui-state'
import { cn } from '@/lib/cn'
import { billingError, billingFormat, localizeChangeImpact, localizePlanAction, localizeStatus, type BillingFmt } from './billing-i18n'
import { BillingNotice } from './BillingNotice'
import { InvoicesList } from './InvoicesList'
import { PlanCard } from './PlanCard'
import { StatusCard } from './StatusCard'

const PLANS: readonly PlanId[] = ['gratuit', 'premium', 'coparentalite']

type Dialog = { type: 'change'; target: Offer } | { type: 'cancel' } | null

export type SubscriptionCenterProps = {
  mode: BillingMode
  view: BillingView
  available: Availability
  initialCycle: Cycle
  /** Formule mise en avant (homepage, paywall). */
  focusPlan: PaidPlan | null
  reason: { title: string; text: string } | null
  info: string | null
  erreur: string | null
  showInvoices: boolean
  /** Un customer Stripe existe (ancien abonné inclus) : portail et factures accessibles. */
  hasCustomer: boolean
  /** `?section=factures` : défilement direct vers les factures. */
  scrollToInvoices: boolean
  demoInvoices: { id: string; date: string; amount: number; paid: boolean }[]
}

export function SubscriptionCenter({ mode, view, available, initialCycle, focusPlan, reason, info, erreur, showInvoices, hasCustomer, scrollToInvoices, demoInvoices }: SubscriptionCenterProps) {
  const router = useRouter()
  const t = useTranslations('billing')
  const f = billingFormat(t, useLocale())
  /** Message d'un code ?info= / retour d'action (codes de BILLING_INFO). */
  const infoText = (code: string) => t(`info.${code}`)
  const [cycle, setCycle] = useState<Cycle>(initialCycle)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(info && Object.hasOwn(BILLING_INFO, info) ? infoText(info) : null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const plansRef = useRef<HTMLElement>(null)

  const managed = hasManagedSubscription(view)
  // Comportement (tone, action, date) : ui-state ; libellés : traduits.
  const status = { ...describeStatus(view), ...localizeStatus(view, f) }
  const demo = mode === 'demo'
  const name = f.plan(view.formule)
  const endLabel = view.periodEnd ? f.date(view.periodEnd) : t('status.periodEndFallback')
  const errorText = (code: string) => billingError(t, code, BILLING_ERROR_MESSAGES)

  // Arrivée depuis la page d'accueil ou un paywall : la grille des formules est montrée directement.
  useEffect(() => {
    if (scrollToInvoices) document.getElementById('factures')?.scrollIntoView({ block: 'start', behavior: 'auto' })
    else if (focusPlan && !managed) plansRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' })
  }, [focusPlan, managed, scrollToInvoices])

  // Retour arrière depuis Stripe (bfcache) : les boutons redeviennent actifs.
  useEffect(() => {
    const reset = () => setBusy(null)
    window.addEventListener('pageshow', reset)
    return () => window.removeEventListener('pageshow', reset)
  }, [])

  /** Après tout changement : droits recalculés partout (composants serveur + autres onglets). */
  function changed(message: string) {
    setError(null)
    setNotice(message)
    notifyBillingChanged()
    router.refresh()
  }

  const fail = (message: string) => {
    setBusy(null)
    setNotice(null)
    setError(message)
  }

  async function subscribe(plan: PaidPlan) {
    setError(null)
    setBusy(plan)
    if (demo) {
      const res = await postBilling('/api/stripe/demo', { action: 'subscribe', formule: plan, cycle })
      if (!res.ok) return fail(errorText(res.code))
      notifyBillingChanged()
      router.push(`/app/abonnement/confirmation?demo=1&formule=${plan}&cycle=${cycle}`)
      return
    }
    const res = await startCheckout(plan, cycle)
    if (!res.ok) {
      if (res.code === 'already_subscribed') router.refresh()
      fail(errorText(res.code))
    }
    // Succès : navigation vers Stripe Checkout en cours (le bouton reste « Un instant… »).
  }

  async function applyChange(target: Offer) {
    setBusy('change')
    const res = demo
      ? await postBilling<{ ok: true }>('/api/stripe/demo', { action: 'change', formule: target.plan, cycle: target.cycle })
      : await postBilling<{ status: string; pending: Offer | null }>('/api/stripe/change-plan', {
          formule: target.plan,
          cycle: target.cycle,
          // Un identifiant par clic : clé d'idempotence Stripe (double clic dédupliqué, jamais un ancien changement rejoué).
          request_id: crypto.randomUUID(),
        })
    setDialog(null)
    if (!res.ok) return fail(errorText(res.code))
    setBusy(null)
    const code = 'status' in res.data ? res.data.status : 'upgraded'
    const pending = 'pending' in res.data ? res.data.pending : null
    const later = pending ? t('center.laterChange', { offer: f.offer(pending.plan, pending.cycle) }) : ''
    changed(demo ? t('center.demoChanged', { offer: f.offer(target.plan, target.cycle) }) : `${infoText(Object.hasOwn(BILLING_INFO, code) ? code : 'unchanged')}${later}`)
  }

  async function setCancel(cancel: boolean) {
    setBusy(cancel ? 'cancel' : 'resume')
    const res = demo
      ? await postBilling('/api/stripe/demo', { action: cancel ? 'cancel' : 'resume' })
      : await postBilling<{ current_period_end: string }>('/api/stripe/cancel', { cancel })
    setDialog(null)
    if (!res.ok) return fail(errorText(res.code))
    setBusy(null)
    changed(cancel
      ? t('center.canceledNotice', { name, date: endLabel })
      : infoText('resumed'))
  }

  async function portal() {
    setError(null)
    if (demo) {
      setNotice(t('center.demoPortal'))
      return
    }
    setBusy('portal')
    const res = await openBillingPortal()
    if (!res.ok) fail(errorText(res.code))
  }

  async function resetDemo() {
    setBusy('reset')
    const res = await postBilling('/api/stripe/demo', { action: 'reset' })
    if (!res.ok) return fail(errorText(res.code))
    setBusy(null)
    changed(infoText('demo_reset'))
  }

  function onPlan(plan: PlanId, action: PlanAction) {
    if (busy) return
    switch (action.kind) {
      case 'subscribe':
        if (plan !== 'gratuit') void subscribe(plan)
        return
      case 'change':
        if (plan !== 'gratuit') setDialog({ type: 'change', target: { plan, cycle } })
        return
      case 'keep':
        if (plan !== 'gratuit') void applyChange({ plan, cycle })
        return
      case 'resume':
        void setCancel(false)
        return
      case 'fix_payment':
        void portal()
        return
      case 'cancel':
        setDialog({ type: 'cancel' })
        return
      default:
        return
    }
  }

  const current: Offer = { plan: view.formule, cycle: view.cycle }
  const changeTarget = dialog?.type === 'change' ? dialog.target : null
  const impact = changeTarget ? changeImpact(current, view.pending, changeTarget) : 'none'

  const statusAction =
    status.action === 'pay' && view.payUrl ? (
      <a href={view.payUrl} className={btn.primary} rel="noopener noreferrer">
        <CreditCard className="h-5 w-5" aria-hidden />
        {t('center.payOnStripe')}
      </a>
    ) : status.action === 'fix_payment' ? (
      <button type="button" className={btn.primary} onClick={() => void portal()} disabled={!!busy} aria-busy={busy === 'portal' || undefined}>
        <CreditCard className="h-5 w-5" aria-hidden />
        {busy === 'portal' ? t('center.portalOpening') : t('center.updatePaymentMethod')}
      </button>
    ) : status.action === 'resume' ? (
      <button type="button" className={btn.primary} onClick={() => void setCancel(false)} disabled={!!busy} aria-busy={busy === 'resume' || undefined}>
        <RotateCcw className="h-5 w-5" aria-hidden />
        {busy === 'resume' ? t('center.resuming') : t('center.resume')}
      </button>
    ) : null

  return (
    <div className="mx-auto w-full max-w-[1040px] px-4 pb-10 pt-3 sm:px-5">
      {/* Messages (une seule zone, annoncée aux lecteurs d'écran). */}
      <div className="space-y-3">
        <BillingNotice code={erreur} />
        {error && (
          <div role="alert">
            <Banner tone="red" icon={<AlertTriangle className="h-5 w-5" />} title={t('errors.title')}>{error}</Banner>
          </div>
        )}
        {notice && <div role="status"><Banner tone="green" icon={<Info className="h-5 w-5" />}>{notice}</Banner></div>}
        {demo && (
          <Banner tone="gold" icon={<FlaskConical className="h-5 w-5" />} title={t('center.demoTitle')}>
            {t('center.demoText')}{' '}
            {(managed || view.plan !== 'gratuit') && (
              <button type="button" onClick={() => void resetDemo()} disabled={!!busy} className="inline-flex min-h-[44px] items-center font-semibold text-night-900 underline underline-offset-2">
                {t('center.resetDemo')}
              </button>
            )}
          </Banner>
        )}
        {mode === 'unavailable' && (
          <Banner tone="night" icon={<Info className="h-5 w-5" />} title={t('center.unavailableTitle')}>
            {t('center.unavailableText')}
          </Banner>
        )}
        {reason && !managed && (
          <Banner tone="warm" icon={<Sparkles className="h-5 w-5" />} title={reason.title}>{reason.text}</Banner>
        )}
      </div>

      {/* Statut et formules côte à côte seulement à partir de 2xl ; les cartes passent à 3 colonnes dès xl (1280 px), en dessous tout s'empile. */}
      <div className={cn('2xl:grid 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)] 2xl:items-start 2xl:gap-6', 'mt-4')}>
        {/* 1. Statut actuel */}
        <div className="space-y-4 2xl:sticky 2xl:top-6">
          <StatusCard view={view} status={status} action={statusAction} />

          {(managed || hasCustomer) && (
            <section aria-labelledby="gerer-titre">
              <h2 id="gerer-titre" className="mb-2 text-[15px] font-bold text-night-900">{t('center.manage')}</h2>
              <ListGroup>
                <ListRow
                  onClick={busy ? undefined : () => void portal()}
                  icon={<CreditCard className="h-5 w-5" />}
                  title={busy === 'portal' ? t('center.portalOpening') : t('center.managePayment')}
                  subtitle={t('center.managePaymentSub')}
                />
                <ListRow href="#factures" icon={<Receipt className="h-5 w-5" />} title={t('center.invoices')} subtitle={t('center.invoicesSub')} />
                {!managed ? null : view.cancelAtPeriodEnd ? (
                  <ListRow
                    onClick={busy ? undefined : () => void setCancel(false)}
                    icon={<RotateCcw className="h-5 w-5" />}
                    title={busy === 'resume' ? t('center.resuming') : t('center.resume')}
                    subtitle={t('center.resumeSub', { date: endLabel })}
                  />
                ) : (
                  <ListRow
                    onClick={busy ? undefined : () => setDialog({ type: 'cancel' })}
                    tone="danger"
                    icon={<XCircle className="h-5 w-5" />}
                    title={t('center.cancel')}
                    subtitle={<span className="text-night-700">{t('center.cancelSub', { date: endLabel })}</span>}
                  />
                )}
              </ListGroup>
            </section>
          )}
        </div>

        {/* 2. Formules */}
        <section ref={plansRef} aria-labelledby="formules-titre" className="mt-6 scroll-mt-20 2xl:mt-0">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="formules-titre" className="text-[17px] font-extrabold text-night-900">{managed ? t('center.changePlan') : t('center.choosePlan')}</h2>
              <p className="mt-0.5 text-[12.5px] text-night-700">{t('center.noCommitment')}</p>
            </div>
            <CycleSwitch value={cycle} onChange={setCycle} f={f} />
          </div>
          <p className="mt-3 rounded-xl border border-leaf-100 bg-leaf-50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-night-900">
            {cycle === 'annuel'
              ? t.rich('center.annualBanner', { strong, premiumPromo: f.freeMonths('premium'), savings: f.price(PRICING.premium.yearlySavings), copaPromo: f.freeMonths('coparentalite') })
              : t.rich('center.monthlyBanner', { strong, amount: f.price(PRICING.coparentalite.yearlySavings) })}
          </p>

          <ul className="mt-4 grid gap-4 xl:grid-cols-3">
            {PLANS.map(plan => {
              const input = { mode, view, target: plan, cycle, available }
              const action = localizePlanAction(input, planAction(input), f)
              const isOwn = managed ? plan === view.formule : plan === 'gratuit' && !view.sharedPremium
              return (
                <PlanCard
                  key={plan}
                  plan={plan}
                  cycle={cycle}
                  action={action}
                  isOwn={isOwn}
                  featured={!managed && plan === (focusPlan ?? 'premium')}
                  busy={busy === plan}
                  locked={busy !== null}
                  onAction={() => onPlan(plan, action)}
                />
              )
            })}
          </ul>
          {managed && (
            <p className="mt-3 text-[12px] leading-relaxed text-night-700">
              {t('center.changeRules')}
            </p>
          )}

          <details className="group mt-5">
            <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 text-[13.5px] font-semibold text-leaf-700 hover:text-leaf-800 [&::-webkit-details-marker]:hidden">
              {t('center.compare')}
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
            </summary>
            <PlanComparison highlight={managed ? view.formule : focusPlan ?? undefined} className="mt-2" />
            <p className="mt-2 text-[12px] leading-relaxed text-night-700">
              {t('center.sharedNote')}
            </p>
          </details>

          {/* 3. Factures */}
          {(showInvoices || hasCustomer) && (
            <section id="factures" aria-labelledby="factures-titre" className="mt-8 scroll-mt-20">
              <h2 id="factures-titre" className="mb-1 text-[15px] font-bold text-night-900">{t('center.invoices')}</h2>
              <InvoicesList live={mode === 'live'} mock={demoInvoices} />
            </section>
          )}

          <StripeNote className="mt-6" />
        </section>
      </div>

      <ConfirmDialog
        open={dialog?.type === 'change'}
        onClose={() => { if (!busy) setDialog(null) }}
        onConfirm={() => { if (changeTarget) void applyChange(changeTarget) }}
        title={changeTarget ? t('center.changeTitle', { offer: f.offer(changeTarget.plan, changeTarget.cycle) }) : t('center.changeTitleFallback')}
        description={changeTarget ? `${localizeChangeImpact(impact, current, changeTarget, view.periodEnd, f, { trialing: view.status === 'trialing' })}${demo ? t('center.demoSuffix') : ''}` : ''}
        confirmLabel={t('center.confirmChange')}
        cancelLabel={t('center.cancelButton')}
        tone="default"
        loading={busy === 'change'}
      />

      <ConfirmDialog
        open={dialog?.type === 'cancel'}
        onClose={() => { if (!busy) setDialog(null) }}
        onConfirm={() => void setCancel(true)}
        title={t('center.cancelTitle')}
        description={t('center.cancelDescription', { name, date: endLabel, family: view.formule === 'coparentalite' ? t('center.cancelFamily') : '' })}
        confirmLabel={t('center.confirmCancel')}
        cancelLabel={t('center.keepPlan', { name })}
        loading={busy === 'cancel'}
      />
    </div>
  )
}

/** Mise en gras des montants dans les bandeaux traduits (t.rich). */
const strong = (chunks: React.ReactNode) => <strong className="font-bold text-leaf-800">{chunks}</strong>

/** Sélecteur Mensuel / Annuel (groupe radio, flèches du clavier). */
function CycleSwitch({ value, onChange, f }: { value: Cycle; onChange: (c: Cycle) => void; f: BillingFmt }) {
  const { t } = f
  const items: { key: Cycle; label: string; badge?: string }[] = [
    { key: 'mensuel', label: t('common.cycle.mensuel') },
    { key: 'annuel', label: t('common.cycle.annuel'), badge: t('center.upTo', { discount: f.discount('premium') }) },
  ]
  return (
    <div role="radiogroup" aria-label={t('center.billingAria')} className="inline-flex rounded-xl border border-night-200 bg-night-50 p-1">
      {items.map(it => {
        const active = value === it.key
        return (
          <button
            key={it.key}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(it.key)}
            onKeyDown={e => {
              if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                e.preventDefault()
                const next = value === 'mensuel' ? 'annuel' : 'mensuel'
                onChange(next)
                const sibling = (e.currentTarget.parentElement?.querySelector(`[data-cycle="${next}"]`) as HTMLButtonElement | null)
                sibling?.focus()
              }
            }}
            data-cycle={it.key}
            className={cn(
              'inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3.5 text-[13.5px] font-bold transition-colors motion-reduce:transition-none',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500',
              active ? 'bg-white text-night-900 shadow-soft' : 'text-night-700 hover:text-night-900',
            )}
          >
            {it.label}
            {it.badge && <span className="rounded-md bg-leaf-700 px-1.5 py-0.5 text-[10.5px] font-bold text-white">{it.badge}</span>}
          </button>
        )
      })}
    </div>
  )
}
