import Link from 'next/link'
import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { CalendarClock, CheckCircle2, Coins, Info, Receipt, ShieldCheck, Wallet } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { btn } from '@/components/coach/ui'
import { formatPriceIn } from '@/components/profil/pricing'
import { getCurrentUser } from '@/lib/auth/session'
import { grantCreditsForSession } from '@/lib/ai/credits'
import { getCreditConfig } from '@/lib/ai/credit-config-server'
import { CREDIT_ACTIONS } from '@/lib/ai/credit-config'
import { getWallet, listLedger, parseLedgerFilter, type LedgerItem, type WalletView } from '@/lib/ai/wallet'
import { LEDGER_TYPES } from '@/lib/ai/wallet-core'
import { parseCheckoutSessionId } from '@/lib/billing/checkout-core'
import { bestValuePack, packPrice, packUnitPrice, packsFromConfig, parseCreditPack } from '@/lib/billing/credit-packs'
import { BILLING_LIVE } from '@/lib/billing/config'
import { DEMO_BILLING } from '@/lib/billing/demo'
import { getStripe } from '@/lib/billing/stripe'
import { rateLimit, userKey } from '@/lib/data/server/rate-limit'
import { intlLocale } from '@/lib/i18n/config'
import { getRequestTz } from '@/lib/tz-server'
import { cn } from '@/lib/cn'

// Coach IA · « Mes crédits » (cahier V6) : soldes A (mensuel), B (acheté) et A + B, prochaine
// allocation, expirations des lots, coût des actions, historique filtrable (journal immuable),
// packs (configuration active) et achat via Stripe Checkout (POST /api/stripe/credits, formulaire
// natif : fonctionne sans JavaScript). Le serveur reste l'autorité : rien n'est lu du cache PWA.
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('coach.credits')
  return { title: t('metaTitle') }
}

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
const ERRORS = ['waiver_required', 'invalid_pack', 'rate_limited', 'stripe_unavailable'] as const

type Receipt = { credits: number; amountCents: number; at: string; url: string | null }
type Settled = { state: 'granted'; receipt: Receipt } | { state: 'pending' } | { state: 'failed' }

/**
 * Retour de Stripe Checkout : session RELUE chez Stripe, contrôle d'appartenance
 * (client_reference_id), puis crédit idempotent (même chemin que le webhook : une session ne
 * crédite qu'une fois). La redirection seule ne crédite jamais : session non payée → aucun crédit.
 */
async function settleReturn(rawSessionId: string | undefined): Promise<Settled> {
  const sessionId = parseCheckoutSessionId(rawSessionId)
  if (!BILLING_LIVE || !sessionId) return { state: 'pending' }
  const user = await getCurrentUser()
  if (!user) return { state: 'pending' }
  // Chaque retour relit Stripe : débit limité (une URL forgée en boucle n'épuise pas le quota d'API).
  const rl = await rateLimit(userKey('credits-return', user.id), 20, 10 * 60_000)
  if (!rl.ok) return { state: 'pending' }
  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId, { expand: ['payment_intent.latest_charge'] })
    if (session.client_reference_id !== user.id) return { state: 'pending' }
    if (session.status === 'expired' || (session.status === 'complete' && session.payment_status === 'unpaid')) return { state: 'failed' }
    const res = await grantCreditsForSession(session, 'return')
    if ((res.outcome === 'granted' || res.outcome === 'duplicate') && res.grant) {
      const pi = session.payment_intent
      const charge = pi && typeof pi === 'object' ? pi.latest_charge : null
      const url = charge && typeof charge === 'object' ? charge.receipt_url ?? null : null
      return { state: 'granted', receipt: { credits: res.grant.pack.credits, amountCents: res.grant.amountCents, at: res.grant.purchasedAt, url } }
    }
    return { state: 'pending' }
  } catch (err) {
    console.warn('[ai-credits] retour de paiement non vérifié', err instanceof Error ? err.message : 'unknown')
    return { state: 'pending' }
  }
}

