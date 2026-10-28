import Link from 'next/link'
import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { CheckCircle2, Coins, Info, ShieldCheck } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { btn } from '@/components/coach/ui'
import { formatPriceIn } from '@/components/profil/pricing'
import { getCurrentUser } from '@/lib/auth/session'
import { grantCreditsForSession } from '@/lib/ai/credits'
import { loadCoachUsage } from '@/lib/ai/quota'
import { parseCheckoutSessionId } from '@/lib/billing/checkout-core'
import {
  AI_CREDIT_PACKS,
  AI_CREDIT_VALIDITY_MONTHS,
  bestValuePack,
  packPrice,
  packUnitPrice,
  parseCreditPack,
} from '@/lib/billing/credit-packs'
import { BILLING_LIVE } from '@/lib/billing/config'
import { DEMO_BILLING } from '@/lib/billing/demo'
import { getStripe } from '@/lib/billing/stripe'
import { intlLocale } from '@/lib/i18n/config'
import { getRequestTz } from '@/lib/tz-server'
import { cn } from '@/lib/cn'

// Coach IA · Crédits d'analyses : solde, packs (lib/billing/credit-packs.ts), achat via Stripe Checkout
// (POST /api/stripe/credits, formulaire natif : fonctionne sans JavaScript) et retour de paiement.
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('coach.credits')
  return { title: t('metaTitle') }
}

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
const ERRORS = ['waiver_required', 'invalid_pack', 'rate_limited'] as const

type Notice = { tone: 'ok' | 'info' | 'error'; text: string }

/**
 * Retour de Stripe Checkout : session relue chez Stripe, contrôle d'appartenance (client_reference_id),
 * puis crédit idempotent (même chemin que le webhook : une session ne crédite qu'une fois).
 * Renvoie le nombre de crédits du pack si la session est payée, null sinon (en attente / inconnue).
 */
async function settleReturn(rawSessionId: string | undefined): Promise<number | null> {
  const sessionId = parseCheckoutSessionId(rawSessionId)
  if (!BILLING_LIVE || !sessionId) return null
  const user = await getCurrentUser()
  if (!user) return null
  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId)
    if (session.client_reference_id !== user.id) return null
    const res = await grantCreditsForSession(session, 'return')
    return res.outcome === 'granted' || res.outcome === 'duplicate' ? res.grant?.pack.analyses ?? null : null
  } catch (err) {
    console.warn('[ai-credits] retour de paiement non vérifié', err instanceof Error ? err.message : 'unknown')
    return null
  }
}

