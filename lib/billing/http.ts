import 'server-only'
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { appOrigin, BILLING_LIVE } from './config'
import { isUuid } from './subscription'
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

/** Anti-CSRF : les mutations n'acceptent que l'Origin exacte de l'app. */
export function isSameOrigin(req: Request): boolean {
  const expected = appOrigin()
  const origin = req.headers.get('origin')
  return Boolean(expected && origin && origin === expected)
}

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
  if (!BILLING_LIVE) return { error: { status: 503, code: 'billing_disabled', message: 'Le paiement en ligne n’est pas encore disponible.' } }
  const user = await getCurrentUser()
  if (!user || !isUuid(user.id)) return { error: { status: 401, code: 'unauthenticated', message: 'Connexion requise.' } }
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
