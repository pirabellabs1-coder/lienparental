import 'server-only'
import { getTranslations } from 'next-intl/server'
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { rateLimit, rateLimitedResponse, userKey } from '@/lib/data/server/rate-limit'
import { appOrigin, BILLING_LIVE } from './config'
import { BILLING_RATE_LIMITS, type BillingRateAction } from './limits'
import { isUuid } from './sync-core'
import type { ApiError } from './types'

/** Réponse d'erreur à enveloppe stable. Jamais de détail interne (message Stripe, SQL…). */
export function apiError(status: number, code: string, message: string): NextResponse<ApiError> {
  const correlation_id = `req_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
  if (status >= 500) console.error('[billing] erreur', { status, code, correlation_id })
  return NextResponse.json(
    { error: { code, message, correlation_id } },
    { status, headers: { 'Cache-Control': 'no-store' } },
  )
}

/** Log serveur d'une exception sans fuite vers le client. */
export function logError(scope: string, err: unknown): void {
  const e = err as { type?: string; code?: string; message?: string } | null
  console.error(`[billing] ${scope}`, { type: e?.type, code: e?.code, message: e?.message })
}

export { isSameOrigin } from '@/lib/data/server/http'

/** Appelant fetch (JSON) vs formulaire HTML classique (redirection 303). */
export function wantsJson(req: Request): boolean {
  const accept = req.headers.get('accept') ?? ''
  const type = req.headers.get('content-type') ?? ''
  return accept.includes('application/json') || type.includes('application/json')
}

/** Corps JSON ou formulaire, aplati en objet. Corps invalide → objet vide. */
export async function readBody(req: Request): Promise<Record<string, unknown>> {
  const type = req.headers.get('content-type') ?? ''
  try {
    if (type.includes('application/json')) {
      const json: unknown = await req.json()
      return json && typeof json === 'object' && !Array.isArray(json) ? (json as Record<string, unknown>) : {}
    }
    if (type.includes('form')) {
      const form = await req.formData()
      return Object.fromEntries([...form.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : '']))
    }
  } catch {
    /* corps illisible → validation en aval */
  }
  return {}
}

export type BillingUser = { id: string; email: string; prenom: string; nom: string }

export type GuardError = { status: number; code: string; message: string }

/**
 * Garde commune des routes /api/stripe/* : facturation active + session réelle.
 * Les comptes de démonstration (ids non-UUID) sont refusés.
 */
export async function requireBillingUser(): Promise<{ user: BillingUser } | { error: GuardError }> {
  const t = await getTranslations('server.common')
  if (!BILLING_LIVE) return { error: { status: 503, code: 'billing_disabled', message: t('billingDisabled') } }
  const user = await getCurrentUser()
  if (!user || !isUuid(user.id)) return { error: { status: 401, code: 'unauthenticated', message: t('loginRequired') } }
  return { user: { id: user.id, email: user.email, prenom: user.prenom, nom: user.nom } }
}

/**
 * Erreur adaptée à l'appelant : enveloppe JSON pour fetch, retour 303 vers
 * l'écran d'origine avec `?erreur=<code>` pour un formulaire HTML.
 */
export function fail(req: Request, status: number, code: string, message: string, backPath: string): NextResponse {
  if (wantsJson(req) || !appOrigin()) return apiError(status, code, message)
  if (status >= 500) apiError(status, code, message) // journalise avec correlation_id
  const sep = backPath.includes('?') ? '&' : '?'
  return seeOther(`${backPath}${sep}erreur=${encodeURIComponent(code)}`)
}

/** Redirection 303 (POST → GET) vers une URL absolue ou un chemin de l'app. */
export function seeOther(url: string): NextResponse {
  const origin = appOrigin()
  const target = url.startsWith('/') && origin ? `${origin}${url}` : url
  return NextResponse.redirect(target, { status: 303 })
}

const FAIL_CLOSED = new Set<BillingRateAction>(['checkout', 'credits', 'storage', 'change-plan', 'cancel', 'portal'])

/**
 * Limite de débit par utilisateur (BILLING_RATE_LIMITS). Retourne la réponse de
 * refus (429 / 503) ou null si la requête peut continuer.
 */
export async function limitBilling(action: BillingRateAction, userId: string): Promise<NextResponse | null> {
  const { limit, windowMs } = BILLING_RATE_LIMITS[action]
  // Mutations (paiement, changement, résiliation, portail) : refus 503 si le limiteur
  // partagé est indisponible plutôt qu'un repli mémoire par instance.
  const rl = await rateLimit(userKey(`billing:${action}`, userId), limit, windowMs, { failClosed: FAIL_CLOSED.has(action) })
  if (rl.ok) return null
  return rateLimitedResponse(rl, (await getTranslations('server.common'))('rateLimitedRetry'))
}
