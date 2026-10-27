'use client'
/**
 * Cérémonies WebAuthn côté navigateur via @simplewebauthn/browser (v13) :
 * options JSON du serveur → navigator.credentials → réponse JSON base64url.
 * Toute la vérification cryptographique est faite par le serveur ; ce fichier
 * ne manipule aucun secret.
 */
import {
  browserSupportsWebAuthn, platformAuthenticatorIsAvailable, startAuthentication, startRegistration,
  type PublicKeyCredentialCreationOptionsJSON, type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser'

export class WebauthnError extends Error {
  constructor(public kind: 'cancelled' | 'already_registered' | 'unsupported' | 'security' | 'failed', message: string, public browserUnsupported = false) {
    super(message)
  }
}

/** Message traduit d'une WebauthnError (le message français d'origine reste le repli). */
export function webauthnErrorMessage(e: WebauthnError, t: (key: string) => string): string {
  return t(e.browserUnsupported ? 'unsupportedBrowser' : e.kind)
}

export function webauthnSupported(): boolean {
  return typeof window !== 'undefined' && browserSupportsWebAuthn()
}

/** Capteur biométrique / Windows Hello disponible sur cet appareil. */
export async function platformAuthenticatorAvailable(): Promise<boolean> {
  if (!webauthnSupported()) return false
  try {
    return await platformAuthenticatorIsAvailable()
  } catch {
    return false
  }
}

function mapError(e: unknown): WebauthnError {
  // WebAuthnError (bibliothèque) reprend le nom de la DOMException d'origine.
  const name = e instanceof Error ? e.name : ''
  if (name === 'NotAllowedError' || name === 'AbortError') return new WebauthnError('cancelled', 'Opération annulée ou délai dépassé.')
  if (name === 'InvalidStateError') return new WebauthnError('already_registered', 'Cet appareil est déjà enregistré.')
  if (name === 'NotSupportedError') return new WebauthnError('unsupported', 'Cet appareil ne propose pas d’empreinte ni de reconnaissance faciale.')
  if (name === 'SecurityError') return new WebauthnError('security', 'Empreinte indisponible sur cette adresse (HTTPS requis).')
  return new WebauthnError('failed', 'L’empreinte n’a pas pu être utilisée.')
}

export async function createCredential(optionsJSON: unknown) {
  if (!webauthnSupported()) throw new WebauthnError('unsupported', 'Ce navigateur ne prend pas en charge l’empreinte.', true)
  try {
    return await startRegistration({ optionsJSON: optionsJSON as PublicKeyCredentialCreationOptionsJSON })
  } catch (e) {
    throw mapError(e)
  }
}

export async function getAssertion(optionsJSON: unknown) {
  if (!webauthnSupported()) throw new WebauthnError('unsupported', 'Ce navigateur ne prend pas en charge l’empreinte.', true)
  try {
    return await startAuthentication({ optionsJSON: optionsJSON as PublicKeyCredentialRequestOptionsJSON })
  } catch (e) {
    throw mapError(e)
  }
}

/** Nom proposé par défaut pour l'appareil courant. */
export function guessDeviceName(labels: { thisDevice: string; android: string; windows: string } = { thisDevice: 'Cet appareil', android: 'Téléphone Android', windows: 'PC Windows (Windows Hello)' }): string {
  if (typeof navigator === 'undefined') return labels.thisDevice
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone (Face ID / Touch ID)'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return labels.android
  if (/Macintosh/.test(ua)) return 'Mac (Touch ID)'
  if (/Windows/.test(ua)) return labels.windows
  return labels.thisDevice
}
