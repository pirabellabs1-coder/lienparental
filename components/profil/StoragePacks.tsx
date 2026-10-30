import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { CheckCircle2, HardDrive, ShieldCheck } from 'lucide-react'
import { formatPriceIn } from '@/components/profil/pricing'
import { getCurrentUser } from '@/lib/auth/session'
import { BILLING_LIVE } from '@/lib/billing/config'
import { DEMO_BILLING } from '@/lib/billing/demo'
import { parseCheckoutSessionId } from '@/lib/billing/checkout-core'
import { getStripe } from '@/lib/billing/stripe'
import { grantStorageForSession, listActiveStoragePacks } from '@/lib/billing/storage'
import { STORAGE_FEATURED, STORAGE_PACKS, STORAGE_VALIDITY_MONTHS, parseStoragePack, storagePricePerGb } from '@/lib/billing/storage-packs'
import { rateLimit, userKey } from '@/lib/data/server/rate-limit'
import { intlLocale } from '@/lib/i18n/config'
import { getRequestTz } from '@/lib/tz-server'
import { cn } from '@/lib/cn'

type SP = Record<string, string | string[] | undefined>
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
const ERRORS = ['waiver_required', 'invalid_pack', 'rate_limited', 'stripe_unavailable'] as const

type Settled = { state: 'granted'; gb: number } | { state: 'pending' } | { state: 'failed' }

/**
 * Retour de Stripe Checkout : session RELUE chez Stripe, contrôle d'appartenance, puis octroi
 * idempotent (même chemin que le webhook). La redirection seule n'accorde jamais d'espace.
 */
async function settleReturn(rawSessionId: string | undefined): Promise<Settled> {
  const sessionId = parseCheckoutSessionId(rawSessionId)
  if (!BILLING_LIVE || !sessionId) return { state: 'pending' }
  const user = await getCurrentUser()
  if (!user) return { state: 'pending' }
  const rl = await rateLimit(userKey('storage-return', user.id), 20, 10 * 60_000)
  if (!rl.ok) return { state: 'pending' }
  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId, { expand: ['payment_intent.latest_charge'] })
    if (session.client_reference_id !== user.id) return { state: 'pending' }
    if (session.status === 'expired' || (session.status === 'complete' && session.payment_status === 'unpaid')) return { state: 'failed' }
    const res = await grantStorageForSession(session, 'return')
    if ((res.outcome === 'granted' || res.outcome === 'duplicate') && res.grant) return { state: 'granted', gb: res.grant.pack.gigabytes }
    return { state: 'pending' }
  } catch (err) {
    console.warn('[storage] retour de paiement non vérifié', err instanceof Error ? err.message : 'unknown')
    return { state: 'pending' }
  }
}

/** Retour de paiement à traiter AVANT la lecture de l'usage (un retour payé accorde d'abord l'espace). */
export async function storagePurchaseNotice(sp: SP): Promise<{ tone: 'ok' | 'info' | 'error'; text: string } | null> {
  const t = await getTranslations('vault.storage')
  const erreur = first(sp.erreur)
  if (erreur) {
    const known = (ERRORS as readonly string[]).includes(erreur) ? erreur : null
    return { tone: 'error', text: known ? t(`errors.${known}`) : t('errors.generic') }
  }
  const achat = first(sp.achat)
  if (achat === 'succes') {
    const r = await settleReturn(first(sp.session_id))
    return r.state === 'granted' ? { tone: 'ok', text: t('success', { gb: r.gb }) }
      : r.state === 'failed' ? { tone: 'error', text: t('paymentFailed') } : { tone: 'info', text: t('successPending') }
  }
  if (achat === 'demo' && DEMO_BILLING) {
    const pack = parseStoragePack(first(sp.pack))
    if (pack) return { tone: 'ok', text: t('demoSuccess', { gb: pack.gigabytes }) }
  }
  if (achat === 'annule') return { tone: 'info', text: t('canceled') }
  return null
}

export function StorageNotice({ notice }: { notice: { tone: 'ok' | 'info' | 'error'; text: string } }) {
  return (
    <p
      role={notice.tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'mb-4 rounded-xl2 border p-4 text-[13px] leading-relaxed text-night-900',
        notice.tone === 'ok' && 'border-leaf-200 bg-leaf-50',
        notice.tone === 'info' && 'border-night-100 bg-night-50',
        notice.tone === 'error' && 'border-alert-200 bg-alert-50',
      )}
    >
      {notice.text}
    </p>
  )
}

