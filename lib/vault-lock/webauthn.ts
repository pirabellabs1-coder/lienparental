import 'server-only'
/**
 * WebAuthn (passkeys de plateforme : Touch ID, Face ID, Windows Hello, empreinte Android).
 *
 * Dépendance : @simplewebauthn/server (v13, cf. package.json).
 *
 * Défi : 32 octets aléatoires générés par la bibliothèque, conservés CÔTÉ SERVEUR
 * (m7, audit v3 : table vault_webauthn_challenges, 0360 ; mémoire en démo), 2 minutes,
 * usage unique garanti par la base (DELETE ... RETURNING), lié à l'utilisateur et au
 * type de cérémonie. Le cookie HttpOnly signé ne porte plus que l'identifiant du défi
 * (liaison au navigateur) : rejouer une réponse, ou un ancien cookie, échoue.
 * Vérification : origine, RP ID, présence ET vérification de l'utilisateur
 * (biométrie / code de l'appareil), signature, compteur.
 */
import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticationResponseJSON, type AuthenticatorTransportFuture, type RegistrationResponseJSON,
} from '@simplewebauthn/server'
import { createHash } from 'node:crypto'
import { cookies } from 'next/headers'
import { signToken, verifyToken } from './crypto'
import type { VaultPrincipal } from './context'
import { MAX_PASSKEYS, vaultStore, type StoredPasskey } from './store'

export type { AuthenticationResponseJSON, RegistrationResponseJSON }

/** WebAuthn non configuré sur ce serveur (RP ID / origine absents en production) : 503. */
export class WebauthnUnavailable extends Error {
  constructor() {
    super('webauthn_unavailable')
  }
}


const SECURE = process.env.NODE_ENV === 'production'
const CHALLENGE_COOKIE = SECURE ? '__Host-lp_vault_chal' : 'lp_vault_chal'
const CHALLENGE_TTL_S = 120
const RP_NAME = 'Lien Parental'

/** Contenu du cookie : identifiant du défi stocké côté serveur (jamais le défi lui-même). */
type ChallengeCookie = { id: string; u: string; k: 'reg' | 'auth'; exp: number }
type ChallengePayload = { c: string; u: string; k: 'reg' | 'auth'; n?: string }

/** RP ID et origines attendues. Production : variables explicites (jamais déduites d'en-têtes). */
function relyingParty(req: Request): { rpID: string; origins: string[] } {
  const envOrigins = (process.env.WEBAUTHN_ORIGIN ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (SECURE) {
    const origins = envOrigins.length ? envOrigins : appUrl ? [new URL(appUrl).origin] : []
    const rpID = process.env.WEBAUTHN_RP_ID || (origins[0] ? new URL(origins[0]).hostname : '')
    if (!rpID || origins.length === 0) throw new WebauthnUnavailable()
    return { rpID, origins }
  }
  // Développement : origine de la requête (localhost, IP du réseau local pour tester sur mobile en HTTPS).
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost:3000'
  const proto = req.headers.get('x-forwarded-proto') ?? 'http'
  const origin = `${proto}://${host}`
  return { rpID: process.env.WEBAUTHN_RP_ID || new URL(origin).hostname, origins: envOrigins.length ? envOrigins : [origin] }
}

async function setChallenge(principal: VaultPrincipal, p: ChallengePayload) {
  const id = await vaultStore(principal.mode).saveChallenge(p.u, p.k, p.c, p.n ?? null, CHALLENGE_TTL_S)
  const store = await cookies()
  store.set(CHALLENGE_COOKIE, signToken({ id, u: p.u, k: p.k, exp: Math.floor(Date.now() / 1000) + CHALLENGE_TTL_S } satisfies ChallengeCookie), {
    httpOnly: true, secure: SECURE, sameSite: 'strict', path: '/', maxAge: CHALLENGE_TTL_S,
  })
}

/** Lit ET consomme le défi (usage unique, côté serveur) ; le cookie est effacé dans tous les cas. */
async function takeChallenge(principal: VaultPrincipal, kind: 'reg' | 'auth'): Promise<ChallengePayload | null> {
  const store = await cookies()
  const p = verifyToken<ChallengeCookie>(store.get(CHALLENGE_COOKIE)?.value)
  store.set(CHALLENGE_COOKIE, '', { httpOnly: true, secure: SECURE, sameSite: 'strict', path: '/', maxAge: 0 })
  if (!p || typeof p.id !== 'string' || p.u !== principal.userId || p.k !== kind || p.exp <= Math.floor(Date.now() / 1000)) return null
  const stored = await vaultStore(principal.mode).consumeChallenge(principal.userId, kind, p.id)
  if (!stored) return null
  return { c: stored.challenge, u: principal.userId, k: kind, n: stored.name ?? undefined }
}

const toB64 = (u: Uint8Array) => Buffer.from(u).toString('base64url')
const fromB64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64url'))
const asTransports = (t: string[]) => t as AuthenticatorTransportFuture[]

export async function registrationOptions(req: Request, principal: VaultPrincipal, name: string) {
  const { rpID } = relyingParty(req)
  const existing = await vaultStore(principal.mode).listPasskeys(principal.userId)
  if (existing.length >= MAX_PASSKEYS) return { ok: false as const, code: 'too_many' as const }
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    // Identifiant opaque stable (ni l'e-mail ni l'id en clair) : 16 octets de SHA-256.
    userID: new Uint8Array(createHash('sha256').update(`lp-vault:${principal.userId}`).digest().subarray(0, 16)),
    userName: principal.email || principal.displayName,
    userDisplayName: principal.displayName,
    attestationType: 'none',
    excludeCredentials: existing.filter((p) => !p.simulated).map((p) => ({ id: p.credentialId, transports: asTransports(p.transports) })),
    authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'preferred', userVerification: 'required' },
    timeout: 60_000,
  })
  await setChallenge(principal, { c: options.challenge, u: principal.userId, k: 'reg', n: name })
  return { ok: true as const, options }
}

