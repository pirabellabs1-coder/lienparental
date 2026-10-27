'use client'

import { useCallback, useEffect, useState } from 'react'
import { Download, ExternalLink } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { EmptyState } from '@/components/ui'
import { Banner, btn } from '@/components/profil/kit'
import { BILLING_ERROR_MESSAGES } from '@/lib/billing/client'
import type { InvoiceItem, InvoicesResponse } from '@/lib/billing/types'
import { cn } from '@/lib/cn'
import { billingError, billingFormat } from './billing-i18n'

type MockInvoice = { id: string; date: string; amount: number; paid: boolean }

// Libellés : billing.invoices.status.<statut> (traduits au rendu).
const STATUS_CLS: Record<InvoiceItem['status'], string> = {
  paid: 'bg-leaf-50 text-leaf-700',
  open: 'bg-orange-50 text-orange-700',
  uncollectible: 'bg-alert-50 text-alert-600',
  void: 'bg-night-50 text-night-700',
  draft: 'bg-night-50 text-night-700',
}

/** N'ouvre que des liens Stripe en https (défense en profondeur côté client). */
function stripeHref(url: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && (u.hostname === 'stripe.com' || u.hostname.endsWith('.stripe.com')) ? u.toString() : null
  } catch {
    return null
  }
}

export function InvoicesList({ live, mock }: { live: boolean; mock: MockInvoice[] }) {
  const t = useTranslations('billing')
  const f = billingFormat(t, useLocale())
  const formatPrice = f.price
  const formatAmount = (cents: number, currency: string) =>
    currency === 'EUR' ? formatPrice(cents / 100) : `${(cents / 100).toFixed(2)} ${currency}`
  const [items, setItems] = useState<InvoiceItem[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [state, setState] = useState<'idle' | 'loading' | 'error'>(live ? 'loading' : 'idle')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (after: string | null) => {
    setState('loading')
    try {
      const qs = new URLSearchParams({ limit: '12' })
      if (after) qs.set('cursor', after)
      const res = await fetch(`/api/stripe/invoices?${qs}`, { headers: { Accept: 'application/json' }, cache: 'no-store' })
      const json = (await res.json().catch(() => null)) as InvoicesResponse | { error?: { code?: string } } | null
      if (!res.ok || !json || !('data' in json)) {
        setError(billingError(t, (json as { error?: { code?: string } } | null)?.error?.code, BILLING_ERROR_MESSAGES))
        setState('error')
        return
      }
      setItems(prev => (after ? [...prev, ...json.data] : json.data))
      setCursor(json.page.next_cursor)
      setHasMore(json.page.has_more)
      setState('idle')
    } catch {
      setError(billingError(t, 'network', BILLING_ERROR_MESSAGES))
      setState('error')
    }
  }, [t])

  useEffect(() => {
    if (live) void load(null)
  }, [live, load])

  if (!live) {
    return (
      <>
        <table className="w-full text-[12.5px]">
          <caption className="sr-only">{t('invoices.previousCaption')}</caption>
          <thead className="sr-only"><tr><th scope="col">{t('invoices.colDate')}</th><th scope="col">{t('invoices.colAmount')}</th><th scope="col">{t('invoices.colStatus')}</th><th scope="col">{t('invoices.colDocument')}</th></tr></thead>
          <tbody className="divide-y divide-night-100">
            {mock.map(inv => (
              <tr key={inv.id}>
                <td className="py-3 text-night-800">{inv.date}</td>
                <td className="py-3 font-bold text-night-900">{formatPrice(inv.amount)}</td>
                <td className="py-3 text-right">
                  <span className="rounded-md bg-leaf-50 px-2 py-1 text-[11px] font-bold text-leaf-700">{inv.paid ? t('invoices.status.paid') : t('invoices.pending')}</span>
                </td>
                <td className="py-3 pl-2 text-right">
                  <span className="inline-flex h-11 w-11 items-center justify-center text-night-500" title={t('invoices.pdfDemoTitle')}>
                    <Download className="h-4 w-4" aria-hidden /><span className="sr-only">{t('invoices.pdfDemoSr')}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-center text-[12px] text-night-700">{t('invoices.demoNote')}</p>
      </>
    )
  }

  return (
    <div aria-busy={state === 'loading'}>
      {error && <div role="alert" className="mb-3"><Banner tone="red">{error}</Banner></div>}

      {state === 'loading' && items.length === 0 ? (
        <p role="status" className="py-6 text-center text-[12.5px] text-night-600">{t('invoices.loading')}</p>
      ) : items.length === 0 && state !== 'error' ? (
        <EmptyState title={t('invoices.emptyTitle')} description={t('invoices.emptyText')} />
      ) : items.length > 0 ? (
        <table className="w-full text-[12.5px]">
          <caption className="sr-only">{t('invoices.caption')}</caption>
          <thead className="sr-only">
            <tr><th scope="col">{t('invoices.colDate')}</th><th scope="col">{t('invoices.colAmount')}</th><th scope="col">{t('invoices.colStatus')}</th><th scope="col">{t('invoices.colDocuments')}</th></tr>
          </thead>
          <tbody className="divide-y divide-night-100">
            {items.map(inv => {
              const view = stripeHref(inv.hosted_invoice_url)
              const pdf = stripeHref(inv.invoice_pdf)
              const date = f.date(inv.date)
              const viewLabel = inv.number ? t('invoices.view', { number: inv.number, date }) : t('invoices.viewNoNumber', { date })
              const pdfLabel = inv.number ? t('invoices.download', { number: inv.number, date }) : t('invoices.downloadNoNumber', { date })
              return (
                <tr key={inv.id}>
                  <td className="py-3 text-night-800">{date}</td>
                  <td className="py-3 font-bold text-night-900">{formatAmount(inv.amount_cents, inv.currency)}</td>
                  <td className="py-3 text-right">
                    <span className={cn('rounded-md px-2 py-1 text-[11px] font-bold', STATUS_CLS[inv.status])}>{t(`invoices.status.${inv.status}`)}</span>
                  </td>
                  <td className="py-3 pl-2 text-right">
                    <span className="inline-flex items-center gap-1">
                      {view && (
                        <a href={view} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-night-800 hover:bg-night-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400">
                          <ExternalLink className="h-4 w-4" aria-hidden /><span className="sr-only">{viewLabel}</span>
                        </a>
                      )}
                      {pdf && (
                        <a href={pdf} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-night-800 hover:bg-night-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400">
                          <Download className="h-4 w-4" aria-hidden /><span className="sr-only">{pdfLabel}</span>
                        </a>
                      )}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : null}

      {hasMore && (
        <button type="button" onClick={() => load(cursor)} disabled={state === 'loading'} className={cn(btn.secondary, 'mt-3')}>
          {state === 'loading' ? t('invoices.loadingShort') : t('invoices.more')}
        </button>
      )}
      {state === 'error' && (
        <button type="button" onClick={() => { setError(null); void load(null) }} className={cn(btn.secondary, 'mt-3')}>{t('invoices.retry')}</button>
      )}

    </div>
  )
}
