import 'server-only'
import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { jsonError } from '@/lib/data/server/http'
import type { FactorResult } from './verify'

function waitText(until: number): string {
  const s = Math.max(1, Math.ceil((until - Date.now()) / 1000))
  if (s < 60) return `${s} seconde${s > 1 ? 's' : ''}`
  const m = Math.ceil(s / 60)
  return `${m} minute${m > 1 ? 's' : ''}`
}

/** Même enveloppe que jsonError, avec un objet `details` (essais restants, fin du blocage). */
function errorWithDetails(status: number, code: string, message: string, details: Record<string, unknown>, headers?: Record<string, string>) {
  const correlation_id = `req_${randomBytes(6).toString('hex')}`
  return NextResponse.json(
    { error: { code, message, correlation_id, details } },
    { status, headers: { 'Cache-Control': 'no-store', ...headers } },
  )
}

/** Traduit un échec de facteur en réponse HTTP. */
export function factorFailure(r: Exclude<FactorResult, { ok: true }>, what: 'pin' | 'password') {
  switch (r.code) {
    case 'locked_out': {
      const retry = String(Math.max(1, Math.ceil((r.lockedUntil - Date.now()) / 1000)))
      return errorWithDetails(429, 'locked_out', `Trop d’essais. Réessayez dans ${waitText(r.lockedUntil)}.`,
        { lockedUntil: r.lockedUntil, attemptsLeft: 0, scope: what }, { 'Retry-After': retry })
    }
    case 'invalid': {
      const label = what === 'pin' ? 'Code incorrect.' : 'Mot de passe incorrect.'
      const left = r.attemptsLeft
      return errorWithDetails(401, what === 'pin' ? 'invalid_pin' : 'invalid_password',
        `${label} Il vous reste ${left} essai${left > 1 ? 's' : ''}.`, { lockedUntil: null, attemptsLeft: left, scope: what })
    }
    case 'no_pin':
      return jsonError(409, 'no_pin', 'Aucun code n’est défini pour ce compte.')
    case 'provider_rate_limited':
      return jsonError(429, 'rate_limited', 'Trop de tentatives. Patientez quelques minutes.')
    case 'error':
      return jsonError(503, 'verification_unavailable', 'Vérification impossible pour le moment. Réessayez.')
  }
}
