import 'server-only'
import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { jsonError } from '@/lib/data/server/http'
import type { FactorResult } from './verify'

type Translate = (key: string, values?: Record<string, string | number>) => string

function waitText(t: Translate, until: number): string {
  const s = Math.max(1, Math.ceil((until - Date.now()) / 1000))
  if (s < 60) return t('waitSeconds', { count: s })
  const m = Math.ceil(s / 60)
  return t('waitMinutes', { count: m })
}

/** Même enveloppe que jsonError, avec un objet `details` (essais restants, fin du blocage). */
function errorWithDetails(status: number, code: string, message: string, details: Record<string, unknown>, headers?: Record<string, string>) {
  const correlation_id = `req_${randomBytes(6).toString('hex')}`
  return NextResponse.json(
    { error: { code, message, correlation_id, details } },
    { status, headers: { 'Cache-Control': 'no-store', ...headers } },
  )
}

/** Traduit un échec de facteur en réponse HTTP (langue de l'utilisateur : appel pendant une requête). */
export async function factorFailure(r: Exclude<FactorResult, { ok: true }>, what: 'pin' | 'password') {
  const t = await getTranslations('server.vaultLock')
  switch (r.code) {
    case 'locked_out': {
      const retry = String(Math.max(1, Math.ceil((r.lockedUntil - Date.now()) / 1000)))
      return errorWithDetails(429, 'locked_out', t('lockedOut', { wait: waitText(t, r.lockedUntil) }),
        { lockedUntil: r.lockedUntil, attemptsLeft: 0, scope: what }, { 'Retry-After': retry })
    }
    case 'invalid': {
      const left = r.attemptsLeft
      return errorWithDetails(401, what === 'pin' ? 'invalid_pin' : 'invalid_password',
        t(what === 'pin' ? 'invalidPin' : 'invalidPassword', { left }), { lockedUntil: null, attemptsLeft: left, scope: what })
    }
    case 'no_pin':
      return jsonError(409, 'no_pin', t('noPin'))
    case 'provider_rate_limited':
      return jsonError(429, 'rate_limited', t('providerRateLimited'))
    case 'error':
      return jsonError(503, 'verification_unavailable', t('verificationUnavailable'))
  }
}
