'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Clock, FlaskConical, Loader2, ShieldCheck, XCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Banner, SuccessBurst, btn } from '@/components/profil/kit'
import type { PlanId } from '@/components/profil/pricing'
import { BILLING_ERROR_MESSAGES, notifyBillingChanged } from '@/lib/billing/client'
import type { CheckoutReturnState } from '@/lib/billing/checkout-core'
import { STATUS_POLL_INTERVAL_MS, STATUS_POLL_TIMEOUT_MS } from '@/lib/billing/limits'
import type { BillingMode } from '@/lib/billing/ui-state'
import { cn } from '@/lib/cn'
import { billingError } from '../_components/billing-i18n'

type Phase = CheckoutReturnState['state'] | 'checking' | 'timeout' | 'error'

/**
 * Écran de retour de Stripe Checkout. Tant que l'abonnement n'est pas actif,
 * interroge GET /api/stripe/status?session_id=… (qui synchronise côté serveur)
 * toutes les 3 s pendant 60 s, puis affiche un message d'attente explicite.
 */
export function ConfirmationView({ mode, sessionId, initial }: { mode: BillingMode; sessionId: string | null; initial: CheckoutReturnState }) {
  const router = useRouter()
  const t = useTranslations('billing')
  const startPolling = mode === 'live' && !!sessionId && initial.state === 'pending'
  const [phase, setPhase] = useState<Phase>(initial.state === 'active' ? 'active' : startPolling ? 'checking' : initial.state)
  const [plan, setPlan] = useState<PlanId | null>(initial.state === 'active' ? initial.plan : null)
  const [error, setError] = useState<string | null>(null)
  const [round, setRound] = useState(0)
  const notified = useRef(false)

  // Abonnement actif : droits recalculés partout (composants serveur, autres onglets).
  useEffect(() => {
    if (phase !== 'active' || notified.current) return
    notified.current = true
    notifyBillingChanged()
    router.refresh()
  }, [phase, router])

  const poll = useCallback(async (signal: AbortSignal): Promise<Phase> => {
    const res = await fetch(`/api/stripe/status?session_id=${encodeURIComponent(sessionId ?? '')}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal,
    })
    const json = (await res.json().catch(() => null)) as { state?: string; plan?: PlanId; error?: { code?: string } } | null
    if (res.status === 404) return 'not_found'
    if (!res.ok) {
      // 429 / 503 : on continue d'attendre sans alarmer (nouvel essai au tour suivant).
      if (res.status === 429 || res.status >= 500) return 'checking'
      setError(billingError(t, json?.error?.code, BILLING_ERROR_MESSAGES))
      return 'error'
    }
    if (json?.state === 'active' && json.plan) {
      setPlan(json.plan)
      return 'active'
    }
    if (json?.state === 'open' || json?.state === 'expired') return json.state
    return 'checking'
  }, [sessionId, t])

  useEffect(() => {
    if (phase !== 'checking' || !sessionId) return
    const ctrl = new AbortController()
    const started = Date.now()
    let timer: number | undefined
    const tick = async () => {
      try {
        const next = await poll(ctrl.signal)
        if (ctrl.signal.aborted) return
        if (next !== 'checking') return setPhase(next)
      } catch {
        if (ctrl.signal.aborted) return
      }
      if (Date.now() - started >= STATUS_POLL_TIMEOUT_MS) return setPhase('timeout')
      timer = window.setTimeout(tick, STATUS_POLL_INTERVAL_MS)
    }
    void tick()
    return () => {
      ctrl.abort()
      window.clearTimeout(timer)
    }
  }, [phase, poll, sessionId, round])

  const retry = () => {
    setError(null)
    setPhase('checking')
    setRound(r => r + 1)
  }

  return (
    <div className="mx-auto w-full max-w-[560px] px-5 pb-10 pt-6">
      {mode === 'demo' && (
        <Banner tone="gold" className="mb-5" icon={<FlaskConical className="h-5 w-5" />} title={t('confirmation.demoTitle')}>
          {t('confirmation.demoText')}
        </Banner>
      )}

      <div role="status" aria-live="polite" className="text-center">
        {phase === 'active' ? (
          <>
            <SuccessBurst className="mt-2" />
            <h2 className="text-[22px] font-extrabold text-night-900">{t('confirmation.activeTitle')}</h2>
            <p className="mx-auto mt-2 max-w-[340px] text-[14px] leading-relaxed text-night-800">
              {plan && plan !== 'gratuit'
                ? t('confirmation.activePlan', { plan: t(`common.plan.${plan}`) })
                : t('confirmation.activeGeneric')}
            </p>
          </>
        ) : phase === 'checking' ? (
          <>
            <Loader2 className="mx-auto mt-6 h-12 w-12 animate-spin text-leaf-600 motion-reduce:animate-none" aria-hidden />
            <h2 className="mt-4 text-[20px] font-extrabold text-night-900">{t('confirmation.checkingTitle')}</h2>
            <p className="mx-auto mt-2 max-w-[340px] text-[14px] leading-relaxed text-night-800">
              {t('confirmation.checkingText')}
            </p>
          </>
        ) : phase === 'timeout' || phase === 'pending' ? (
          <>
            <Clock className="mx-auto mt-6 h-12 w-12 text-gold-600" aria-hidden />
            <h2 className="mt-4 text-[20px] font-extrabold text-night-900">{t('confirmation.pendingTitle')}</h2>
            <p className="mx-auto mt-2 max-w-[360px] text-[14px] leading-relaxed text-night-800">
              {t('confirmation.pendingText')}
            </p>
          </>
        ) : phase === 'open' || phase === 'expired' ? (
          <>
            <XCircle className="mx-auto mt-6 h-12 w-12 text-night-600" aria-hidden />
            <h2 className="mt-4 text-[20px] font-extrabold text-night-900">{t('confirmation.openTitle')}</h2>
            <p className="mx-auto mt-2 max-w-[340px] text-[14px] leading-relaxed text-night-800">
              {t('confirmation.openText')}
            </p>
          </>
        ) : (
          <>
            <XCircle className="mx-auto mt-6 h-12 w-12 text-night-600" aria-hidden />
            <h2 className="mt-4 text-[20px] font-extrabold text-night-900">{t('confirmation.notFoundTitle')}</h2>
            <p className="mx-auto mt-2 max-w-[340px] text-[14px] leading-relaxed text-night-800">
              {error ?? t('confirmation.notFoundText')}
            </p>
          </>
        )}
      </div>

      {phase === 'active' && (
        <Banner tone="green" className="mt-6" icon={<ShieldCheck className="h-6 w-6" />} title={t('confirmation.readyTitle')}>
          {plan === 'coparentalite' ? t('confirmation.readyFamily') : ''}
          {mode === 'demo' ? t('confirmation.readyDemo') : t('confirmation.readyReceipt')}{t('confirmation.readyManage')}
        </Banner>
      )}

      <div className="mt-7 space-y-3">
        {phase === 'active' ? (
          <>
            <Link href="/app" className={btn.primary}>{t('confirmation.goToApp')}</Link>
            <Link href="/app/abonnement" className={btn.secondary}>{t('confirmation.viewSubscription')}</Link>
          </>
        ) : phase === 'timeout' || phase === 'pending' ? (
          <>
            {sessionId && mode === 'live' && <button type="button" onClick={retry} className={btn.primary}>{t('confirmation.checkAgain')}</button>}
            <Link href="/app/abonnement" className={cn(sessionId && mode === 'live' ? btn.secondary : btn.primary)}>{t('confirmation.viewSubscription')}</Link>
          </>
        ) : phase === 'checking' ? (
          <Link href="/app/abonnement" className={btn.secondary}>{t('confirmation.viewSubscription')}</Link>
        ) : (
          <Link href="/app/abonnement" className={btn.primary}>{t('confirmation.backToSubscription')}</Link>
        )}
      </div>
    </div>
  )
}