type Notice = { tone: 'ok' | 'info' | 'error'; text: string; receipt?: Receipt }

export default async function CoachCreditsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const t = await getTranslations('coach.credits')
  const locale = await getLocale()
  const intl = intlLocale(locale)
  const tz = await getRequestTz()
  const price = (eur: number) => formatPriceIn(eur, intl)
  const unit = (eur: number) => new Intl.NumberFormat(intl, { style: 'currency', currency: 'EUR', minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(eur)
  const dateFmt = new Intl.DateTimeFormat(intl, { dateStyle: 'long', timeZone: tz })
  const dateTimeFmt = new Intl.DateTimeFormat(intl, { dateStyle: 'medium', timeStyle: 'short', timeZone: tz })
  const { config } = await getCreditConfig()
  const packs = packsFromConfig(config)

  // Notice de retour (avant la lecture du solde : un retour payé crédite d'abord le compte).
  let notice: Notice | null = null
  const achat = first(sp.achat)
  if (achat === 'succes') {
    const r = await settleReturn(first(sp.session_id))
    notice = r.state === 'granted'
      ? { tone: 'ok', text: t('success', { count: r.receipt.credits }), receipt: r.receipt }
      : r.state === 'failed' ? { tone: 'error', text: t('paymentFailed') } : { tone: 'info', text: t('successPending') }
  } else if (achat === 'demo' && DEMO_BILLING) {
    const pack = parseCreditPack(first(sp.pack), packs)
    if (pack) notice = { tone: 'ok', text: t('demoSuccess', { count: pack.credits }) }
  } else if (achat === 'annule') {
    notice = { tone: 'info', text: t('canceled') }
  }
  const erreur = first(sp.erreur)
  if (erreur) {
    const known = (ERRORS as readonly string[]).includes(erreur) ? (erreur as (typeof ERRORS)[number]) : null
    notice = { tone: 'error', text: known ? t(`errors.${known}`) : t('errors.generic') }
  }

  const user = await getCurrentUser()
  const filter = parseLedgerFilter(sp.type)
  let wallet: WalletView | null = null
  let ledger: LedgerItem[] = []
  if (user) {
    try {
      ;[wallet, ledger] = await Promise.all([getWallet(user), listLedger(user, filter, 50)])
    } catch (err) {
      console.warn('[ai-credits] soldes indisponibles', err instanceof Error ? err.message : 'unknown')
    }
  }
  const best = packs.length ? bestValuePack(packs) : null
  const canBuy = (BILLING_LIVE || DEMO_BILLING) && packs.length > 0
  const activeActions = CREDIT_ACTIONS.filter((a) => config.actions[a].active)

  return (
    <>
      <TopBar title={t('topTitle')} showBack backHref="/app/coach/utilisation" showBell={false} />

      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 pb-8 pt-3">
        <h1 className="text-[18px] font-extrabold text-night-900">{t('title')}</h1>
        <p className="text-[13px] leading-relaxed text-night-700">{t('intro')}</p>

        {notice && (
          <div
            role={notice.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'rounded-xl2 border p-4 text-[13.5px] leading-relaxed text-night-900',
              notice.tone === 'ok' && 'border-leaf-200 bg-leaf-50',
              notice.tone === 'info' && 'border-night-100 bg-night-50',
              notice.tone === 'error' && 'border-alert-200 bg-alert-50',
            )}
          >
            <p>{notice.text}</p>
            {notice.receipt && (
              <dl className="mt-3 grid grid-cols-1 gap-1 text-[12.5px] sm:grid-cols-3">
                <div><dt className="text-night-600">{t('receipt.credits')}</dt><dd className="font-semibold">{notice.receipt.credits}</dd></div>
                <div><dt className="text-night-600">{t('receipt.amount')}</dt><dd className="font-semibold">{price(notice.receipt.amountCents / 100)}</dd></div>
                <div><dt className="text-night-600">{t('receipt.date')}</dt><dd className="font-semibold">{dateTimeFmt.format(new Date(notice.receipt.at))}</dd></div>
              </dl>
            )}
            {notice.receipt?.url && (
              <a href={notice.receipt.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-semibold underline underline-offset-2">
                <Receipt className="h-4 w-4" aria-hidden="true" />
                {t('receipt.open')}
              </a>
            )}
          </div>
        )}

        {/* Soldes : A (mensuel), B (acheté), A + B */}
        <section aria-labelledby="credits-balance" className="rounded-xl2 border border-night-100 bg-white px-4 py-4 shadow-soft">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-iris-50" aria-hidden="true">
              <Coins className="h-5 w-5 text-iris-600" />
            </span>
            <div className="min-w-0">
              <h2 id="credits-balance" className="text-[12.5px] text-night-600">{t('totalTitle')}</h2>
              <p className="text-[22px] font-extrabold text-night-900">{wallet ? t('balance', { count: wallet.total }) : t('unavailable')}</p>
            </div>
          </div>
          {wallet && (
            <>
              <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-night-50/70 p-3">
                  <dt className="text-[12px] font-semibold text-night-700">{t('monthlyTitle')}</dt>
                  <dd className="mt-0.5 text-[17px] font-extrabold text-night-900">{t('ofQuota', { count: wallet.monthly, quota: wallet.monthlyQuota })}</dd>
                  <dd className="mt-1 flex items-center gap-1.5 text-[12px] text-night-700">
                    <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {t('nextAllocation', { date: dateFmt.format(new Date(wallet.periodEnd)), count: wallet.monthlyQuota })}
                  </dd>
                </div>
                <div className="rounded-xl bg-night-50/70 p-3">
                  <dt className="text-[12px] font-semibold text-night-700">{t('purchasedTitle')}</dt>
                  <dd className="mt-0.5 text-[17px] font-extrabold text-night-900">{t('balance', { count: wallet.purchased })}</dd>
                  <dd className="mt-1 text-[12px] text-night-700">{wallet.lots.length ? t('nextExpiry', { date: dateFmt.format(new Date(wallet.lots[0].expiresAt)) }) : t('noCredits')}</dd>
                </div>
              </dl>
              {wallet.lots.length > 0 && (
                <details className="mt-3 text-[12.5px] text-night-800">
                  <summary className="cursor-pointer font-semibold text-night-900">{t('lotsTitle')}</summary>
                  <ul className="mt-2 space-y-1">
                    {wallet.lots.map((l, i) => (
                      <li key={i} className="flex justify-between gap-3">
                        <span>{t('balance', { count: l.remaining })}</span>
                        <span className="text-night-600">{t('expiresOn', { date: dateFmt.format(new Date(l.expiresAt)) })}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </section>

        {/* Coût des actions (catalogue actif) */}
        <section aria-labelledby="credits-costs" className="rounded-xl2 border border-night-100 bg-white px-4 py-4 shadow-soft">
          <h2 id="credits-costs" className="text-[14px] font-bold text-night-900">{t('costsTitle')}</h2>
          <ul className="mt-2 divide-y divide-night-100 text-[13px]">
            {activeActions.map((a) => (
              <li key={a} className="flex items-center justify-between gap-3 py-2">
                <span className="text-night-800">{t(`actions.${a}`)}</span>
                <span className="shrink-0 font-semibold text-night-900">{t('balance', { count: config.actions[a].cost })}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="credits-how" className="flex gap-3 rounded-xl2 bg-night-50/80 p-4">
          <Info className="h-5 w-5 shrink-0 text-night-700" aria-hidden="true" />
          <div>
            <h2 id="credits-how" className="text-[13px] font-bold text-night-900">{t('howTitle')}</h2>
            <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-[12.5px] leading-relaxed text-night-700">
              <li>{t('how1')}</li>
              <li>{t('how2')}</li>
              <li>{t('how3')}</li>
              <li>{t('how4', { months: config.purchasedValidityMonths })}</li>
            </ol>
          </div>
        </section>

        {/* Recharge */}
        <form method="post" action="/api/stripe/credits" className="space-y-4" id="packs">
          <fieldset>
            <legend className="text-[15px] font-bold text-night-900">{t('packsTitle')}</legend>
            <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {packs.map((p) => (
                <label
                  key={p.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-xl2 border border-night-100 bg-white px-4 py-3.5 shadow-soft transition-colors',
                    'hover:border-night-200 has-[:checked]:border-iris-500 has-[:checked]:bg-iris-50/60',
                    'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-iris-500 motion-reduce:transition-none',
                  )}
                >
                  <input type="radio" name="pack" value={p.id} defaultChecked={(first(sp.pack) ?? best?.id) === p.id} required className="h-4 w-4 shrink-0 accent-iris-500" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[14.5px] font-bold text-night-900">{t('packName', { count: p.credits })}</span>
                      {p.id === best?.id && (
                        <span className="rounded-full bg-iris-500 px-2 py-0.5 text-[11px] font-semibold text-white">{t('bestValue')}</span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[12.5px] text-night-700">{t('perCredit', { price: unit(packUnitPrice(p)) })}</span>
                  </span>
                  <span className="shrink-0 text-[16px] font-extrabold text-night-900">{price(packPrice(p))}</span>
                </label>
              ))}
            </div>
            <p className="mt-2.5 text-[12px] text-night-600">{t('validity', { months: config.purchasedValidityMonths })}</p>
            <p className="mt-1 text-[12px] text-night-600">{t('noEntitlement')}</p>
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

        {/* Historique (journal immuable), filtrable par type */}
        <section aria-labelledby="credits-history" className="rounded-xl2 border border-night-100 bg-white px-4 py-4 shadow-soft">
          <h2 id="credits-history" className="flex items-center gap-2 text-[14px] font-bold text-night-900">
            <Wallet className="h-4 w-4" aria-hidden="true" />
            {t('historyTitle')}
          </h2>
          <nav aria-label={t('historyFilter')} className="mt-3">
            <ul className="flex flex-wrap gap-2">
              {[null, ...LEDGER_TYPES].map((type) => {
                const active = filter === type
                return (
                  <li key={type ?? 'all'}>
                    <Link
                      href={type ? `/app/coach/credits?type=${type}#credits-history` : '/app/coach/credits#credits-history'}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'inline-flex min-h-[36px] items-center rounded-full border px-3 text-[12px] font-semibold',
                        active ? 'border-iris-500 bg-iris-50 text-night-900' : 'border-night-200 text-night-700 hover:bg-night-50',
                      )}
                    >
                      {type ? t(`types.${type}`) : t('types.all')}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>
          {ledger.length === 0 ? (
            <p className="mt-3 text-[12.5px] text-night-600">{t('historyEmpty')}</p>
          ) : (
            <ul className="mt-3 divide-y divide-night-100">
              {ledger.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3 py-2 text-[12.5px]">
                  <span className="min-w-0">
                    <span className="block font-semibold text-night-900">{t(`types.${e.type}`)}</span>
                    <span className="block text-night-600">{t(`wallets.${e.wallet}`)} · <time dateTime={e.at}>{dateTimeFmt.format(new Date(e.at))}</time></span>
                  </span>
                  <span className={cn('shrink-0 font-bold', e.delta > 0 ? 'text-leaf-700' : e.delta < 0 ? 'text-night-900' : 'text-night-500')}>
                    {e.delta === 0 ? t('confirmed', { count: e.amount }) : `${e.delta > 0 ? '+' : '−'}${Math.abs(e.delta)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Link href="/app/coach" className={btn.secondary}>
          {t('back')}
        </Link>
      </div>
    </>
  )
}
