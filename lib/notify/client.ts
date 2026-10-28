'use client'
/**
 * Côté navigateur : écoulement immédiat des notifications et abonnement Web Push.
 * Aucun effet en mode démonstration (Supabase non configuré).
 */
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { libT } from '@/lib/i18n/runtime'
import type { PushTestOutcome } from './push-test'

let kickTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Après une action qui notifie d'autres personnes (message, partage, événement partagé…) :
 * demande au serveur de livrer tout de suite (sinon le cron le fait sous 5 min).
 * Regroupé (1 s) et sans attente : n'échoue jamais.
 */
export function kickNotifications(): void {
  if (!SUPABASE_ENABLED || typeof window === 'undefined') return
  if (kickTimer) clearTimeout(kickTimer)
  kickTimer = setTimeout(() => {
    kickTimer = null
    fetch('/api/notifications/flush', {
      method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}',
    }).catch(() => undefined)
  }, 1_000)
}

/** Après une connexion réussie (mot de passe, code 2FA, vérification de l'inscription). Borné à 2 s. */
export async function reportSignIn(): Promise<void> {
  if (!SUPABASE_ENABLED) return
  try {
    await fetch('/api/auth/login-check', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(2_000),
    })
  } catch { /* l'alerte n'empêche jamais la connexion */ }
}

// --- Web Push ------------------------------------------------------------------

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

export type PushSupport =
  | 'supported'
  | 'unsupported'      // navigateur sans Push API
  | 'ios-needs-install' // iPhone / iPad : il faut ajouter l'app à l'écran d'accueil
  | 'ios-update'       // iPhone / iPad installé, mais iOS < 16.4 (pas de Web Push)
  | 'not-configured'   // clés VAPID absentes côté serveur
  | 'demo'

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function isAndroid(): boolean {
  return typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)
}

/** Plateforme pour l'aide « réactiver les notifications bloquées ». */
export function helpPlatform(): 'ios' | 'android' | 'desktop' {
  return isIos() ? 'ios' : isAndroid() ? 'android' : 'desktop'
}

export function pushSupport(): PushSupport {
  if (!SUPABASE_ENABLED) return 'demo'
  if (typeof window === 'undefined') return 'unsupported'
  const hasApi = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  // iOS / iPadOS : Web Push uniquement dans l'application ajoutée à l'écran d'accueil (16.4+).
  if (isIos() && !isStandalone()) return 'ios-needs-install'
  if (isIos() && !hasApi) return 'ios-update'
  if (!hasApi) return 'unsupported'
  if (!VAPID_PUBLIC_KEY) return 'not-configured'
  return 'supported'
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/')
  if (existing) return existing
  // En production RegisterSW l'a déjà fait ; ailleurs, on l'enregistre à la demande (clic).
  await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
  return navigator.serviceWorker.ready
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'supported') return null
  const reg = await navigator.serviceWorker.getRegistration('/')
  return reg ? reg.pushManager.getSubscription() : null
}

export async function sha16(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
}

export class PushError extends Error {}

/** Demande la permission (geste utilisateur requis), abonne ce navigateur et l'enregistre côté serveur. */
export async function enablePushOnThisDevice(): Promise<void> {
  if (pushSupport() !== 'supported') throw new PushError(libT('shared.notify')('unsupported'))
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    const t = libT('shared.notify')
    throw new PushError(permission === 'denied' ? t('blocked') : t('notGranted'))
  }
  const reg = await registration()
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }))
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(sub.toJSON()),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new PushError(body?.error?.message ?? libT('shared.notify')('enableFailed'))
  }
}

/** Désabonne ce navigateur (côté navigateur et côté serveur). */
export async function disablePushOnThisDevice(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  await fetch('/api/push/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => undefined)
  await sub.unsubscribe().catch(() => undefined)
}

export type PushDevice = { id: string; label: string; createdAt: string; endpointHash: string }

export async function listPushDevices(): Promise<PushDevice[]> {
  if (!SUPABASE_ENABLED) return []
  const res = await fetch('/api/push/subscribe', { credentials: 'same-origin' })
  if (!res.ok) return []
  const body = (await res.json().catch(() => null)) as { devices?: PushDevice[] } | null
  return body?.devices ?? []
}

export async function removePushDevice(id: string): Promise<boolean> {
  const res = await fetch('/api/push/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ id }),
  }).catch(() => null)
  return Boolean(res?.ok)
}

export type PushTestResult = PushTestOutcome

/**
 * « Envoyer une notification de test » (POST /api/push/test) : push sur tous les appareils
 * du compte + ligne in-app. Erreur HTTP (limite, session…) : PushError avec le message serveur.
 */
export async function sendTestPush(): Promise<PushTestResult> {
  const res = await fetch('/api/push/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: '{}',
  }).catch(() => null)
  // Message vide : l'écran affiche son propre texte d'échec (account.push.test.result.failed).
  if (!res) throw new PushError('')
  const body = (await res.json().catch(() => null)) as (PushTestResult & { error?: { message?: string } }) | null
  if (!res.ok || !body || typeof body.status !== 'string') {
    throw new PushError(body?.error?.message ?? '')
  }
  return body
}
