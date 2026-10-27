import { useLocale } from 'next-intl'
import { intlLocale } from '@/lib/i18n/config'

// Formats localisés (dates, heures, montants) des modules Famille : enfants, Journal, frais,
// parents liés, dossier JAF. Les dates YYYY-MM-DD sont rendues en UTC (date « jour seul »,
// identique serveur / client), comme frDate de lib/mock-vault.

/** "12 mai 2024" / "May 12, 2024" / "12 de maio de 2024" (style long) ou mois abrégé (short). */
export function formatDay(ymd: string, locale: string, style: 'long' | 'short' = 'long'): string {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return ymd
  return new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: style, year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  )
}

/** "14h30" en français, "2:30 PM" en anglais, "14:30" en portugais. */
export function formatHm(hhmm: string, locale: string): string {
  const [h, min] = hhmm.split(':').map(Number)
  if (h === undefined || Number.isNaN(h) || min === undefined || Number.isNaN(min)) return hhmm
  if (locale === 'fr') return hhmm.slice(0, 5).replace(':', 'h')
  return new Intl.DateTimeFormat(intlLocale(locale), { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2000, 0, 1, h, min)),
  )
}

/** Montant en euros (la devise reste EUR quelle que soit la langue). */
export function formatEur(amount: number, locale: string, opts: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(intlLocale(locale), { style: 'currency', currency: 'EUR', ...opts }).format(amount)
}

export function useFamilyFormat() {
  const locale = useLocale()
  return {
    locale,
    intl: intlLocale(locale),
    day: (ymd: string, style: 'long' | 'short' = 'long') => formatDay(ymd, locale, style),
    hm: (hhmm: string) => formatHm(hhmm, locale),
    eur: (amount: number, opts?: Intl.NumberFormatOptions) => formatEur(amount, locale, opts),
  }
}