export async function verifyRegistration(req: Request, principal: VaultPrincipal, response: RegistrationResponseJSON) {
  const challenge = await takeChallenge(principal, 'reg')
  if (!challenge) return { ok: false as const, code: 'challenge_expired' as const }
  const { rpID, origins } = relyingParty(req)
  let verification
  try {
    verification = await verifyRegistrationResponse({
      response, expectedChallenge: challenge.c, expectedOrigin: origins, expectedRPID: rpID, requireUserVerification: true,
    })
  } catch {
    return { ok: false as const, code: 'verification_failed' as const }
  }
  if (!verification.verified || !verification.registrationInfo) return { ok: false as const, code: 'verification_failed' as const }
  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo
  const summary = await vaultStore(principal.mode).addPasskey(principal.userId, {
    name: challenge.n || 'Cet appareil',
    credentialId: credential.id,
    publicKey: toB64(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? response.response.transports ?? [],
    synced: credentialDeviceType === 'multiDevice' || credentialBackedUp,
  })
  return { ok: true as const, passkey: summary }
}

export async function authenticationOptions(req: Request, principal: VaultPrincipal) {
  const { rpID } = relyingParty(req)
  const keys = (await vaultStore(principal.mode).listPasskeys(principal.userId)).filter((p) => !p.simulated)
  if (keys.length === 0) return { ok: false as const, code: 'no_passkey' as const }
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: keys.map((p) => ({ id: p.credentialId, transports: asTransports(p.transports) })),
    userVerification: 'required',
    timeout: 60_000,
  })
  await setChallenge(principal, { c: options.challenge, u: principal.userId, k: 'auth' })
  return { ok: true as const, options }
}

export async function verifyAuthentication(req: Request, principal: VaultPrincipal, response: AuthenticationResponseJSON) {
  const challenge = await takeChallenge(principal, 'auth')
  if (!challenge) return { ok: false as const, code: 'challenge_expired' as const }
  const store = vaultStore(principal.mode)
  // Recherche bornée à l'utilisateur connecté : une clé d'un autre compte ne peut pas servir.
  const key: StoredPasskey | null = await store.findPasskey(principal.userId, response.id)
  if (!key || key.simulated) return { ok: false as const, code: 'unknown_passkey' as const }
  const { rpID, origins } = relyingParty(req)
  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response, expectedChallenge: challenge.c, expectedOrigin: origins, expectedRPID: rpID, requireUserVerification: true,
      credential: { id: key.credentialId, publicKey: fromB64(key.publicKey), counter: key.counter, transports: asTransports(key.transports) },
    })
  } catch {
    return { ok: false as const, code: 'verification_failed' as const }
  }
  if (!verification.verified) return { ok: false as const, code: 'verification_failed' as const }
  await store.markPasskeyUsed(principal.userId, key.id, verification.authenticationInfo.newCounter)
  return { ok: true as const }
}
