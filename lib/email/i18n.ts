// lib/email/i18n.ts — Traduction des e-mails et notifications HORS requête (cron, webhooks, after()).
// Langue = celle du DESTINATAIRE (public.preferences.langue), jamais celle de la requête en cours,
// sauf flux d'inscription / mot de passe oublié (cookie lp_locale, voir lib/auth/email-flows.ts).
// Module PUR (ni `server-only`, ni Supabase) : utilisable par les templates, les tests et la prévisualisation.
import { createTranslator } from 'next-intl'
import { defaultLocale, intlLocale, isLocale, LOCALE_META, type Locale } from '@/lib/i18n/config'
import fr from '@/messages/fr/email.json'
import en from '@/messages/en/email.json'
import pt from '@/messages/pt/email.json'

export type { Locale }

const CATALOGS = { fr, en, pt } as const

/** Valeur quelconque (préférence en base, cookie…) → locale prise en charge, repli sur le français. */
export function toLocale(value: unknown): Locale {
  return typeof value === 'string' && isLocale(value) ? value : defaultLocale
}

export type EmailT = ReturnType<typeof makeT>

function makeT(locale: Locale) {
  return createTranslator({ locale, messages: CATALOGS[locale] as typeof fr, namespace: 'email' })
}

const cache = new Map<Locale, EmailT>()

/** Traducteur du catalogue `email` pour une locale (mis en cache). */
export function emailT(locale: Locale = defaultLocale): EmailT {
  const l = toLocale(locale)
  let t = cache.get(l)
  if (!t) {
    t = makeT(l)
    cache.set(l, t)
  }
  return t
}

/** « Bonjour Camille, » / « Bonjour, ». `prenomHtml` doit être DÉJÀ échappé. */
export function greeting(t: EmailT, prenomHtml: string): string {
  return prenomHtml ? t('common.helloName', { name: prenomHtml }) : t('common.hello')
}

/** Attribut lang du document HTML. */
export function htmlLang(locale: Locale): string {
  return LOCALE_META[toLocale(locale)].htmlLang
}

/** Locale Intl (dates, nombres) : fr-FR, en-US, pt-BR. */
export function dateLocale(locale: Locale): string {
  return intlLocale(locale)
}

/** Cycle de facturation transmis en français par la facturation (« mensuel ») → libellé traduit. */
export function cycleLabel(t: EmailT, cycle: string): string {
  return cycle === 'mensuel' || cycle === 'annuel' ? t(`billing.cycles.${cycle}`) : cycle
}

const PLAN_KEYS: Record<string, 'premium_mensuel' | 'premium_annuel' | 'coparentalite_mensuel' | 'coparentalite_annuel'> = {
  'Premium mensuel': 'premium_mensuel',
  'Premium annuel': 'premium_annuel',
  'Coparentalité+ mensuel': 'coparentalite_mensuel',
  'Coparentalité+ annuel': 'coparentalite_annuel',
}

/** Libellé de formule (planLabel, en français) → libellé traduit ; inconnu : inchangé. */
export function planName(t: EmailT, formule: string): string {
  const key = PLAN_KEYS[formule]
  return key ? t(`billing.plans.${key}`) : formule
}