/** Packs d'espace supplémentaire (+20 / +50 / +100 Go, 12 mois) : formulaire natif vers /api/stripe/stockage. */
export async function StoragePacks({ selected }: { selected?: string }) {
  const t = await getTranslations('vault.storage')
  const locale = await getLocale()
  const intl = intlLocale(locale)
  const tz = await getRequestTz()
  const dateFmt = new Intl.DateTimeFormat(intl, { dateStyle: 'long', timeZone: tz })
  const lots = await listActiveStoragePacks()
  const canBuy = BILLING_LIVE || DEMO_BILLING
  const unit = (eur: number) => new Intl.NumberFormat(intl, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(eur)
  const chosen = parseStoragePack(selected)?.id ?? STORAGE_FEATURED

  return (
    <section aria-labelledby="storage-more" id="plus-d-espace" className="mt-8 scroll-mt-20">
      <h2 id="storage-more" className="flex items-center gap-2 text-[15px] font-bold text-night-900">
        <HardDrive className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
        {t('title')}
      </h2>
      <p className="mt-1 text-[12.5px] leading-relaxed text-night-700">{t('intro', { months: STORAGE_VALIDITY_MONTHS })}</p>

      {lots.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-xl2 bg-leaf-50 p-3 text-[12.5px] text-night-900">
          {lots.map((l, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span className="font-semibold">{t('lot', { gb: l.gigabytes })}</span>
              <span className="text-night-700">{t('until', { date: dateFmt.format(new Date(l.expiresAt)) })}</span>
            </li>
          ))}
        </ul>
      )}

      <form method="post" action="/api/stripe/stockage" className="mt-3 space-y-3">
        <fieldset>
          <legend className="sr-only">{t('choose')}</legend>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {STORAGE_PACKS.map((p) => (
              <label
                key={p.id}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-xl2 border border-night-100 bg-white px-4 py-3.5 shadow-soft transition-colors',
                  'hover:border-night-200 has-[:checked]:border-leaf-500 has-[:checked]:bg-leaf-50/60',
                  'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-leaf-500 motion-reduce:transition-none',
                  'sm:flex-col sm:items-start sm:gap-1.5',
                )}
              >
                <input type="radio" name="pack" value={p.id} defaultChecked={chosen === p.id} required className="h-4 w-4 shrink-0 accent-leaf-600" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-extrabold text-night-900">{t('packName', { gb: p.gigabytes })}</span>
                    {p.id === STORAGE_FEATURED && <span className="rounded-full bg-leaf-600 px-2 py-0.5 text-[11px] font-semibold text-white">{t('featured')}</span>}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-night-700">{t('perGb', { price: unit(storagePricePerGb(p)) })}</span>
                </span>
                <span className="shrink-0 text-[16px] font-extrabold text-night-900">{formatPriceIn(p.priceCents / 100, intl)}</span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-night-600">{t('expiryRule')}</p>
        </fieldset>

        <label className="flex cursor-pointer gap-3 rounded-xl2 border border-night-100 bg-white p-4 text-[13px] leading-relaxed text-night-900">
          <input type="checkbox" name="renonciation" required className="mt-0.5 h-4 w-4 shrink-0 accent-leaf-600" />
          <span>{t('waiver')}</span>
        </label>

        {DEMO_BILLING && (
          <p className="rounded-xl2 border border-amber-200 bg-amber-50 p-3.5 text-[12.5px] leading-relaxed text-night-900" role="note">{t('demoNotice')}</p>
        )}

        <button
          type="submit"
          disabled={!canBuy}
          className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl2 bg-leaf-600 px-5 text-[14px] font-bold text-white transition hover:bg-leaf-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400 focus-visible:ring-offset-2 disabled:opacity-50"
        >
          <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          {DEMO_BILLING ? t('payDemo') : t('pay')}
        </button>
        {!canBuy && <p className="text-center text-[12.5px] text-night-700">{t('errors.generic')}</p>}

        <p className="flex gap-2 text-[12px] leading-relaxed text-night-600">
          <ShieldCheck className="h-4 w-4 shrink-0 text-night-500" aria-hidden="true" />
          <span>
            {t('secure')}{' '}
            <Link href="/legal/cgu" className="font-semibold text-night-900 underline underline-offset-2">{t('terms')}</Link>
          </span>
        </p>
      </form>
    </section>
  )
}