export default async function CoachCreditsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const t = await getTranslations('coach.credits')
  const locale = await getLocale()
  const intl = intlLocale(locale)
  const tz = await getRequestTz()
  const price = (eur: number) => formatPriceIn(eur, intl)

  // Notice de retour (avant la lecture du solde : un retour payé crédite d'abord le compte).
  let notice: Notice | null = null
  const achat = first(sp.achat)
  if (achat === 'succes') {
    const count = await settleReturn(first(sp.session_id))
    notice = count ? { tone: 'ok', text: t('success', { count }) } : { tone: 'info', text: t('successPending') }
  } else if (achat === 'demo' && DEMO_BILLING) {
    const pack = parseCreditPack(first(sp.pack))
    if (pack) notice = { tone: 'ok', text: t('demoSuccess', { count: pack.analyses }) }
  } else if (achat === 'annule') {
    notice = { tone: 'info', text: t('canceled') }
  }
  const erreur = first(sp.erreur)
  if (erreur) {
    const known = (ERRORS as readonly string[]).includes(erreur) ? (erreur as (typeof ERRORS)[number]) : null
    notice = { tone: 'error', text: known ? t(`errors.${known}`) : t('errors.generic') }
  }

  const { used, total, credits } = await loadCoachUsage()
  const expiry = credits.nextExpiry
    ? new Intl.DateTimeFormat(intl, { dateStyle: 'long', timeZone: tz }).format(new Date(credits.nextExpiry))
    : null
  const best = bestValuePack()
  const canBuy = BILLING_LIVE || DEMO_BILLING

  return (
    <>
      <TopBar title={t('topTitle')} showBack backHref="/app/coach/utilisation" showBell={false} />

      <div className="w-full space-y-4 px-4 pb-8 pt-3">
        <h1 className="text-[18px] font-extrabold text-night-900">{t('title')}</h1>
        <p className="text-[13px] leading-relaxed text-night-700">{t('intro', { quota: total })}</p>

        {notice && (
          <p
            role={notice.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'rounded-xl2 border p-4 text-[13.5px] leading-relaxed text-night-900',
              notice.tone === 'ok' && 'border-leaf-200 bg-leaf-50',
              notice.tone === 'info' && 'border-night-100 bg-night-50',
              notice.tone === 'error' && 'border-alert-200 bg-alert-50',
            )}
          >
            {notice.text}
          </p>
        )}

        <section aria-labelledby="credits-balance" className="rounded-xl2 border border-night-100 bg-white px-4 py-4 shadow-soft">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-iris-50" aria-hidden="true">
              <Coins className="h-5 w-5 text-iris-600" />
            </span>
            <div className="min-w-0">
              <h2 id="credits-balance" className="text-[12.5px] text-night-600">{t('balanceTitle')}</h2>
              <p className="text-[19px] font-extrabold text-night-900">{t('balance', { count: credits.balance })}</p>
            </div>
          </div>
          <p className="mt-3 text-[12.5px] text-night-700">{expiry ? t('nextExpiry', { date: expiry }) : t('noCredits')}</p>
          <p className="mt-1 text-[12.5px] text-night-700">{t('quotaLine', { used, quota: total })}</p>
        </section>

        <section aria-labelledby="credits-how" className="flex gap-3 rounded-xl2 bg-night-50/80 p-4">
          <Info className="h-5 w-5 shrink-0 text-night-700" aria-hidden="true" />
          <div>
            <h2 id="credits-how" className="text-[13px] font-bold text-night-900">{t('howTitle')}</h2>
            <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-[12.5px] leading-relaxed text-night-700">
              <li>{t('how1')}</li>
              <li>{t('how2')}</li>
              <li>{t('how3')}</li>
            </ol>
          </div>
        </section>

        <form method="post" action="/api/stripe/credits" className="space-y-4">
          <fieldset>
            <legend className="text-[15px] font-bold text-night-900">{t('packsTitle')}</legend>
            <div className="mt-3 space-y-2.5">
              {AI_CREDIT_PACKS.map((p) => (
                <label
                  key={p.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-xl2 border border-night-100 bg-white px-4 py-3.5 shadow-soft transition-colors',
                    'hover:border-night-200 has-[:checked]:border-iris-500 has-[:checked]:bg-iris-50/60',
                    'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-iris-500 motion-reduce:transition-none',
                  )}
                >
                  <input type="radio" name="pack" value={p.id} defaultChecked={p.id === best.id} required className="h-4 w-4 shrink-0 accent-iris-500" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[14.5px] font-bold text-night-900">{t('packName', { count: p.analyses })}</span>
                      {p.id === best.id && (
                        <span className="rounded-full bg-iris-500 px-2 py-0.5 text-[11px] font-semibold text-white">{t('bestValue')}</span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[12.5px] text-night-700">{t('perAnalysis', { price: price(packUnitPrice(p)) })}</span>
                  </span>
                  <span className="shrink-0 text-[16px] font-extrabold text-night-900">{price(packPrice(p))}</span>
                </label>
              ))}
            </div>
            <p className="mt-2.5 text-[12px] text-night-600">{t('validity', { months: AI_CREDIT_VALIDITY_MONTHS })}</p>
          </fieldset>

          <label className="flex cursor-pointer gap-3 rounded-xl2 border border-night-100 bg-white p-4 text-[13px] leading-relaxed text-night-900">
            <input type="checkbox" name="renonciation" required className="mt-0.5 h-4 w-4 shrink-0 accent-iris-500" />
            <span>
              {t('waiver')} <span className="text-night-600">{t('waiverRequired')}</span>
            </span>
          </label>

          {DEMO_BILLING && (
            <p className="rounded-xl2 border border-amber-200 bg-amber-50 p-3.5 text-[12.5px] leading-relaxed text-night-900" role="note">
              {t('demoNotice')}
            </p>
          )}

          <button type="submit" className={btn.primary} disabled={!canBuy}>
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            {DEMO_BILLING ? t('payDemo') : t('pay')}
          </button>
          {!canBuy && <p className="text-center text-[12.5px] text-night-700">{t('errors.generic')}</p>}

          <p className="flex gap-2 text-[12px] leading-relaxed text-night-600">
            <ShieldCheck className="h-4 w-4 shrink-0 text-night-500" aria-hidden="true" />
            <span>
              {t('secure')}{' '}
              <Link href="/legal/cgu" className="font-semibold text-night-900 underline underline-offset-2">
                {t('terms')}
              </Link>
            </span>
          </p>
        </form>

        <Link href="/app/coach" className={btn.secondary}>
          {t('back')}
        </Link>
      </div>
    </>
  )
}
